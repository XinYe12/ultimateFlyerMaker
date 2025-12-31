from fastapi import FastAPI, UploadFile, File
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from rembg import remove
import tempfile
import ast
import os
from ocr.ocr_engine import run_ocr
import inspect


app = FastAPI()

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/cutout")
async def cutout(file: UploadFile = File(...)):
    input_bytes = await file.read()
    output_bytes = remove(input_bytes)
    return Response(content=output_bytes, media_type="image/png")

class OCRRequest(BaseModel):
    image_path: str

@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    contents = await file.read()

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(contents)
        temp_path = f.name

    result = run_ocr(temp_path)

    # ✅ result is dict -> result["text"] is a STRING
    # ✅ We DO NOT parse it
    # ✅ We extract rec_texts by running OCR AGAIN properly

    if isinstance(result, dict) and "raw" in result:
        raise RuntimeError("Wrong OCR engine in use")

    # ✅ Correct path (works with PaddleX)
    rec_texts = result["rec_texts"] if "rec_texts" in result else []

    return { "rec_texts": rec_texts }
