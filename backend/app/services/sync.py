"""
ORYQEN Backend - Offline Data Synchronization Engine
Coordinates offline queue actions and synchronizes learning records,
quiz attempts, flashcards, and preferences when connectivity is restored.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional

from ..db.database import get_connection


def queue_offline_action(
    action: str,
    table_name: str,
    record_id: str,
    data: Dict[str, Any],
) -> str:
    """Queue a database change made while in offline mode."""
    queue_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO sync_queue (id, action, table_name, record_id, data, status)
               VALUES (?, ?, ?, ?, ?, 'pending')""",
            (queue_id, action, table_name, record_id, json.dumps(data)),
        )
        conn.commit()
        return queue_id
    finally:
        conn.close()


def get_pending_sync_items() -> List[Dict[str, Any]]:
    """Retrieve all pending synchronization items."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT id, action, table_name, record_id, data, created_at
               FROM sync_queue
               WHERE status = 'pending'
               ORDER BY created_at ASC"""
        ).fetchall()
        return [
            {
                "id": r["id"],
                "action": r["action"],
                "table_name": r["table_name"],
                "record_id": r["record_id"],
                "data": json.loads(r["data"]) if r["data"] else {},
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    finally:
        conn.close()


def mark_synced(queue_ids: List[str]) -> int:
    """Mark a batch of sync queue items as completed."""
    if not queue_ids:
        return 0
    conn = get_connection()
    try:
        placeholders = ",".join("?" for _ in queue_ids)
        cursor = conn.execute(
            f"""UPDATE sync_queue
               SET status = 'synced', synced_at = CURRENT_TIMESTAMP
               WHERE id IN ({placeholders})""",
            queue_ids,
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def process_incoming_sync_batch(items: List[Dict[str, Any]], user_id: str = "local-user") -> Dict[str, Any]:
    """Reconcile client offline updates into the local database safely."""
    conn = get_connection()
    applied_count = 0
    try:
        for item in items:
            action = item.get("action", "insert")
            table = item.get("table_name", "")
            data = item.get("data", {})
            record_id = item.get("record_id") or str(uuid.uuid4())

            if table == "quiz_attempts":
                conn.execute(
                    """INSERT OR REPLACE INTO quiz_attempts
                       (id, quiz_id, user_id, score, total_questions, correct_count, answers, weak_topics, completed_at, synced)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                    (
                        record_id,
                        data.get("quiz_id"),
                        user_id,
                        data.get("score", 0),
                        data.get("total_questions", 0),
                        data.get("correct_count", 0),
                        json.dumps(data.get("answers", [])),
                        json.dumps(data.get("weak_topics", [])),
                        data.get("completed_at", datetime.utcnow().isoformat()),
                    ),
                )
                applied_count += 1

            elif table == "flashcards":
                conn.execute(
                    """INSERT OR REPLACE INTO flashcards
                       (id, deck_id, front, back, difficulty, times_seen, times_correct, last_reviewed)
                       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                    (
                        record_id,
                        data.get("deck_id", "default"),
                        data.get("front", ""),
                        data.get("back", ""),
                        data.get("difficulty", "medium"),
                        data.get("times_seen", 1),
                        data.get("times_correct", 1),
                    ),
                )
                applied_count += 1

            elif table == "progress":
                conn.execute(
                    """INSERT INTO progress (id, user_id, streak_days, total_study_time, updated_at)
                       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                       ON CONFLICT(id) DO UPDATE SET
                       streak_days = max(streak_days, excluded.streak_days),
                       total_study_time = total_study_time + excluded.total_study_time,
                       updated_at = CURRENT_TIMESTAMP""",
                    (
                        record_id,
                        user_id,
                        data.get("streak_days", 1),
                        data.get("total_study_time", 15),
                    ),
                )
                applied_count += 1

        conn.commit()
        return {
            "status": "success",
            "applied_count": applied_count,
            "total_received": len(items),
        }
    finally:
        conn.close()
