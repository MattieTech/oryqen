import os
import subprocess
import time
import httpx

exe = r"C:\Users\PC\AppData\Local\Programs\Ollama\ollama.exe"
env = os.environ.copy()
env["OLLAMA_HOST"] = "127.0.0.1:11434"

# Start server
p = subprocess.Popen([exe, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
time.sleep(2)

try:
    res = httpx.get("http://127.0.0.1:11434/api/tags", timeout=5.0)
    print("Tags status:", res.status_code)
    print("Models:", res.json())
except Exception as e:
    print("Error querying tags:", e)
finally:
    p.terminate()
