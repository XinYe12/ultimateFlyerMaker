# FILE: apps/desktop/backend/src/cutout_service/server.py
# FULL FILE — FIXES NameError: io is not defined
# ALL EXISTING BEHAVIOR PRESERVED

from fastapi import FastAPI, UploadFile, File, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os, sys, subprocess, json, asyncio, tempfile, io, gc

try:
    import psutil as _psutil
    _PSUTIL_PID = os.getpid()
    def _rss_mb() -> float:
        return _psutil.Process(_PSUTIL_PID).memory_info().rss / (1024 ** 2)
except ImportError:
    def _rss_mb() -> float:
        return -1.0


def _run_with_peak_rss(fn, *args, **kwargs):
    """Run fn(*args, **kwargs) while sampling RSS every 100 ms; return (result, peak_mb)."""
    import threading as _threading
    peak = [_rss_mb()]
    done = _threading.Event()
    def _poll():
        while not done.wait(0.1):
            peak[0] = max(peak[0], _rss_mb())
    t = _threading.Thread(target=_poll, daemon=True)
    t.start()
    try:
        result = fn(*args, **kwargs)
    finally:
        done.set()
        t.join()
    peak[0] = max(peak[0], _rss_mb())  # final sample after fn returns
    return result, peak[0]


REMBG_MODEL = os.environ.get("UFM_REMBG_MODEL", "u2net")

# Must be set before onnxruntime is imported (rembg pulls it in).
# ORT_NUM_THREADS is ONNX Runtime's own thread pool — Windows ignores OMP_NUM_THREADS.
os.environ.setdefault("ORT_NUM_THREADS", os.environ.get("OMP_NUM_THREADS", "2"))

from PIL import Image, ExifTags
from rembg import remove, new_session
import threading

# ── ORT profiling (UFM_ORT_PROFILE=1) ────────────────────────────────────────
# Profiles the first inference and prints a per-op breakdown to stdout.
# Adds ~5-15% overhead; leave off in production.
_ORT_PROFILE = os.environ.get("UFM_ORT_PROFILE") == "1"
_ort_profile_prefix = os.path.join(tempfile.gettempdir(), "ort_profile_ufm")
_ort_profile_state = {"fired": False}  # mutable so the cutout handler can flip it without global

# ── Python heap tracing (UFM_TRACEMALLOC=1) ──────────────────────────────────
# Adds ~20% overhead — use only for debugging, not in production.
_TRACEMALLOC = os.environ.get("UFM_TRACEMALLOC") == "1"
if _TRACEMALLOC:
    import tracemalloc as _tracemalloc
    _tracemalloc.start(10)  # keep 10 frames of traceback per allocation
    print("[debug] tracemalloc started — Python heap tracing active (UFM_TRACEMALLOC=1)", flush=True)


def _summarize_ort_profile(json_path: str) -> None:
    """Parse an ORT trace JSON and print the top-10 ops by wall-clock duration."""
    try:
        with open(json_path) as f:
            events = json.load(f)
        node_events = [e for e in events if e.get("cat") == "Node" and "dur" in e]
        if not node_events:
            print("[ort-profile] no Node events found in profile", flush=True)
            return
        from collections import defaultdict
        by_op: dict = defaultdict(lambda: {"count": 0, "dur_us": 0})
        total_us = 0
        for e in node_events:
            op = e.get("args", {}).get("op_name", e.get("name", "unknown"))
            dur = int(e["dur"])
            by_op[op]["count"] += 1
            by_op[op]["dur_us"] += dur
            total_us += dur
        ranked = sorted(by_op.items(), key=lambda kv: kv[1]["dur_us"], reverse=True)
        print(f"[ort-profile] total node time: {total_us / 1000:.1f} ms  ({len(node_events)} op calls)", flush=True)
        print("[ort-profile] top 10 ops by duration:", flush=True)
        for op, s in ranked[:10]:
            pct = s["dur_us"] / total_us * 100 if total_us else 0
            print(f"  {op:40s}  {s['dur_us'] / 1000:8.1f} ms  ({pct:5.1f}%)  x{s['count']}", flush=True)
        print(f"[ort-profile] full trace: {json_path}", flush=True)
    except Exception as ex:
        print(f"[ort-profile] parse error: {ex}", flush=True)


# Load the model in a background thread so uvicorn can start and pass the
# health check immediately (important during the first-time ~1 GB download).
_rembg_session = None
_model_ready = threading.Event()

