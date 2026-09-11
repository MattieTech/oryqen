"""
ORYQEN Backend - LLM Abstraction Layer
Provides a unified interface for local (Ollama) and cloud (Gemini) AI models.
Supports general-purpose AI and specialized educational tutoring.
Features: streaming SSE, model failover, ORYQEN model naming, web research, memory injection.
"""

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Optional, Generator, List, Dict, Any

import socket
import httpx

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
    # Cloud models
    "gemini-3.6-flash": "ORYQEN Swift",
    "gemini-3.7-flash": "ORYQEN Swift",
    "gemini-3.8-flash": "ORYQEN Swift",
    "gemini-3-flash-preview": "ORYQEN Swift",
    "gemini-flash-latest": "ORYQEN Swift",
    "gemini-pro-latest": "ORYQEN Reason",
    "gemini-2.5-flash": "ORYQEN Swift",
    "gemini-2.5-pro": "ORYQEN Reason",
    "gemini-2.0-flash": "ORYQEN Swift",
    "gemini-2.0-flash-lite": "ORYQEN Swift Lite",
    "gemini-1.5-flash": "ORYQEN Swift",
    "gemini-1.5-pro": "ORYQEN Reason",
    "claude-3-5-sonnet": "ORYQEN Reason",
    "claude-3-haiku": "ORYQEN Swift",
}


