"""
ORYQEN Backend - AI Tutor Engine
Specialized educational intelligence layer designed around real student problems.
Supports 12 learning modes, adaptive difficulty, weakness detection,
interactive quizzes, flashcards, study planner, and mistake analysis.
"""

import json
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any

from .llm import (
    get_ai_provider,
    TUTOR_SYSTEM_PROMPT,
    TUTOR_MODE_PROMPTS,
    IDENTITY_CORE,
)
from ..db.database import get_connection

# Education level prompts
LEVEL_ADAPTATIONS = {
    "beginner": "Target Audience: Beginner (Secondary / High School). Use very simple language, relatable everyday analogies, avoid dense formulas without breaking them down, and be highly encouraging.",
    "intermediate": "Target Audience: Intermediate (Undergraduate / College). Use standard academic terminology, provide structured proofs or derivations where necessary, and balance conceptual intuition with mathematical or technical rigor.",
    "advanced": "Target Audience: Advanced (Graduate / Professional / Researcher). Provide deep technical depth, comprehensive citations, formal mathematical formulations, edge cases, and industry/research-level rigor.",
}

# 12 Learning Modes Definitions
LEARNING_MODES = {
    "learn": "Step-by-step modular teaching with comprehension checks",
    "practice": "Interactive practice questions with answer evaluation",
    "quiz": "Multiple-choice assessments with immediate scoring & explanations",
    "exam": "Timed examination simulation with full review breakdown",
    "revision": "High-yield summaries, formulas, definitions, and rapid recall",
    "flashcard": "Concept flashcards with front (prompt) and back (explanation)",
    "explain": "Feynman-technique intuitive explanations with analogies",
    "socratic": "Guiding Socratic questions that lead students to discover answers",
    "mistake_analysis": "Diagnostic breakdown of why an answer was incorrect and how to fix it",
    "study_plan": "Customized day-by-day study roadmap based on exam date and hours",
    "weakness_detector": "Performance analytics to discover and address weak topics",
    "materials": "Strictly grounded learning directly from uploaded textbooks and notes",
}


def build_tutor_system_prompt(
    mode: str = "learn",
    level: str = "intermediate",
    subject: Optional[str] = None,
    learning_goal: Optional[str] = None,
) -> str:
    """Build a specialized system prompt for the AI Tutor."""
    mode_key = mode.lower().replace("-", "_").replace(" ", "_")
    mode_prompt = TUTOR_MODE_PROMPTS.get(mode_key, TUTOR_MODE_PROMPTS.get("learn", ""))
    level_prompt = LEVEL_ADAPTATIONS.get(level.lower(), LEVEL_ADAPTATIONS["intermediate"])
    
    subject_clause = f"\nSubject Focus: {subject}" if subject else ""
    goal_clause = f"\nLearning Goal: {learning_goal}" if learning_goal else ""

    return f"""{TUTOR_SYSTEM_PROMPT}

ACADEMIC CONTEXT:
{level_prompt}{subject_clause}{goal_clause}

ACTIVE TUTORING MODE:
{mode_prompt}

TEACHING PRINCIPLES:
1. Never give dry robotic answers. Act like an empathetic, inspiring world-class teacher.
2. If teaching formulas or calculations, explain EVERY variable and step clearly.
3. Finish your response with an actionable next step or a brief thought-provoking check question.
"""


def generate_tutor_response(
    question: str,
    mode: str = "learn",
    level: str = "intermediate",
    subject: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    ai_mode: str = "offline",
) -> Dict[str, Any]:
    """Generate an AI Tutor response with the specified learning mode."""
    provider = get_ai_provider(mode=ai_mode)
    system_prompt = build_tutor_system_prompt(mode=mode, level=level, subject=subject)

    chat_messages = []
    if conversation_history:
        for m in conversation_history[-6:]:
            chat_messages.append({
                "role": "user" if m.get("role") == "user" else "assistant",
                "content": m.get("content", ""),
            })
    chat_messages.append({"role": "user", "content": question})

    result = provider.chat(messages=chat_messages, system=system_prompt, temperature=0.6)
    
    return {
        "answer": result["content"],
        "model": result["model"],
        "display_name": result.get("display_name", "ORYQEN Tutor"),
        "mode": mode,
        "level": level,
        "subject": subject,
    }


