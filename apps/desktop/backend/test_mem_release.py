"""
Memory-release verification for birefnet ORT workspace fix.
Sends two /cutout requests, polls /debug/mem before, between, and after.
Expected: RSS after request 2 should be close to RSS after request 1 (not cumulative).
"""
import sys, time, subprocess, os, requests, json, threading, signal

BACKEND_URL = "http://127.0.0.1:17890"
VENV_PYTHON = os.path.join(os.path.dirname(__file__), ".venv", "Scripts", "python.exe")
TEST_IMAGE  = os.path.join(os.path.dirname(__file__), "..", "..", "..", "screenshots", "weekly_p1_img1.png")
MODEL       = os.environ.get("UFM_REMBG_MODEL", "birefnet-general-lite")

def mem():
    try:
        r = requests.get(f"{BACKEND_URL}/debug/mem", timeout=5)
        d = r.json()
        return d.get("rss_mb", -1), d.get("model", "?")
    except Exception as e:
        return -1, str(e)

def wait_ready(timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(f"{BACKEND_URL}/health", timeout=3)
            if r.json().get("ready"):
                return True
        except:
            pass
        time.sleep(1)
    return False

def do_cutout(label):
    print(f"\n[{label}] sending /cutout …", flush=True)
    with open(TEST_IMAGE, "rb") as f:
        r = requests.post(f"{BACKEND_URL}/cutout", files={"file": f}, timeout=300)
    if r.ok:
        print(f"[{label}] done: low_confidence={r.json().get('low_confidence')}", flush=True)
    else:
        print(f"[{label}] ERROR {r.status_code}: {r.text[:200]}", flush=True)
    return r.ok

# ── Start backend ──────────────────────────────────────────────────────────────
env = os.environ.copy()
env["UFM_REMBG_MODEL"] = MODEL
env["UFM_CUTOUT_MAX_EDGE_PX"] = "768"
env["ORT_NUM_THREADS"] = "2"

print(f"Starting backend with model={MODEL} …", flush=True)
SRC_DIR = os.path.join(os.path.dirname(__file__), "src")

proc = subprocess.Popen(
    [VENV_PYTHON, "-m", "uvicorn", "cutout_service.server:app",
     "--host", "127.0.0.1", "--port", "17890"],
    cwd=SRC_DIR,
    env=env,
    stdout=sys.stdout, stderr=sys.stderr,
)

print("Waiting for /health ready …", flush=True)
if not wait_ready(120):
    proc.terminate()
    sys.exit("Backend never became ready")

rss0, model = mem()
print(f"\n=== baseline RSS: {rss0:.0f} MB  (model={model}) ===\n", flush=True)

# ── Request 1 ─────────────────────────────────────────────────────────────────
ok1 = do_cutout("req1")
rss1, _ = mem()
print(f"\n=== after req1 RSS: {rss1:.0f} MB  (delta from baseline: +{rss1-rss0:.0f} MB) ===\n", flush=True)

# ── Request 2 ─────────────────────────────────────────────────────────────────
print("Waiting for model reload (birefnet teardown) …", flush=True)
time.sleep(3)
if not wait_ready(120):
    proc.terminate()
    sys.exit("Backend not ready before req2")

ok2 = do_cutout("req2")
rss2, _ = mem()
print(f"\n=== after req2 RSS: {rss2:.0f} MB  (delta from req1: +{rss2-rss1:.0f} MB) ===\n", flush=True)

# ── Verdict ───────────────────────────────────────────────────────────────────
print("=" * 60)
print(f"baseline : {rss0:.0f} MB")
print(f"after req1: {rss1:.0f} MB  (+{rss1-rss0:.0f} MB)")
print(f"after req2: {rss2:.0f} MB  (+{rss2-rss1:.0f} MB vs req1)")
cumulative_leak = rss2 - rss1
if cumulative_leak < 500:
    print(f"\nPASS — memory did NOT accumulate between requests ({cumulative_leak:+.0f} MB)")
else:
    print(f"\nFAIL — memory still growing cumulatively (+{cumulative_leak:.0f} MB req1→req2)")
print("=" * 60)

proc.terminate()
proc.wait()
