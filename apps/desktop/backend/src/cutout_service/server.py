# FILE: apps/desktop/backend/src/cutout_service/server.py
# FULL FILE — FIXES NameError: io is not defined
# ALL EXISTING BEHAVIOR PRESERVED

from fastapi import FastAPI, UploadFile, File, Request, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os, sys, subprocess, json, asyncio, tempfile, io, gc
from urllib.parse import unquote, urlparse

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


REMBG_MODEL = os.environ.get("UFM_REMBG_MODEL", "border-trim")
BRIA_ALIASES = ("briaai-rmbg", "bria", "briaai-rmbg-1.4")
USE_BRIA = REMBG_MODEL in BRIA_ALIASES
_BLOB_REMOVAL = os.environ.get("UFM_BLOB_REMOVAL", "1") != "0"

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


def _is_bria_model(model_name: str) -> bool:
    return model_name in BRIA_ALIASES


def _make_ort_session_options():
    import onnxruntime as ort
    _ort_threads = int(os.environ.get("ORT_NUM_THREADS", "2"))
    _opts = ort.SessionOptions()
    _opts.intra_op_num_threads = _ort_threads
    _opts.inter_op_num_threads = 1
    # Disable BFC memory arena: ORT returns native allocs to OS after each
    # inference rather than pooling them. Costs ~10-20% speed.
    _opts.enable_cpu_mem_arena = False
    # Disable memory pattern optimisation: prevents ORT from pre-allocating
    # a single large contiguous workspace for the whole execution graph.
    # Critical for transformer models (birefnet): the pattern buffer for
    # birefnet at 1024×1024 is ~6 GB and is NOT released by gc.collect().
    _opts.enable_mem_pattern = False
    if _ORT_PROFILE:
        _opts.enable_profiling = True
        _opts.profile_file_prefix = _ort_profile_prefix
        print(f"[ort-profile] ORT profiling ON — trace prefix: {_ort_profile_prefix}*.json", flush=True)
    return _opts


def _new_rembg_session(model_name: str):
    try:
        return new_session(model_name, sess_options=_make_ort_session_options())
    except TypeError:
        # older rembg doesn't accept sess_options — fall back gracefully
        return new_session(model_name)


# Load the model in a background thread so uvicorn can start and pass the
# health check immediately (important during the first-time ~1 GB download).
_rembg_session = None
_bria_model = None
_model_ready = threading.Event()

def _load_model():
    global _rembg_session, _bria_model
    # border-trim is pure flood-fill — no ML model to load.
    if REMBG_MODEL == "border-trim":
        print("[cutout] default model is border-trim — no ML model load required", flush=True)
        _model_ready.set()
        return
    print(f"[cutout] loading model: {REMBG_MODEL} …", flush=True)
    print(f"[mem] before model load: {_rss_mb():.0f} MB", flush=True)
    try:
        if USE_BRIA:
            import torch
            import torch.nn.functional as _F
            import importlib
            import glob as _glob
            import sys

            # Patch F.sigmoid (removed in PyTorch 2.0) before anything calls the model.
            if not hasattr(_F, "sigmoid"):
                _F.sigmoid = torch.sigmoid
                print("[cutout] patched torch.nn.functional.sigmoid for PyTorch 2.x", flush=True)

            # The HF modules dir is a proper Python package tree (all levels have __init__.py).
            # Use importlib.import_module so relative imports in briarmbg.py work correctly.
            # Avoid from_pretrained: transformers 4.38.2 uses the raw "RMBG-1.4" name (with
            # dots/hyphens) which Python's module system can't resolve.
            hf_modules_dir = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "modules")
            if hf_modules_dir not in sys.path:
                sys.path.insert(0, hf_modules_dir)
                print(f"[cutout] sys.path += {hf_modules_dir}", flush=True)

            hf_bria_dir = os.path.join(hf_modules_dir, "transformers_modules", "briaai")
            # Match only RMBG_hyphen* — skip RMBG-1.4 dir (hyphen in name = invalid Python pkg)
            bria_files = _glob.glob(os.path.join(hf_bria_dir, "RMBG_hyphen*", "*", "briarmbg.py"))

            if bria_files:
                briarmbg_path = sorted(bria_files)[-1]
                # Derive dotted module name from path relative to hf_modules_dir
                # e.g. transformers_modules.briaai.RMBG_hyphen_1_dot_4.2ceba5a5….briarmbg
                rel = os.path.relpath(briarmbg_path, hf_modules_dir)
                module_name = rel.replace(os.sep, ".")[:-3]  # strip .py
                print(f"[cutout] importing BRIA module: {module_name}", flush=True)
                bria_mod = importlib.import_module(module_name)
                model = bria_mod.BriaRMBG()
                from huggingface_hub import hf_hub_download
                weights_path = hf_hub_download(repo_id="briaai/RMBG-1.4", filename="model.pth")
                print(f"[cutout] loading BRIA weights: {weights_path}", flush=True)
                state_dict = torch.load(weights_path, map_location="cpu", weights_only=False)
                model.load_state_dict(state_dict)
            else:
                # No _hyphen_ cache found — let transformers download & cache it
                from transformers import AutoModelForImageSegmentation
                print("[cutout] BRIA cache not found — falling back to transformers from_pretrained", flush=True)
                model = AutoModelForImageSegmentation.from_pretrained(
                    "briaai/RMBG-1.4", trust_remote_code=True
                )

            model.eval()
            _bria_model = model
            print("[cutout] BRIA RMBG-1.4 ready", flush=True)
        else:
            _rembg_session = _new_rembg_session(REMBG_MODEL)
            print(f"[cutout] rembg model ready: {REMBG_MODEL}", flush=True)
        print(f"[mem] after model load ({REMBG_MODEL}): {_rss_mb():.0f} MB", flush=True)
    except Exception as e:
        print(f"[cutout] ERROR loading model: {e}", flush=True)
    finally:
        _model_ready.set()

threading.Thread(target=_load_model, daemon=True).start()


