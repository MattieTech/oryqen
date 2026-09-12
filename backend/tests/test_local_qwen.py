import os
import subprocess
import time
import httpx

# Ensure Ollama is running
sock_check = False
try:
    res = httpx.get("http://127.0.0.1:11434/api/tags", timeout=1.0)
    sock_check = (res.status_code == 200)
except Exception:
    pass

if not sock_check:
    print("Starting ollama serve...")
    exe = r"C:\Users\PC\AppData\Local\Programs\Ollama\ollama.exe"
    env = os.environ.copy()
    env["OLLAMA_HOST"] = "127.0.0.1:11434"
    subprocess.Popen([exe, "serve"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3)

import ollama

print("=== Querying Real Local Model Qwen2.5:0.5b ===", flush=True)
res = ollama.chat(
    model="qwen2.5:0.5b",
    messages=[
        {"role": "system", "content": "You are ORYQEN, an advanced AI assistant."},
        {"role": "user", "content": "Explain what causes tides on Earth in simple terms."}
    ],
    options={"temperature": 0.7, "num_ctx": 2048}
)
print("Content:\n", res.message.content, flush=True)
