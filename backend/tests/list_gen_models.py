import os
import httpx
from pathlib import Path
from dotenv import load_dotenv

env_file = Path("backend/.env")
load_dotenv(env_file)
key = os.environ.get("GEMINI_API_KEY")

res = httpx.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}", timeout=10.0)
models = res.json().get("models", [])
for m in models:
    name = m.get("name")
    methods = m.get("supportedGenerationMethods", [])
    if "generateContent" in methods:
        print(name, "| displayName:", m.get("displayName"))
