from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
import tempfile
import os
import subprocess
import json
import sys
import asyncio

def extract_rec_texts(result):
    texts = []

    if isinstance(result, list):
        for item in result:
            if isinstance(item, dict):
                if "rec_texts" in item and isinstance(item["rec_texts"], list):
                    texts.extend(item["rec_texts"])

                # PaddleX sometimes nests results
                for v in item.values():
                    if isinstance(v, dict) and "rec_texts" in v:
                        texts.extend(v.get("rec_texts", []))

    elif isinstance(result, dict):
        if "rec_texts" in result:
            texts.extend(result.get("rec_texts", []))

        for v in result.values():
            if isinstance(v, dict) and "rec_texts" in v:
                texts.extend(v.get("rec_texts", []))

    return [t for t in texts if isinstance(t, str) and t.strip()]


app = FastAPI()

# REQUIRED for PaddleX (packaging-safe)
os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "True"

ocr_lock = asyncio.Lock()

# ---------- HEALTH ----------
@app.get("/health")
def health():
    return {"ok": True}

# ---------- CUTOUT ----------
class CutoutRequest(BaseModel):
    filePath: str

@app.post("/cutout")
def cutout(req: CutoutRequest):
    if not os.path.isfile(req.filePath):
        raise HTTPException(status_code=400, detail="File not found")

    from rembg import remove

    with open(req.filePath, "rb") as f:
        input_bytes = f.read()

    output_bytes = remove(input_bytes)
    return Response(content=output_bytes, media_type="image/png")

# ---------- OCR ----------
@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    async with ocr_lock:
        contents = await file.read()

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(contents)
            temp_path = f.name

        try:
            env = os.environ.copy()
            env["DISABLE_MODEL_SOURCE_CHECK"] = "True"

            # FIXED PYTHONPATH (DO NOT CHANGE)
            backend_src = os.path.dirname(
                os.path.dirname(os.path.dirname(__file__))
            )
            env["PYTHONPATH"] = backend_src

            proc = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    (
                        "import sys,json;"
                        "from ocr.ocr_engine import run_ocr;"
                        "res=run_ocr(sys.argv[1]);"
                        "print(json.dumps(res, ensure_ascii=False))"
                    ),
                    temp_path,
                ],
                capture_output=True,
                text=True,
                env=env,
            )

            # If subprocess failed, do NOT crash the pipeline
            if proc.returncode != 0:
                return JSONResponse(content={"rec_texts": []})

            try:
                result = json.loads(proc.stdout)
            except Exception:
                return JSONResponse(content={"rec_texts": []})


        finally:
            try:
                os.unlink(temp_path)
            except Exception:
                pass
        rec_texts = extract_rec_texts(result)
        return JSONResponse(content={"rec_texts": rec_texts})

# ---------- DEBUG OCR (NO FRONTEND) ----------
@app.get("/_debug_ocr")
def debug_ocr():
    from ocr.ocr_engine import run_ocr

    cutouts_dir = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            "..",  # src
            "..",  # backend
            "..",  # desktop
            "apps",
            "desktop",
            "project_assets",
            "cutouts",
        )
    )

    if not os.path.isdir(cutouts_dir):
        return {"error": f"cutouts dir not found: {cutouts_dir}"}

    pngs = [f for f in os.listdir(cutouts_dir) if f.endswith(".png")]
    if not pngs:
        return {"error": "no cutout images found"}

    img_path = os.path.join(cutouts_dir, pngs[0])

    result = run_ocr(img_path)

    # force JSON-safe output
    def safe(x):
        if isinstance(x, (str, int, float, bool)) or x is None:
            return x
        if isinstance(x, list):
            return [safe(i) for i in x]
        if isinstance(x, dict):
            return {k: safe(v) for k, v in x.items()}
        return str(x)

    return JSONResponse(content=safe(result))



# ---------- ENTRY ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.environ.get("UFM_HOST", "127.0.0.1"),
        port=int(os.environ.get("UFM_PORT", "17890")),
        log_level="info",
    )
