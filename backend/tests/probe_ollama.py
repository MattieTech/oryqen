import os
import shutil
import subprocess
import socket

print("=== Checking Ollama Environment ===")
ollama_path = shutil.which("ollama")
print("Ollama in PATH:", ollama_path)

local_app = os.environ.get("LOCALAPPDATA", "")
candidate = os.path.join(local_app, "Programs", "Ollama", "ollama.exe")
print("Candidate in LOCALAPPDATA:", candidate, "Exists:", os.path.exists(candidate))

# Check port 11434
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(1.0)
result = sock.connect_ex(("127.0.0.1", 11434))
sock.close()
print("Port 11434 open?", result == 0)

exe = ollama_path or (candidate if os.path.exists(candidate) else None)
if exe:
    try:
        ver = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=5)
        print("Version:", ver.stdout.strip() or ver.stderr.strip())
    except Exception as e:
        print("Version check failed:", e)

    try:
        lst = subprocess.run([exe, "list"], capture_output=True, text=True, timeout=5)
        print("List returncode:", lst.returncode)
        print("List output:\n", lst.stdout.strip() or lst.stderr.strip())
    except Exception as e:
        print("List failed:", e)
