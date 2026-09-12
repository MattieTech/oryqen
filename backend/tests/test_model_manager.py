import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_models_endpoints():
    print("=== 1. Testing GET /api/models ===")
    res = client.get("/api/models")
    assert res.status_code == 200, f"Failed: {res.status_code} {res.text}"
    data = res.json()
    print("  [OK] Cloud models count:", len(data.get("cloud_models", [])))
    print("  [OK] Installed local models:", [m["name"] for m in data.get("installed_local_models", [])])
    print("  [OK] Recommended catalog count:", len(data.get("recommended_catalog", [])))
    print("  [OK] Storage used MB:", data.get("storage_used_mb"))
    print("  [OK] Ollama active:", data.get("ollama_active"))

    print("\n=== 2. Testing GET /api/models/status ===")
    sres = client.get("/api/models/status")
    assert sres.status_code == 200
    sdata = sres.json()
    print("  [OK] Inference Mode:", sdata.get("inference_mode"))
    print("  [OK] Active Local Model:", sdata.get("active_local_model"))
    print("  [OK] Active Cloud Model:", sdata.get("active_cloud_model"))
    print("  [OK] Has Internet:", sdata.get("has_internet"))

    print("\n=== 3. Testing Streaming Output (Token & Chunk) ===")
    with client.stream("POST", "/api/chat/stream", json={
        "question": "Explain speed vs velocity",
        "user_id": "test-user",
        "mode": "offline",
        "capability": "tutor",
        "tutor_mode": "socratic"
    }) as stream_res:
        assert stream_res.status_code == 200
        tokens = []
        for line in stream_res.iter_lines():
            if line.startswith("data: "):
                payload = line[6:]
                if payload == "[DONE]":
                    break
                import json
                try:
                    d = json.loads(payload)
                    if "token" in d:
                        tokens.append(d["token"])
                except Exception:
                    pass
        print(f"  [OK] Streamed Tokens Count: {len(tokens)}")
        assert len(tokens) > 5, "Expected streamed tokens!"

    print("\n=======================================================")
    print("  ALL MODEL MANAGEMENT & STREAMING CHECKS PASSED!      ")
    print("=======================================================")

if __name__ == "__main__":
    test_models_endpoints()