def _load_model():
    global _rembg_session
    print(f"[cutout] loading rembg model: {REMBG_MODEL} …", flush=True)
    print(f"[mem] before model load: {_rss_mb():.0f} MB", flush=True)
    try:
        try:
            import onnxruntime as ort
            _ort_threads = int(os.environ.get("ORT_NUM_THREADS", "2"))
            _opts = ort.SessionOptions()
            _opts.intra_op_num_threads = _ort_threads
            _opts.inter_op_num_threads = 1
            # Disable the BFC memory arena so ORT releases native allocations after
            # each inference rather than holding a permanently-growing pool.
            # Costs ~10-20% inference speed but keeps RSS bounded between requests.
            _opts.enable_cpu_mem_arena = False
            if _ORT_PROFILE:
                _opts.enable_profiling = True
                _opts.profile_file_prefix = _ort_profile_prefix
                print(f"[ort-profile] ORT profiling ON — trace prefix: {_ort_profile_prefix}*.json", flush=True)
            _rembg_session = new_session(REMBG_MODEL, sess_options=_opts)
        except TypeError:
            # older rembg doesn't accept sess_options — fall back gracefully
            _rembg_session = new_session(REMBG_MODEL)
        print(f"[cutout] rembg model ready: {REMBG_MODEL}", flush=True)
        print(f"[mem] after model load ({REMBG_MODEL}): {_rss_mb():.0f} MB", flush=True)
    except Exception as e:
        print(f"[cutout] ERROR loading model: {e}", flush=True)
    finally:
        _model_ready.set()

threading.Thread(target=_load_model, daemon=True).start()

app = FastAPI()
ocr_lock = asyncio.Lock()
_cutout_lock = asyncio.Lock()


def _cutout_max_edge_px() -> int:
    raw = os.environ.get("UFM_CUTOUT_MAX_EDGE_PX", "1536").strip()
    try:
        v = int(raw)
    except ValueError:
        return 1536
    return max(0, min(v, 4096))


def _maybe_downscale_for_rembg(img: Image.Image) -> Image.Image:
    """Shrink very large Serper / camera images before rembg to cut RAM + CPU."""
    cap = _cutout_max_edge_px()
    # BiRefNet's Swin Transformer scales quadratically with token count — apply a
    # lower hard cap (768 px) regardless of UFM_CUTOUT_MAX_EDGE_PX to keep the
    # attention matrices bounded. u2net is a plain CNN so no special cap needed.
    if REMBG_MODEL.startswith("birefnet") and (cap <= 0 or cap > 768):
        cap = 768
    if cap <= 0:
        return img
    w, h = img.size
    m = max(w, h)
    if m <= cap:
        return img
    scale = cap / m
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    try:
        resample = Image.Resampling.LANCZOS
    except AttributeError:
        resample = Image.LANCZOS
    print(f"[cutout] downscaling {w}x{h} -> {nw}x{nh} (UFM_CUTOUT_MAX_EDGE_PX={cap})", flush=True)
    return img.resize((nw, nh), resample)


class OCRRequest(BaseModel):
    image_path: str


@app.get("/health")
def health():
    return {"ok": True, "ready": _model_ready.is_set()}


@app.get("/debug/mem")
def debug_mem():
    import tracemalloc
    result = {
        "rss_mb": round(_rss_mb(), 1),
        "pid": os.getpid(),
        "model": REMBG_MODEL,
        "model_ready": _model_ready.is_set(),
        "ort_threads": int(os.environ.get("ORT_NUM_THREADS", "2")),
        "ort_profile_active": _ORT_PROFILE,
        "ort_profile_fired": _ort_profile_state["fired"],
        "tracemalloc_active": tracemalloc.is_tracing(),
    }
    if tracemalloc.is_tracing():
        snapshot = tracemalloc.take_snapshot()
        top = snapshot.statistics("lineno")[:10]
        result["tracemalloc_top10"] = [str(s) for s in top]
    return result


# ---------- IMAGE ORIENTATION NORMALIZATION ----------
# FILE: apps/desktop/backend/src/cutout_service/server.py
# ACTION: REMOVE SHAPE-BASED ROTATION, KEEP EXIF ONLY
# DROP-IN REPLACEMENT FOR normalize_orientation()

def normalize_orientation(img: Image.Image) -> Image.Image:
    try:
        exif = img._getexif()
        if not exif:
            return img

        orientation_key = next(
            k for k, v in ExifTags.TAGS.items() if v == "Orientation"
        )
        orientation = exif.get(orientation_key)

        if orientation == 3:
            img = img.rotate(180, expand=True)
        elif orientation == 6:
            img = img.rotate(270, expand=True)
        elif orientation == 8:
            img = img.rotate(90, expand=True)

    except Exception:
        pass

    return img


