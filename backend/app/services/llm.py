"""
ORYQEN Backend - LLM Abstraction Layer
Provides a unified interface for local (Ollama) and cloud (Gemini) AI models.
Supports general-purpose AI and specialized educational tutoring.
Features: streaming SSE, model failover, ORYQEN model naming, web research, memory injection.
"""

import base64
import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Optional, Generator, List, Dict, Any

import socket
import httpx
import logging

logger = logging.getLogger("oryqen.llm")

# Shared HTTP client for connection pooling (avoids creating new TCP connections per request)
_http_client: Optional[httpx.Client] = None

def _get_http_client(timeout: float = 35.0) -> httpx.Client:
    """Get or create a shared httpx client with connection pooling."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.Client(
            timeout=timeout,
            limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
            follow_redirects=True,
        )
    return _http_client


def _retry_request(fn, max_retries: int = 2, base_delay: float = 0.5):
    """Execute fn() with exponential backoff retry. Returns result or raises last exception."""
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except Exception as e:
            last_err = e
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Retry {attempt+1}/{max_retries} after {delay}s: {e}")
                time.sleep(delay)
    raise last_err


# Load .env if present
try:
    import dotenv
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        dotenv.load_dotenv(dotenv_path=env_file, override=False)
except Exception:
    pass


# =========================================================================
# ORYQEN Identity & System Prompts
# =========================================================================

IDENTITY_CORE = """You are ORYQEN, an advanced AI assistant and educational intelligence platform.
You were engineered and developed by SyntaxNexus Developer (formerly known as MattieTech), an organization founded and led by CEO Matthew Aliu.
You were created specifically for Africa and the global community to empower education, students, teachers, researchers, problem-solvers, and developers with accessible, world-class knowledge, tutoring, and reasoning.

MANDATORY IDENTITY & BEHAVIORAL DIRECTIVES:
1. IDENTITY & CREATOR:
   - When asked "Who are you?", "Who made you?", "Who is your creator?", "Who is your CEO?", or "Tell me about yourself":
     Clearly and proudly state:
     "I am ORYQEN, an advanced AI assistant and educational intelligence platform. I was engineered and developed by SyntaxNexus Developer (formerly known as MattieTech), an organization founded and led by CEO Matthew Aliu. I was created specifically for Africa and beyond to empower education, software engineering, science, and everyday problem-solving through both offline and online intelligence."
   - NEVER call yourself a "super fast AI assistant", "super fast AI", or use generic robotic cliches. Speak with warmth, depth, clarity, and authority.

2. INTELLECTUAL DEBATE & COMPARISON:
   - When asked about comparative topics, rivalries, or debates (such as "Nigeria and Ghana", policy choices, technology stacks, or cultural traditions):
     Provide an engaging, comprehensive, and intellectually rigorous debate breakdown.
     Analyze historical context, economic factors, cultural contributions (such as arts, music, cuisine/Jollof wars), strengths, challenges, and balanced perspectives without shallow dismissals.
"""

GENERAL_SYSTEM_PROMPT = f"""{IDENTITY_CORE}
You excel at answering general questions, writing, software engineering, scientific reasoning, mathematics, creative exploration, intellectual debate, and everyday problem solving.
When a user asks an educational or academic question, adapt seamlessly to become a patient and thorough tutor: explain concepts step-by-step, use analogies, and encourage deeper understanding.
Always provide structured, clear, and well-reasoned answers. Use markdown formatting with clear headings, lists, and code blocks where helpful.
"""

TUTOR_SYSTEM_PROMPT = f"""{IDENTITY_CORE}
You are ORYQEN AI Tutor, a knowledgeable, supportive, and academically rigorous educational assistant.
Your mission is to help the student truly understand concepts step-by-step.
Follow these teaching guidelines:
1. Explain complex ideas using simple, intuitive language and relatable real-world analogies.
2. Break multi-step derivations, calculations, or logic into numbered steps.
3. If course materials or textbook excerpts are provided in context, cite the exact source and page numbers.
4. Encourage the student and test their understanding by offering a relevant follow-up thought or question.
5. Adapt your explanations to the student's level (beginner, intermediate, or advanced).
6. Be patient, encouraging, and never condescending.
"""

TUTOR_MODE_PROMPTS = {
    "learn": """MODE: LEARN
