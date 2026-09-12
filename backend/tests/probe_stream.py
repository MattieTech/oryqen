import httpx

client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=10.0)

print("GET /api/models:")
try:
    r = client.get("/api/models")
    print("Status:", r.status_code)
    if r.status_code == 200:
        print("Keys:", list(r.json().keys()))
        print("Installed models:", [m["name"] for m in r.json().get("installed_local_models", [])])
    else:
        print("Error:", r.text[:200])
except Exception as e:
    print("Exception:", e)

print("\nPOST /api/chat/stream:")
try:
    with client.stream("POST", "/api/chat/stream", json={"question": "hello", "mode": "offline"}) as res:
        print("Stream Status:", res.status_code)
        for i, line in enumerate(res.iter_lines()):
            print(f"Line {i}:", repr(line))
            if i > 5:
                break
except Exception as e:
    print("Stream exception:", e)
