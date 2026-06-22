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


def _bbox_from_poly(poly):
    if not poly:
        return None
    try:
        pts = [[float(p[0]), float(p[1])] for p in poly]
    except Exception:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    w = max(1, int(round(x1 - x0)))
    h = max(1, int(round(y1 - y0)))
    return int(round(x0)), int(round(y0)), w, h


def _append_text_block(text_blocks, text, score, poly):
    if not isinstance(text, str) or not text.strip():
        return
    bbox = _bbox_from_poly(poly)
    block = {
        "text": text.strip(),
        "score": float(score) if score is not None else 0.0,
    }
    if bbox:
        block["x"], block["y"], block["width"], block["height"] = bbox
    text_blocks.append(block)


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
          "rec_scores": [float, ...],
          "text_blocks": [{text, score, x?, y?, width?, height?}, ...]
        }
      ]
    """
    empty = [{"rec_texts": [], "rec_scores": [], "text_blocks": []}]
    if not image_path or not os.path.exists(image_path):
        return empty

    ocr = _get_ocr()

    try:
        # predict() is the v3 API; ocr() is a deprecated alias for it
        results = ocr.predict(image_path)
    except Exception:
        # Fail closed, never crash caller
        return empty

    rec_texts: List[str] = []
    rec_scores: List[float] = []
    text_blocks: List[Dict[str, Any]] = []

    # results is a list of OCRResult (dict-like) objects:
    # each has "rec_texts": [str, ...] and "rec_scores": [float, ...]
    for res in results:
        texts = res.get("rec_texts", []) or []
        scores = res.get("rec_scores", []) or []
        polys = res.get("rec_polys") or res.get("dt_polys") or []

        for i, text in enumerate(texts):
            if isinstance(text, str) and text.strip():
                rec_texts.append(text.strip())
            score = scores[i] if i < len(scores) else 0.0
            try:
                rec_scores.append(float(score))
            except Exception:
                rec_scores.append(0.0)
            poly = polys[i] if i < len(polys) else None
            _append_text_block(text_blocks, text, score, poly)

    return [{"rec_texts": rec_texts, "rec_scores": rec_scores, "text_blocks": text_blocks}]


# -----------------------------
# CLI / subprocess support
# -----------------------------
if __name__ == "__main__":
    # Expected usage:
    #   python ocr_engine.py /path/to/image.jpg
    if len(sys.argv) < 2:
        print(json.dumps([{"rec_texts": [], "rec_scores": [], "text_blocks": []}]))
        sys.exit(0)

    image_path = sys.argv[1]
    result = run_ocr(image_path)
    print(json.dumps(result))