def _run_bria_inference(img_bytes: bytes) -> bytes:
    """Run BRIA RMBG-1.4 inference on PNG bytes; return RGBA PNG bytes."""
    import torch
    import torch.nn.functional as _F
    import numpy as np
    # F.sigmoid was removed in PyTorch 2.0; BRIA's custom forward() still calls it.
    if not hasattr(_F, "sigmoid"):
        _F.sigmoid = torch.sigmoid
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    orig_size = img.size  # (w, h)
    img_1024 = img.resize((1024, 1024), Image.BILINEAR)
    arr = np.array(img_1024).astype(np.float32) / 255.0
    # BRIA RMBG-1.4 expects normalize(mean=[0.5]*3, std=[1.0]*3), not ImageNet stats.
    arr = arr - np.array([0.5, 0.5, 0.5], dtype=np.float32)
    tensor = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0).float()
    with torch.no_grad():
        result = _bria_model(tensor)
    # result[0][0]: shape [1, 1, 1024, 1024], already sigmoided by model.
    # Resize to original size using bilinear interpolation, then min-max normalize
    # to stretch output to full [0,1] contrast (BRIA standard postprocess_image).
    pred = _F.interpolate(result[0][0], size=(orig_size[1], orig_size[0]),
                          mode='bilinear', align_corners=False).squeeze()
    ma, mi = pred.max(), pred.min()
    if ma > mi:
        pred = (pred - mi) / (ma - mi)
    # Preserve BRIA's soft alpha matte. Hard-thresholding turns pale backgrounds
    # into opaque white blobs and makes transparent packaging look jagged.
    mask_arr = (pred.detach().numpy() * 255).astype(np.uint8)
    out = img.convert("RGBA")
    out.putalpha(Image.fromarray(mask_arr))
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


def _run_rembg_with_new_session(img_bytes: bytes, model_name: str) -> bytes:
    session = _new_rembg_session(model_name)
    try:
        return remove(img_bytes, session=session)
    finally:
        del session
        gc.collect()


def _prefer_base_cutout_source(cutout_path: str) -> str | None:
    """Find the pre-shadow/pre-smart cutout so restored pixels use original RGB when possible."""
    candidates = []
    base = cutout_path
    import re
    base = re.sub(r"\.smart-\d+(?=\.png$)", "", base)
    candidates.append(base)
    if base.endswith(".cutout.shadow.png"):
        candidates.append(base.replace(".cutout.shadow.png", ".cutout.png"))
    if base.endswith(".shadow.png"):
        candidates.append(base.replace(".shadow.png", ".png"))
    for candidate in candidates:
        if candidate and candidate != cutout_path and os.path.exists(candidate):
            return candidate
    return None


def _normalize_local_path(value: str | None) -> str | None:
    if not value:
        return value
    raw = str(value)
    if raw.startswith("file://"):
        parsed = urlparse(raw)
        raw = unquote(parsed.path or raw.replace("file://", ""))
        if os.name == "nt" and raw.startswith("/") and len(raw) > 2 and raw[2] == ":":
            raw = raw[1:]
    else:
        raw = unquote(raw)
    return os.path.normpath(raw)


def _existing_cutout_path(value: str | None) -> str | None:
    path_value = _normalize_local_path(value)
    if path_value and os.path.exists(path_value):
        return path_value
    if not path_value:
        return None
    import re
    candidate = path_value
    for _ in range(10):  # progressively strip one suffix at a time
        new_candidate = re.sub(r"\.(?:erased|extracted|smart)-\d+(?=\.png$)", "", candidate, count=1)
        if new_candidate == candidate:
            break
        candidate = os.path.normpath(new_candidate)
        if os.path.exists(candidate):
            return candidate
    return path_value


def _teardown_and_reload_session():
    """
    Destroy the current ORT InferenceSession and immediately reload it.

    For transformer-based models (birefnet), ORT's workspace/scratch buffers are NOT
    freed by gc.collect() — only the C++ InferenceSession destructor releases them.
    Setting _rembg_session = None triggers that destructor (once GC runs), returning
    several GB of native memory to the OS between inferences.

    Called from inside _cutout_lock so there is never a concurrent inference.
    The _model_ready event is cleared before reload starts and set again when done,
    so the next request waits safely if it arrives during the short reload window.
    """
    global _rembg_session
    before_mb = _rss_mb()
    _model_ready.clear()
    _rembg_session = None
    gc.collect()
    after_teardown_mb = _rss_mb()
    print(
        f"[mem] birefnet session teardown: {before_mb:.0f} -> {after_teardown_mb:.0f} MB "
        f"(freed {before_mb - after_teardown_mb:.0f} MB)",
        flush=True,
    )
    # Reload synchronously in this thread; _model_ready is cleared so any concurrent
    # health checks will report not-ready until the new session is live.
    _load_model()

app = FastAPI()
ocr_lock = asyncio.Lock()
_cutout_lock = asyncio.Lock()
_sam_lock = asyncio.Lock()

# ── MobileSAM lazy loader ─────────────────────────────────────────────────────
_mobile_sam_predictor = None

def _get_sam_predictor():
    """Load MobileSAM on first call and cache the predictor."""
    global _mobile_sam_predictor
    if _mobile_sam_predictor is not None:
        return _mobile_sam_predictor
    try:
        from mobile_sam import sam_model_registry, SamPredictor
    except ImportError:
        raise RuntimeError("mobile-sam not installed. Run: pip install mobile-sam")
    import torch
    from pathlib import Path
    cache_dir = Path.home() / ".cache" / "mobile_sam"
    cache_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = cache_dir / "mobile_sam.pt"
    def _download_checkpoint():
        import urllib.request
        # HuggingFace mirror — the original GitHub v1.0 release URL is no longer available.
        urls = [
            "https://huggingface.co/dhkim2810/MobileSAM/resolve/main/mobile_sam.pt",
            "https://huggingface.co/ChaoningZhang/MobileSAM/resolve/main/mobile_sam.pt",
        ]
        downloaded = False
        for url in urls:
            try:
                print(f"[MobileSAM] Downloading model weights (~9 MB) to {checkpoint_path} from {url}...", flush=True)
                urllib.request.urlretrieve(url, str(checkpoint_path))
                print("[MobileSAM] Download complete.", flush=True)
                downloaded = True
                break
            except Exception as dl_err:
                print(f"[MobileSAM] Download failed from {url}: {dl_err}", flush=True)
                checkpoint_path.unlink(missing_ok=True)
        if not downloaded:
            raise RuntimeError(
                "MobileSAM weights could not be downloaded from any mirror. "
                f"Please download mobile_sam.pt manually and place it at {checkpoint_path}"
            )

    if not checkpoint_path.exists():
        _download_checkpoint()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    try:
        sam = sam_model_registry["vit_t"](checkpoint=str(checkpoint_path))
    except Exception as load_err:
        # Corrupted checkpoint (e.g. partial/interrupted download) — delete and retry once.
        err_str = str(load_err).lower()
        if any(kw in err_str for kw in ("pytorchstreamreader", "zip archive", "central directory", "miniz")):
            print(f"[MobileSAM] Corrupted checkpoint detected, deleting and re-downloading... ({load_err})", flush=True)
            checkpoint_path.unlink(missing_ok=True)
            _download_checkpoint()
            sam = sam_model_registry["vit_t"](checkpoint=str(checkpoint_path))
        else:
            raise
    sam.eval()
    sam.to(device=device)
    _mobile_sam_predictor = SamPredictor(sam)
    print(f"[MobileSAM] Model loaded on {device}.", flush=True)
    return _mobile_sam_predictor


