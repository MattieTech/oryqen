"""
Tests for Voice Endpoint and Multi-Tiered Failover (Gemini -> OpenRouter -> OpenAI -> Local Core)
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app
from app.services.llm import get_oryqen_model_name, get_oryqen_model_id, CloudAIProvider, LocalAIProvider

client = TestClient(app)


def test_model_name_sanitization():
    # Verify no raw third-party names leak
    test_cases = [
        ("gemini-2.5-flash", "ORYQEN Swift"),
        ("gemini-1.5-pro", "ORYQEN Reason"),
        ("qwen2.5:0.5b", "ORYQEN Local Core"),
        ("llama3.2:1b", "ORYQEN Local Core"),
        ("gpt-4o-mini", "ORYQEN Swift"),
        ("gpt-4o", "ORYQEN Reason"),
        ("deepseek-chat", "ORYQEN Reason"),
        ("openrouter/free", "ORYQEN Swift"),
        ("unknown-future-model", "ORYQEN Core"),
    ]
    for raw, expected in test_cases:
        branded = get_oryqen_model_name(raw)
        assert branded == expected, f"Failed for {raw}: got {branded}, expected {expected}"
        mod_id = get_oryqen_model_id(raw)
        assert not any(tp in mod_id for tp in ["gemini", "gpt", "llama", "qwen", "deepseek"])


def test_voice_endpoint_with_transcription():
    # Test sending audio with client transcription
    dummy_audio = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
    files = {"audio": ("sample.wav", dummy_audio, "audio/wav")}
    data = {
        "mode": "offline",
        "capability": "tutor",
        "transcription": "What is photosynthesis and why does it matter?",
        "user_id": "test-scholar",
    }
    res = client.post("/api/voice/process", files=files, data=data)
    assert res.status_code == 200, f"Voice process failed: {res.text}"
    body = res.json()
    assert body["transcription"] == "What is photosynthesis and why does it matter?"
    assert "photosynthesis" in body["answer"].lower() or len(body["answer"]) > 50
    assert not any(tp in body["display_name"].lower() for tp in ["gemini", "gpt", "llama", "qwen"])


def test_voice_endpoint_silent_fallback():
    # Test sending silent / untranscribed audio without client transcription
    dummy_audio = b"empty_audio_content"
    files = {"audio": ("empty.webm", dummy_audio, "audio/webm")}
    data = {
        "mode": "offline",
        "capability": "general",
        "transcription": "",
        "user_id": "test-scholar",
    }
    res = client.post("/api/voice/process", files=files, data=data)
    assert res.status_code == 200
    body = res.json()
    # Must NOT return hardcoded "I need help understanding this concept."
    assert body["transcription"] != "I need help understanding this concept."


def test_multi_tier_cloud_provider_fallback():
    # Test CloudAIProvider when no valid cloud key is present (should fall back cleanly to ORYQEN Core)
    cloud = CloudAIProvider(api_key="test-dummy-key")
    res = cloud.generate("Explain entropy in simple terms.")
    assert "content" in res and len(res["content"]) > 30
    assert res["model"] == "oryqen-swift"
    assert "ORYQEN" in res["display_name"]
    assert not any(tp in res["display_name"].lower() for tp in ["gemini", "gpt", "llama", "qwen"])


def test_settings_openrouter_openai_keys():
    # Verify settings endpoint accepts and masks openrouter and openai keys
    payload = {
        "openrouter_api_key": "sk-or-v1-test9876543210abcdef",
        "openai_api_key": "sk-proj-test1234567890abcdef",
    }
    res = client.post("/api/settings", json=payload)
    assert res.status_code == 200

    get_res = client.get("/api/settings")
    assert get_res.status_code == 200
    s_data = get_res.json()
    assert s_data["openrouter_api_key_set"] is True
    assert s_data["openai_api_key_set"] is True
    assert "*" in s_data["openrouter_api_key_masked"]
    assert "*" in s_data["openai_api_key_masked"]


if __name__ == "__main__":
    print("Running voice & failover tests...")
    test_model_name_sanitization()
    print("  [OK] Model name sanitization verified")
    test_voice_endpoint_with_transcription()
    print("  [OK] Voice endpoint with transcription verified")
    test_voice_endpoint_silent_fallback()
    print("  [OK] Voice silent fallback verified")
    test_multi_tier_cloud_provider_fallback()
    print("  [OK] Multi-tier cloud provider failover verified")
    test_settings_openrouter_openai_keys()
    print("  [OK] Settings OpenRouter & OpenAI key persistence verified")
    print("\nALL VOICE & FAILOVER TESTS PASSED!")
