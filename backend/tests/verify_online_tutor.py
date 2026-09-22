import httpx
import json
import sys

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=20.0)

print("--- 1. Testing Health ---")
res = client.get("/api/health")
print("Health:", res.status_code, res.json())

print("\n--- 2. Testing Online Chat (Greeting) ---")
res2 = client.post("/api/chat", json={
    "question": "Hey",
    "user_id": "test-user",
    "mode": "online",
    "capability": "general"
})
print("Chat Status:", res2.status_code)
data2 = res2.json()
answer2 = data2.get("answer", "")
print("Display Name:", data2.get("display_name"))
print("Answer:\n", answer2)
assert "yusuke" not in answer2.lower(), "Must not identify as Yusuke"
assert "ryder" not in answer2.lower(), "Must not identify as Ryder"
assert not answer2.startswith("?"), "Greeting must not start with '?'"

print("\n--- 3. Testing Online Streaming Chat (Tutor Mode: 'Hey') ---")
chunks = []
with client.stream("POST", "/api/chat/stream", json={
    "question": "Hey",
    "user_id": "test-user",
    "mode": "online",
    "capability": "tutor",
    "tutor_mode": "learn",
    "tutor_level": "intermediate",
    "subject": "Physics"
}) as stream_res:
    print("Stream Status:", stream_res.status_code)
    for line in stream_res.iter_lines():
        if line.startswith("data: "):
            payload = line[6:].strip()
            if payload == "[DONE]":
                break
            try:
                d = json.loads(payload)
                c = d.get("token") or d.get("chunk")
                if c:
                    chunks.append(c)
            except Exception:
                pass

full_streamed = "".join(chunks)
print("Chunks received:", len(chunks))
print("Streamed Answer:\n", full_streamed)
assert len(chunks) > 0, "Stream must not be empty"
assert "yusuke" not in full_streamed.lower(), "Tutor must not identify as Yusuke"
assert "ryder" not in full_streamed.lower(), "Tutor must not identify as Ryder"
assert not full_streamed.strip().startswith("?"), "Must not have leading '?'"

print("\n=== ALL TESTS PASSED SUCCESSFULLY! ===")