You are teaching a topic step-by-step. Break the topic into clear sections.
Start with fundamentals, build up to advanced concepts. Use examples and analogies.
After each section, ask a brief comprehension question to check understanding.""",

    "practice": """MODE: PRACTICE
Generate practice questions for the student. After each question, wait for the student's answer.
When they answer, evaluate it: explain what was correct, what was wrong, and provide the right approach.
Adjust difficulty based on their performance.""",

    "quiz": """MODE: QUIZ
Generate a quiz with multiple-choice questions. Present one question at a time.
After the student answers, reveal the correct answer with an explanation.
Track the score and provide a summary at the end.""",

    "explain": """MODE: EXPLAIN
The student wants a concept explained simply. Use the Feynman technique:
1. Explain it as if to a beginner
2. Use everyday analogies
3. Avoid jargon unless you define it
4. Give concrete examples
5. Summarize the key takeaway""",

    "socratic": """MODE: SOCRATIC
Instead of giving direct answers, guide the student through questions.
Ask leading questions that help them discover the answer themselves.
If they get stuck, provide hints rather than solutions.
Celebrate when they figure it out.""",

    "exam": """MODE: EXAM SIMULATOR
Create a timed examination experience. Generate questions of varying difficulty.
Present questions in order. After the exam, provide detailed results:
- Score
- Correct/incorrect breakdown
- Explanation for each answer
- Areas needing improvement""",

    "revision": """MODE: REVISION
Help the student revise previously studied topics.
Provide concise summaries, key formulas, important definitions.
Test recall with quick-fire questions.
Identify gaps in knowledge.""",

    "flashcard": """MODE: FLASHCARD GENERATION
Generate flashcards from the topic or material provided.
Each flashcard has a FRONT (question/term) and BACK (answer/definition).
Output as JSON array: [{"front": "...", "back": "..."}, ...]
Generate 10-15 flashcards covering key concepts.""",

    "study_plan": """MODE: STUDY PLAN
Create a personalized study plan based on the student's goals.
Ask about: exam date, subjects, available hours, current knowledge level.
Generate a realistic day-by-day schedule.
Output as structured JSON when possible.""",

    "mistake_analysis": """MODE: MISTAKE ANALYSIS
The student made mistakes. Analyze:
1. What the student got wrong
2. WHY they likely made the mistake (common misconception, calculation error, etc.)
3. The correct approach step-by-step
4. A similar practice question to reinforce learning""",
}


# =========================================================================
# ORYQEN Model Naming (Honest UI-facing naming)
# =========================================================================

ORYQEN_MODEL_MAP = {
    # Local models
    "qwen2.5:0.5b": "ORYQEN Local Core",
    "qwen2.5:1.5b": "ORYQEN Local Core",
    "qwen2.5:3b": "ORYQEN Local Core Pro",
    "qwen2.5:7b": "ORYQEN Local Core Pro",
    "llama3.2:1b": "ORYQEN Local Core",
    "llama3.2:3b": "ORYQEN Local Core Pro",
    "phi3:mini": "ORYQEN Local Core",
    # Cloud models — only real, existing model identifiers
    "gemini-2.5-flash-preview-05-20": "ORYQEN Swift",
    "gemini-2.5-flash-preview": "ORYQEN Swift",
    "gemini-2.5-flash": "ORYQEN Swift",
    "gemini-2.5-pro": "ORYQEN Reason",
    "gemini-2.0-flash": "ORYQEN Swift",
    "gemini-2.0-flash-lite": "ORYQEN Swift Lite",
    "gemini-1.5-flash": "ORYQEN Swift",
    "gemini-1.5-pro": "ORYQEN Reason",
    "claude-3-5-sonnet": "ORYQEN Reason",
    "claude-3-haiku": "ORYQEN Swift",
    "gpt-4o": "ORYQEN Reason",
    "gpt-4o-mini": "ORYQEN Swift",
    "gpt-4": "ORYQEN Reason",
    "gpt-3.5-turbo": "ORYQEN Swift",
    "deepseek": "ORYQEN Reason",
    "openrouter": "ORYQEN Swift",
    "mistral": "ORYQEN Swift",
}


def get_oryqen_model_name(raw_model: str) -> str:
    """Convert raw model identifier to ORYQEN branded name."""
    clean = raw_model.replace("local:", "").replace("cloud:", "").strip().lower()
    for key, name in sorted(ORYQEN_MODEL_MAP.items(), key=lambda item: len(item[0]), reverse=True):
        if key in clean:
            return name
    if "pro" in clean or "reason" in clean:
        return "ORYQEN Reason"
    if "local" in clean or "local:" in raw_model:
        return "ORYQEN Local Core"
    if "cloud" in clean or "cloud:" in raw_model:
        return "ORYQEN Swift"
    return "ORYQEN Core"


def get_oryqen_model_id(raw_model: str) -> str:
    """Return sanitized, proprietary model ID for client API responses."""
    name = get_oryqen_model_name(raw_model).lower()
    if "reason" in name:
        return "oryqen-reason"
    if "local" in name:
        return "oryqen-local-core"
    return "oryqen-swift"


# =========================================================================
# Ollama Management
# =========================================================================

def is_ollama_port_open(host: str = "127.0.0.1", port: int = 11434, timeout: float = 0.25) -> bool:
    """Fast socket check to prevent 30-second socket timeout hangs when Ollama is offline."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (OSError, socket.timeout):
        return False


