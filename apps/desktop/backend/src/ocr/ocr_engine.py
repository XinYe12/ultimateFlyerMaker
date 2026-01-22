import os
import sys
import json
from typing import List, Dict, Any

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
            use_angle_cls=False,
            lang="en",
            show_log=False
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
        result = ocr.ocr(image_path, cls=False)
        print("=== RAW OCR RESULT ===")
        print(result)
        print("======================")

    except Exception as e:
        # Fail closed, never crash caller
        return [{"rec_texts": [], "rec_scores": []}]

    rec_texts = []
    rec_scores = []

    # PaddleOCR may return:
    # Shape A: [ [box, (text, score)], ... ]
    # Shape B: [ [ [box, (text, score)], ... ] ]
    pages = result if isinstance(result, list) else []

    for page in pages:
        if not isinstance(page, list):
            continue

        for line in page:
            if not isinstance(line, (list, tuple)) or len(line) != 2:
                continue

            box, rec = line
            if not isinstance(rec, (list, tuple)) or len(rec) != 2:
                continue

            text, score = rec
            if not isinstance(text, str) or not text.strip():
                continue

            rec_texts.append(text.strip())
            try:
                rec_scores.append(float(score))
            except Exception:
                rec_scores.append(0.0)


    return [{
        "rec_texts": rec_texts,
        "rec_scores": rec_scores
    }]


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
