"""
ORYQEN Backend - Voice Processing Engine
Supports speech audio capture, voice message storage, speech-to-text transcription,
and educational voice interaction with multi-engine cloud & local fallback.
"""

import os
import uuid
import base64
import logging
from pathlib import Path
from typing import Optional, Dict, Any
import httpx

logger = logging.getLogger("oryqen.voice")

VOICE_DIR = Path(__file__).parent.parent.parent / "data" / "voice"
VOICE_DIR.mkdir(parents=True, exist_ok=True)


def save_voice_file(file_bytes: bytes, filename: str) -> Path:
    """Save audio bytes to disk."""
    ext = Path(filename).suffix or ".webm"
    unique_name = f"{uuid.uuid4()}{ext}"
    dest = VOICE_DIR / unique_name
    dest.write_bytes(file_bytes)
    return dest


def _get_audio_mimetype(file_path: Path) -> str:
    """Determine MIME type based on file extension."""
    ext = file_path.suffix.lower()
    mapping = {
        ".webm": "audio/webm",
        ".mp3": "audio/mp3",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".opus": "audio/ogg",
        ".m4a": "audio/m4a",
        ".aac": "audio/aac",
        ".flac": "audio/flac",
    }
    return mapping.get(ext, "audio/webm")


def transcribe_with_gemini(file_path: Path, api_key: str) -> Optional[str]:
    """Transcribe audio verbatim using Gemini multimodal audio capabilities."""
    try:
        audio_bytes = file_path.read_bytes()
        b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
        mime_type = _get_audio_mimetype(file_path)

        prompt = (
            "Transcribe the spoken words in this audio recording verbatim into English text. "
            "Output only the exact transcribed words spoken. Do not add any introductory text, "
            "do not add quotes, do not explain, and do not summarize. If no speech is present, return empty."
        )

        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": b64_audio,
                        }
                    }
                ]
            }],
            "generationConfig": {
                "temperature": 0.0,
                "maxOutputTokens": 1024,
            }
        }

        candidate_models = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
        for model in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            with httpx.Client(timeout=35.0) as client:
                res = client.post(url, headers={"Content-Type": "application/json"}, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        text = "".join(p.get("text", "") for p in parts).strip()
                        if text:
                            return text
    except Exception as e:
        logger.warning(f"Gemini voice transcription failed: {e}")
    return None


def transcribe_with_openai(file_path: Path, api_key: str) -> Optional[str]:
    """Transcribe audio using OpenAI Whisper API."""
    try:
        mime_type = _get_audio_mimetype(file_path)
        with open(file_path, "rb") as f:
            with httpx.Client(timeout=35.0) as client:
                res = client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={"file": (file_path.name, f, mime_type)},
                    data={"model": "whisper-1"},
                )
                if res.status_code == 200:
                    text = res.json().get("text", "").strip()
                    if text:
                        return text
    except Exception as e:
        logger.warning(f"OpenAI whisper transcription failed: {e}")
    return None


def transcribe_audio_file(file_path: Path, language: str = "en") -> Dict[str, Any]:
    """
    Transcribe speech audio to text with multi-tier failover:
    1. Gemini Cloud multimodal transcription (fastest & native)
    2. OpenAI Cloud Whisper API (if OPENAI_API_KEY is configured)
    3. Local Whisper model (if installed)
    4. Client-assisted / empty indication
    """
    # 1. Cloud Gemini Transcription
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if gemini_key and not gemini_key.startswith("test-"):
        cloud_text = transcribe_with_gemini(file_path, gemini_key)
        if cloud_text:
            return {
                "text": cloud_text,
                "confidence": 0.98,
                "engine": "oryqen_cloud_stt",
                "language": language,
                "file_url": f"/api/voice/audio/{file_path.name}",
            }

    # 2. OpenAI Whisper API
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key and not openai_key.startswith("test-"):
        openai_text = transcribe_with_openai(file_path, openai_key)
        if openai_text:
            return {
                "text": openai_text,
                "confidence": 0.98,
                "engine": "oryqen_whisper_cloud",
                "language": language,
                "file_url": f"/api/voice/audio/{file_path.name}",
            }

    # 3. Local Whisper (if installed)
    try:
        import whisper
        model = whisper.load_model("tiny")
        result = model.transcribe(str(file_path))
        text = result.get("text", "").strip()
        if text:
            return {
                "text": text,
                "confidence": 0.95,
                "engine": "local_whisper",
                "language": language,
                "file_url": f"/api/voice/audio/{file_path.name}",
            }
    except Exception:
        pass

    # 4. Fallback if no speech recognized
    return {
        "text": "",
        "confidence": 0.0,
        "engine": "fallback",
        "file_url": f"/api/voice/audio/{file_path.name}",
        "language": language,
    }