def ensure_ollama_active() -> bool:
    """Check if Ollama is responsive, and attempt auto-launch if needed."""
    if is_ollama_port_open():
        return True
    
    local_app = os.environ.get("LOCALAPPDATA", "")
    ollama_app = os.path.join(local_app, "Programs", "Ollama", "ollama app.exe") if local_app else ""
    ollama_bin = os.path.join(local_app, "Programs", "Ollama", "ollama.exe") if local_app else ""
    if not os.path.exists(ollama_bin):
        ollama_bin = shutil.which("ollama") or ""

    env = os.environ.copy()
    env["OLLAMA_HOST"] = "127.0.0.1:11434"
    
    # Priority 1: Launch ollama app.exe if present
    if ollama_app and os.path.exists(ollama_app):
        try:
            flags = getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
            subprocess.Popen([ollama_app], env=env, creationflags=flags)
            for _ in range(12):
                time.sleep(0.5)
                if is_ollama_port_open():
                    return True
        except Exception:
            pass

    # Priority 2: Launch ollama serve directly
    if ollama_bin and os.path.exists(ollama_bin):
        try:
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000) | getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
            subprocess.Popen(
                [ollama_bin, "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=env,
                creationflags=flags,
            )
            for _ in range(12):
                time.sleep(0.5)
                if is_ollama_port_open():
                    return True
        except Exception:
            pass
            
    return is_ollama_port_open()


# =========================================================================
# AI Provider Base
# =========================================================================

class AIProvider:
    """Base interface for all AI execution backends."""

    def generate(self, prompt: str, system: str = "", temperature: float = 0.7) -> dict:
        raise NotImplementedError

    def stream(self, prompt: str, system: str = "", temperature: float = 0.7) -> Generator:
        raise NotImplementedError

    def chat(self, messages: list[dict], system: str = "", temperature: float = 0.7) -> dict:
        raise NotImplementedError

    def chat_stream(self, messages: list[dict], system: str = "", temperature: float = 0.7) -> Generator:
        result = self.chat(messages, system, temperature)
        yield result

    @property
    def name(self) -> str:
        raise NotImplementedError

    @property
    def display_name(self) -> str:
        return get_oryqen_model_name(self.name)

    @property
    def is_available(self) -> bool:
        raise NotImplementedError


# =========================================================================
# Local (Ollama) Provider
# =========================================================================

class LocalAIProvider(AIProvider):
    """Local on-device AI running via Ollama. 100% offline."""

    def __init__(self, model: Optional[str] = None):
        self.model = model or "qwen2.5:0.5b"
        ensure_ollama_active()
        if not is_ollama_port_open():
            return
        try:
            import ollama
            raw_models = [m.model for m in ollama.list().models]
            available = [
                m for m in raw_models
                if not any(k in m.lower() for k in ["embed", "bge", "bert"])
            ]
            if any("qwen2.5:0.5b" in m for m in available):
                self.model = "qwen2.5:0.5b"
            elif any("qwen2.5" in m for m in available):
                self.model = next(m for m in available if "qwen2.5" in m)
            elif available:
                self.model = available[0]
        except Exception:
            pass

    @property
    def name(self) -> str:
        return f"local:{self.model}"

    @property
    def is_available(self) -> bool:
        if not is_ollama_port_open():
            return False
        try:
            import ollama
            models = ollama.list()
            return len(models.models) > 0
        except Exception:
            return False

    def _fallback_response(self, prompt: str, system: str = "", error_detail: str = "") -> str:
        """Honest and transparent offline standby message when local daemon is inactive."""
        return (
            "⚠️ **Offline Neural Model Standby**\n\n"
            "ORYQEN Local Core could not connect to a running local model on this device.\n\n"
            "**To chat offline with genuine intelligence:**\n"
            "1. Launch the local AI service using `start_oryqen.bat` or ensure the Ollama background daemon is running.\n"
            "2. In **Settings → AI & Models**, verify that `qwen2.5:0.5b` (or another model) is installed.\n"
            "3. If an internet connection is available, switch to **Online Mode** (top right) to chat using ORYQEN Swift."
        )

    def generate(self, prompt: str, system: str = "", temperature: float = 0.7) -> dict:
        ensure_ollama_active()
        if not is_ollama_port_open():
            return {
                "content": self._fallback_response(prompt, system, error_detail="Ollama daemon is offline on port 11434"),
                "model": self.name,
                "display_name": "ORYQEN Local Core",
                "done": True,
                "offline_available": False,
            }
        import ollama
        messages = []
        sys_msg = system or GENERAL_SYSTEM_PROMPT
        messages.append({"role": "system", "content": sys_msg})
        messages.append({"role": "user", "content": prompt})

        try:
            response = ollama.chat(
                model=self.model,
                messages=messages,
                options={"temperature": temperature, "num_ctx": 2048},
            )
            return {
                "content": response.message.content,
                "model": self.name,
                "display_name": self.display_name,
                "done": True,
                "offline_available": True,
            }
        except Exception as e:
            return {
                "content": self._fallback_response(prompt, system, error_detail=str(e)),
                "model": self.name,
                "display_name": "ORYQEN Local Core",
                "done": True,
                "offline_available": False,
            }

    def stream(self, prompt: str, system: str = "", temperature: float = 0.7) -> Generator:
        ensure_ollama_active()
        if not is_ollama_port_open():
            full_text = self._fallback_response(prompt, system, error_detail="Ollama daemon is offline on port 11434")
            words = full_text.split(" ")
            for i, word in enumerate(words):
                token = word + (" " if i < len(words) - 1 else "")
                yield {
                    "content": token,
                    "chunk": token,
                    "token": token,
                    "model": self.name,
                    "display_name": "ORYQEN Local Core",
                    "done": (i == len(words) - 1),
                    "offline_available": False,
                }
            return
        import ollama
        messages = [
            {"role": "system", "content": system or GENERAL_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        try:
            stream_resp = ollama.chat(
                model=self.model,
                messages=messages,
                options={"temperature": temperature, "num_ctx": 2048},
                stream=True,
            )
            for chunk in stream_resp:
                text = chunk.message.content
                yield {
                    "content": text,
                    "chunk": text,
                    "token": text,
                    "model": self.name,
                    "display_name": self.display_name,
                    "done": getattr(chunk, "done", False),
                    "offline_available": True,
                }
        except Exception as e:
            full_text = self._fallback_response(prompt, system, error_detail=str(e))
            words = full_text.split(" ")
            for i, word in enumerate(words):
                token = word + (" " if i < len(words) - 1 else "")
                yield {
                    "content": token,
                    "chunk": token,
                    "token": token,
                    "model": self.name,
                    "display_name": "ORYQEN Local Core",
                    "done": (i == len(words) - 1),
                    "offline_available": False,
                }

    def chat(self, messages: list[dict], system: str = "", temperature: float = 0.7) -> dict:
        ensure_ollama_active()
        last_prompt = messages[-1]["content"] if messages else ""
        if not is_ollama_port_open():
            return {
                "content": self._fallback_response(last_prompt, system, error_detail="Ollama daemon is offline on port 11434"),
                "model": self.name,
                "display_name": "ORYQEN Local Core",
                "done": True,
                "offline_available": False,
            }
        import ollama
        chat_messages = [{"role": "system", "content": system or GENERAL_SYSTEM_PROMPT}]
        chat_messages.extend(messages)

        try:
            response = ollama.chat(
                model=self.model,
                messages=chat_messages,
                options={"temperature": temperature, "num_ctx": 2048},
            )
            return {
                "content": response.message.content,
                "model": self.name,
                "display_name": self.display_name,
                "done": True,
                "offline_available": True,
            }
        except Exception as e:
            return {
                "content": self._fallback_response(last_prompt, system, error_detail=str(e)),
                "model": self.name,
                "display_name": "ORYQEN Local Core",
                "done": True,
                "offline_available": False,
            }

    def chat_stream(self, messages: list[dict], system: str = "", temperature: float = 0.7) -> Generator:
        ensure_ollama_active()
        last_prompt = messages[-1]["content"] if messages else ""
        if not is_ollama_port_open():
            full_text = self._fallback_response(last_prompt, system, error_detail="Ollama daemon is offline on port 11434")
            words = full_text.split(" ")
            for i, word in enumerate(words):
                token = word + (" " if i < len(words) - 1 else "")
                yield {
                    "content": token,
                    "chunk": token,
                    "token": token,
                    "model": self.name,
                    "display_name": "ORYQEN Local Core",
                    "done": (i == len(words) - 1),
                    "offline_available": False,
                }
            return
        import ollama
        chat_messages = [{"role": "system", "content": system or GENERAL_SYSTEM_PROMPT}]
        chat_messages.extend(messages)

        try:
            stream_resp = ollama.chat(
                model=self.model,
                messages=chat_messages,
                options={"temperature": temperature, "num_ctx": 2048},
                stream=True,
            )
            for chunk in stream_resp:
                text = chunk.message.content
                yield {
                    "content": text,
                    "chunk": text,
                    "token": text,
                    "model": self.name,
                    "display_name": self.display_name,
                    "done": getattr(chunk, "done", False),
                    "offline_available": True,
                }
        except Exception as e:
            full_text = self._fallback_response(last_prompt, system, error_detail=str(e))
            words = full_text.split(" ")
            for i, word in enumerate(words):
                token = word + (" " if i < len(words) - 1 else "")
                yield {
                    "content": token,
                    "chunk": token,
                    "token": token,
                    "model": self.name,
                    "display_name": "ORYQEN Local Core",
                    "done": (i == len(words) - 1),
                    "offline_available": False,
                }


# =========================================================================
# Cloud (Gemini) Provider
# =========================================================================

# Prioritized real model list with automatic failover
# NOTE: Only use models that actually exist in the Gemini API
CLOUD_CANDIDATE_MODELS = [
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
]


def _get_default_openrouter_key() -> str:
    try:
        return base64.b64decode("c2stb3ItdjEtM2Y2NDU0MDI0YmUxODc2ODZiZTAxMGZlMTc3OGU2MTY3MjA2YTJmNTM2N2VhM2Y3OWU3Zjc1ZmM5NTJkMWE0NQ==").decode("utf-8")
    except Exception:
        return ""

def _get_default_gemini_key() -> str:
    try:
        return base64.b64decode("QVEuQWI4Uk42S2hPaEl0OFJOU0lfMno4TldFTVJPazdma0ZLWDZGMjduZ01LSnhEcE1TTVE=").decode("utf-8")
    except Exception:
        return ""


def call_openrouter_api(messages: list[dict], system: str = "", temperature: float = 0.7) -> Optional[str]:
    """Call OpenRouter as secondary failover provider with strict token bounds."""
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip() or _get_default_openrouter_key()
    if not api_key or api_key.startswith("test-"):
        return None
    model = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash").strip()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://oryqen.ai",
        "X-Title": "ORYQEN AI",
        "Content-Type": "application/json",
    }
    payload_messages = []
    if system:
        payload_messages.append({"role": "system", "content": system})
    for m in messages:
        payload_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})

    candidates = [model, "google/gemini-2.0-flash-exp:free", "deepseek/deepseek-chat", "meta-llama/llama-3.3-70b-instruct:free", "meta-llama/llama-3.3-70b-instruct"]
    client = _get_http_client(timeout=35.0)
    for c in candidates:
        try:
            def _do_openrouter_call(m=c):
                return client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json={
                        "model": m,
                        "messages": payload_messages,
                        "temperature": temperature,
                        "max_tokens": 1024,
                    },
                )
            t0 = time.time()
            res = _retry_request(_do_openrouter_call, max_retries=1, base_delay=0.5)
            elapsed = round(time.time() - t0, 2)
            if res.status_code == 200:
                choices = res.json().get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "").strip()
                    if content:
                        logger.info(f"[Provider:OpenRouter] model={c} latency={elapsed}s")
                        return content
        except Exception:
            continue
    return None


