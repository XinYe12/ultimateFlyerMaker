# apps/desktop/backend/src/ocr/ocr_engine.py

import threading
from typing import Any, Dict, List

# If you are using PaddleX pipelines, keep it here.
# Adjust imports to match your current implementation.
from paddlex import create_pipeline

_lock = threading.Lock()
_pipeline = None


def _get_pipeline():
    """
    Create the OCR pipeline ONCE per process.
    """
    global _pipeline
    if _pipeline is not None:
        return _pipeline

    with _lock:
        if _pipeline is not None:
            return _pipeline

        # ✅ Create only once
        # NOTE: this name must match what you used before.
        # If your original code used a different pipeline name, keep it.
        _pipeline = create_pipeline(pipeline="OCR")

        return _pipeline
def run_ocr(image_path: str):
    pipe = _get_pipeline()
    result = pipe.predict(image_path)

    if not result:
        return []

    cleaned = []

    for item in result:
        if not isinstance(item, dict):
            continue

        rec_texts = item.get("rec_texts", [])
        rec_scores = item.get("rec_scores", [])

        safe_texts = []
        for t in rec_texts:
            if isinstance(t, str):
                safe_texts.append(t)

        cleaned.append({
            "rec_texts": safe_texts,
            "rec_scores": rec_scores[:len(safe_texts)]
        })

    return cleaned
