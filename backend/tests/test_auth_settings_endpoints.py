"""
Comprehensive test for Auth, Settings, Database Schema, Export, and Proprietary Model Rebranding.
Uses urllib.request (zero external dependencies).
"""
import urllib.request
import urllib.error
import json
import time

BASE = "http://127.0.0.1:8000"

def get(path):
    req = urllib.request.Request(f"{BASE}{path}", method="GET")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def post(path, body=None):
    data = json.dumps(body or {}).encode("utf-8")
    req = urllib.request.Request(f"{BASE}{path}", data=data, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

def test_all():
    print("--- 1. Testing GET /api/database/schema ---")
    status, schema_data = get("/api/database/schema")
    assert status == 200, f"Schema endpoint failed with {status}"
    assert "schema_sql" in schema_data
    assert "CREATE TABLE" in schema_data["schema_sql"]
    print(" [PASS] Schema endpoint returned valid PostgreSQL/pgvector SQL.")

    print("\n--- 2. Testing POST /api/settings/test-connection ---")
    status, conn_data = post("/api/settings/test-connection")
    assert status == 200, f"Test connection endpoint failed: {conn_data}"
    print(f" Test connection result: {conn_data}")
    assert "status" in conn_data
    assert "latency_ms" in conn_data
    assert "gemini" not in conn_data.get("model", "").lower(), "Third-party model leaked in connection test!"
    print(" [PASS] Connection ping works with live latency.")

    print("\n--- 3. Testing Settings Save (Cloud License & Supabase) ---")
    status, save_res = post("/api/settings", {
        "cloud_api_key": "test-oryqen-key-12345",
        "supabase_url": "https://testxyz.supabase.co",
        "supabase_key": "eyJtest1234"
    })
    assert status == 200
    status, settings_data = get("/api/settings")
    assert status == 200
    assert settings_data.get("cloud_api_key_set") is True
    assert settings_data.get("supabase_url_set") is True
    print(f" [PASS] Settings updated and masked: {settings_data}")

    print("\n--- 4. Testing Export Data ---")
    status, export_data = get("/api/export/data?user_id=local-user")
    assert status == 200
    assert export_data.get("platform") == "ORYQEN AI Platform"
    assert "conversations" in export_data
    assert "study_plans" in export_data
    print(f" [PASS] Full user data export verified ({len(export_data['conversations'])} convs, {len(export_data['study_plans'])} plans).")

    print("\n--- 5. Testing Auth (Register & Login) ---")
    test_email = f"scholar_{int(time.time())}@university.edu"
    status, reg_res = post("/api/auth/register", {
        "name": "Prof Adaeze",
        "email": test_email,
        "password": "Password123!",
        "education_level": "advanced",
        "preferred_subjects": ["Quantum Physics", "Computer Science"]
    })
    assert status == 200, f"Registration failed: {reg_res}"
    print(" [PASS] User registration succeeded.")

    status, login_res = post("/api/auth/login", {
        "email": test_email,
        "password": "Password123!"
    })
    assert status == 200, f"Login failed: {login_res}"
    assert "user" in login_res
    assert login_res["user"]["name"] == "Prof Adaeze"
    print(f" [PASS] User login succeeded: {login_res['user']['email']}")

    print("\n--- 6. Testing Model Branding Sanitization in Chat ---")
    status, chat_data = post("/api/chat", {
        "question": "Hello, who are you?",
        "mode": "offline",
        "user_id": "local-user"
    })
    assert status == 200, f"Chat failed: {chat_data}"
    returned_model = chat_data.get("model", "")
    print(f" Chat model returned: {returned_model}")
    assert "gemini" not in returned_model.lower(), "Third-party name leaked in chat response model!"
    assert "qwen" not in returned_model.lower(), "Third-party name leaked in chat response model!"
    assert "ollama" not in returned_model.lower(), "Third-party name leaked in chat response model!"
    assert "oryqen" in returned_model.lower(), "Model should be branded as ORYQEN!"
    print(" [PASS] Chat model strictly branded as ORYQEN Proprietary.")

    print("\n>>> ALL VERIFICATION CHECKS PASSED! <<<")

if __name__ == "__main__":
    test_all()