def analyze_student_mistake(
    question_text: str,
    student_answer: str,
    correct_answer: str,
    subject: Optional[str] = None,
    ai_mode: str = "offline",
) -> Dict[str, Any]:
    """Provide a structured diagnostic of why the student got an answer wrong."""
    provider = get_ai_provider(mode=ai_mode)

    prompt = f"""MISTAKE ANALYSIS REQUEST:
Subject: {subject or 'General'}
Question: {question_text}
Student's Answer: {student_answer}
Correct Answer: {correct_answer}

Please provide a supportive, structured breakdown:
1. Core Misconception: What likely led to this mistake?
2. Step-by-Step Resolution: How to solve it correctly.
3. Golden Rule / Key Takeaway: One memorable rule to prevent this error in the future.
4. Quick Practice Drill: A similar question for the student to try right now."""

    system_prompt = build_tutor_system_prompt(mode="mistake_analysis", level="intermediate", subject=subject)
    result = provider.generate(prompt=prompt, system=system_prompt, temperature=0.4)

    return {
        "analysis": result["content"],
        "model": result["model"],
        "display_name": result.get("display_name", "ORYQEN Tutor"),
    }


def generate_interactive_quiz(
    topic: str,
    count: int = 5,
    level: str = "intermediate",
    subject: Optional[str] = None,
    ai_mode: str = "offline",
) -> Dict[str, Any]:
    """Generate structured multiple-choice quiz questions."""
    provider = get_ai_provider(mode=ai_mode)

    prompt = f"""Generate an assessment quiz on the topic: "{topic}".
Subject: {subject or 'Academic Study'}
Level: {level}
Question Count: {count}

Return ONLY a valid JSON array of {count} questions in the following strict schema:
[
  {{
    "question": "Clear, specific question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": 0,
    "explanation": "Clear explanation why Option A is correct and why other choices fail",
    "difficulty": "easy|medium|hard",
    "topic": "{topic}"
  }}
]
Do not wrap in markdown or backticks. Return raw JSON only."""

    system = f"{IDENTITY_CORE}\nYou are an expert academic examiner. Output ONLY valid JSON containing the question array."
    res = provider.generate(prompt=prompt, system=system, temperature=0.3)
    text = res["content"].strip()

    # Extract JSON if enclosed in markdown
    if "```" in text:
        parts = text.split("```")
        for p in parts:
            p_clean = p.replace("json", "").strip()
            if p_clean.startswith("[") and p_clean.endswith("]"):
                text = p_clean
                break

    try:
        questions = json.loads(text)
        if not isinstance(questions, list):
            raise ValueError("Parsed result is not a list")
    except Exception:
        # Fallback structured questions if parser fails
        questions = [
            {
                "question": f"What is the foundational concept behind {topic}?",
                "options": [
                    f"The core theoretical principle governing {topic}",
                    f"A secondary empirical approximation",
                    f"An unrelated peripheral hypothesis",
                    f"A constant arbitrary variable"
                ],
                "correct_answer": 0,
                "explanation": f"The primary foundation defines the core mechanisms of {topic}.",
                "difficulty": "medium",
                "topic": topic
            },
            {
                "question": f"Which of the following is most essential when analyzing {topic}?",
                "options": [
                    "Empirical observation and logical deduction",
                    "Ignoring standard boundary conditions",
                    "Relying solely on unverified assumptions",
                    "Assuming zero variance across all states"
                ],
                "correct_answer": 0,
                "explanation": "Systematic empirical analysis and logical reasoning form the bedrock of understanding.",
                "difficulty": "easy",
                "topic": topic
            }
        ]

    return {
        "topic": topic,
        "questions": questions,
        "count": len(questions),
        "model": res.get("model", "local"),
    }


def generate_flashcards(
    topic: str,
    count: int = 8,
    subject: Optional[str] = None,
    level: str = "intermediate",
    ai_mode: str = "offline",
) -> List[Dict[str, str]]:
    """Generate high-yield flashcards with front (prompt/term) and back (explanation)."""
    provider = get_ai_provider(mode=ai_mode)

    prompt = f"""Generate {count} educational flashcards for "{topic}".
Subject: {subject or 'General'}
Level: {level}

Output ONLY a JSON array in this strict format:
[
  {{
    "front": "Key Term or Question",
    "back": "Concise, memorable definition, formula, or explanation"
  }}
]
No preamble, no markdown formatting. Just raw JSON."""

    system = f"{IDENTITY_CORE}\nYou are an expert educational study card creator. Output raw JSON only."
    res = provider.generate(prompt=prompt, system=system, temperature=0.3)
    text = res["content"].strip()

    if "```" in text:
        parts = text.split("```")
        for p in parts:
            p_clean = p.replace("json", "").strip()
            if p_clean.startswith("[") and p_clean.endswith("]"):
                text = p_clean
                break

    try:
        cards = json.loads(text)
        if isinstance(cards, list):
            return cards
    except Exception:
        pass

    return [
        {"front": f"Define {topic}", "back": f"The central academic concept covering key principles and applications in {subject or 'this field'}."},
        {"front": f"Key Principle of {topic}", "back": "Break down complex phenomena into fundamental laws and verified relationships."},
        {"front": f"Common pitfall in {topic}", "back": "Confusing correlation with causation and neglecting initial boundary conditions."},
    ]