# ---------- CUTOUT ----------
@app.post("/cutout")
async def cutout(request: Request, file: UploadFile = File(...)):
    async with _cutout_lock:
        try:
            data = await file.read()
            print(f"[cutout] received {len(data)} bytes, filename={file.filename}, content_type={file.content_type}")

            # If the Node.js client already aborted, skip rembg entirely
            await asyncio.sleep(0)
            if await request.is_disconnected():
                print("[cutout] client disconnected before processing — skipping")
                return JSONResponse(status_code=499, content={"error": "client disconnected"})

            # Validate we can open this as an image first
            try:
                src_img = Image.open(io.BytesIO(data))
                print(f"[cutout] input image: format={src_img.format}, size={src_img.size}, mode={src_img.mode}")
                src_img = _maybe_downscale_for_rembg(src_img)
                # Convert animated / palette / CMYK images to RGBA for rembg compatibility
                if src_img.mode not in ("RGB", "RGBA"):
                    src_img = src_img.convert("RGBA")
                    buf = io.BytesIO()
                    src_img.save(buf, format="PNG")
                    data = buf.getvalue()
                    print(f"[cutout] converted to RGBA PNG ({len(data)} bytes)")
            except Exception as e:
                print(f"[cutout] PIL cannot open input: {e}")
                return JSONResponse(status_code=400, content={"error": f"Invalid image: {e}"})

            # Add a white border before rembg so the model doesn't over-aggressively
            # remove product pixels that touch or are near the image edges/corners.
            BORDER = 40
            padded = Image.new("RGB", (src_img.width + BORDER * 2, src_img.height + BORDER * 2), (255, 255, 255))
            padded.paste(src_img.convert("RGB"), (BORDER, BORDER))
            pad_buf = io.BytesIO()
            padded.save(pad_buf, format="PNG")
            padded_data = pad_buf.getvalue()

            # Wait for background model load (handles first-time download gracefully)
            if not _model_ready.is_set():
                print("[cutout] waiting for model to finish loading …", flush=True)
                await asyncio.to_thread(_model_ready.wait, 3600)
            if _rembg_session is None:
                return JSONResponse(status_code=503, content={"error": "Model failed to load"})

            before_mb = _rss_mb()
            print(f"[mem] before inference ({REMBG_MODEL}, {padded.width}x{padded.height}px): {before_mb:.0f} MB", flush=True)
            out_padded, peak_mb = await asyncio.to_thread(
                _run_with_peak_rss, remove, padded_data, session=_rembg_session
            )
            after_mb = _rss_mb()
            print(f"[mem] inference peak: {peak_mb:.0f} MB  (after={after_mb:.0f} MB, delta=+{peak_mb - before_mb:.0f} MB)", flush=True)

            if _ORT_PROFILE and not _ort_profile_state["fired"]:
                _ort_profile_state["fired"] = True
                import glob as _glob
                profiles = sorted(_glob.glob(f"{_ort_profile_prefix}*.json"))
                if profiles:
                    await asyncio.to_thread(_summarize_ort_profile, profiles[-1])
                else:
                    print(f"[ort-profile] WARNING: no JSON found at prefix {_ort_profile_prefix}", flush=True)

            src_w, src_h = src_img.width, src_img.height
            del data, src_img, padded, pad_buf, padded_data  # free input buffers before GC so they're actually collected
            gc.collect()
            print(f"[mem] after gc.collect(): {_rss_mb():.0f} MB", flush=True)
            print(f"[cutout] rembg produced {len(out_padded)} bytes")

            # Crop back to the original dimensions (strip the added border)
            padded_result = Image.open(io.BytesIO(out_padded)).convert("RGBA")
            img = padded_result.crop((BORDER, BORDER, BORDER + src_w, BORDER + src_h))
            img = normalize_orientation(img)

            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                img.save(f.name, format="PNG")
                print(f"[cutout] saved to {f.name}")
                return {"output_path": f.name}

        except Exception as e:
            import traceback
            traceback.print_exc()
            return JSONResponse(status_code=500, content={"error": str(e)})


# ---------- OCR ----------
@app.post("/ocr")
async def ocr(req: OCRRequest):
    async with ocr_lock:
        backend_src = os.path.dirname(
            os.path.dirname(os.path.dirname(__file__))
        )

        code = """
import sys, json, contextlib, io
sys.path.insert(0, sys.argv[2])
from ocr.ocr_engine import run_ocr

buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    result = run_ocr(sys.argv[1])

json.dump(result, sys.stdout, ensure_ascii=False)
"""

        # Use async subprocess so the event loop stays free for /health checks
        # while PaddleOCR runs (subprocess.run blocks the entire loop).
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-u", "-c", code, req.image_path, backend_src,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await proc.communicate()
        stdout_text = stdout_bytes.decode("utf-8", errors="replace")
        stderr_text = stderr_bytes.decode("utf-8", errors="replace")

        if proc.returncode != 0:
            print("OCR SUBPROCESS ERROR:", stderr_text)
            return JSONResponse(content=[])

        try:
            data = json.loads(stdout_text)
        except Exception as e:
            print("OCR JSON PARSE ERROR:", e)
            print("STDOUT:", stdout_text)
            print("STDERR:", stderr_text)
            return JSONResponse(content=[])

        return JSONResponse(content=data if isinstance(data, list) else [data])
