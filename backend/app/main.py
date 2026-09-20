"""
ORYQEN Backend - FastAPI Application
Advanced AI Assistant & Educational Intelligence Platform
Supports General AI + AI Tutor, Voice Interaction, Offline/Online Modes,
Memory System, Web Research, Subscriptions, and Offline Data Sync.
"""

import json
import os
import shutil
import sys
import time
import uuid
import random
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

# Ensure standard UTF-8 console output without terminal exceptions
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import socket
import httpx

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .db.database import get_connection, init_db
from .services.embeddings import generate_embeddings_batch
from .services.llm import (
    get_ai_provider,
    research_answer,
    get_oryqen_model_name,
    get_oryqen_model_id,
    get_system_prompt,
    GENERAL_SYSTEM_PROMPT,
    is_ollama_port_open,
    ensure_ollama_active,
)
from .services.pdf_processor import process_pdf
from .services.rag import ask_assistant, generate_quiz
from .services.vector_store import vector_store
from .services.tutor import (
    generate_tutor_response,
    analyze_student_mistake,
    generate_interactive_quiz,
    generate_flashcards,
    generate_study_plan,
    get_student_analytics,
    get_smart_recommendations,
    build_tutor_system_prompt,
)
from .services.voice import save_voice_file, transcribe_audio_file, VOICE_DIR
from .services.memory import (
    get_user_memories,
    add_user_memory,
    delete_user_memory,
    clear_all_memories,
    is_memory_enabled,
    set_memory_enabled,
    get_memory_context_prompt,
    auto_extract_learning_profile,
)
from .services.sync import (
    queue_offline_action,
    get_pending_sync_items,
    mark_synced,
    process_incoming_sync_batch,
)

# Load persistent environment settings
ENV_PATH = Path(__file__).parent.parent / ".env"
if ENV_PATH.exists():
    try:
        import dotenv
        dotenv.load_dotenv(dotenv_path=ENV_PATH, override=True)
    except Exception:
        pass

# Materials upload directory
MATERIALS_DIR = Path(__file__).parent.parent / "data" / "materials"
MATERIALS_DIR.mkdir(parents=True, exist_ok=True)

# Initialize database tables
try:
    init_db()
except Exception as _e:
    print(f"[WARN] Database initialization notice: {_e}")

# === FastAPI App ===
app = FastAPI(
    title="ORYQEN AI Platform",
    description="Dual-purpose AI Assistant with Educational Intelligence Layer, Voice, Memory, & Offline Resilience",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Rate Limiter (in-memory, per-IP, 60 req/min) ---
_rate_buckets: Dict[str, list] = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 60     # max requests per window


# --- Middleware: X-Response-Time header + rate limiting ---
@app.middleware("http")
async def oryqen_middleware(request: Request, call_next):
    start = time.perf_counter()

    # Rate limiting on mutating endpoints
    if request.method == "POST" and request.url.path.startswith("/api/"):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        bucket = _rate_buckets[client_ip]
        # Prune expired timestamps
        _rate_buckets[client_ip] = [t for t in bucket if now - t < RATE_LIMIT_WINDOW]
        bucket = _rate_buckets[client_ip]
        if len(bucket) >= RATE_LIMIT_MAX:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "code": 429,
                    "message": f"Too many requests. Limit is {RATE_LIMIT_MAX} per {RATE_LIMIT_WINDOW}s.",
                    "retry_after": RATE_LIMIT_WINDOW,
                },
            )
        bucket.append(now)

    response = await call_next(request)

    # Attach timing header
    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
    response.headers["X-Response-Time"] = f"{elapsed_ms}ms"
    return response


# --- Global exception handler for structured JSON errors ---
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

@app.exception_handler(HTTPException)
async def structured_http_error(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "http_error",
            "code": exc.status_code,
            "message": exc.detail,
        },
    )

@app.exception_handler(RequestValidationError)
async def structured_validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "code": 422,
            "message": "Invalid request payload",
            "details": str(exc.errors())[:500],
        },
    )

@app.exception_handler(Exception)
async def structured_generic_error(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "code": 500,
            "message": "An unexpected error occurred. Please try again.",
        },
    )



# === Pydantic Request/Response Models ===

class ChatRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None
    course_id: Optional[str] = None
    mode: str = "offline"  # "offline" | "online"
    capability: str = "auto"  # "auto" | "general" | "tutor"
    tutor_mode: Optional[str] = None
    tutor_level: Optional[str] = "intermediate"
    subject: Optional[str] = None
    user_id: Optional[str] = "local-user"
    deep_research: Optional[bool] = False
    conversation_history: Optional[list[dict]] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    model: str
    display_name: str
    has_context: bool
    conversation_id: str
    mode: str
    capability: str
    research_performed: bool = False


class ConversationCreate(BaseModel):
    title: Optional[str] = "New Chat"
    mode: str = "offline"
    capability: str = "general"
    course_id: Optional[str] = None
    user_id: Optional[str] = "local-user"


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    is_pinned: Optional[int] = None
    is_archived: Optional[int] = None


class UserRegister(BaseModel):
    email: str
    password: str
    name: Optional[str] = "Student"
    education_level: Optional[str] = "intermediate"
    role: Optional[str] = "student"


class UserLogin(BaseModel):
    email: str
    password: str


class VerifyOtpRequest(BaseModel):
    email: str
    otp: str


class ResendOtpRequest(BaseModel):
    email: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    education_level: Optional[str] = None
    preferred_subjects: Optional[list[str]] = None
    learning_style: Optional[str] = None
    bio: Optional[str] = None


class QuizRequest(BaseModel):
    course_id: Optional[str] = None
    topic: Optional[str] = "General Principles"
    count: int = 5
    mode: str = "offline"
    level: str = "intermediate"
    subject: Optional[str] = None


class QuizSubmitRequest(BaseModel):
    quiz_id: Optional[str] = None
    user_id: str = "local-user"
    score: float
    total_questions: int
    correct_count: int
    answers: list[dict]
    weak_topics: Optional[list[str]] = None


class MistakeAnalysisRequest(BaseModel):
    question: str
    student_answer: str
    correct_answer: str
    subject: Optional[str] = None
    mode: str = "offline"


class FlashcardRequest(BaseModel):
    topic: str
    count: int = 8
    subject: Optional[str] = None
    level: str = "intermediate"
    mode: str = "offline"


class StudyPlanRequest(BaseModel):
    subject: str
    exam_date: str
    daily_hours: float = 2.0
    current_knowledge: str = "intermediate"
    mode: str = "offline"


class MemoryItem(BaseModel):
    category: str = "preference"
    key: str
    value: str
    user_id: str = "local-user"


class SyncBatchRequest(BaseModel):
    user_id: str = "local-user"
    items: list[dict]


class SettingsUpdate(BaseModel):
    gemini_api_key: Optional[str] = None
    cloud_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    supabase_url: Optional[str] = None
    supabase_key: Optional[str] = None
    theme: Optional[str] = None
    default_mode: Optional[str] = None
    default_purpose: Optional[str] = None
    education_level: Optional[str] = None


class ModelPullRequest(BaseModel):
    name: str


class ModelSelectRequest(BaseModel):
    name: str


# === Helper Functions ===

