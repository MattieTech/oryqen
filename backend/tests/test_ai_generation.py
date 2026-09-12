import httpx
import json

client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=30.0)

print("--- 1. Testing Offline Chat (Python String Reversal) ---", flush=True)
res = client.post("/api/chat", json={
    "question": "How do I reverse a string in Python?",
    "user_id": "test-user",
    "mode": "offline",
    "capability": "general"
})
assert res.status_code == 200, f"Error: {res.status_code} {res.text}"
data = res.json()
reply = data.get("answer", "")
print("Status:", res.status_code, flush=True)
print("Model display name:", data.get("display_name"), flush=True)
print("Preview:\n", reply[:250], flush=True)
assert "[::-1]" in reply or "slice" in reply.lower(), "Expected python slice in response!"
assert "Newton's Second Law" not in reply, "Should not return Newton's law for python question!"
print("=> Test 1 Passed!\n", flush=True)

print("--- 2. Testing Offline Chat (Identity / Creator) ---", flush=True)
res2 = client.post("/api/chat", json={
    "question": "Who created you?",
    "user_id": "test-user",
    "mode": "offline",
    "capability": "general"
})
assert res2.status_code == 200
data2 = res2.json()
reply2 = data2.get("answer", "")
print("Preview:\n", reply2[:250], flush=True)
assert "SyntaxNexus" in reply2 or "Matthew" in reply2, "Expected Matthew Aliu / SyntaxNexus in identity response!"
print("=> Test 2 Passed!\n", flush=True)

print("--- 3. Testing Offline Quiz Generation ---", flush=True)
res3 = client.post("/api/chat", json={
    "question": "Generate a multiple choice quiz on Photosynthesis",
    "user_id": "test-user",
    "mode": "offline",
    "capability": "tutor",
    "tutor_mode": "quiz"
})
assert res3.status_code == 200
data3 = res3.json()
reply3 = data3.get("answer", "")
print("Preview:\n", reply3[:250], flush=True)
assert "chlorophyll" in reply3.lower() or "quiz" in reply3.lower() or "photosynthesis" in reply3.lower(), "Expected photosynthesis quiz content!"
print("=> Test 3 Passed!\n", flush=True)

print("--- 4. Testing Streaming Chat Endpoint (Offline) ---", flush=True)
with client.stream("POST", "/api/chat/stream", json={
    "question": "Explain speed vs velocity",
    "user_id": "test-user",
    "mode": "offline",
    "capability": "tutor",
    "tutor_mode": "socratic"
}) as stream_res:
    assert stream_res.status_code == 200
    chunks = []
    for line in stream_res.iter_lines():
        if line.startswith("data: "):
            payload = line[6:]
            if payload == "[DONE]":
                break
            try:
                chunk_data = json.loads(payload)
                val = chunk_data.get("token") or chunk_data.get("chunk")
                if val:
                    chunks.append(val)
            except Exception:
                pass
    full_text = "".join(chunks)
    print("Streamed Chunks Count:", len(chunks), flush=True)
    print("Streamed Text Preview:\n", full_text[:250], flush=True)
    assert len(chunks) > 5, "Expected multi-token streaming output!"
    assert "vector" in full_text.lower() or "scalar" in full_text.lower() or "speed" in full_text.lower()
print("=> Test 4 Passed!\n", flush=True)

print("--- 5. Testing Online Chat Endpoint (Failover / Live Gemini) ---", flush=True)
res5 = client.post("/api/chat", json={
    "question": "What is the capital of France?",
    "user_id": "test-user",
    "mode": "online",
    "capability": "general"
})
assert res5.status_code == 200
data5 = res5.json()
reply5 = data5.get("answer", "")
print("Online Status:", res5.status_code, flush=True)
print("Online Display Name:", data5.get("display_name"), flush=True)
print("Online Reply Preview:\n", reply5[:250], flush=True)
assert "HTTP 400" not in reply5 and "API_KEY_INVALID" not in reply5, "Raw JSON error should not be dumped to user!"
print("=> Test 5 Passed!\n", flush=True)

print("==================================================", flush=True)
print("SUCCESS: ALL ONLINE & OFFLINE GENERATION TESTS PASSED!", flush=True)
print("==================================================", flush=True)
