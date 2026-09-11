import os
import httpx
from pathlib import Path
from dotenv import load_dotenv

env_file = Path("backend/.env")
load_dotenv(env_file)
key = os.environ.get("GEMINI_API_KEY")
print("Key length:", len(key) if key else 0)

res = httpx.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}", timeout=10.0)
print("Status:", res.status_code)
if res.status_code == 200:
    models = [m["name"].replace("models/", "") for m in res.json().get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])]
    print("Supported models count:", len(models))
    print("Flash models:", [m for m in models if "flash" in m])
else:
    print(res.text[:300])
