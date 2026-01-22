from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os, sys, subprocess, json, asyncio, tempfile

app = FastAPI()
ocr_lock = asyncio.Lock()

class OCRRequest(BaseModel):
    image_path: str

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/cutout")
async def cutout(file: UploadFile = File(...)):
    from rembg import remove
    data = await file.read()
    out = remove(data)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(out)
        return {"output_path": f.name}

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
