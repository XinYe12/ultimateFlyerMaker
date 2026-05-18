import os
import sys
import json
import logging
from typing import List, Dict, Any

# Suppress PaddleOCR/PaddleX verbose init logs (replaces the removed show_log arg)
logging.getLogger("paddleocr").setLevel(logging.ERROR)
logging.getLogger("paddlex").setLevel(logging.ERROR)

# -----------------------------
# Hard caps for low-end machines
# -----------------------------
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from paddleocr import PaddleOCR

# -----------------------------
# Singleton OCR instance
# -----------------------------
_ocr = None

def _get_ocr() -> PaddleOCR:
    global _ocr
    if _ocr is None:
        _ocr = PaddleOCR(
            use_textline_orientation=False,  # v3 name for use_angle_cls
            lang="en",
            # show_log removed — no longer a valid arg in PaddleOCR 3.x
        )
    return _ocr


# -----------------------------
# Public entry point
# -----------------------------
def run_ocr(image_path: str) -> List[Dict[str, Any]]:
    """
    OCR on ORIGINAL image only.
    Returns:
      [
        {
          "rec_texts": [str, ...],
          "rec_scores": [float, ...]
        }
      ]
    """
    if not image_path or not os.path.exists(image_path):
        return [{"rec_texts": [], "rec_scores": []}]

    ocr = _get_ocr()

    try:
        # predict() is the v3 API; ocr() is a deprecated alias for it
        results = ocr.predict(image_path)
    except Exception as e:
        # Fail closed, never crash caller
        return [{"rec_texts": [], "rec_scores": []}]

    rec_texts: List[str] = []
    rec_scores: List[float] = []

    # results is a list of OCRResult (dict-like) objects:
    # each has "rec_texts": [str, ...] and "rec_scores": [float, ...]
    for res in results:
        for text in res.get("rec_texts", []):
            if isinstance(text, str) and text.strip():
                rec_texts.append(text.strip())
        for score in res.get("rec_scores", []):
            try:
                rec_scores.append(float(score))
            except Exception:
                rec_scores.append(0.0)

    return [{"rec_texts": rec_texts, "rec_scores": rec_scores}]


# -----------------------------
# CLI / subprocess support
# -----------------------------
if __name__ == "__main__":
    # Expected usage:
    #   python ocr_engine.py /path/to/image.jpg
    if len(sys.argv) < 2:
        print(json.dumps([{"rec_texts": [], "rec_scores": []}]))
        sys.exit(0)

    image_path = sys.argv[1]
    result = run_ocr(image_path)
    print(json.dumps(result))