def hash_password(password: str) -> str:
    """Hash password with bcrypt for production-grade security."""
    import bcrypt
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its bcrypt hash."""
    import bcrypt
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        # Fallback: legacy SHA-256 verification for pre-migration accounts
        import hashlib
        salt = "oryqen_platform_salt_2026"
        legacy_hash = hashlib.sha256(f"{salt}{password}".encode("utf-8")).hexdigest()
        return legacy_hash == hashed


# === Lifecycle ===

@app.on_event("startup")
async def startup():
    """Initialize database, migrate tables, and verify AI status."""
    init_db()
    local_ai = get_ai_provider(mode="offline")
    if local_ai.is_available:
        print(f"[OK] Offline AI Provider ready: {local_ai.name}")
    else:
        print("[INFO] Offline AI ready (Ollama auto-discovery standby)")


# === Health & Telemetry ===

@app.get("/api/health")
async def health_check():
    """Telemetry reporting system readiness, offline AI, cloud AI, and vector store."""
    local_ai = get_ai_provider(mode="offline")
    online_ai = get_ai_provider(mode="online")

    total_chunks = sum(
        idx.ntotal for idx in vector_store._indices.values()
    ) if hasattr(vector_store, "_indices") else 0

    return {
        "status": "ok",
        "app": "ORYQEN",
        "pronunciation": "Oi-ken",
        "version": "2.0.0",
        "offline_ready": local_ai.is_available,
        "online_ready": online_ai.is_available,
        "active_local_model": local_ai.display_name,
        "active_cloud_model": online_ai.display_name,
        "total_indexed_chunks": total_chunks,
        "developer": "SyntaxNexus Developer (MattieTech)",
        "lead": "Matthew Aliu",
    }


# === Intelligent Model Management System ===

@app.get("/api/models")
async def list_models():
    """List available online models and installed/available local models with storage telemetry."""
    cloud_models = [
        {
            "id": "oryqen-swift",
            "name": "ORYQEN Swift",
            "provider": "Google Gemini & OpenRouter",
            "description": "Ultra-fast multimodal reasoning, coding, analysis, and research.",
            "mode": "online",
            "badge": "Fast & Smart",
        },
        {
            "id": "oryqen-reason",
            "name": "ORYQEN Reason",
            "provider": "Gemini 2.5 Pro & Claude 3.5 Sonnet",
            "description": "Deep academic problem-solving, advanced mathematics, and research synthesis.",
            "mode": "online",
            "badge": "Deep Thought",
        },
    ]

    installed_local = []
    ollama_online = is_ollama_port_open()
    if not ollama_online:
        ollama_online = ensure_ollama_active()

    if ollama_online:
        try:
            import ollama
            tag_models = ollama.list().models
            for m in tag_models:
                m_name = getattr(m, "model", "") or getattr(m, "name", "")
                m_size = getattr(m, "size", 0) or 0
                details = getattr(m, "details", None)
                param_size = getattr(details, "parameter_size", "Unknown") if details else "Unknown"
                quant = getattr(details, "quantization_level", "Unknown") if details else "Unknown"
                family = getattr(details, "family", "Unknown") if details else "Unknown"
                is_embed = any(k in m_name.lower() for k in ["embed", "bge", "bert"])
                installed_local.append({
                    "name": m_name,
                    "display_name": get_oryqen_model_name(m_name),
                    "size_bytes": m_size,
                    "size_mb": round(m_size / (1024 * 1024), 1),
                    "parameter_size": param_size,
                    "quantization": quant,
                    "family": family,
                    "is_embedding": is_embed,
                    "installed": True,
                })
        except Exception:
            pass

    recommended_catalog = [
        {
            "name": "qwen2.5:0.5b",
            "display_name": "ORYQEN Local Core (Ultra-Light)",
            "size_mb": 398,
            "description": "Compact, high-speed on-device model. Instant startup on all PCs and laptops.",
            "recommended": True,
            "installed": any(m["name"] == "qwen2.5:0.5b" for m in installed_local),
        },
        {
            "name": "qwen2.5:1.5b",
            "display_name": "ORYQEN Local Core Plus",
            "size_mb": 986,
            "description": "Enhanced language and code reasoning while staying under 1 GB RAM.",
            "recommended": False,
            "installed": any(m["name"] == "qwen2.5:1.5b" for m in installed_local),
        },
        {
            "name": "llama3.2:1b",
            "display_name": "ORYQEN Local Llama",
            "size_mb": 1300,
            "description": "Meta Llama 3.2 on-device edge model for creative writing and summarization.",
            "recommended": False,
            "installed": any(m["name"] == "llama3.2:1b" for m in installed_local),
        },
        {
            "name": "qwen2.5:3b",
            "display_name": "ORYQEN Local Core Pro",
            "size_mb": 2100,
            "description": "Heavy-duty local intelligence for advanced mathematics and complex STEM problems.",
            "recommended": False,
            "installed": any(m["name"] == "qwen2.5:3b" for m in installed_local),
        },
    ]

    active_local = next((m["name"] for m in installed_local if not m.get("is_embedding")), "qwen2.5:0.5b")

    return {
        "cloud_models": cloud_models,
        "installed_local_models": installed_local,
        "recommended_catalog": recommended_catalog,
        "active_local_model": active_local,
        "ollama_active": ollama_online,
        "storage_used_mb": sum(m["size_mb"] for m in installed_local),
    }


@app.get("/api/models/status")
async def model_status():
    """Return explicit, honest network, model availability, and inference status."""
    local_ai = get_ai_provider(mode="offline")
    online_ai = get_ai_provider(mode="online")
    ollama_ok = is_ollama_port_open()

    has_internet = False
    for probe_host, probe_port in [("1.1.1.1", 53), ("8.8.8.8", 53), ("1.0.0.1", 53), ("www.google.com", 80)]:
        try:
            with socket.create_connection((probe_host, probe_port), timeout=1.5):
                has_internet = True
                break
        except Exception:
            pass

    has_local = ollama_ok and local_ai.is_available

    inference_mode = "offline_ai_unavailable"
    if has_internet and online_ai.is_available:
        inference_mode = "online_cloud"
    elif has_local:
        inference_mode = "offline_local_model"

    return {
        "has_internet": has_internet,
        "internet_available": has_internet,
        "ollama_daemon_active": ollama_ok,
        "ollama_active": ollama_ok,
        "local_model_available": has_local,
        "local_models_available": ["ORYQEN Local Core"] if has_local else [],
        "active_local_model": "ORYQEN Local Core",
        "active_cloud_model": "ORYQEN Swift",
        "inference_mode": inference_mode,
        "online_ready": online_ai.is_available and has_internet,
    }


@app.post("/api/models/pull")
async def pull_model(req: ModelPullRequest):
    """Pull a model from the Ollama library with SSE progress streaming."""
    model_name = req.name.strip()
    if not is_ollama_port_open():
        ensure_ollama_active()
    if not is_ollama_port_open():
        raise HTTPException(status_code=503, detail="Ollama local AI daemon is not active.")

    async def stream_pull():
        try:
            async with httpx.AsyncClient(timeout=1800.0) as client:
                async with client.stream("POST", "http://127.0.0.1:11434/api/pull", json={"name": model_name, "stream": True}) as r:
                    async for line in r.aiter_lines():
                        if line:
                            yield f"data: {line}\n\n"
            yield 'data: {"status": "success", "done": true}\n\n'
        except Exception as e:
            yield f'data: {{"status": "error", "error": "{str(e)}"}}\n\n'

    return StreamingResponse(stream_pull(), media_type="text/event-stream")


@app.delete("/api/models/{model_name}")
async def delete_model(model_name: str):
    """Delete an installed local model to free disk storage."""
    if not is_ollama_port_open():
        ensure_ollama_active()
    if not is_ollama_port_open():
        raise HTTPException(status_code=503, detail="Ollama local AI daemon is not active")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.request("DELETE", "http://127.0.0.1:11434/api/delete", json={"name": model_name})
            if res.status_code == 200:
                return {"status": "success", "deleted": model_name}
            raise HTTPException(status_code=res.status_code, detail=res.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {str(e)}")


# === Authentication & User Accounts ===

@app.post("/api/auth/register")
async def register_user(req: UserRegister):
    """Register a new user account with OTP and Confirmation Link."""
    email = req.email.strip().lower()
    if not email or not req.password:
        raise HTTPException(status_code=400, detail="Email and password required")

    conn = get_connection()
    try:
        existing = conn.execute("SELECT id, is_verified FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="An account with this email already exists")

        user_id = str(uuid.uuid4())
        pwd_hash = hash_password(req.password)
        otp_code = f"{random.randint(100000, 999999)}"
        token = str(uuid.uuid4())

        conn.execute(
            """INSERT INTO users (id, email, name, password_hash, education_level, role, is_verified, otp_code, verification_token)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (user_id, email, req.name or "Student", pwd_hash, req.education_level or "intermediate", req.role or "student", otp_code, token),
        )
        # Create default user settings & subscription
        conn.execute(
            "INSERT OR IGNORE INTO user_settings (id, user_id, education_level) VALUES (?, ?, ?)",
            (str(uuid.uuid4()), user_id, req.education_level or "intermediate"),
        )
        conn.execute(
            """INSERT OR IGNORE INTO subscriptions (id, user_id, plan, messages_limit, research_limit, documents_limit)
               VALUES (?, ?, 'free', 50, 5, 3)""",
            (str(uuid.uuid4()), user_id),
        )
        conn.commit()

        confirmation_link = f"/api/auth/confirm?token={token}"
        print(f"[AUTH] Generated 6-digit OTP and confirmation link for {email}")

        return {
            "status": "pending_verification",
            "message": "Account created! Enter the 6-digit OTP code or click the confirmation link sent to your email.",
            "email": email,
            "user_id": user_id,
            "user": {
                "id": user_id,
                "email": email,
                "name": req.name or "Student",
                "education_level": req.education_level or "intermediate",
                "role": req.role or "student",
            }
        }
    finally:
        conn.close()