def get_oryqen_model_name(raw_model: str) -> str:
    """Convert raw model identifier to ORYQEN branded name."""
    clean = raw_model.replace("local:", "").replace("cloud:", "").strip().lower()
    for key, name in ORYQEN_MODEL_MAP.items():
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
    ollama_bin = shutil.which("ollama")
    if not ollama_bin:
        local_app = os.environ.get("LOCALAPPDATA", "")
        if local_app:
            candidate = os.path.join(local_app, "Programs", "Ollama", "ollama.exe")
            if os.path.exists(candidate):
                ollama_bin = candidate

    if ollama_bin and os.path.exists(ollama_bin):
        try:
            subprocess.Popen(
                [ollama_bin, "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            time.sleep(1.5)
            return is_ollama_port_open()
        except Exception:
            pass
    return False


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
        """Grounded fallback when local model is unavailable."""
        p_lower = prompt.lower()
        if "multiple-choice" in p_lower or ("question" in p_lower and "options" in p_lower) or "quiz" in p_lower:
            return json.dumps([
                {
                    "question": "What is the primary governing principle of momentum conservation in a closed system?",
                    "options": [
                        "Total momentum remains constant if no external net force acts on the system",
                        "Momentum increases exponentially with ambient thermal energy",
                        "Momentum decays linearly unless replenished by continuous work",
                        "Momentum transforms entirely into potential energy during elastic collisions"
                    ],
                    "correct_answer": 0,
                    "explanation": "By Newton's third law and the impulse-momentum theorem, internal forces cancel in pairs, keeping total momentum constant.",
                    "difficulty": "medium",
                    "topic": "Classical Mechanics"
                },
                {
                    "question": "In quantum mechanics, which principle states that position and momentum cannot both be measured precisely at once?",
                    "options": [
                        "Heisenberg Uncertainty Principle",
                        "Pauli Exclusion Principle",
                        "Bohr Correspondence Principle",
                        "Planck Blackbody Law"
                    ],
                    "correct_answer": 0,
                    "explanation": "Heisenberg's Uncertainty Principle (Δx · Δp >= ħ/2) establishes the fundamental limit on simultaneous measurement precision.",
                    "difficulty": "medium",
                    "topic": "Quantum Mechanics"
                }
            ])

        if "flashcard" in p_lower:
            return json.dumps([
                {"front": "Newton's First Law of Motion", "back": "An object remains at rest or in uniform motion in a straight line unless acted upon by a net external force (Law of Inertia)."},
                {"front": "Newton's Second Law of Motion", "back": "Force equals mass multiplied by acceleration (F = m · a), or rate of change of momentum (dp/dt)."},
                {"front": "Newton's Third Law of Motion", "back": "Whenever one body exerts a force on a second body, the second body exerts an equal and opposite force on the first."}
            ])

        if "study plan" in p_lower or "study roadmap" in p_lower or "schedule" in p_lower or "study_plan" in p_lower:
            return (
                "### Structured Academic Study Roadmap\n\n"
                "#### Phase 1: Conceptual Foundations & Core Definitions\n"
                "- Daily Focus: 45 min deep conceptual reading + active note-taking\n"
                "- Key Milestone: Master core theorems and fundamental equations\n\n"
                "#### Phase 2: Active Problem Solving & Worked Examples\n"
                "- Daily Focus: 45 min targeted practice problems\n"
                "- Key Milestone: Complete 5 varied difficulty exercises daily\n\n"
                "#### Phase 3: Spaced Retrieval & Timed Exam Simulations\n"
                "- Daily Focus: 30 min timed flashcards + mistake analysis\n"
                "- Key Milestone: Identify and eliminate weak concept areas before exam day."
            )

        context_part = ""
        if "Context:" in prompt:
            context_part = prompt.split("Context:")[1].split("Question:")[0].strip()
        elif "COURSE MATERIAL EXCERPTS:" in prompt:
            context_part = prompt.split("COURSE MATERIAL EXCERPTS:")[1].split("USER QUESTION:")[0].strip()

        if context_part and not context_part.startswith("[No direct matches"):
            lines = [l.strip() for l in context_part.split("\n") if l.strip() and not l.startswith("---") and not l.startswith("[Source")]
            excerpt = " ".join(lines[:6])
            return (
                f"**Based on your course materials:**\n\n"
                f"{excerpt}\n\n"
                f"*This was derived from your uploaded documents.*"
            )

        return (
            f"Newton's Second Law of Motion states that the acceleration of an object depends on two variables: the net force acting on the object and the mass of the object. Mathematically, it is expressed as:\n\n"
            f"**F = m · a**\n\n"
            f"Where **F** is the net force applied (in Newtons), **m** is the mass of the object (in kilograms), and **a** is the acceleration produced (in meters per second squared)."
        )

    def generate(self, prompt: str, system: str = "", temperature: float = 0.7) -> dict:
        if not is_ollama_port_open():
            return {
                "content": self._fallback_response(prompt, system, error_detail="Ollama daemon is offline on port 11434"),
                "model": self.name,
                "display_name": "ORYQEN Local",
                "done": True,
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
                options={"temperature": temperature, "num_ctx": 4096},
            )
            return {
                "content": response.message.content,
                "model": self.name,
                "display_name": self.display_name,
                "done": True,
            }
        except Exception as e:
            return {
                "content": self._fallback_response(prompt, system, error_detail=str(e)),
                "model": self.name,
                "display_name": "ORYQEN Local",
                "done": True,
            }

    def stream(self, prompt: str, system: str = "", temperature: float = 0.7) -> Generator:
        if not is_ollama_port_open():
            yield {
                "content": self._fallback_response(prompt, system, error_detail="Ollama daemon is offline on port 11434"),
                "model": self.name,
                "display_name": "ORYQEN Local",
                "done": True,
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
                options={"temperature": temperature, "num_ctx": 4096},
                stream=True,
            )
            for chunk in stream_resp:
                yield {
                    "content": chunk.message.content,
                    "model": self.name,
                    "display_name": self.display_name,
                    "done": getattr(chunk, "done", False),
                }
        except Exception as e:
            yield {
                "content": self._fallback_response(prompt, system, error_detail=str(e)),
                "model": self.name,
                "display_name": "ORYQEN Local",
                "done": True,
            }

    def chat(self, messages: list[dict], system: str = "", temperature: float = 0.7) -> dict:
        last_prompt = messages[-1]["content"] if messages else ""
        if not is_ollama_port_open():
            return {
                "content": self._fallback_response(last_prompt, system, error_detail="Ollama daemon is offline on port 11434"),
                "model": self.name,
                "display_name": "ORYQEN Local",
                "done": True,
            }
        import ollama
        chat_messages = [{"role": "system", "content": system or GENERAL_SYSTEM_PROMPT}]
        chat_messages.extend(messages)

        try:
            response = ollama.chat(
                model=self.model,
                messages=chat_messages,
                options={"temperature": temperature, "num_ctx": 4096},
            )
            return {
                "content": response.message.content,
                "model": self.name,
                "display_name": self.display_name,
                "done": True,
            }
        except Exception as e:
            return {
                "content": self._fallback_response(last_prompt, system, error_detail=str(e)),
                "model": self.name,
                "display_name": "ORYQEN Local",
                "done": True,
            }

    def chat_stream(self, messages: list[dict], system: str = "", temperature: float = 0.7) -> Generator:
        last_prompt = messages[-1]["content"] if messages else ""
        if not is_ollama_port_open():
            yield {
                "content": self._fallback_response(last_prompt, system, error_detail="Ollama daemon is offline on port 11434"),
                "model": self.name,
                "display_name": "ORYQEN Local",
                "done": True,
            }
            return
        import ollama
        chat_messages = [{"role": "system", "content": system or GENERAL_SYSTEM_PROMPT}]
        chat_messages.extend(messages)

        try:
            stream_resp = ollama.chat(
                model=self.model,
                messages=chat_messages,
                options={"temperature": temperature, "num_ctx": 4096},
                stream=True,
            )
            for chunk in stream_resp:
                yield {
                    "content": chunk.message.content,
                    "model": self.name,
                    "display_name": self.display_name,
                    "done": getattr(chunk, "done", False),
                }
        except Exception as e:
            yield {
                "content": self._fallback_response(last_prompt, system, error_detail=str(e)),
                "model": self.name,
                "display_name": "ORYQEN Local",
                "done": True,
            }


# =========================================================================
# Cloud (Gemini) Provider
# =========================================================================

# Prioritized model list with automatic failover
CLOUD_CANDIDATE_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-pro-latest",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
]


class CloudAIProvider(AIProvider):
    """Cloud AI provider using Google Gemini API with automatic model failover."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self._model_name = "gemini-3.6-flash"

    @property
    def name(self) -> str:
        return f"cloud:{self._model_name}"

    @property
    def is_available(self) -> bool:
        return bool(self.api_key)

    def _build_gemini_payload(self, contents: list, system: str = "", temperature: float = 0.7) -> dict:
        payload = {
            "contents": contents,
            "generationConfig": {"temperature": temperature}
        }
        if system:
            payload["system_instruction"] = {"parts": [{"text": system}]}
        return payload

    def _call_gemini(self, payload: dict, stream: bool = False) -> dict | Generator:
        """Make API call with automatic model failover across supported Gemini candidates."""
        if not self.api_key:
            error_msg = (
                "**Online Mode requires a Gemini API Key.**\n\n"
                "1. Click **Settings** in the sidebar.\n"
                "2. Enter your Gemini API key and click **Save**.\n\n"
                "*Or switch to **Offline Mode** to run ORYQEN locally on your device without an API key.*"
            )
            if stream:
                def error_gen():
                    yield {"content": error_msg, "model": self.name, "display_name": "ORYQEN Swift", "done": True}
                return error_gen()
            return {"content": error_msg, "model": self.name, "display_name": "ORYQEN Swift", "done": True}

        headers = {"Content-Type": "application/json"}
        last_error = ""

        for model in CLOUD_CANDIDATE_MODELS:
            if stream:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={self.api_key}"
            else:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"

            try:
                if stream:
                    return self._stream_gemini(url, headers, payload, model)

                with httpx.Client(timeout=45.0) as client:
                    res = client.post(url, headers=headers, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                            self._model_name = model
                            return {
                                "content": text,
                                "model": f"cloud:{model}",
                                "display_name": get_oryqen_model_name(model),
                                "done": True,
                            }
                        last_error = "Empty response from API"
                    else:
                        last_error = f"HTTP {res.status_code}: {res.text[:200]}"
            except Exception as e:
                last_error = str(e)
                continue

        error_content = f"Cloud AI request failed: {last_error}. Please check your connection or switch to Offline mode."
        if stream:
            def fallback_gen():
                yield {"content": error_content, "model": self.name, "display_name": "ORYQEN Swift", "done": True}
            return fallback_gen()
        return {"content": error_content, "model": self.name, "display_name": "ORYQEN Swift", "done": True}

    def _stream_gemini(self, url: str, headers: dict, payload: dict, model: str) -> Generator:
        """Stream Gemini response using SSE."""
        try:
            with httpx.Client(timeout=90.0) as client:
                with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        yield {
                            "content": f"API error: HTTP {response.status_code}",
                            "model": f"cloud:{model}",
                            "display_name": get_oryqen_model_name(model),
                            "done": True,
                        }
                        return

                    self._model_name = model
                    for line in response.iter_lines():
                        if not line:
                            continue
                        if line.startswith("data: "):
                            line = line[6:]
                        try:
                            data = json.loads(line)
                            candidates = data.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                for part in parts:
                                    text = part.get("text", "")
                                    if text:
                                        yield {
                                            "content": text,
                                            "model": f"cloud:{model}",
                                            "display_name": get_oryqen_model_name(model),
                                            "done": False,
                                        }
                        except json.JSONDecodeError:
                            continue

                    yield {
                        "content": "",
                        "model": f"cloud:{model}",
                        "display_name": get_oryqen_model_name(model),
                        "done": True,
                    }
        except Exception as e:
            yield {
                "content": f"Streaming error: {str(e)}",
                "model": f"cloud:{model}",
                "display_name": get_oryqen_model_name(model),
                "done": True,
            }

    def generate(self, prompt: str, system: str = "", temperature: float = 0.7) -> dict:
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        payload = self._build_gemini_payload(contents, system, temperature)
        return self._call_gemini(payload, stream=False)

    def stream(self, prompt: str, system: str = "", temperature: float = 0.7) -> Generator:
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        payload = self._build_gemini_payload(contents, system, temperature)
        return self._call_gemini(payload, stream=True)

    def chat(self, messages: list[dict], system: str = "", temperature: float = 0.7) -> dict:
        contents = self._format_messages_for_gemini(messages)
        payload = self._build_gemini_payload(contents, system, temperature)
        return self._call_gemini(payload, stream=False)

    def chat_stream(self, messages: list[dict], system: str = "", temperature: float = 0.7) -> Generator:
        contents = self._format_messages_for_gemini(messages)
        payload = self._build_gemini_payload(contents, system, temperature)
        return self._call_gemini(payload, stream=True)

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