def _cutout_max_edge_px() -> int:
    raw = os.environ.get("UFM_CUTOUT_MAX_EDGE_PX", "1536").strip()
    try:
        v = int(raw)
    except ValueError:
        return 1536
    return max(0, min(v, 4096))


def _maybe_downscale_for_rembg(img: Image.Image, model_name: str | None = None) -> Image.Image:
    """Shrink very large Serper / camera images before rembg to cut RAM + CPU."""
    cap = _cutout_max_edge_px()
    # BiRefNet's Swin Transformer scales quadratically with token count — apply a
    # lower hard cap (768 px) regardless of UFM_CUTOUT_MAX_EDGE_PX to keep the
    # attention matrices bounded. u2net is a plain CNN so no special cap needed.
    effective_model = model_name or REMBG_MODEL
    if effective_model.startswith("birefnet") and (cap <= 0 or cap > 768):
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


class SmartCutoutPoint(BaseModel):
    x: float
    y: float


class SmartCutoutRequest(BaseModel):
    image_path: str | None = None
    cutout_path: str
    positive_points: list[SmartCutoutPoint] = []
    negative_points: list[SmartCutoutPoint] = []
    point_radius: int = 18


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

def _substitute_white_background(img: Image.Image, fill: tuple = (127, 127, 127), tolerance: int = 28) -> Image.Image:
    """Flood-fill corner-connected white/near-white background with a mid-gray.

    Gives rembg / BiRefNet a contrast signal when the product itself is white or
    light-coloured against a white background — without touching the product pixels.
    Returns a new RGB image; the caller should apply the resulting alpha mask to the
    *original* image so pixel colours are preserved.
    """
    import numpy as np
    from collections import deque

    arr = np.array(img.convert("RGB"), dtype=np.int32)
    h, w = arr.shape[:2]

    # Sample representative background colour from a 12×12 patch in each corner.
    def _corner_mean(y0, x0):
        return arr[y0:y0 + 12, x0:x0 + 12].mean(axis=(0, 1))

    _c_means = np.array([
        _corner_mean(0, 0), _corner_mean(0, w - 12),
        _corner_mean(h - 12, 0), _corner_mean(h - 12, w - 12),
    ])
    _c_median = np.median(_c_means, axis=0)
    _c_dist = np.linalg.norm(_c_means - _c_median, axis=1)
    _c_med_dist = float(np.median(_c_dist))
    _c_inliers = _c_dist <= max(2.5 * _c_med_dist, 30.0)
    bg_color = _c_means[_c_inliers].mean(axis=0) if _c_inliers.sum() >= 2 else _c_median

    # Only apply when the detected background is near-white.
    if np.any(bg_color < 200):
        return img.convert("RGB")  # coloured background — no substitution needed

    def _is_bg(y: int, x: int) -> bool:
        return bool(np.all(np.abs(arr[y, x] - bg_color) <= tolerance))

    visited = np.zeros((h, w), dtype=bool)
    queue: deque = deque()

    # Seed from all 4 corners + edge mid-points for better coverage on non-square images.
    seeds = [
        (0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1),
        (0, w // 2), (h - 1, w // 2), (h // 2, 0), (h // 2, w - 1),
    ]
    for sy, sx in seeds:
        if _is_bg(sy, sx) and not visited[sy, sx]:
            visited[sy, sx] = True
            queue.append((sy, sx))

    while queue:
        y, x = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and _is_bg(ny, nx):
                visited[ny, nx] = True
                queue.append((ny, nx))

    result = arr.copy()
    result[visited] = fill
    print(
        f"[cutout] white-bg substitution: replaced {int(visited.sum())} / {h * w} pixels "
        f"({visited.mean():.1%}) with gray — bg_color=({bg_color[0]:.0f},{bg_color[1]:.0f},{bg_color[2]:.0f})",
        flush=True,
    )
    return Image.fromarray(result.astype(np.uint8), "RGB")


def border_trim_background(
    img: Image.Image,
    tolerance: int = 25,
    feather_px: int = 2,
) -> Image.Image:
    """Remove background by BFS flood-fill from the image perimeter.

    Uses two stopping conditions:
    1. Colour similarity — pixel must be within `tolerance` of the detected
       background colour (sampled from corners).
    2. Edge strength — stops at any visible colour gradient even when the
       colour difference is subtle (e.g. ivory packaging on white background).
       This prevents JPEG-blended edge pixels from letting the fill bleed into
       the product's off-white/ivory areas.
    """
    import numpy as np
    from collections import deque

    try:
        import cv2
        _HAS_CV2 = True
    except ImportError:
        _HAS_CV2 = False

    rgb = np.array(img.convert("RGB"), dtype=np.int32)
    h, w = rgb.shape[:2]

    # Sample background colour from 12×12 patches in all 4 corners.
    patch = 12
    corners = [
        rgb[:patch, :patch],
        rgb[:patch, max(0, w - patch):],
        rgb[max(0, h - patch):, :patch],
        rgb[max(0, h - patch):, max(0, w - patch):],
    ]
    # Robust bg estimate: drop corners that are significantly different from the
    # median (e.g. a product that bleeds into one corner of the image).
    corner_means = np.array([c.mean(axis=(0, 1)) for c in corners])  # (4, 3)
    median = np.median(corner_means, axis=0)
    distances = np.linalg.norm(corner_means - median, axis=1)
    med_dist = float(np.median(distances))
    inlier_mask = distances <= max(2.5 * med_dist, 30.0)  # 30 px floor avoids all-same edge case
    bg = corner_means[inlier_mask].mean(axis=0) if inlier_mask.sum() >= 2 else median
    is_white_bg = np.all(bg > 200)

    # Compute Sobel edge strength so we can stop at product boundaries even
    # when the colour difference between product and background is small.
    if _HAS_CV2:
        gray = np.mean(rgb, axis=2).astype(np.float32)
        sx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        sy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        edge_strength = np.sqrt(sx ** 2 + sy ** 2)
        # Threshold: edges above this are treated as product boundaries.
        # For white backgrounds, use 8 so BFS crosses weak bottle-shadow gradients
        # and drains enclosed white floor areas that would otherwise remain.
        # For non-white backgrounds, 15 is safer to avoid eating into the product.
        EDGE_STOP = 8.0 if is_white_bg else 15.0
    else:
        edge_strength = None
        EDGE_STOP = None

    def _is_bg(y: int, x: int) -> bool:
        # Must be colour-similar to background.
        if not np.all(np.abs(rgb[y, x] - bg) <= tolerance):
            return False
        # Must NOT be at a product boundary (visible edge).
        if edge_strength is not None and edge_strength[y, x] >= EDGE_STOP:
            return False
        return True

    # Seed flood-fill from every pixel on the perimeter.
    visited = np.zeros((h, w), dtype=bool)
    queue: deque = deque()

    for x in range(w):
        for y_seed in (0, h - 1):
            if not visited[y_seed, x] and _is_bg(y_seed, x):
                visited[y_seed, x] = True
                queue.append((y_seed, x))
    for y in range(1, h - 1):
        for x_seed in (0, w - 1):
            if not visited[y, x_seed] and _is_bg(y, x_seed):
                visited[y, x_seed] = True
                queue.append((y, x_seed))

    while queue:
        y, x = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and _is_bg(ny, nx):
                visited[ny, nx] = True
                queue.append((ny, nx))

    # Erode the background mask by 1 px so JPEG-blurred edge pixels that slipped
    # past the Sobel gate are not claimed as background.
    # Skip for white-bg: erode re-introduces near-white background pixels as
    # "product", wasting the first ring-cleanup pass undoing its own work.
    if _HAS_CV2 and not is_white_bg:
        visited_u8 = visited.astype(np.uint8)
        kernel = np.ones((3, 3), np.uint8)
        visited_eroded = cv2.erode(visited_u8, kernel, iterations=1).astype(bool)
        visited = visited & visited_eroded

    # Build RGBA: background → transparent, product → opaque.
    rgba = np.array(img.convert("RGBA"), dtype=np.uint8)
    rgba[visited, 3] = 0

    # Feather the alpha channel at the boundary for natural-looking edges.
    # Skip for white-background images — feathering creates semi-transparent near-white
    # pixels that render as a fuzzy white halo on coloured flyer backgrounds.
    if feather_px > 0 and not is_white_bg:
        try:
            import cv2
            alpha = rgba[:, :, 3].astype(np.float32)
            k = feather_px * 2 + 1
            blurred = cv2.GaussianBlur(alpha, (k, k), 0)
            # Only soften pixels at the transition (near the mask boundary).
            boundary = (alpha > 0) & (alpha < 255) | \
                       (cv2.dilate((alpha == 0).astype(np.uint8), np.ones((3, 3), np.uint8)) & (alpha > 0)).astype(bool)
            alpha[boundary] = blurred[boundary]
            rgba[:, :, 3] = alpha.clip(0, 255).astype(np.uint8)
        except ImportError:
            pass  # cv2 not available — hard edges are still clean

    # White-background edge cleanup: iteratively expand the transparent region
    # into near-white territory. JPEG compression blurs the product edge over
    # ~3 pixels; each pass zeros the 1-px near-white ring adjacent to the
    # current transparent region, then the next pass peels the next layer.
    # 4 passes removes ~4px of fringe (1 more than before, compensating for
    # skipping erode which had been wasting 1 pass undoing its own work).
    if is_white_bg and _HAS_CV2:
        for _ in range(4):
            a_ch = rgba[:, :, 3]
            bg_mask = (a_ch == 0).astype(np.uint8)
            bg_dilated = cv2.dilate(bg_mask, np.ones((3, 3), np.uint8))
            ring = bg_dilated.astype(bool) & (a_ch > 0)
            near_white_ring = rgba[:, :, :3].mean(axis=2) > 215
            rgba[ring & near_white_ring, 3] = 0

    pct = float(visited.sum()) / (h * w)
    print(
        f"[border-trim] removed {pct:.1%} of pixels  "
        f"bg=({bg[0]:.0f},{bg[1]:.0f},{bg[2]:.0f})  tol={tolerance}",
        flush=True,
    )
    return Image.fromarray(rgba, "RGBA")


def contour_background(img: Image.Image) -> Image.Image:
    """Remove background using the largest-enclosed-shape technique.

    Instead of flood-filling from the background colour, this finds the largest
    closed contour in the image that does not touch the photo border — which is
    almost always the product outline — and uses it as the alpha mask.

    Works well for products whose colour matches the background (transparent bags,
    white products on white surfaces) because it operates on EDGES, not colours.

    Pipeline:
      1. Canny edge detection  → pencil-sketch of the photo
      2. Morphological closing → seal JPEG-compression gaps in the outline
      3. findContours          → trace every closed loop of edges
      4. Discard border-touching contours (those are background)
      5. Pick the largest remaining contour by area
      6. Fill it as the product mask
      7. 4-pass near-white ring cleanup (same as border_trim_background)
    """
    import numpy as np
    try:
        import cv2
    except ImportError:
        # cv2 unavailable — fall back gracefully by returning original as RGBA
        return img.convert("RGBA")

    rgb = np.array(img.convert("RGB"), dtype=np.uint8)
    h, w = rgb.shape[:2]
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

    # Step 1: Boost local contrast before edge detection.
    # CLAHE (Contrast Limited Adaptive Histogram Equalization) sharpens subtle
    # transitions — e.g. pale yellow pear against white — without blowing out
    # areas that already have good contrast.  This gives Canny much more to work
    # with on low-contrast products.
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Step 2: Canny edge detection on the contrast-enhanced image.
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    edges = cv2.Canny(blurred, threshold1=20, threshold2=60)

    # Step 3: Close gaps — thickens and connects broken edge lines into loops.
    close_kernel = np.ones((5, 5), np.uint8)
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, close_kernel, iterations=2)

    # Step 4: Find all contours.
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        print("[contour-bg] no contours found — returning original as RGBA", flush=True)
        return img.convert("RGBA")

    # Step 5: Discard contours whose actual outline points lie on the image border.
    # Using bounding-rect was wrong: a large product that fills the frame has a
    # bounding rect that reaches the edge even though the product's own curved
    # outline never runs along the border.  Checking actual point coordinates
    # catches only contours that genuinely trace the photo edge.
    margin = 3
    interior = []
    for c in contours:
        pts = c.reshape(-1, 2)
        touches_border = (
            np.any(pts[:, 0] <= margin) or
            np.any(pts[:, 1] <= margin) or
            np.any(pts[:, 0] >= w - margin) or
            np.any(pts[:, 1] >= h - margin)
        )
        if not touches_border:
            interior.append(c)

    candidates = interior if interior else contours  # fall back to all if none qualify

    # Step 5: Pick the largest by area.
    best = max(candidates, key=cv2.contourArea)
    best_area = cv2.contourArea(best)
    pct_covered = best_area / (h * w)

    # Guard: if interior contours exist but the best is tiny (< 5 % of image),
    # the product outline was filtered as border-touching and what remains are
    # skin-texture features / noise (e.g. a close-up mango filling the frame).
    # Returning the original as fully-opaque RGBA is better than a mangled cutout.
    if interior and pct_covered < 0.05:
        print(
            f"[contour-bg] best interior contour too small ({pct_covered:.1%}); "
            "product likely fills frame — returning original as RGBA",
            flush=True,
        )
        return img.convert("RGBA")

    # Step 6: Fill the product mask.
    # Include ALL interior candidate contours with area ≥ 5 % of the best —
    # heat seals, labels, and transparent sections of the same product form
    # separate contours that should all be kept.  Tiny specks (< 5 %) are noise.
    mask = np.zeros((h, w), dtype=np.uint8)
    min_fragment_area = max(best_area * 0.05, 200.0)
    for c in candidates:
        if cv2.contourArea(c) >= min_fragment_area:
            cv2.drawContours(mask, [c], -1, color=255, thickness=cv2.FILLED)

    # Light closing to smooth contour edges and seal tiny JPEG-compression holes
    # within each individual contour.  Keep this kernel small — a large kernel
    # bridges the white-floor gaps between multiple grouped product items (e.g.
    # three bok choy plants side-by-side) and folds background into the mask.
    gap_kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, gap_kernel, iterations=1)

    # Build RGBA with the contour mask as alpha.
    rgba = np.array(img.convert("RGBA"), dtype=np.uint8)
    rgba[:, :, 3] = mask

    # Step 7: 4-pass near-white ring cleanup (same as border_trim_background).
    # Removes JPEG-blurred fringe at the product boundary.
    for _ in range(4):
        a_ch = rgba[:, :, 3]
        bg_mask_arr = (a_ch == 0).astype(np.uint8)
        bg_dilated = cv2.dilate(bg_mask_arr, np.ones((3, 3), np.uint8))
        ring = bg_dilated.astype(bool) & (a_ch > 0)
        near_white_ring = rgba[:, :, :3].mean(axis=2) > 215
        rgba[ring & near_white_ring, 3] = 0

    print(
        f"[contour-bg] best contour area={pct_covered:.1%} of image  "
        f"total={len(contours)}  border_filtered={len(contours)-len(interior)}  candidates={len(candidates)}",
        flush=True,
    )
    return Image.fromarray(rgba, "RGBA")