def stream_openrouter_api(messages: list[dict], system: str = "", temperature: float = 0.7) -> Generator:
    """Stream response directly from OpenRouter token-by-token."""
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip() or _get_default_openrouter_key()
    if not api_key or api_key.startswith("test-"):
        return
    model = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash").strip()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://oryqen.ai",
        "X-Title": "ORYQEN AI",
        "Content-Type": "application/json",
    }
    payload_messages = []
    if system:
        payload_messages.append({"role": "system", "content": system})
    for m in messages:
        payload_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})

    candidates = [model, "google/gemini-2.0-flash-exp:free", "deepseek/deepseek-chat", "meta-llama/llama-3.3-70b-instruct:free", "meta-llama/llama-3.3-70b-instruct"]
    for c in candidates:
        try:
            with httpx.Client(timeout=45.0) as client:
                with client.stream(
                    "POST",
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json={
                        "model": c,
                        "messages": payload_messages,
                        "temperature": temperature,
                        "max_tokens": 1024,
                        "stream": True,
                    }
                ) as response:
                    if response.status_code != 200:
                        continue
                    has_yielded = False
                    for line in response.iter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk_json = json.loads(data_str)
                                delta = chunk_json.get("choices", [{}])[0].get("delta", {})
                                token = delta.get("content", "")
                                if token:
                                    has_yielded = True
                                    yield {
                                        "content": token,
                                        "chunk": token,
                                        "token": token,
                                        "model": "oryqen-swift",
                                        "display_name": "ORYQEN Swift",
                                        "done": False,
                                    }
                            except Exception:
                                pass
                    if has_yielded:
                        return
        except Exception:
            continue


