"""
ORYQEN Backend - RAG & Conversation Engine
Handles general-purpose AI interactions as well as course-grounded RAG answers.
Runs 100% offline via local Ollama and on-device vector search, with cloud mode support.
Zero emojis used in output and logs.
"""

from typing import Optional
from .vector_store import vector_store
from .llm import (
    get_ai_provider,
    GENERAL_SYSTEM_PROMPT,
    TUTOR_SYSTEM_PROMPT,
)


GROUNDED_TUTOR_PROMPT = """You are ORYQEN, an advanced AI assistant and educational intelligence platform engineered and developed by SyntaxNexus Developer (formerly known as MattieTech), an organization founded and led by CEO Matthew Aliu. You were created specifically for Africa and beyond to empower education and research. Never refer to yourself as a "super fast AI".

RULES YOU MUST FOLLOW:
1. When answering the student's question, ground your explanation primarily in the provided course material excerpts.
2. Clearly cite the material title and page number when referencing concepts from the excerpts.
3. If the provided material does not cover the question, clearly state that the specific textbook excerpts do not address it, then offer a concise, foundational answer from general knowledge.
4. Break down complex formulas, definitions, and theories step by step.
5. Maintain a supportive, encouraging, and academically rigorous tone.

Citation format:
Source: [Material Title], Page [Page Number]
"""

QUIZ_SYSTEM_PROMPT = """You are ORYQEN, an educational assessment engine creating practice questions.

Based on the course material provided, generate exactly {count} multiple-choice questions.

RULES:
1. Questions must be derived directly from the provided course material.
2. Each question must provide exactly 4 options (A, B, C, D).
3. Exactly one option must be correct.
4. Provide a clear, educational explanation for the correct answer.
5. Vary difficulty across foundational, intermediate, and advanced concepts.

Strict JSON Output format:
{{
  "questions": [
    {{
      "question": "What is...?",
      "options": ["...", "...", "...", "..."],
      "correct_answer": 0,
      "explanation": "...",
      "difficulty": "easy|medium|hard"
    }}
  ]
}}

Output ONLY valid JSON. Do not include markdown code fencing or introductory remarks."""


def ask_assistant(
    question: str,
    course_id: Optional[str] = None,
    conversation_history: Optional[list[dict]] = None,
    mode: str = "offline",
    capability: str = "auto",
    top_k: int = 5,
) -> dict:
    """
    Primary intelligence interface for ORYQEN.
    - If course_id is provided: grounds the answer using retrieved document chunks (RAG).
    - If course_id is None: conducts a general-purpose AI conversation (coding, writing, analysis, QA).
    - Respects mode ('offline' | 'online').
    - capability: 'auto' (default) uses the unified prompt; 'tutor' forces tutor mode.
    """
    ai = get_ai_provider(mode=mode)
    sources = []
    has_context = False

    # Document grounding branch (if course_id or document is attached)
    if course_id:
        chunks = vector_store.search(
            query=question,
            course_id=course_id,
            top_k=top_k,
            min_score=0.25,
        )
        has_context = len(chunks) > 0

        if has_context:
            context_parts = []
            for i, chunk in enumerate(chunks):
                title = chunk.get("material_title", "Course Material")
                page = chunk.get("page_number", "?")
                source_label = f"[{title}, Page {page}]"
                context_parts.append(f"--- Excerpt {i+1} {source_label} ---\n{chunk['content']}")
            context = "\n\n".join(context_parts)

            sources = [
                {
                    "material_title": c.get("material_title", "Course Document"),
                    "page_number": c.get("page_number"),
                    "score": round(c.get("score", 0), 3),
                    "chunk_id": c.get("id"),
                    "chunk_text": c.get("content", ""),
                }
                for c in chunks
            ]
        else:
            context = "[No direct matches found in current indexed materials]"

        prompt = f"""COURSE MATERIAL EXCERPTS:
{context}

USER QUESTION:
{question}

Provide a grounded, comprehensive answer based on the excerpts above."""

        if conversation_history:
            history_text = "\n".join(
                f"{'User' if m.get('role') == 'user' else 'ORYQEN'}: {m.get('content')}"
                for m in conversation_history[-4:]
            )
            prompt = f"""CONVERSATION CONTEXT:
{history_text}

{prompt}"""

        # When documents are attached, always use the grounded tutor prompt
        system_prompt = GROUNDED_TUTOR_PROMPT
        response = ai.generate(prompt=prompt, system=system_prompt, temperature=0.3)

    else:
        # General-purpose AI conversation branch (no document required)
        # 'auto' or 'general' uses the unified prompt; 'tutor' forces tutor mode
        if capability == "tutor":
            system_prompt = TUTOR_SYSTEM_PROMPT
        else:
            system_prompt = GENERAL_SYSTEM_PROMPT
        
        # Prepare multi-turn messages
        chat_messages = []
        if conversation_history:
            for m in conversation_history[-6:]:
                chat_messages.append({
                    "role": "user" if m.get("role") == "user" else "assistant",
                    "content": m.get("content", "")
                })
        chat_messages.append({"role": "user", "content": question})

        response = ai.chat(messages=chat_messages, system=system_prompt, temperature=0.7)

    return {
        "answer": response["content"],
        "sources": sources,
        "model": response["model"],
        "has_context": has_context,
        "mode": mode,
        "capability": capability,
    }


# Backwards compatibility alias
def ask_tutor(
    question: str,
    course_id: Optional[str] = None,
    conversation_history: Optional[list[dict]] = None,
    top_k: int = 5,
) -> dict:
    return ask_assistant(
        question=question,
        course_id=course_id,
        conversation_history=conversation_history,
        mode="offline",
        capability="tutor",
        top_k=top_k,
    )


def generate_quiz(
    course_id: str,
    count: int = 5,
    topic: Optional[str] = None,
    mode: str = "offline",
) -> dict:
    """
    Generate an assessment quiz from course materials.
    """
    search_query = topic if topic else "key principles definitions mechanisms formulas"
    chunks = vector_store.search(
        query=search_query,
        course_id=course_id,
        top_k=8,
        min_score=0.2,
    )

    if not chunks:
        return {
            "questions": [],
            "model": "none",
            "course_id": course_id,
            "error": "No indexed course material found to generate questions from.",
        }

    context = "\n\n".join(
        f"--- From: {c.get('material_title', 'Material')}, Page {c.get('page_number', '?')} ---\n{c['content']}"
        for c in chunks
    )

    prompt = f"""COURSE MATERIAL:
{context}

Generate {count} multiple-choice questions based on this material."""

    if topic:
        prompt += f"\nFocus on the topic: {topic}"

    ai = get_ai_provider(mode=mode)
    response = ai.generate(
        prompt=prompt,
        system=QUIZ_SYSTEM_PROMPT.format(count=count),
        temperature=0.4,
    )

    import json
    try:
        content = response["content"]
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            quiz_data = json.loads(content[start:end])
        else:
            # Check for JSON array
            a_start = content.find("[")
            a_end = content.rfind("]") + 1
            if a_start >= 0 and a_end > a_start:
                quiz_data = {"questions": json.loads(content[a_start:a_end])}
            else:
                quiz_data = {"questions": []}
    except json.JSONDecodeError:
        quiz_data = {"questions": [], "parse_error": True}

    return {
        "questions": quiz_data.get("questions", []),
        "model": response["model"],
        "course_id": course_id,
    }