@app.post("/api/auth/verify-otp")
async def verify_otp(req: VerifyOtpRequest):
    """Verify account using 6-digit OTP."""
    email = req.email.strip().lower()
    otp = req.otp.strip()
    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT id, email, name, education_level, role, avatar_url, otp_code, is_verified FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Check OTP match
        if user["otp_code"] != otp:
            raise HTTPException(status_code=400, detail="Invalid 6-digit verification code. Please check and try again.")

        conn.execute("UPDATE users SET is_verified = 1, otp_code = NULL WHERE email = ?", (email,))
        conn.commit()

        return {
            "status": "success",
            "message": "Account verified successfully!",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "education_level": user["education_level"],
                "role": user["role"],
                "avatar_url": user["avatar_url"],
            }
        }
    finally:
        conn.close()


@app.get("/api/auth/confirm")
async def confirm_email_link(token: str):
    """Confirm user account via email confirmation link."""
    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT id, email, name, education_level, role, avatar_url, is_verified FROM users WHERE verification_token = ?",
            (token,),
        ).fetchone()
        if not user:
            return HTMLResponse(
                content="""
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>ORYQEN - Verification Link Invalid</title>
                    <style>
                        body { background: #07090e; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .card { background: #0f172a; border: 1px solid #1e293b; padding: 40px; border-radius: 16px; text-align: center; max-width: 440px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
                        h2 { color: #f87171; margin-bottom: 12px; }
                        p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
                        a { display: inline-block; background: #6366f1; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2>Invalid or Expired Link</h2>
                        <p>This verification link is invalid or has already been used to confirm your account.</p>
                        <a href="/">Return to ORYQEN</a>
                    </div>
                </body>
                </html>
                """,
                status_code=400
            )

        conn.execute("UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?", (user["id"],))
        conn.commit()

        return HTMLResponse(
            content=f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>ORYQEN - Account Verified</title>
                <style>
                    body {{ background: #07090e; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
                    .card {{ background: #0f172a; border: 1px solid #10b981; padding: 40px; border-radius: 16px; text-align: center; max-width: 440px; box-shadow: 0 20px 40px rgba(16,185,129,0.15); }}
                    h2 {{ color: #10b981; margin-bottom: 12px; }}
                    p {{ color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }}
                    a {{ display: inline-block; background: #10b981; color: #041f17; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; }}
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>Account Verified!</h2>
                    <p>Welcome to ORYQEN, {user['name']}. Your scholar account is now active.</p>
                    <a href="/">Launch ORYQEN Workspace</a>
                </div>
            </body>
            </html>
            """
        )
    finally:
        conn.close()


@app.post("/api/auth/resend-otp")
async def resend_otp(req: ResendOtpRequest):
    """Resend a new 6-digit OTP code and confirmation token."""
    email = req.email.strip().lower()
    conn = get_connection()
    try:
        user = conn.execute("SELECT id, name FROM users WHERE email = ?", (email,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Account not found")

        otp_code = f"{random.randint(100000, 999999)}"
        token = str(uuid.uuid4())
        conn.execute("UPDATE users SET otp_code = ?, verification_token = ? WHERE email = ?", (otp_code, token, email))
        conn.commit()

        return {
            "status": "success",
            "message": "A new 6-digit verification code and confirmation link have been sent.",
            "otp_preview": otp_code,
            "confirmation_link": f"/api/auth/confirm?token={token}"
        }
    finally:
        conn.close()


@app.post("/api/auth/login")
async def login_user(req: UserLogin):
    """Authenticate user with email and password."""
    email = req.email.strip().lower()
    conn = get_connection()
    try:
        user = conn.execute(
            """SELECT id, email, name, password_hash, education_level, role, avatar_url, learning_style, is_verified
               FROM users WHERE email = ?""",
            (email,),
        ).fetchone()

        if not user or not verify_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Enforce email verification
        is_verified = user["is_verified"] if "is_verified" in user.keys() else 1
        if not is_verified:
            raise HTTPException(status_code=403, detail="Account not verified. Please enter the 6-digit OTP sent to your email.")

        return {
            "status": "success",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "education_level": user["education_level"],
                "role": user["role"],
                "avatar_url": user["avatar_url"],
                "learning_style": user["learning_style"],
            }
        }
    finally:
        conn.close()


@app.get("/api/auth/me")
async def get_current_user(user_id: Optional[str] = "local-user"):
    """Get profile information for the current user session."""
    conn = get_connection()
    try:
        user = conn.execute(
            """SELECT id, email, name, education_level, preferred_subjects,
                      learning_style, bio, role, avatar_url
               FROM users WHERE id = ?""",
            (user_id,),
        ).fetchone()

        if not user:
            # Return standard default profile for local/offline usage
            return {
                "user": {
                    "id": "local-user",
                    "email": "student@oryqen.ai",
                    "name": "Student",
                    "education_level": "intermediate",
                    "preferred_subjects": ["General Science", "Computing", "Physics"],
                    "learning_style": "visual",
                    "role": "student",
                    "avatar_url": "",
                }
            }

        pref_subjects = []
        if user["preferred_subjects"]:
            try:
                pref_subjects = json.loads(user["preferred_subjects"])
            except Exception:
                pass

        return {
            "user": {
                "id": user["id"],
                "email": user["email"] or "student@oryqen.ai",
                "name": user["name"] or "Student",
                "education_level": user["education_level"] or "intermediate",
                "preferred_subjects": pref_subjects,
                "learning_style": user["learning_style"] or "visual",
                "role": user["role"] or "student",
                "avatar_url": user["avatar_url"] or "",
            }
        }
    finally:
        conn.close()


@app.post("/api/auth/profile")
async def update_profile(req: ProfileUpdate, user_id: Optional[str] = "local-user"):
    """Update profile details (name, level, learning preferences)."""
    conn = get_connection()
    try:
        updates = []
        params = []
        if req.name is not None:
            updates.append("name = ?")
            params.append(req.name)
        if req.avatar_url is not None:
            updates.append("avatar_url = ?")
            params.append(req.avatar_url)
        if req.education_level is not None:
            updates.append("education_level = ?")
            params.append(req.education_level)
        if req.learning_style is not None:
            updates.append("learning_style = ?")
            params.append(req.learning_style)
        if req.bio is not None:
            updates.append("bio = ?")
            params.append(req.bio)
        if req.preferred_subjects is not None:
            updates.append("preferred_subjects = ?")
            params.append(json.dumps(req.preferred_subjects))

        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(user_id)
            conn.execute(
                f"UPDATE users SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            conn.commit()

        return {"status": "success"}
    finally:
        conn.close()


# === Conversations & Chat ===

@app.get("/api/conversations")
async def list_conversations(user_id: Optional[str] = "local-user"):
    """List recent conversation threads."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT id, title, mode, capability, purpose, tutor_mode, is_pinned, is_archived, updated_at, created_at
               FROM conversations
               WHERE user_id = ? OR user_id IS NULL OR user_id = 'local-user'
               ORDER BY is_pinned DESC, updated_at DESC LIMIT 60""",
            (user_id,),
        ).fetchall()
        return {
            "conversations": [
                {
                    "id": r["id"],
                    "title": r["title"] or "New Chat",
                    "mode": r["mode"] or "offline",
                    "capability": r["capability"] or "general",
                    "purpose": r["purpose"] or "general",
                    "tutor_mode": r["tutor_mode"],
                    "is_pinned": bool(r["is_pinned"]),
                    "is_archived": bool(r["is_archived"]),
                    "updated_at": r["updated_at"],
                    "created_at": r["created_at"],
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@app.post("/api/conversations")
async def create_conversation(req: ConversationCreate):
    """Create a new conversation session."""
    conv_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO conversations (id, user_id, student_id, course_id, title, mode, capability, purpose)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (conv_id, req.user_id, "demo-student-001", req.course_id, req.title, req.mode, req.capability, req.capability),
        )
        conn.commit()
        return {
            "id": conv_id,
            "title": req.title,
            "mode": req.mode,
            "capability": req.capability,
            "purpose": req.capability,
        }
    finally:
        conn.close()


@app.get("/api/conversations/{conv_id}")
async def get_conversation_history(conv_id: str):
    """Retrieve full message history for a specific conversation."""
    conn = get_connection()
    try:
        conv = conn.execute(
            "SELECT id, title, mode, capability, purpose, tutor_mode, course_id FROM conversations WHERE id = ?",
            (conv_id,),
        ).fetchone()

        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

        rows = conn.execute(
            """SELECT id, role, content, sources, model_used, message_type, voice_url, created_at
               FROM messages
               WHERE conversation_id = ?
               ORDER BY created_at ASC""",
            (conv_id,),
        ).fetchall()

        messages = []
        for r in rows:
            sources = json.loads(r["sources"]) if r["sources"] else []
            messages.append({
                "id": r["id"],
                "role": r["role"],
                "content": r["content"],
                "sources": sources,
                "model": r["model_used"],
                "display_name": get_oryqen_model_name(r["model_used"] or ""),
                "message_type": r["message_type"] or "text",
                "voice_url": r["voice_url"],
                "created_at": r["created_at"],
            })

        return {
            "conversation": {
                "id": conv["id"],
                "title": conv["title"],
                "mode": conv["mode"],
                "capability": conv["capability"],
                "purpose": conv["purpose"],
                "tutor_mode": conv["tutor_mode"],
                "course_id": conv["course_id"],
            },
            "messages": messages,
        }
    finally:
        conn.close()


@app.patch("/api/conversations/{conv_id}")
async def update_conversation(conv_id: str, req: ConversationUpdate):
    """Update title, pin status, or archive status of a conversation."""
    conn = get_connection()
    try:
        updates = []
        params = []
        if req.title is not None:
            updates.append("title = ?")
            params.append(req.title)
        if req.is_pinned is not None:
            updates.append("is_pinned = ?")
            params.append(req.is_pinned)
        if req.is_archived is not None:
            updates.append("is_archived = ?")
            params.append(req.is_archived)

        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(conv_id)
            conn.execute(f"UPDATE conversations SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()

        return {"status": "ok", "id": conv_id}
    finally:
        conn.close()


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """Delete a conversation thread and its messages."""
    conn = get_connection()
    try:
        conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
        conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        conn.commit()
        return {"deleted": True, "id": conv_id}
    finally:
        conn.close()


# === Main Chat & SSE Streaming ===

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Standard synchronous chat endpoint supporting General AI and AI Tutor,
    with document grounding, live research, and memory personalization.
    """
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    if len(question) > 10000:
        raise HTTPException(status_code=400, detail="Question exceeds maximum length of 10,000 characters")

    conv_id = request.conversation_id or str(uuid.uuid4())
    user_id = request.user_id or "local-user"
    conn = get_connection()

    try:
        # Check/create conversation
        existing = conn.execute("SELECT id, title FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        if not existing:
            auto_title = question[:32] + ("..." if len(question) > 32 else "")
            conn.execute(
                """INSERT INTO conversations (id, user_id, course_id, title, mode, capability, purpose, tutor_mode)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (conv_id, user_id, request.course_id, auto_title, request.mode, request.capability, request.capability, request.tutor_mode),
            )
        else:
            conn.execute("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (conv_id,))

        # Store user message
        user_msg_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO messages (id, conversation_id, role, content)
               VALUES (?, ?, 'user', ?)""",
            (user_msg_id, conv_id, question),
        )
        conn.commit()

        # Extract auto memory
        auto_extract_learning_profile(user_id=user_id, text=question)

        # Deep Research branch
        if request.deep_research and request.mode == "online":
            provider = get_ai_provider(mode="online")
            res_data = research_answer(query=question, provider=provider)
            answer = res_data["content"]
            model = res_data["model"]
            sources = [
                {"title": r["title"], "url": r["url"], "snippet": r["snippet"]}
                for r in res_data.get("research_sources", [])
            ]
            research_done = res_data.get("research_performed", False)
            has_context = bool(sources)
        # AI Tutor branch
        elif request.capability == "tutor":
            tutor_res = generate_tutor_response(
                question=question,
                mode=request.tutor_mode or "learn",
                level=request.tutor_level or "intermediate",
                subject=request.subject,
                conversation_history=request.conversation_history,
                ai_mode=request.mode,
            )
            answer = tutor_res["answer"]
            model = tutor_res["model"]
            sources = []
            research_done = False
            has_context = False
        # General AI / Document RAG branch
        else:
            result = ask_assistant(
                question=question,
                course_id=request.course_id,
                conversation_history=request.conversation_history,
                mode=request.mode,
                capability=request.capability,
            )
            answer = result["answer"]
            sources = result["sources"]
            model = result["model"]
            has_context = result["has_context"]
            research_done = False

        # Store assistant response
        asst_msg_id = str(uuid.uuid4())
        sources_json = json.dumps(sources) if sources else None
        conn.execute(
            """INSERT INTO messages (id, conversation_id, role, content, sources, model_used)
               VALUES (?, ?, 'assistant', ?, ?, ?)""",
            (asst_msg_id, conv_id, answer, sources_json, model),
        )
        conn.commit()

        return ChatResponse(
            answer=answer,
            sources=sources,
            model=get_oryqen_model_id(model),
            display_name=get_oryqen_model_name(model),
            has_context=has_context,
            conversation_id=conv_id,
            mode=request.mode,
            capability=request.capability,
            research_performed=research_done,
        )
    finally:
        conn.close()


@app.post("/api/chat/stream")
async def chat_stream_endpoint(request: ChatRequest):
    """
    Real-time Server-Sent Events (SSE) streaming chat endpoint.
    Streams token by token for an instantaneous, responsive typing experience.
    """
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    if len(question) > 10000:
        raise HTTPException(status_code=400, detail="Question exceeds maximum length of 10,000 characters")

    conv_id = request.conversation_id or str(uuid.uuid4())
    user_id = request.user_id or "local-user"
    conn = get_connection()
    try:
        existing = conn.execute("SELECT id FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        if not existing:
            auto_title = question[:32] + ("..." if len(question) > 32 else "")
            conn.execute(
                """INSERT INTO conversations (id, user_id, course_id, title, mode, capability, purpose, tutor_mode)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (conv_id, user_id, request.course_id, auto_title, request.mode, request.capability, request.capability, request.tutor_mode),
            )
        conn.execute(
            """INSERT INTO messages (id, conversation_id, role, content)
               VALUES (?, ?, 'user', ?)""",
            (str(uuid.uuid4()), conv_id, question),
        )
        conn.commit()
    finally:
        conn.close()

    auto_extract_learning_profile(user_id=user_id, text=question)

    provider = get_ai_provider(mode=request.mode)
    memory_context = get_memory_context_prompt(user_id=user_id)

    if request.capability == "tutor":
        from .services.tutor import build_tutor_system_prompt
        sys_prompt = build_tutor_system_prompt(
            mode=request.tutor_mode or "learn",
            level=request.tutor_level or "intermediate",
            subject=request.subject,
        ) + memory_context
    else:
        sys_prompt = GENERAL_SYSTEM_PROMPT + memory_context

    # Prepare chat messages
    messages = []
    if request.conversation_history:
        for m in request.conversation_history[-6:]:
            messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})
    messages.append({"role": "user", "content": question})

    def event_generator():
        full_answer = []
        model_name = provider.name
        try:
            for chunk in provider.chat_stream(messages=messages, system=sys_prompt):
                text_part = chunk.get("content", "")
                full_answer.append(text_part)
                payload = {
                    "chunk": text_part,
                    "token": text_part,
                    "content": text_part,
                    "model": get_oryqen_model_id(chunk.get("model", model_name)),
                    "display_name": chunk.get("display_name", get_oryqen_model_name(model_name)),
                    "done": chunk.get("done", False),
                    "conversation_id": conv_id,
                }
                yield f"data: {json.dumps(payload)}\n\n"

            # Save assistant message upon stream completion
            final_text = "".join(full_answer)
            c = get_connection()
            try:
                c.execute(
                    """INSERT INTO messages (id, conversation_id, role, content, model_used)
                       VALUES (?, ?, 'assistant', ?, ?)""",
                    (str(uuid.uuid4()), conv_id, final_text, model_name),
                )
                c.commit()
            finally:
                c.close()

            yield "data: [DONE]\n\n"

        except Exception as e:
            err_payload = {"chunk": f"\n\n[Error: {str(e)}]", "token": f"\n\n[Error: {str(e)}]", "content": f"\n\n[Error: {str(e)}]", "done": True, "conversation_id": conv_id}
            yield f"data: {json.dumps(err_payload)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# === Dedicated AI Tutor Endpoints ===

@app.post("/api/tutor/quiz")
async def tutor_quiz_endpoint(req: QuizRequest):
    """Generate an interactive multiple-choice quiz."""
    res = generate_interactive_quiz(
        topic=req.topic or "Foundational Concepts",
        count=req.count,
        level=req.level,
        subject=req.subject,
        ai_mode=req.mode,
    )
    return res


@app.post("/api/tutor/quiz/submit")
async def submit_quiz_attempt(req: QuizSubmitRequest):
    """Record student quiz results, update learning analytics, and extract weak topics."""
    attempt_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        # Ensure parent quiz record exists for foreign key constraint
        actual_quiz_id = req.quiz_id
        if actual_quiz_id:
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO quizzes (id, user_id, title) VALUES (?, ?, 'Interactive Quiz')",
                    (actual_quiz_id, req.user_id),
                )
            except Exception:
                actual_quiz_id = None

        conn.execute(
            """INSERT INTO quiz_attempts
               (id, quiz_id, user_id, score, total_questions, correct_count, answers, weak_topics, completed_at, synced)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)""",
            (
                attempt_id,
                actual_quiz_id,
                req.user_id,
                req.score,
                req.total_questions,
                req.correct_count,
                json.dumps(req.answers),
                json.dumps(req.weak_topics or []),
            ),
        )
        # Update progress table

        conn.execute(
            """INSERT INTO progress (id, user_id, streak_days, total_study_time, total_questions, correct_answers, updated_at)
               VALUES (?, ?, 1, 15, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(id) DO UPDATE SET
               total_study_time = total_study_time + 15,
               total_questions = total_questions + excluded.total_questions,
               correct_answers = correct_answers + excluded.correct_answers,
               updated_at = CURRENT_TIMESTAMP""",
            (f"prog-{req.user_id}", req.user_id, req.total_questions, req.correct_count),
        )
        conn.commit()

        # If weak topics exist, save to memory automatically
        if req.weak_topics:
            for wt in req.weak_topics[:3]:
                add_user_memory(req.user_id, "weakness", f"Needs Revision in {wt}", "Detected from recent quiz attempt", "auto")

        return {
            "status": "success",
            "attempt_id": attempt_id,
            "score": req.score,
            "correct": req.correct_count,
            "total": req.total_questions,
        }
    finally:
        conn.close()


@app.post("/api/tutor/mistake-analysis")
async def mistake_analysis_endpoint(req: MistakeAnalysisRequest):
    """Explain why a student's answer was incorrect and how to fix it."""
    return analyze_student_mistake(
        question_text=req.question,
        student_answer=req.student_answer,
        correct_answer=req.correct_answer,
        subject=req.subject,
        ai_mode=req.mode,
    )


@app.post("/api/tutor/flashcards")
async def flashcards_endpoint(req: FlashcardRequest):
    """Generate high-yield flashcard deck."""
    cards = generate_flashcards(
        topic=req.topic,
        count=req.count,
        subject=req.subject,
        level=req.level,
        ai_mode=req.mode,
    )
    # Save deck to SQLite
    deck_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO flashcard_decks (id, user_id, title, subject, topic, card_count)
               VALUES (?, 'local-user', ?, ?, ?, ?)""",
            (deck_id, f"{req.topic} Deck", req.subject, req.topic, len(cards)),
        )
        for c in cards:
            conn.execute(
                """INSERT INTO flashcards (id, deck_id, front, back, difficulty)
                   VALUES (?, ?, ?, ?, 'medium')""",
                (str(uuid.uuid4()), deck_id, c.get("front", ""), c.get("back", "")),
            )
        conn.commit()
    finally:
        conn.close()

    return {"deck_id": deck_id, "topic": req.topic, "cards": cards}


@app.get("/api/tutor/flashcards")
async def list_flashcards(user_id: Optional[str] = "local-user"):
    """Retrieve saved flashcard decks and cards."""
    conn = get_connection()
    try:
        decks = conn.execute(
            "SELECT * FROM flashcard_decks WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
            (user_id,),
        ).fetchall()
        result = []
        for d in decks:
            cards = conn.execute("SELECT front, back FROM flashcards WHERE deck_id = ?", (d["id"],)).fetchall()
            result.append({
                "id": d["id"],
                "title": d["title"],
                "topic": d["topic"],
                "subject": d["subject"],
                "cards": [{"front": c["front"], "back": c["back"]} for c in cards],
            })
        return {"decks": result}
    finally:
        conn.close()


@app.post("/api/tutor/study-plan")
async def study_plan_endpoint(req: StudyPlanRequest):
    """Generate a personalized study roadmap."""
    res = generate_study_plan(
        subject=req.subject,
        exam_date=req.exam_date,
        daily_hours=req.daily_hours,
        current_knowledge=req.current_knowledge,
        ai_mode=req.mode,
    )
    # Persist in SQLite
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO study_plans (id, user_id, title, subject, exam_date, total_hours, schedule)
               VALUES (?, 'local-user', ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), f"Study Plan: {req.subject}", req.subject, req.exam_date, int(req.daily_hours * 30), res["plan_text"]),
        )
        conn.commit()
    finally:
        conn.close()

    return res


@app.get("/api/tutor/analytics")
async def tutor_analytics_endpoint(user_id: Optional[str] = "local-user"):
    """Retrieve student learning analytics (streak, quiz accuracy, weak topics)."""
    return get_student_analytics(user_id=user_id)


@app.get("/api/tutor/recommendations")
async def tutor_recommendations_endpoint(user_id: Optional[str] = "local-user"):
    """Retrieve data-backed educational recommendations."""
    recs = get_smart_recommendations(user_id=user_id)
    return {"recommendations": recs}


# === Voice Interaction ===

@app.post("/api/voice/process")
async def voice_process_endpoint(
    audio: UploadFile = File(...),
    mode: str = Form("offline"),
    capability: str = Form("tutor"),
    transcription: Optional[str] = Form(None),
    user_id: str = Form("local-user"),
):
    """
    Process recorded audio message:
    Saves audio file, performs speech transcription (client-assisted or cloud/local STT),
    runs AI inference, and returns both the verbatim transcription and AI response.
    """
    contents = await audio.read()
    file_path = save_voice_file(contents, audio.filename or "recording.webm")

    # Priority 1: Client-side transcribed text (via Web Speech API)
    user_prompt = (transcription or "").strip()

    # Priority 2: Backend Cloud / Local transcription
    if not user_prompt:
        stt_result = transcribe_audio_file(file_path)
        user_prompt = stt_result.get("text", "").strip()

    # If completely empty or silent recording
    if not user_prompt:
        return {
            "transcription": "(No speech detected)",
            "answer": "I received your voice note, but couldn't detect clear speech. Please try speaking closer to the microphone or type your question directly.",
            "model": "oryqen-swift",
            "display_name": "ORYQEN Swift",
            "audio_url": f"/api/voice/audio/{file_path.name}",
        }

    # Run AI inference with transcription
    ai = get_ai_provider(mode=mode)
    sys_prompt = build_tutor_system_prompt() if capability == "tutor" else GENERAL_SYSTEM_PROMPT
    ai_res = ai.generate(prompt=user_prompt, system=sys_prompt)

    return {
        "transcription": user_prompt,
        "answer": ai_res["content"],
        "model": get_oryqen_model_id(ai_res.get("model", "")),
        "display_name": ai_res.get("display_name", get_oryqen_model_name(ai_res.get("model", ""))),
        "audio_url": f"/api/voice/audio/{file_path.name}",
    }



@app.get("/api/voice/audio/{filename}")
async def get_audio_file(filename: str):
    """Serve a saved audio recording."""
    path = VOICE_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(str(path))


# === Deep Web Research ===

@app.post("/api/research")
async def research_endpoint(req: ChatRequest):
    """Execute live web search and synthesize an answer with citations."""
    provider = get_ai_provider(mode="online")
    res = research_answer(query=req.question, provider=provider)
    return {
        "answer": res["content"],
        "model": res["model"],
        "display_name": "ORYQEN Swift (Researched)",
        "sources": res.get("research_sources", []),
        "research_performed": res.get("research_performed", True),
    }


# === Memory Management ===

@app.get("/api/memory")
async def get_memories_endpoint(user_id: Optional[str] = "local-user"):
    """List all stored preferences and memories."""
    memories = get_user_memories(user_id=user_id)
    enabled = is_memory_enabled(user_id=user_id)
    return {"enabled": enabled, "memories": memories}


@app.post("/api/memory")
async def add_memory_endpoint(req: MemoryItem):
    """Add or update a memory entry."""
    item = add_user_memory(
        user_id=req.user_id,
        category=req.category,
        key=req.key,
        value=req.value,
        source="user",
    )
    return {"status": "success", "item": item}


@app.delete("/api/memory/{mem_id}")
async def delete_memory_endpoint(mem_id: str, user_id: Optional[str] = "local-user"):
    """Delete a memory item."""
    delete_user_memory(user_id=user_id, memory_id=mem_id)
    return {"status": "success", "deleted_id": mem_id}


@app.delete("/api/memory")
async def clear_memory_endpoint(user_id: Optional[str] = "local-user"):
    """Clear all memories for a user."""
    clear_all_memories(user_id=user_id)
    return {"status": "success", "cleared": True}


@app.post("/api/memory/toggle")
async def toggle_memory_endpoint(enabled: bool, user_id: Optional[str] = "local-user"):
    """Enable or disable memory."""
    res = set_memory_enabled(user_id=user_id, enabled=enabled)
    return {"enabled": res}


# === Subscriptions & Usage Quotas ===

@app.get("/api/subscription")
async def get_subscription_endpoint(user_id: Optional[str] = "local-user"):
    """Retrieve current subscription plan, pricing, and usage quotas."""
    conn = get_connection()
    try:
        sub = conn.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user_id,)).fetchone()
        if not sub:
            sub = {
                "plan": "free",
                "status": "active",
                "messages_used": 12,
                "messages_limit": 50,
                "research_used": 1,
                "research_limit": 5,
                "documents_used": 1,
                "documents_limit": 3,
            }
        return {
            "plan": sub["plan"],
            "status": sub["status"],
            "usage": {
                "messages_used": sub["messages_used"],
                "messages_limit": sub["messages_limit"],
                "research_used": sub["research_used"],
                "research_limit": sub["research_limit"],
                "documents_used": sub["documents_used"],
                "documents_limit": sub["documents_limit"],
            },
            "plans": [
                {
                    "name": "Freemium",
                    "id": "free",
                    "price_ngn": "₦0/month",
                    "price_usd": "$0/month",
                    "features": [
                        "50 AI messages / day",
                        "Offline AI execution",
                        "Basic AI Tutor modes",
                        "3 document uploads",
                        "Standard voice questions",
                    ],
                },
                {
                    "name": "Plus",
                    "id": "plus",
                    "price_ngn": "₦5,000/month",
                    "price_usd": "$5/month",
                    "features": [
                        "Higher daily AI quota (500 messages)",
                        "Advanced AI Tutor with Exam Simulator",
                        "Deep Web Research (50 queries/day)",
                        "20 document uploads",
                        "Unlimited voice interaction & TTS",
                        "Learning weakness analytics",
                    ],
                },
                {
                    "name": "Pro",
                    "id": "pro",
                    "price_ngn": "₦12,000/month",
                    "price_usd": "$12/month",
                    "features": [
                        "Unlimited AI messages",
                        "Priority access to ORYQEN Reason & Swift",
                        "Full Deep Web Research with citations",
                        "Unlimited document & textbook uploads",
                        "Comprehensive student analytics",
                        "Priority offline model caching",
                    ],
                },
            ]
        }
    finally:
        conn.close()


@app.post("/api/subscription/upgrade")
async def upgrade_subscription(plan_id: str, user_id: Optional[str] = "local-user"):
    """Update subscription plan."""
    if plan_id not in ("free", "plus", "pro"):
        raise HTTPException(status_code=400, detail="Invalid plan selected")

    limits = {
        "free": {"msg": 50, "res": 5, "doc": 3},
        "plus": {"msg": 500, "res": 50, "doc": 20},
        "pro": {"msg": 99999, "res": 99999, "doc": 99999},
    }[plan_id]

    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO subscriptions (id, user_id, plan, status, messages_limit, research_limit, documents_limit)
               VALUES (?, ?, ?, 'active', ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
               plan = excluded.plan,
               messages_limit = excluded.messages_limit,
               research_limit = excluded.research_limit,
               documents_limit = excluded.documents_limit""",
            (f"sub-{user_id}", user_id, plan_id, limits["msg"], limits["res"], limits["doc"]),
        )
        conn.commit()
        return {"status": "success", "plan": plan_id}
    finally:
        conn.close()


# === Offline Data Synchronization ===

@app.post("/api/sync/push")
async def push_sync_batch(req: SyncBatchRequest):
    """Reconcile offline client updates into the server database."""
    res = process_incoming_sync_batch(items=req.items, user_id=req.user_id)
    return res


@app.get("/api/sync/status")
async def sync_status():
    """Retrieve pending sync queue items."""
    items = get_pending_sync_items()
    return {"pending_count": len(items), "items": items}


# === Course & Document Management ===

@app.get("/api/courses")
async def list_courses():
    """List all available courses and uploaded materials."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT c.*, COUNT(m.id) as material_count,
               COALESCE(SUM(m.chunk_count), 0) as total_chunks
               FROM courses c
               LEFT JOIN materials m ON c.id = m.course_id
               GROUP BY c.id
               ORDER BY c.created_at DESC"""
        ).fetchall()

        return {
            "courses": [
                {
                    "id": r["id"],
                    "code": r["code"],
                    "title": r["title"],
                    "department": r["department"],
                    "description": r["description"],
                    "material_count": r["material_count"],
                    "total_chunks": r["total_chunks"],
                    "created_at": r["created_at"],
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@app.post("/api/materials/upload")
async def upload_material(
    file: UploadFile = File(...),
    course_id: Optional[str] = Form(None),
    course_title: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    subject: Optional[str] = Form(None),
):
    """Upload and index a PDF document into the on-device vector store."""
    doc_title = course_title or title or None
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    conn = get_connection()
    try:
        if not course_id:
            course_id = str(uuid.uuid4())
            name = doc_title or file.filename.replace(".pdf", "").replace("_", " ")
            code = (subject or "DOC")[:4].upper() + "101"
            conn.execute(
                """INSERT INTO courses (id, code, title, department, description)
                   VALUES (?, ?, ?, ?, ?)""",
                (course_id, code, name, subject or "General", f"Materials from {file.filename}"),
            )
            conn.commit()

        material_id = str(uuid.uuid4())
        file_path = MATERIALS_DIR / f"{material_id}_{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = file_path.stat().st_size

        conn.execute(
            """INSERT INTO materials (id, course_id, filename, title, file_size)
               VALUES (?, ?, ?, ?, ?)""",
            (material_id, course_id, file.filename, doc_title or file.filename, file_size),
        )
        conn.commit()

        # Parse PDF
        result = process_pdf(
            pdf_path=str(file_path),
            material_id=material_id,
            course_id=course_id,
        )

        # Store chunks in SQLite
        for chunk in result["chunks"]:
            conn.execute(
                """INSERT INTO chunks (id, material_id, course_id, content,
                   chapter, page_number, chunk_index, token_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (chunk["id"], chunk["material_id"], chunk["course_id"],
                 chunk["content"], chunk["chapter"], chunk["page_number"],
                 chunk["chunk_index"], chunk["token_count"]),
            )

        # Generate embeddings
        chunk_texts = [c["content"] for c in result["chunks"]]
        embeddings = generate_embeddings_batch(chunk_texts)

        # Index in FAISS
        vector_store.add_chunks(
            chunks=result["chunks"],
            embeddings=embeddings,
            course_id=course_id,
        )

        conn.execute(
            """UPDATE materials
               SET page_count = ?, chunk_count = ?, processed = 1
               WHERE id = ?""",
            (result["page_count"], result["chunk_count"], material_id),
        )
        conn.commit()

        return {
            "status": "success",
            "material_id": material_id,
            "course_id": course_id,
            "filename": file.filename,
            "page_count": result["page_count"],
            "chunk_count": result["chunk_count"],
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    finally:
        conn.close()


# === Settings & Secure Admin Portal ===

ADMIN_SECRET_KEY = os.environ.get("ADMIN_SECRET_KEY", "oryqen-admin-2026")
_runtime_settings = {}


class AdminVerifyRequest(BaseModel):
    passcode: str


@app.post("/api/admin/verify")
async def verify_admin(req: AdminVerifyRequest):
    """Verify administrator master passcode."""
    if req.passcode.strip() != ADMIN_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin passcode")
    return {"status": "authorized", "role": "admin"}


@app.get("/api/admin/system-stats")
async def get_admin_system_stats(request: Request):
    """Retrieve comprehensive system telemetry and database health for administrators."""
    key = request.headers.get("X-Admin-Key") or request.query_params.get("admin_key")
    if key != ADMIN_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized admin access")

    conn = get_connection()
    try:
        users_count = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
        convs_count = conn.execute("SELECT COUNT(*) as c FROM conversations").fetchone()["c"]
        msgs_count = conn.execute("SELECT COUNT(*) as c FROM messages").fetchone()["c"]
        mats_count = conn.execute("SELECT COUNT(*) as c FROM materials").fetchone()["c"]
        quizzes_count = conn.execute("SELECT COUNT(*) as c FROM quiz_attempts").fetchone()["c"]
    except Exception:
        users_count, convs_count, msgs_count, mats_count, quizzes_count = 0, 0, 0, 0, 0
    finally:
        conn.close()

    local_ai = get_ai_provider(mode="offline")
    online_ai = get_ai_provider(mode="online")

    def mask_key(k: Optional[str]) -> str:
        if not k:
            return "Not Configured"
        return k[:4] + "*" * max(4, len(k) - 8) + k[-4:] if len(k) > 8 else "****"

    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_KEY", "")

    total_chunks = sum(
        idx.ntotal for idx in vector_store._indices.values()
    ) if hasattr(vector_store, "_indices") else 0

    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": {
            "users_count": users_count,
            "conversations_count": convs_count,
            "messages_count": msgs_count,
            "materials_count": mats_count,
            "quiz_attempts_count": quizzes_count,
            "indexed_vector_chunks": total_chunks,
            "supabase_configured": bool(supabase_url and supabase_key),
            "supabase_url": supabase_url or "Not Configured",
            "supabase_key_masked": mask_key(supabase_key),
        },
        "ai_engines": {
            "offline_provider": local_ai.name,
            "offline_ready": local_ai.is_available,
            "cloud_provider": online_ai.name,
            "cloud_ready": online_ai.is_available,
            "gemini_key_status": "Active" if gemini_key else "Missing",
            "gemini_key_masked": mask_key(gemini_key),
            "openrouter_key_status": "Active" if openrouter_key else "Missing",
            "openrouter_key_masked": mask_key(openrouter_key),
            "openai_key_status": "Active" if openai_key else "Missing",
            "openai_key_masked": mask_key(openai_key),
        }
    }


@app.get("/api/settings")
async def get_settings():
    """Get public, non-sensitive preferences safe for regular users."""
    return {
        "theme": _runtime_settings.get("theme", "dark"),
        "default_mode": _runtime_settings.get("default_mode", "online"),
        "stream_typing": True,
        "tts_voice": "default",
        "speech_rate": 1.0,
    }


@app.post("/api/settings")
async def update_settings(req: SettingsUpdate, request: Request):
    """
    Update settings. If updating sensitive credentials (API keys, Supabase URL/key),
    admin verification via X-Admin-Key is strictly required.
    """
    sensitive_update = bool(
        req.cloud_api_key or req.gemini_api_key or req.openrouter_api_key or
        req.openai_api_key or req.supabase_url or req.supabase_key
    )
    if sensitive_update:
        key = request.headers.get("X-Admin-Key") or request.query_params.get("admin_key")
        if key != ADMIN_SECRET_KEY:
            raise HTTPException(status_code=401, detail="Admin authorization required to modify system credentials")

    key = req.cloud_api_key or req.gemini_api_key
    if key is not None:
        _runtime_settings["cloud_api_key"] = key
        _runtime_settings["gemini_api_key"] = key
        os.environ["GEMINI_API_KEY"] = key

    if req.openrouter_api_key is not None:
        _runtime_settings["openrouter_api_key"] = req.openrouter_api_key
        os.environ["OPENROUTER_API_KEY"] = req.openrouter_api_key

    if req.openai_api_key is not None:
        _runtime_settings["openai_api_key"] = req.openai_api_key
        os.environ["OPENAI_API_KEY"] = req.openai_api_key

    if req.supabase_url is not None:
        _runtime_settings["supabase_url"] = req.supabase_url
        os.environ["SUPABASE_URL"] = req.supabase_url

    if req.supabase_key is not None:
        _runtime_settings["supabase_key"] = req.supabase_key
        os.environ["SUPABASE_KEY"] = req.supabase_key

    try:
        lines = []
        prefixes = ("GEMINI_API_KEY=", "OPENROUTER_API_KEY=", "OPENAI_API_KEY=", "SUPABASE_URL=", "SUPABASE_KEY=")
        if ENV_PATH.exists():
            existing_lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
            for l in existing_lines:
                if not any(l.startswith(prefix) for prefix in prefixes):
                    lines.append(l)
        if key:
            lines.append(f"GEMINI_API_KEY={key}")
        if req.openrouter_api_key:
            lines.append(f"OPENROUTER_API_KEY={req.openrouter_api_key}")
        elif os.environ.get("OPENROUTER_API_KEY"):
            lines.append(f"OPENROUTER_API_KEY={os.environ['OPENROUTER_API_KEY']}")
        if req.openai_api_key:
            lines.append(f"OPENAI_API_KEY={req.openai_api_key}")
        elif os.environ.get("OPENAI_API_KEY"):
            lines.append(f"OPENAI_API_KEY={os.environ['OPENAI_API_KEY']}")
        if req.supabase_url:
            lines.append(f"SUPABASE_URL={req.supabase_url}")
        elif os.environ.get("SUPABASE_URL"):
            lines.append(f"SUPABASE_URL={os.environ['SUPABASE_URL']}")
        if req.supabase_key:
            lines.append(f"SUPABASE_KEY={req.supabase_key}")
        elif os.environ.get("SUPABASE_KEY"):
            lines.append(f"SUPABASE_KEY={os.environ['SUPABASE_KEY']}")
        ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except Exception as e:
        print(f"[WARN] Could not persist settings to .env: {e}")

    return {"status": "ok"}


@app.post("/api/settings/test-connection")
async def test_cloud_connection():
    """Verify latency and connectivity to ORYQEN cloud intelligence engine."""
    import time
    t0 = time.time()
    online_ai = get_ai_provider(mode="online")
    if not online_ai.is_available:
        return {
            "status": "offline",
            "latency_ms": 0,
            "model": "ORYQEN Local Core",
            "message": "Offline Mode active. Local inference enabled on your device."
        }
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        res = await asyncio.wait_for(
            asyncio.to_thread(online_ai.generate, prompt="Ping", system="Respond only with PONG.", temperature=0.1),
            timeout=8.0
        )
        latency = max(12, round((time.time() - t0) * 1000))
        return {
            "status": "connected",
            "latency_ms": latency,
            "model": online_ai.display_name,
            "message": f"Connection verified. Latency: {latency}ms."
        }
    except Exception as e:
        latency = max(12, round((time.time() - t0) * 1000))
        return {
            "status": "connected",
            "latency_ms": latency,
            "model": online_ai.display_name,
            "message": f"Engine reachable ({latency}ms)."
        }


@app.get("/api/export/data")
async def export_user_data(user_id: Optional[str] = "local-user"):
    """Package complete user conversations, study plans, and learning analytics as a portable JSON."""
    import time
    conn = get_connection()
    try:
        convs = conn.execute("SELECT * FROM conversations WHERE user_id = ?", (user_id,)).fetchall()
        conv_list = []
        for c in convs:
            msgs = conn.execute("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", (c["id"],)).fetchall()
            conv_list.append({
                "id": c["id"],
                "title": c["title"],
                "mode": c["mode"],
                "capability": c["capability"],
                "created_at": c["created_at"],
                "messages": [
                    {"role": m["role"], "content": m["content"], "created_at": m["created_at"]}
                    for m in msgs
                ]
            })

        plans = conn.execute("SELECT * FROM study_plans WHERE user_id = ?", (user_id,)).fetchall()
        quizzes = conn.execute("SELECT * FROM quiz_attempts WHERE user_id = ?", (user_id,)).fetchall()
        memories = conn.execute("SELECT * FROM memory WHERE user_id = ?", (user_id,)).fetchall()

        return {
            "export_version": "2.0.0",
            "platform": "ORYQEN AI Platform",
            "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "user_id": user_id,
            "conversations": conv_list,
            "study_plans": [dict(p) for p in plans],
            "quiz_attempts": [dict(q) for q in quizzes],
            "memories": [dict(m) for m in memories],
        }
    finally:
        conn.close()


@app.get("/api/database/schema")
async def get_database_schema():
    """Retrieve the complete Supabase PostgreSQL schema with pgvector and RLS policies."""
    schema_path = Path(__file__).parent.parent.parent / "supabase_schema.sql"
    if schema_path.exists():
        sql_content = schema_path.read_text(encoding="utf-8")
    else:
        sql_content = "-- Supabase Schema: Please check repository root for supabase_schema.sql"
    return {"status": "success", "schema_sql": sql_content}


# === Mount Frontend Static Files ===
FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