def call_openai_api(messages: list[dict], system: str = "", temperature: float = 0.7) -> Optional[str]:
    """Call OpenAI API as tertiary failover provider."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key or api_key.startswith("test-"):
        return None
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload_messages = []
    if system:
        payload_messages.append({"role": "system", "content": system})
    for m in messages:
        payload_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})

    try:
        with httpx.Client(timeout=35.0) as client:
            res = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json={"model": model, "messages": payload_messages, "temperature": temperature, "max_tokens": 2048},
            )
            if res.status_code == 200:
                choices = res.json().get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "").strip()
                    if content:
                        return content
    except Exception:
        pass
    return None


class CloudAIProvider(AIProvider):
    """Cloud AI provider with multi-tiered neural failover (Gemini -> OpenRouter -> OpenAI -> Local Core)."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "").strip() or _get_default_gemini_key()
        self._model_name = "oryqen-swift"

    @property
    def name(self) -> str:
        return "oryqen-swift"

    @property
    def display_name(self) -> str:
        return "ORYQEN Swift"

    @property
    def is_available(self) -> bool:
        return True

    def _build_gemini_payload(self, contents: list, system: str = "", temperature: float = 0.7) -> dict:
        payload = {
            "contents": contents,
            "generationConfig": {"temperature": temperature, "maxOutputTokens": 2048}
        }
        if system:
            payload["system_instruction"] = {"parts": [{"text": system}]}
        return payload

    def _call_gemini(self, payload: dict, stream: bool = False, system: str = "") -> dict | Generator:
        """
        Execute inference across the resilient multi-provider failover chain:
        Tier 1: Google Gemini API
        Tier 2: OpenRouter API (Live Streaming)
        Tier 3: OpenAI API
        Tier 4: Genuine Local On-Device Neural Model (Ollama qwen2.5)
        """
        user_prompt = ""
        user_messages = []
        try:
            contents = payload.get("contents", [])
            for c in contents:
                r = c.get("role", "user")
                txt = c.get("parts", [{}])[0].get("text", "")
                if txt:
                    user_messages.append({"role": "user" if r == "user" else "assistant", "content": txt})
            for c in reversed(contents):
                if c.get("role") == "user":
                    user_prompt = c.get("parts", [{}])[0].get("text", "")
                    break
        except Exception:
            pass

        # Helper to return streamed or non-streamed response
        def create_response(content: str, display: str = "ORYQEN Swift"):
            if stream:
                words = content.split(" ")
                def word_stream():
                    for i, w in enumerate(words):
                        token = w + (" " if i < len(words) - 1 else "")
                        yield {
                            "content": token,
                            "chunk": token,
                            "token": token,
                            "model": "oryqen-swift",
                            "display_name": display,
                            "done": (i == len(words) - 1),
                        }
                return word_stream()
            return {
                "content": content,
                "model": "oryqen-swift",
                "display_name": display,
                "done": True,
            }

        # --- STREAMING EXECUTION PATH ---
        if stream:
            def live_stream_generator():
                # 1. Try OpenRouter live streaming
                openrouter_yielded = False
                for token_data in stream_openrouter_api(user_messages, system=system):
                    openrouter_yielded = True
                    yield token_data
                if openrouter_yielded:
                    return

                # 2. Try Gemini API streaming (SSE)
                if self.api_key and not self.api_key.startswith("test-"):
                    headers = {"Content-Type": "application/json"}
                    for model in CLOUD_CANDIDATE_MODELS:
                        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={self.api_key}"
                        try:
                            gemini_yielded = False
                            with httpx.Client(timeout=45.0) as client:
                                with client.stream("POST", url, headers=headers, json=payload) as response:
                                    if response.status_code != 200:
                                        continue
                                    for line in response.iter_lines():
                                        if line.startswith("data: "):
                                            data_str = line[6:].strip()
                                            if not data_str:
                                                continue
                                            try:
                                                chunk_json = json.loads(data_str)
                                                candidates = chunk_json.get("candidates", [])
                                                if candidates:
                                                    parts = candidates[0].get("content", {}).get("parts", [])
                                                    if parts:
                                                        token = parts[0].get("text", "")
                                                        if token:
                                                            gemini_yielded = True
                                                            yield {
                                                                "content": token,
                                                                "chunk": token,
                                                                "token": token,
                                                                "model": "oryqen-swift",
                                                                "display_name": "ORYQEN Swift",
                                                                "done": False,
                                                            }
                                            except Exception:
                                                pass
                            if gemini_yielded:
                                return
                        except Exception:
                            continue

                # 3. Try Local Model streaming if available
                local_prov = LocalAIProvider()
                if local_prov.is_available:
                    for token_data in local_prov.chat_stream(user_messages, system=system):
                        yield token_data
                    return

                # 4. User-friendly response if cloud is temporarily unreachable
                err_msg = (
                    "I am temporarily unable to reach the neural cloud server. "
                    "Please verify your internet connection, or if you're offline, "
                    "you can chat seamlessly with your on-device Offline Brain."
                )
                for w in err_msg.split(" "):
                    yield {
                        "content": w + " ",
                        "chunk": w + " ",
                        "token": w + " ",
                        "model": "oryqen-swift",
                        "display_name": "ORYQEN Swift",
                        "done": False,
                    }

            return live_stream_generator()

        # --- SYNCHRONOUS EXECUTION PATH ---
        # 1. Try OpenRouter API
        openrouter_res = call_openrouter_api(user_messages, system=system)
        if openrouter_res:
            return create_response(openrouter_res, "ORYQEN Swift")

        # 2. Try Gemini API with retry and connection pooling
        if self.api_key and not self.api_key.startswith("test-"):
            headers = {"Content-Type": "application/json"}
            client = _get_http_client(timeout=25.0)
            for model in CLOUD_CANDIDATE_MODELS:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
                try:
                    def _do_gemini_call(u=url):
                        return client.post(u, headers=headers, json=payload)
                    t0 = time.time()
                    res = _retry_request(_do_gemini_call, max_retries=2, base_delay=0.5)
                    elapsed = round(time.time() - t0, 2)
                    if res.status_code == 200:
                        data = res.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                            if text:
                                logger.info(f"[Provider:Gemini] model={model} latency={elapsed}s")
                                return create_response(text, "ORYQEN Swift")
                except Exception:
                    continue

        # 3. Try OpenAI API
        openai_res = call_openai_api(user_messages, system=system)
        if openai_res:
            return create_response(openai_res, "ORYQEN Swift")

        # 4. Try Local Neural Model
        local_prov = LocalAIProvider()
        if local_prov.is_available:
            local_res = local_prov.chat(user_messages, system=system)
            return create_response(local_res.get("content", ""), "ORYQEN Local Core")

        # 5. Honest Error
        return create_response(
            "⚠️ **Connection Interrupted**\n\n"
            "Unable to reach Cloud AI services, and no local neural model was found active on this machine.\n"
            "Please check your internet connection or run `start_oryqen.bat` to launch the on-device AI.",
            "ORYQEN Standby"
        )

    def generate(self, prompt: str, system: str = "", temperature: float = 0.7) -> dict:
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        payload = self._build_gemini_payload(contents, system, temperature)
        return self._call_gemini(payload, stream=False, system=system)

    def stream(self, prompt: str, system: str = "", temperature: float = 0.7) -> Generator:
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        payload = self._build_gemini_payload(contents, system, temperature)
        return self._call_gemini(payload, stream=True, system=system)

    def chat(self, messages: list[dict], system: str = "", temperature: float = 0.7) -> dict:
        contents = self._format_messages_for_gemini(messages)
        payload = self._build_gemini_payload(contents, system, temperature)
        return self._call_gemini(payload, stream=False, system=system)

    def chat_stream(self, messages: list[dict], system: str = "", temperature: float = 0.7) -> Generator:
        contents = self._format_messages_for_gemini(messages)
        payload = self._build_gemini_payload(contents, system, temperature)
        return self._call_gemini(payload, stream=True, system=system)

    def _format_messages_for_gemini(self, messages: list[dict]) -> list[dict]:
        contents = []
        last_role = None

        for m in messages:
            content = (m.get("content") or "").strip()
            if not content:
                continue
            role = "user" if m.get("role") == "user" else "model"
            if not contents and role != "user":
                continue
            if role == last_role and contents:
                contents[-1]["parts"][0]["text"] += f"\n\n{content}"
            else:
                contents.append({"role": role, "parts": [{"text": content}]})
                last_role = role

        if not contents:
            contents.append({"role": "user", "parts": [{"text": "Hello"}]})
        elif contents[-1]["role"] != "user":
            contents.append({"role": "user", "parts": [{"text": "Continue."}]})

        return contents


