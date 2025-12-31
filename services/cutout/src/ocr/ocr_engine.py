from paddleocr import PaddleOCR
import cv2

from paddleocr import PaddleOCR
import cv2
import numpy as np

def run_ocr(image_path: str) -> dict:
    print("RUN_OCR CALLED WITH:", image_path)

    img = cv2.imread(image_path)
    print("IMAGE SHAPE:", img.shape if img is not None else None)

    ocr = PaddleOCR(lang="ch", use_angle_cls=True)

    result = ocr.ocr(img)
    print("RAW OCR RESULT TYPE:", type(result))
    print("RAW OCR RESULT:", result)

    return {
        "rec_texts": result[0]["rec_texts"]
    }

