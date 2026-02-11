# FILE: apps/desktop/backend/src/cutout_service/server.py
# FULL FILE — FIXES NameError: io is not defined
# ALL EXISTING BEHAVIOR PRESERVED

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os, sys, subprocess, json, asyncio, tempfile, io

from PIL import Image, ExifTags
from rembg import remove

app = FastAPI()
ocr_lock = asyncio.Lock()


class OCRRequest(BaseModel):
    image_path: str


@app.get("/health")
def health():
    return {"ok": True}


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
async def cutout(file: UploadFile = File(...)):
    try:
        data = await file.read()
        print(f"[cutout] received {len(data)} bytes, filename={file.filename}, content_type={file.content_type}")

        # Validate we can open this as an image first
        try:
            src_img = Image.open(io.BytesIO(data))
            print(f"[cutout] input image: format={src_img.format}, size={src_img.size}, mode={src_img.mode}")
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

        out = remove(data)
        print(f"[cutout] rembg produced {len(out)} bytes")

        img = Image.open(io.BytesIO(out))
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

        proc = subprocess.run(
            [
                sys.executable,
                "-u",
                "-c",
                code,
                req.image_path,
                backend_src,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        if proc.returncode != 0:
            print("OCR SUBPROCESS ERROR:", proc.stderr)
            return JSONResponse(content=[])

        try:
            data = json.loads(proc.stdout)
        except Exception as e:
            print("OCR JSON PARSE ERROR:", e)
            print("STDOUT:", proc.stdout)
            print("STDERR:", proc.stderr)
            return JSONResponse(content=[])

        return JSONResponse(content=data if isinstance(data, list) else [data])
