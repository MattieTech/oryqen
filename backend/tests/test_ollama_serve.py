import os
import subprocess
import time
import socket

exe = r"C:\Users\PC\AppData\Local\Programs\Ollama\ollama.exe"
print("Launching Ollama serve with OLLAMA_HOST=127.0.0.1:11434...", flush=True)

env = os.environ.copy()
env["OLLAMA_HOST"] = "127.0.0.1:11434"

p = subprocess.Popen([exe, "serve"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
time.sleep(2.5)

# Check if port is open
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(1.0)
res = sock.connect_ex(("127.0.0.1", 11434))
sock.close()

print(f"Port 11434 open: {res == 0}", flush=True)
poll = p.poll()
print(f"Process poll status: {poll}", flush=True)
if poll is not None:
    stdout, stderr = p.communicate(timeout=2)
    print("Stdout:", stdout[:500], flush=True)
    print("Stderr:", stderr[:500], flush=True)
else:
    print("Ollama serve is running successfully!", flush=True)
    p.terminate()