def generate_study_plan(
    subject: str,
    exam_date: str,
    daily_hours: float = 2.0,
    current_knowledge: str = "beginner",
    ai_mode: str = "offline",
) -> Dict[str, Any]:
    """Generate a realistic, day-by-day structured study schedule."""
    provider = get_ai_provider(mode=ai_mode)

    prompt = f"""Create a comprehensive study plan for:
Subject: {subject}
Target Exam Date: {exam_date}
Available Study Time: {daily_hours} hours per day
Current Knowledge Level: {current_knowledge}

Structure the plan with:
1. Executive Roadmap (Milestones)
2. Week-by-Week Breakdown with specific topics and practical exercises
3. Daily Study Routine (How to spend the {daily_hours} hours effectively: e.g. 45 min Learn, 45 min Practice, 30 min Revision)
4. Revision & Mock Exam Schedule for the final days before {exam_date}
5. Key Memorization Checklist"""

    system = build_tutor_system_prompt(mode="study_plan", level=current_knowledge, subject=subject)
    res = provider.generate(prompt=prompt, system=system, temperature=0.5)

    return {
        "subject": subject,
        "exam_date": exam_date,
        "daily_hours": daily_hours,
        "plan_text": res["content"],
        "model": res["model"],
    }


def get_student_analytics(user_id: str = "local-user") -> Dict[str, Any]:
    """Retrieve learning metrics, quiz scores, weak topics, and study streak."""
    conn = get_connection()
    try:
        # User progress
        row = conn.execute(
            "SELECT * FROM progress WHERE user_id = ?", (user_id,)
        ).fetchone()

        # Quiz attempts
        attempts = conn.execute(
            """SELECT score, total_questions, correct_count, weak_topics, completed_at
               FROM quiz_attempts WHERE user_id = ? ORDER BY completed_at DESC LIMIT 10""",
            (user_id,),
        ).fetchall()

        # Flashcards
        flashcard_count = conn.execute(
            "SELECT COUNT(f.id) as count FROM flashcards f JOIN flashcard_decks d ON f.deck_id = d.id WHERE d.user_id = ?",
            (user_id,),
        ).fetchone()

        total_quizzes = len(attempts)
        avg_score = round(sum(r["score"] for r in attempts) / total_quizzes, 1) if total_quizzes > 0 else 0.0

        all_weak_topics = []
        for a in attempts:
            if a["weak_topics"]:
                try:
                    wt = json.loads(a["weak_topics"])
                    if isinstance(wt, list):
                        all_weak_topics.extend(wt)
                except Exception:
                    pass

        # Deduplicate weak topics
        unique_weak = list(set(all_weak_topics))[:6]

        streak = row["streak_days"] if row and row["streak_days"] else max(1, total_quizzes)
        total_time = row["total_study_time"] if row and row["total_study_time"] else (total_quizzes * 15)

        return {
            "user_id": user_id,
            "total_quizzes_taken": total_quizzes,
            "average_quiz_score": avg_score,
            "streak_days": streak,
            "total_study_minutes": total_time,
            "flashcards_saved": flashcard_count["count"] if flashcard_count else 0,
            "weak_topics": unique_weak,
            "recent_attempts": [
                {
                    "score": r["score"],
                    "correct": r["correct_count"],
                    "total": r["total_questions"],
                    "completed_at": r["completed_at"],
                }
                for r in attempts[:5]
            ],
        }
    finally:
        conn.close()


def get_smart_recommendations(user_id: str = "local-user") -> List[Dict[str, str]]:
    """Produce actionable, data-driven learning recommendations."""
    analytics = get_student_analytics(user_id=user_id)
    recs = []

    weak = analytics.get("weak_topics", [])
    if weak:
        recs.append({
            "type": "weakness",
            "title": f"Revise Weak Topic: {weak[0]}",
            "description": f"Based on your recent quiz performance, spending 15 minutes reviewing {weak[0]} will yield the fastest grade improvement.",
            "action_mode": "revision",
            "topic": weak[0],
        })

    avg_score = analytics.get("average_quiz_score", 0)
    if avg_score > 0 and avg_score < 70:
        recs.append({
            "type": "practice",
            "title": "Reinforce with Practice Mode",
            "description": "Your current quiz average is under 70%. Switch to Practice Mode for guided answer evaluations before your next test.",
            "action_mode": "practice",
            "topic": "Fundamentals",
        })
    elif avg_score >= 85:
        recs.append({
            "type": "exam",
            "title": "Challenge Yourself with an Exam Simulator",
            "description": "High accuracy! Test your speed and endurance under timed examination conditions.",
            "action_mode": "exam",
            "topic": "Advanced Assessment",
        })

    recs.append({
        "type": "flashcards",
        "title": "Quick Flashcard Recall",
        "description": "Test active recall on key terms to cement concepts into long-term memory.",
        "action_mode": "flashcard",
        "topic": "Core Definitions",
    })

    return recs
