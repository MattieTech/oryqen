"""
ORYQEN Backend - Memory System
Manages persistent user preferences, learning goals, education level,
and study context for both online and offline modes.
Full user governance: view, add, edit, delete, clear, and toggle.
"""

import json
import uuid
from typing import List, Dict, Any, Optional
from ..db.database import get_connection


def is_memory_enabled(user_id: str = "local-user") -> bool:
    """Check if memory is enabled in user settings."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT memory_enabled FROM user_settings WHERE user_id = ?", (user_id,)
        ).fetchone()
        return bool(row["memory_enabled"]) if row else True
    finally:
        conn.close()


def set_memory_enabled(user_id: str = "local-user", enabled: bool = True) -> bool:
    """Toggle memory on/off."""
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO user_settings (id, user_id, memory_enabled)
               VALUES (?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET memory_enabled = excluded.memory_enabled, updated_at = CURRENT_TIMESTAMP""",
            (str(uuid.uuid4()), user_id, 1 if enabled else 0),
        )
        conn.commit()
        return enabled
    finally:
        conn.close()


def get_user_memories(user_id: str = "local-user") -> List[Dict[str, Any]]:
    """Retrieve all stored memory items for a user."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT id, category, key, value, source, created_at, updated_at
               FROM memory
               WHERE user_id = ?
               ORDER BY created_at DESC""",
            (user_id,),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "category": r["category"],
                "key": r["key"],
                "value": r["value"],
                "source": r["source"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ]
    finally:
        conn.close()


def add_user_memory(
    user_id: str = "local-user",
    category: str = "preference",
    key: str = "",
    value: str = "",
    source: str = "user",
) -> Dict[str, Any]:
    """Store or update a memory item."""
    if not key or not value:
        raise ValueError("Memory key and value cannot be empty")

    mem_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        # Check existing key
        existing = conn.execute(
            "SELECT id FROM memory WHERE user_id = ? AND key = ?", (user_id, key)
        ).fetchone()

        if existing:
            conn.execute(
                """UPDATE memory
                   SET value = ?, category = ?, source = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (value, category, source, existing["id"]),
            )
            conn.commit()
            return {"id": existing["id"], "key": key, "value": value, "category": category, "source": source}
        else:
            conn.execute(
                """INSERT INTO memory (id, user_id, category, key, value, source)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (mem_id, user_id, category, key, value, source),
            )
            conn.commit()
            return {"id": mem_id, "key": key, "value": value, "category": category, "source": source}
    finally:
        conn.close()


def delete_user_memory(user_id: str = "local-user", memory_id: str = "") -> bool:
    """Delete a specific memory item."""
    conn = get_connection()
    try:
        conn.execute("DELETE FROM memory WHERE user_id = ? AND id = ?", (user_id, memory_id))
        conn.commit()
        return True
    finally:
        conn.close()


def clear_all_memories(user_id: str = "local-user") -> bool:
    """Delete all memories for a user."""
    conn = get_connection()
    try:
        conn.execute("DELETE FROM memory WHERE user_id = ?", (user_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def get_memory_context_prompt(user_id: str = "local-user") -> str:
    """Compile relevant memory entries into a system prompt injection."""
    if not is_memory_enabled(user_id):
        return ""

    memories = get_user_memories(user_id=user_id)
    if not memories:
        return ""

    mem_lines = [f"- {m['key']}: {m['value']}" for m in memories[:8]]
    return f"""\nUSER MEMORY & PREFERENCES:
The user has specified the following context and preferences. Respect them naturally in your responses:
{chr(10).join(mem_lines)}
"""


def auto_extract_learning_profile(user_id: str = "local-user", text: str = ""):
    """
    Subtle heuristic extractor for user learning level, subjects, or study goals.
    Never stores sensitive passwords, personal private secrets, or irrelevant chatter.
    """
    if not is_memory_enabled(user_id) or len(text) < 10:
        return

    lower = text.lower()
    
    # Education level clues
    if "high school" in lower or "secondary school" in lower or "waec" in lower or "jamb" in lower:
        add_user_memory(user_id, "education", "Education Level", "Secondary / High School", "auto")
    elif "undergrad" in lower or "university" in lower or "college" in lower or "bachelor" in lower or "200l" in lower or "300l" in lower:
        add_user_memory(user_id, "education", "Education Level", "Undergraduate", "auto")
    elif "master" in lower or "phd" in lower or "postgraduate" in lower:
        add_user_memory(user_id, "education", "Education Level", "Postgraduate", "auto")

    # Learning style clues
    if "explain like i'm 5" in lower or "simple terms" in lower or "eli5" in lower:
        add_user_memory(user_id, "preference", "Explanation Style", "Prefers intuitive everyday analogies", "auto")
    elif "step by step" in lower:
        add_user_memory(user_id, "preference", "Explanation Style", "Prefers step-by-step numbered breakdowns", "auto")