def _border_white_fraction(img: Image.Image, threshold: int = 240, border_px: int = 8) -> float:
    """Fraction of border-strip pixels that are near-white (all channels > threshold)."""
    import numpy as np
    arr = np.array(img.convert("RGB"))
    h, w = arr.shape[:2]
    b = max(1, min(border_px, h // 4, w // 4))
    strips = [arr[:b, :], arr[h - b:, :], arr[b:h - b, :b], arr[b:h - b, w - b:]]
    border = np.concatenate([s.reshape(-1, 3) for s in strips])
    return float(np.mean(np.all(border > threshold, axis=1)))


def _alpha_coverage(img_rgba: Image.Image) -> float:
    """Fraction of pixels with alpha > 10 (considered opaque/foreground)."""
    import numpy as np
    return float(np.mean(np.array(img_rgba.getchannel("A")) > 10))


def _composite_over_white(img: Image.Image) -> Image.Image:
    """Flatten images with alpha onto white without exposing hidden transparent RGB pixels."""
    if img.mode == "RGBA":
        base = Image.new("RGBA", img.size, (255, 255, 255, 255))
        base.alpha_composite(img)
        return base.convert("RGB")
    if img.mode in ("LA", "PA") or ("transparency" in img.info):
        rgba = img.convert("RGBA")
        base = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        base.alpha_composite(rgba)
        return base.convert("RGB")
    return img.convert("RGB")


def _alpha_border_fraction(img_rgba: Image.Image, threshold: int = 10, border_px: int = 6) -> float:
    """Fraction of border-strip pixels still considered foreground by alpha."""
    import numpy as np
    alpha = np.array(img_rgba.getchannel("A"), dtype=np.uint8)
    h, w = alpha.shape[:2]
    b = max(1, min(border_px, h // 4, w // 4))
    strips = [alpha[:b, :], alpha[h - b:, :], alpha[b:h - b, :b], alpha[b:h - b, w - b:]]
    border = np.concatenate([s.reshape(-1) for s in strips])
    return float(np.mean(border > threshold))


def _alpha_bbox_metrics(img_rgba: Image.Image, threshold: int = 10) -> dict:
    import numpy as np
    alpha = np.array(img_rgba.getchannel("A"), dtype=np.uint8)
    mask = alpha > threshold
    if not np.any(mask):
        return {"bbox_area_ratio": 0.0, "bbox_fill_ratio": 0.0}
    ys, xs = np.where(mask)
    bbox_area = int((xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1))
    img_area = int(alpha.shape[0] * alpha.shape[1])
    fg_count = int(np.count_nonzero(mask))
    return {
        "bbox_area_ratio": float(bbox_area / img_area) if img_area else 0.0,
        "bbox_fill_ratio": float(fg_count / bbox_area) if bbox_area else 0.0,
    }


def _component_count(img_rgba: Image.Image, threshold: int = 10, min_area: int = 75) -> int:
    import numpy as np
    try:
        import cv2
    except ImportError:
        return 0
    alpha = np.array(img_rgba.getchannel("A"), dtype=np.uint8)
    mask = (alpha > threshold).astype(np.uint8) * 255
    num_labels, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    count = 0
    for label_id in range(1, num_labels):
        if int(stats[label_id, cv2.CC_STAT_AREA]) >= min_area:
            count += 1
    return count


def _light_halo_fraction(img_rgba: Image.Image) -> float:
    """Approximate how much retained foreground is pale/gray semi-background."""
    import numpy as np
    arr = np.array(img_rgba.convert("RGBA"), dtype=np.uint8)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]
    fg = alpha > 10
    fg_count = int(np.count_nonzero(fg))
    if fg_count == 0:
        return 0.0
    light = np.all(rgb > 215, axis=2)
    semi = (alpha > 10) & (alpha < 250)
    return float(np.count_nonzero(fg & light & semi) / fg_count)


def _cutout_quality(img_rgba: Image.Image, is_white_bg: bool) -> dict:
    coverage = _alpha_coverage(img_rgba)
    border_alpha = _alpha_border_fraction(img_rgba)
    bbox = _alpha_bbox_metrics(img_rgba)
    component_count = _component_count(img_rgba)
    light_halo = _light_halo_fraction(img_rgba)
    reason = None

    if coverage < 0.04:
        reason = "foreground-too-small"
    elif (not is_white_bg) and coverage > 0.87 and bbox["bbox_area_ratio"] > 0.94:
        reason = "background-retained"
    elif border_alpha > 0.55:
        reason = "opaque-border"
    elif border_alpha > 0.22 and coverage > 0.65:
        reason = "border-background-retained"
    elif bbox["bbox_area_ratio"] > 0.94 and coverage > 0.80:
        reason = "full-rectangle-mask"
    elif component_count > 25:
        reason = "fragmented-mask"
    elif border_alpha > 0.12 and light_halo > 0.30:
        reason = "light-gray-halo"

    return {
        "alpha_coverage": round(coverage, 3),
        "border_alpha": round(border_alpha, 3),
        "component_count": component_count,
        "bbox_area_ratio": round(bbox["bbox_area_ratio"], 3),
        "bbox_fill_ratio": round(bbox["bbox_fill_ratio"], 3),
        "light_halo": round(light_halo, 3),
        "quality_reason": reason,
    }


def remove_stray_blobs(
    img_rgba: Image.Image,
    rel_threshold: float = 0.02,
    abs_min_px: int = 200,
) -> Image.Image:
    """Remove small disconnected foreground islands (floating brand badges, rembg artifacts).

    Keeps any connected component whose area >= max(abs_min_px, total_fg * rel_threshold).
    At 2%, floating brand badges (<1% of foreground) are wiped; multi-item products (≥20%) survive.
    """
    import numpy as np
    try:
        import cv2
    except ImportError:
        print("[cutout] cv2 not available — skipping blob removal", flush=True)
        return img_rgba

    alpha = np.array(img_rgba.getchannel("A"), dtype=np.uint8)
    mask = (alpha > 0).astype(np.uint8) * 255
    total_fg = int(np.count_nonzero(mask))
    if total_fg == 0:
        return img_rgba

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    keep_threshold = max(abs_min_px, int(total_fg * rel_threshold))

    removed_count = 0
    removed_px = 0
    keep_mask = np.zeros_like(alpha, dtype=bool)
    for label_id in range(1, num_labels):  # label 0 is always background in OpenCV
        area = int(stats[label_id, cv2.CC_STAT_AREA])
        if area >= keep_threshold:
            keep_mask |= (labels == label_id)
        else:
            removed_count += 1
            removed_px += area

    if removed_count == 0:
        return img_rgba

    print(
        f"[cutout] blob removal: kept {num_labels - 1 - removed_count}/{num_labels - 1} components, "
        f"removed {removed_count} blobs ({removed_px} px, threshold={keep_threshold} px)",
        flush=True,
    )
    new_alpha = np.where(keep_mask, alpha, 0).astype(np.uint8)
    rgba_arr = np.array(img_rgba)
    rgba_arr[:, :, 3] = new_alpha
    return Image.fromarray(rgba_arr, "RGBA")


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


def _defringe_white_bg(img_rgba: Image.Image) -> Image.Image:
    """
    Remove white fringe from semi-transparent edge pixels produced by rembg on
    white-background product images.

    When rembg removes a white background it leaves edge pixels with partial alpha
    that still carry the white background color mixed into their RGB. Those pixels
    appear as a fuzzy white halo when composited over any non-white surface.

    Derivation (straight-alpha compositing over white):
        pixel = product * alpha + 255 * (1 - alpha)
        product = (pixel - 255 * (1 - alpha)) / alpha

    Only semi-transparent pixels are adjusted; fully opaque/transparent ones are
    left untouched.
    """
    import numpy as _np
    arr = _np.array(img_rgba, dtype=_np.float32)
    alpha = arr[:, :, 3] / 255.0

    semi = (alpha > 0.01) & (alpha < 0.99)
    if not semi.any():
        return img_rgba

    a = alpha[semi, _np.newaxis]          # (N, 1)
    rgb = arr[semi, :3]                   # (N, 3)
    corrected = (rgb - 255.0 * (1.0 - a)) / a
    corrected = _np.clip(corrected, 0, 255)

    result = arr.copy()
    result[semi, :3] = corrected
    return Image.fromarray(result.astype(_np.uint8), "RGBA")


# ---------- CUTOUT ----------
@app.post("/cutout")
async def cutout(request: Request, file: UploadFile = File(...), model: str | None = Form(None)):
    async with _cutout_lock:
        try:
            request_model = (model or REMBG_MODEL).strip()
            if not request_model:
                request_model = REMBG_MODEL
            data = await file.read()
            if request_model != REMBG_MODEL:
                print(f"[cutout] model override requested: {REMBG_MODEL} -> {request_model}", flush=True)
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
                src_img = _maybe_downscale_for_rembg(src_img, request_model)
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

            # ── Border-trim fast path (no ML model) ──────────────────────────────
            # Flood-fill from image perimeter removes edge-connected background
            # directly as alpha transparency. Bypasses all model loading / padding.
            if request_model == "border-trim":
                # If the input is an RGBA image (e.g. a shadow/cutout PNG re-sent for
                # a redo), PIL's convert("RGB") would fill transparent pixels with black,
                # making bg=(0,0,0) and causing dark product pixels to be eaten.
                # Composite over white first so transparent areas become white background.
                if src_img.mode == "RGBA":
                    src_img_bt = _composite_over_white(src_img)
                    print("[border-trim] RGBA input composited over white before BFS")
                else:
                    src_img_bt = src_img
                img_bt = await asyncio.to_thread(border_trim_background, src_img_bt)
                is_white_bg_bt = _border_white_fraction(src_img_bt) > 0.85
                if is_white_bg_bt:
                    img_bt = _defringe_white_bg(img_bt)
                quality = _cutout_quality(img_bt, is_white_bg_bt)

                # If border-trim is low-confidence on a white-background image,
                # try the contour-based approach before falling back to heavy ML.
                model_used = "border-trim"
                if quality["quality_reason"] is not None and is_white_bg_bt:
                    print("[border-trim] low confidence on white-bg — trying contour-bg", flush=True)
                    img_cb = await asyncio.to_thread(contour_background, src_img_bt)
                    quality_cb = _cutout_quality(img_cb, is_white_bg_bt)
                    if quality_cb["quality_reason"] is None:
                        img_bt = img_cb
                        quality = quality_cb
                        model_used = "contour-bg"
                        print("[border-trim] contour-bg passed quality check — using it", flush=True)
                    else:
                        print("[border-trim] contour-bg also low confidence — leaving for ML fallback", flush=True)

                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                    img_bt.save(f.name, format="PNG")
                    return {
                        "output_path": f.name,
                        "alpha_coverage": quality["alpha_coverage"],
                        "low_confidence": quality["quality_reason"] is not None,
                        "model": model_used,
                        **quality,
                    }

            # ── Contour-cut fast path (largest-enclosed-shape, no ML model) ─────
            # Edge-detection based: finds the largest closed contour that does not
            # touch the image border.  Works even when product colour == background
            # colour (transparent bags, white products on white surfaces).
            if request_model == "contour-bg":
                if src_img.mode == "RGBA":
                    src_img_cb = _composite_over_white(src_img)
                    print("[contour-bg] RGBA input composited over white", flush=True)
                else:
                    src_img_cb = src_img
                img_cb = await asyncio.to_thread(contour_background, src_img_cb)
                is_white_bg_cb = _border_white_fraction(src_img_cb) > 0.85
                if is_white_bg_cb:
                    img_cb = _defringe_white_bg(img_cb)
                quality_cb = _cutout_quality(img_cb, is_white_bg_cb)
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                    img_cb.save(f.name, format="PNG")
                    return {
                        "output_path": f.name,
                        "alpha_coverage": quality_cb["alpha_coverage"],
                        "low_confidence": quality_cb["quality_reason"] is not None,
                        "model": "contour-bg",
                        **quality_cb,
                    }

            # Option B: detect clean white background before rembg.
            # White-background images (official product shots) work fine with rembg, but
            # knowing the bg is clean lets us skip the false-positive high-coverage check.
            white_bg_fraction = _border_white_fraction(src_img)
            is_white_bg = white_bg_fraction > 0.85
            if is_white_bg:
                print(f"[cutout] white background detected ({white_bg_fraction:.0%}) — rembg should produce clean result", flush=True)

            # For white-background images, substitute the corner-connected white background
            # with mid-gray before sending to the model. This gives all models (rembg,
            # BiRefNet, SAM) a visible contrast edge to work with when the product itself
            # is light-coloured or white. The alpha mask from the model is later re-applied
            # to the *original* pixels so product colours are fully preserved.
            BORDER = 40
            src_rgb = _composite_over_white(src_img)
            if is_white_bg:
                model_input_rgb = await asyncio.to_thread(_substitute_white_background, src_rgb)
                pad_color = (140, 140, 140)  # contrasting gray — not white — so edge is visible
            else:
                model_input_rgb = src_rgb
                pad_color = (255, 255, 255)
            padded = Image.new("RGB", (src_img.width + BORDER * 2, src_img.height + BORDER * 2), pad_color)
            padded.paste(model_input_rgb, (BORDER, BORDER))
            pad_buf = io.BytesIO()
            padded.save(pad_buf, format="PNG")
            padded_data = pad_buf.getvalue()

            # Wait for background model load (handles first-time download gracefully)
            if not _model_ready.is_set():
                print("[cutout] waiting for model to finish loading …", flush=True)
                await asyncio.to_thread(_model_ready.wait, 3600)
            request_uses_bria = _is_bria_model(request_model)
            if request_uses_bria and _bria_model is None:
                return JSONResponse(status_code=503, content={"error": "BRIA model failed to load"})
            if not request_uses_bria and request_model != "border-trim" and request_model == REMBG_MODEL and _rembg_session is None:
                return JSONResponse(status_code=503, content={"error": "Model failed to load"})

            before_mb = _rss_mb()
            print(f"[mem] before inference ({request_model}, {padded.width}x{padded.height}px): {before_mb:.0f} MB", flush=True)
            if request_uses_bria:
                out_padded, peak_mb = await asyncio.to_thread(
                    _run_with_peak_rss, _run_bria_inference, padded_data
                )
            elif request_model != REMBG_MODEL:
                out_padded, peak_mb = await asyncio.to_thread(
                    _run_with_peak_rss, _run_rembg_with_new_session, padded_data, request_model
                )
            else:
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
            # Preserve original pixels for re-application when background was substituted.
            original_rgb_for_mask = src_rgb if is_white_bg else None
            del data, src_img, src_rgb, model_input_rgb, padded, pad_buf, padded_data  # free input buffers before GC so they're actually collected
            gc.collect()
            print(f"[mem] after gc.collect(): {_rss_mb():.0f} MB", flush=True)
            print(f"[cutout] rembg produced {len(out_padded)} bytes")

            # Crop back to the original dimensions (strip the added border)
            padded_result = Image.open(io.BytesIO(out_padded)).convert("RGBA")
            img = padded_result.crop((BORDER, BORDER, BORDER + src_w, BORDER + src_h))

            # Re-apply alpha mask to original (non-substituted) pixels so the product
            # retains its true colours — the gray-substituted version was only used to
            # help the model find edges, not as the final colour source.
            if original_rgb_for_mask is not None:
                import numpy as _np
                alpha_channel = _np.array(img.getchannel("A"))
                orig_rgba = original_rgb_for_mask.convert("RGBA")
                orig_arr = _np.array(orig_rgba)
                orig_arr[:, :, 3] = alpha_channel
                img = Image.fromarray(orig_arr, "RGBA")
                del original_rgb_for_mask
                img = _defringe_white_bg(img)

            # Remove floating brand badge blobs (small disconnected foreground islands)
            if _BLOB_REMOVAL:
                img = remove_stray_blobs(img)

            img = normalize_orientation(img)

            quality = _cutout_quality(img, is_white_bg)
            coverage = quality["alpha_coverage"]
            low_confidence = quality["quality_reason"] is not None
            if low_confidence:
                print(
                    f"[cutout] low confidence cutout: reason={quality['quality_reason']}, "
                    f"coverage={coverage:.1%}, border_alpha={quality['border_alpha']:.1%}, "
                    f"components={quality['component_count']}, white_bg={is_white_bg}",
                    flush=True,
                )
            else:
                print(
                    f"[cutout] cutout ok: coverage={coverage:.1%}, "
                    f"border_alpha={quality['border_alpha']:.1%}, white_bg={is_white_bg}",
                    flush=True,
                )

            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                img.save(f.name, format="PNG")
                print(f"[cutout] saved to {f.name}")
                result = {
                    "output_path": f.name,
                    "alpha_coverage": coverage,
                    "low_confidence": low_confidence,
                    "model": request_model,
                    **quality,
                }

            # Transformer-based models (birefnet) hold ~6 GB of ORT workspace buffers
            # that gc.collect() cannot free — only destroying the InferenceSession
            # releases them. Tear down and synchronously reload here, while still
            # holding _cutout_lock, so the session is ready for the next request.
            if request_model == REMBG_MODEL and REMBG_MODEL.startswith("birefnet"):
                await asyncio.to_thread(_teardown_and_reload_session)

            return result

        except Exception as e:
            import traceback
            traceback.print_exc()
            return JSONResponse(status_code=500, content={"error": str(e)})


# ---------- INTERACTIVE CUTOUT REFINEMENT ----------
@app.post("/interactive-cutout")
async def interactive_cutout(req: SmartCutoutRequest):
    """
    MobileSAM-based interactive cutout refinement.

    Uses Meta's MobileSAM (Segment Anything, mobile distillation) with user
    point prompts. SAM works on learned visual embeddings — edges, textures,
    object shape — not pixel color, so it handles transparent packaging and
    other hard cases that confuse GrabCut's color-cluster approach.
    """
    async with _sam_lock:
        try:
            import numpy as np
            import cv2

            if not req.positive_points and not req.negative_points:
                return JSONResponse(status_code=400, content={"error": "At least one keep/remove point is required"})
            cutout_path = _existing_cutout_path(req.cutout_path)
            if not cutout_path or not os.path.exists(cutout_path):
                return JSONResponse(status_code=400, content={"error": f"cutout_path does not exist: {req.cutout_path!r}"})

            image_path = _normalize_local_path(req.image_path)
            cutout = Image.open(cutout_path).convert("RGBA")
            w, h = cutout.size

            # Prefer original photo for embedding; fall back to base cutout or current cutout
            preferred_cutout_source = _prefer_base_cutout_source(cutout_path)
            if image_path and os.path.exists(image_path) and image_path != cutout_path:
                source_path = image_path
            elif preferred_cutout_source:
                source_path = preferred_cutout_source
            else:
                source_path = cutout_path

            source = Image.open(source_path).convert("RGBA")
            if source.size != cutout.size:
                try:
                    resample = Image.Resampling.LANCZOS
                except AttributeError:
                    resample = Image.LANCZOS
                source = source.resize(cutout.size, resample)

            # Existing rembg alpha — used for post-processing only
            alpha = np.array(cutout.getchannel("A"), dtype=np.uint8)
            radius = max(3, min(int(req.point_radius or 18), max(8, min(w, h) // 4)))

            # Build user-seed masks for post-processing (negative clicks = hard bg override)
            user_bg_mask = np.zeros((h, w), dtype=np.uint8)
            for p in req.negative_points:
                x = int(round(max(0, min(w - 1, p.x))))
                y = int(round(max(0, min(h - 1, p.y))))
                cv2.circle(user_bg_mask, (x, y), radius, 255, thickness=-1)

            # Prepare RGB for SAM (composite transparent pixels over white so SAM
            # sees surface texture rather than undefined black areas)
            if source_path == cutout_path:
                source_rgb_img = _composite_over_white(source)
            else:
                source_rgb_img = source.convert("RGB")
            source_rgb = np.array(source_rgb_img, dtype=np.uint8)

            # Build SAM point arrays
            pos_coords = [(p.x, p.y) for p in req.positive_points]
            neg_coords = [(p.x, p.y) for p in req.negative_points]
            all_coords = pos_coords + neg_coords
            all_labels = [1] * len(pos_coords) + [0] * len(neg_coords)

            try:
                # Run in a thread so the download + model load (first call) and
                # CPU-bound SAM inference never block the event loop — the /health
                # endpoint must stay responsive even during the ~9 MB weight download.
                _all_coords = np.array(all_coords, dtype=np.float32)
                _all_labels = np.array(all_labels, dtype=np.int32)
                _source_rgb = source_rgb  # local ref for closure

                def _run_sam():
                    pred = _get_sam_predictor()
                    pred.set_image(_source_rgb)
                    return pred.predict(
                        point_coords=_all_coords,
                        point_labels=_all_labels,
                        multimask_output=True,
                    )

                masks, scores, _ = await asyncio.to_thread(_run_sam)
                # SAM returns 3 masks at different scales; pick the highest-confidence one
                best_idx = int(np.argmax(scores))
                fg_mask = (masks[best_idx].astype(np.uint8)) * 255

                print(
                    f"[interactive-cutout] SAM ok — fg {fg_mask.mean() / 255:.1%} "
                    f"(score {scores[best_idx]:.3f})",
                    flush=True,
                )
            except Exception as sam_err:
                print(f"[interactive-cutout] SAM failed ({sam_err}), falling back to rembg alpha", flush=True)
                fg_mask = alpha.copy()

            # Lock rembg's high-confidence foreground (trust rembg for clearly-opaque
            # regions that SAM might clip) unless the user explicitly clicked remove there
            rembg_sure_fg = (alpha > 230) & (user_bg_mask == 0)
            fg_mask[rembg_sure_fg] = 255

            refined_alpha = cv2.GaussianBlur(fg_mask, (3, 3), 0)

            # Compose output using source RGB for pixel colours
            source_arr = np.array(source.convert("RGBA"), dtype=np.uint8)
            out_arr = source_arr.copy()
            out_arr[:, :, 3] = refined_alpha
            out = Image.fromarray(out_arr, "RGBA")

            quality = _cutout_quality(out, _border_white_fraction(source) > 0.85)
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                out.save(f.name, format="PNG")
                return {
                    "output_path": f.name,
                    "alpha_coverage": quality["alpha_coverage"],
                    "low_confidence": quality["quality_reason"] is not None,
                    **quality,
                }
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
