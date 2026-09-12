"""
ORYQEN Backend - Database Connection Manager
Handles SQLite database initialization, connection, and migrations.
"""

import os
import sqlite3
from pathlib import Path
from .init_sql import INIT_SQL

# Database lives in backend/data/db/
DB_DIR = Path(__file__).parent.parent.parent / "data" / "db"
DB_PATH = DB_DIR / "oryqen.db"


def get_db_path() -> Path:
    """Get the database file path, creating directories if needed."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    return DB_PATH


def get_connection() -> sqlite3.Connection:
    """Get a SQLite connection with row factory enabled."""
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")  # Better concurrent reads
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _safe_add_column(cursor, table: str, column: str, col_type: str, default=None):
    """Safely add a column if it doesn't exist."""
    cursor.execute(f"PRAGMA table_info({table})")
    existing = {row["name"] for row in cursor.fetchall()}
    if column not in existing:
        default_clause = f" DEFAULT {default}" if default is not None else ""
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}{default_clause}")


def run_migrations(conn: sqlite3.Connection):
    """Ensure all required columns exist in existing database tables."""
    cursor = conn.cursor()

    # Users table migrations (for OTP and confirmation verification)
    cursor.execute("PRAGMA table_info(users)")
    user_cols = {row["name"] for row in cursor.fetchall()}
    if user_cols:
        _safe_add_column(cursor, "users", "is_verified", "INTEGER", "1")
        _safe_add_column(cursor, "users", "otp_code", "TEXT", "NULL")
        _safe_add_column(cursor, "users", "verification_token", "TEXT", "NULL")

    # Conversations table migrations
    cursor.execute("PRAGMA table_info(conversations)")
    conv_cols = {row["name"] for row in cursor.fetchall()}
    if conv_cols:
        _safe_add_column(cursor, "conversations", "mode", "TEXT", "'offline'")
        _safe_add_column(cursor, "conversations", "capability", "TEXT", "'general'")
        _safe_add_column(cursor, "conversations", "is_pinned", "INTEGER", "0")
        _safe_add_column(cursor, "conversations", "is_archived", "INTEGER", "0")
        _safe_add_column(cursor, "conversations", "purpose", "TEXT", "'general'")
        _safe_add_column(cursor, "conversations", "tutor_mode", "TEXT", "NULL")
        _safe_add_column(cursor, "conversations", "tutor_subject", "TEXT", "NULL")
        _safe_add_column(cursor, "conversations", "tutor_level", "TEXT", "NULL")
        _safe_add_column(cursor, "conversations", "user_id", "TEXT", "'local-user'")

    # Messages table migrations
    cursor.execute("PRAGMA table_info(messages)")
    msg_cols = {row["name"] for row in cursor.fetchall()}
    if msg_cols:
        _safe_add_column(cursor, "messages", "sources", "TEXT", "NULL")
        _safe_add_column(cursor, "messages", "model_used", "TEXT", "NULL")
        _safe_add_column(cursor, "messages", "message_type", "TEXT", "'text'")
        _safe_add_column(cursor, "messages", "voice_url", "TEXT", "NULL")

    # Materials table migrations
    cursor.execute("PRAGMA table_info(materials)")
    mat_cols = {row["name"] for row in cursor.fetchall()}
    if mat_cols:
        _safe_add_column(cursor, "materials", "is_processed", "INTEGER", "0")
        _safe_add_column(cursor, "materials", "processed_at", "DATETIME", "NULL")
        _safe_add_column(cursor, "materials", "total_chunks", "INTEGER", "0")

    # Quiz attempts table migrations
    cursor.execute("PRAGMA table_info(quiz_attempts)")
    qa_cols = {row["name"] for row in cursor.fetchall()}
    if qa_cols:
        _safe_add_column(cursor, "quiz_attempts", "user_id", "TEXT", "'local-user'")
        _safe_add_column(cursor, "quiz_attempts", "correct_count", "INTEGER", "0")
        _safe_add_column(cursor, "quiz_attempts", "weak_topics", "TEXT", "NULL")
        _safe_add_column(cursor, "quiz_attempts", "synced", "INTEGER", "0")
        _safe_add_column(cursor, "quiz_attempts", "answers", "TEXT", "NULL")
        _safe_add_column(cursor, "quiz_attempts", "time_taken_seconds", "INTEGER", "0")

    # Quizzes table migrations
    cursor.execute("PRAGMA table_info(quizzes)")
    q_cols = {row["name"] for row in cursor.fetchall()}
    if q_cols:
        _safe_add_column(cursor, "quizzes", "user_id", "TEXT", "'local-user'")
        _safe_add_column(cursor, "quizzes", "topic", "TEXT", "NULL")
        _safe_add_column(cursor, "quizzes", "questions_data", "TEXT", "NULL")

    # Flashcard decks migrations
    cursor.execute("PRAGMA table_info(flashcard_decks)")
    fd_cols = {row["name"] for row in cursor.fetchall()}
    if fd_cols:
        _safe_add_column(cursor, "flashcard_decks", "user_id", "TEXT", "'local-user'")
        _safe_add_column(cursor, "flashcard_decks", "topic", "TEXT", "NULL")

    # Subscriptions migrations
    cursor.execute("PRAGMA table_info(subscriptions)")
    sub_cols = {row["name"] for row in cursor.fetchall()}
    if sub_cols:
        _safe_add_column(cursor, "subscriptions", "user_id", "TEXT", "'local-user'")
        _safe_add_column(cursor, "subscriptions", "messages_used", "INTEGER", "0")
        _safe_add_column(cursor, "subscriptions", "messages_limit", "INTEGER", "50")
        _safe_add_column(cursor, "subscriptions", "research_used", "INTEGER", "0")
        _safe_add_column(cursor, "subscriptions", "research_limit", "INTEGER", "5")
        _safe_add_column(cursor, "subscriptions", "documents_used", "INTEGER", "0")
        _safe_add_column(cursor, "subscriptions", "documents_limit", "INTEGER", "3")

    # Progress migrations
    cursor.execute("PRAGMA table_info(progress)")
    p_cols = {row["name"] for row in cursor.fetchall()}
    if p_cols:
        _safe_add_column(cursor, "progress", "user_id", "TEXT", "'local-user'")
        _safe_add_column(cursor, "progress", "streak_days", "INTEGER", "0")
        _safe_add_column(cursor, "progress", "total_study_time", "INTEGER", "0")
        _safe_add_column(cursor, "progress", "total_questions", "INTEGER", "0")
        _safe_add_column(cursor, "progress", "correct_answers", "INTEGER", "0")
        _safe_add_column(cursor, "progress", "quiz_scores", "TEXT", "'[]'")
        _safe_add_column(cursor, "progress", "weak_topics", "TEXT", "'[]'")
        _safe_add_column(cursor, "progress", "strong_topics", "TEXT", "'[]'")
        _safe_add_column(cursor, "progress", "topics_covered", "TEXT", "'[]'")
        _safe_add_column(cursor, "progress", "updated_at", "DATETIME", "CURRENT_TIMESTAMP")

    conn.commit()



def init_db():
    """Initialize the database with the schema and run migrations."""
    conn = get_connection()
    try:
        conn.executescript(INIT_SQL)
        conn.commit()
        run_migrations(conn)
        print(f"[OK] Database initialized and migrated at {get_db_path()}")
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
