import json
import requests
import sys
import os

# CHANGE THIS TO A REAL IMAGE PATH YOU KNOW EXISTS
IMAGE_PATH = sys.argv[1] if len(sys.argv) > 1 else None

if not IMAGE_PATH or not os.path.exists(IMAGE_PATH):
    print("❌ Provide a valid image path:")
    print("   python test_ocr_pipeline.py /path/to/image.jpg")
    sys.exit(1)

URL = "http://127.0.0.1:17890/ocr"

print("▶ Sending OCR request")
print("  image_path =", IMAGE_PATH)

res = requests.post(
    URL,
    json={"image_path": IMAGE_PATH},
    timeout=30,
)

print("\n▶ HTTP status:", res.status_code)
print("▶ Raw response text:")
print(res.text)

try:
    data = res.json()
except Exception as e:
    print("\n❌ JSON parse failed:", e)
    sys.exit(1)

print("\n▶ Parsed JSON type:", type(data))
print("▶ Parsed JSON value:")
print(json.dumps(data, indent=2, ensure_ascii=False))

if not isinstance(data, list):
    print("\n❌ FAIL: response is NOT a list")
    sys.exit(1)

if not data:
    print("\n❌ FAIL: response is empty list")
    sys.exit(1)

item = data[0]
if "rec_texts" not in item:
    print("\n❌ FAIL: rec_texts missing")
    sys.exit(1)

print("\n✅ SUCCESS")
print("OCR TEXT:")
print("\n".join(item["rec_texts"]))
