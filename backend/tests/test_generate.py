import os
import time
import httpx
from pathlib import Path
from dotenv import load_dotenv

env_file = Path("backend/.env")
load_dotenv(env_file)
key = os.environ.get("GEMINI_API_KEY")

for m in ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-3.6-flash"]:
    t0 = time.time()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={key}"
    try:
        res = httpx.post(url, json={"contents": [{"parts": [{"text": "Hello"}]}]}, timeout=10.0)
        dur = round(time.time() - t0, 2)
        print(f"Model: {m:22} | Status: {res.status_code} | Time: {dur}s")
        if res.status_code == 200:
            text = res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            print(f"  Response: {text[:60]}")
    except Exception as e:
        print(f"Model: {m:22} | Error: {e}")