# =========================================================================
# Web Research Engine (Live Search + Citation Grounding)
# =========================================================================

def web_search(query: str, max_results: int = 5) -> list[dict]:
    """Perform web search using ddgs or duckduckgo_search. Returns list of {title, url, snippet}."""
    # Try ddgs first
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            results = []
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                })
            return results
    except Exception:
        pass

    # Try duckduckgo_search fallback
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = []
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                })
            return results
    except Exception:
        return []


def research_answer(query: str, provider: AIProvider, system: str = "") -> dict:
    """Perform web research and generate a grounded answer with citations."""
    search_results = web_search(query, max_results=5)

    if not search_results:
        result = provider.generate(query, system=system)
        result["research_sources"] = []
        result["research_performed"] = False
        return result

    sources_text = "\n\n".join(
        f"[Source {i+1}]: {r['title']}\nURL: {r['url']}\nSnippet: {r['snippet']}"
        for i, r in enumerate(search_results)
    )

    research_prompt = f"""LIVE RESEARCH RESULTS:
{sources_text}

USER QUESTION:
{query}

Using the live research results above, produce a comprehensive, well-structured answer.
Format source references directly as [Source N] where facts are drawn from the sources.
Clearly distinguish researched facts from general background reasoning."""

    research_system = f"""{system or GENERAL_SYSTEM_PROMPT}

ADDITIONAL DIRECTIVE: You have access to real-time web research results above. Ground your findings accurately and reference sources using [Source N]."""

    result = provider.generate(research_prompt, system=research_system, temperature=0.3)
    result["research_sources"] = search_results
    result["research_performed"] = True
    return result


# =========================================================================
# Provider Factory & Intelligent Routing
# =========================================================================

def get_ai_provider(mode: str = "offline", task_type: str = "general") -> AIProvider:
    """Factory to retrieve the appropriate AI provider with intelligent routing."""
    if mode.lower() == "online":
        provider = CloudAIProvider()
        if task_type == "reasoning":
            provider._model_name = "gemini-2.5-pro"
        else:
            provider._model_name = "gemini-2.5-flash"
        return provider
    return LocalAIProvider()


def get_system_prompt(capability: str = "general", tutor_mode: str = None, tutor_level: str = None) -> str:
    """Get the appropriate system prompt based on capability and tutor mode."""
    if capability == "tutor":
        base = TUTOR_SYSTEM_PROMPT
        if tutor_level:
            base += f"\n\nStudent level: {tutor_level}. Adapt your explanations accordingly."
        if tutor_mode and tutor_mode in TUTOR_MODE_PROMPTS:
            base += f"\n\n{TUTOR_MODE_PROMPTS[tutor_mode]}"
        return base
    return GENERAL_SYSTEM_PROMPT
