"""
ORYQEN Backend - Database Initialization
SQLite schema for the offline-first AI education platform.
Supports General AI + AI Tutor with memory, study tracking, and subscriptions.
"""

INIT_SQL = """
-- User profiles
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT NOT NULL DEFAULT 'Student',
    password_hash TEXT,
    avatar_url TEXT,
    education_level TEXT DEFAULT 'intermediate',
    preferred_subjects TEXT DEFAULT '[]',
    learning_style TEXT DEFAULT 'visual',
    bio TEXT,
    role TEXT DEFAULT 'student',
    is_onboarded INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Legacy student table compatibility
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT,
    level TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Courses
CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    department TEXT,
    description TEXT,
    is_downloaded INTEGER DEFAULT 0,
    material_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Course materials (PDFs, documents)
CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    course_id TEXT REFERENCES courses(id),
    filename TEXT NOT NULL,
    title TEXT,
    file_size INTEGER,
    page_count INTEGER,
    chunk_count INTEGER DEFAULT 0,
    processed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Document chunks (for RAG)
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    material_id TEXT REFERENCES materials(id),
    course_id TEXT REFERENCES courses(id),
    content TEXT NOT NULL,
    chapter TEXT,
    page_number INTEGER,
    chunk_index INTEGER,
    token_count INTEGER
);

-- Chat conversations
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'local-user',
    student_id TEXT REFERENCES students(id),
    course_id TEXT REFERENCES courses(id),
    title TEXT,
    mode TEXT DEFAULT 'offline',
    capability TEXT DEFAULT 'general',
    purpose TEXT DEFAULT 'general',
    tutor_mode TEXT,
    tutor_subject TEXT,
    tutor_level TEXT,
    is_pinned INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Chat messages
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    role TEXT CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    sources TEXT,
    model_used TEXT,
    message_type TEXT DEFAULT 'text',
    voice_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI Memory
CREATE TABLE IF NOT EXISTS memory (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'local-user',
    category TEXT NOT NULL DEFAULT 'general',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT DEFAULT 'auto',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Quizzes
CREATE TABLE IF NOT EXISTS quizzes (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'local-user',
    course_id TEXT REFERENCES courses(id),
    title TEXT,
    subject TEXT,
    topic TEXT,
    difficulty TEXT DEFAULT 'mixed',
    question_count INTEGER,
    time_limit_minutes INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Quiz questions
CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT REFERENCES quizzes(id),
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_answer INTEGER,
    explanation TEXT,
    difficulty TEXT DEFAULT 'medium',
    source_chunk_id TEXT
);

-- Quiz attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id TEXT PRIMARY KEY,
    quiz_id TEXT REFERENCES quizzes(id),
    user_id TEXT DEFAULT 'local-user',
    student_id TEXT REFERENCES students(id),
    score REAL,
    total_questions INTEGER,
    correct_count INTEGER DEFAULT 0,
    time_taken_seconds INTEGER,
    answers TEXT,
    weak_topics TEXT,
    completed_at DATETIME,
    synced INTEGER DEFAULT 0
);

-- Flashcard decks
CREATE TABLE IF NOT EXISTS flashcard_decks (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'local-user',
    title TEXT NOT NULL,
    subject TEXT,
    topic TEXT,
    card_count INTEGER DEFAULT 0,
    course_id TEXT REFERENCES courses(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Individual flashcards
CREATE TABLE IF NOT EXISTS flashcards (
    id TEXT PRIMARY KEY,
    deck_id TEXT REFERENCES flashcard_decks(id),
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    times_seen INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    last_reviewed DATETIME,
    next_review DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Study plans
CREATE TABLE IF NOT EXISTS study_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'local-user',
    title TEXT NOT NULL,
    subject TEXT,
    exam_date TEXT,
    total_hours INTEGER,
    schedule TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Study sessions (analytics)
CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'local-user',
    subject TEXT,
    topic TEXT,
    session_type TEXT DEFAULT 'chat',
    duration_minutes INTEGER DEFAULT 0,
    questions_asked INTEGER DEFAULT 0,
    quiz_score REAL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME
);

-- Study progress
CREATE TABLE IF NOT EXISTS progress (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'local-user',
    student_id TEXT REFERENCES students(id),
    course_id TEXT REFERENCES courses(id),
    subject TEXT,
    topics_covered TEXT DEFAULT '[]',
    weak_topics TEXT DEFAULT '[]',
    strong_topics TEXT DEFAULT '[]',
    quiz_scores TEXT DEFAULT '[]',
    quiz_average REAL DEFAULT 0,
    total_study_time INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    last_studied DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'local-user' UNIQUE,
    theme TEXT DEFAULT 'system',
    default_mode TEXT DEFAULT 'offline',
    default_purpose TEXT DEFAULT 'general',
    response_style TEXT DEFAULT 'balanced',
    memory_enabled INTEGER DEFAULT 1,
    voice_enabled INTEGER DEFAULT 1,
    notifications_enabled INTEGER DEFAULT 1,
    education_level TEXT DEFAULT 'intermediate',
    preferred_subjects TEXT DEFAULT '[]',
    tutor_difficulty TEXT DEFAULT 'adaptive',
    language TEXT DEFAULT 'en',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'local-user',
    plan TEXT DEFAULT 'free',
    status TEXT DEFAULT 'active',
    messages_used INTEGER DEFAULT 0,
    messages_limit INTEGER DEFAULT 50,
    research_used INTEGER DEFAULT 0,
    research_limit INTEGER DEFAULT 5,
    documents_used INTEGER DEFAULT 0,
    documents_limit INTEGER DEFAULT 3,
    period_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    period_end DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Offline sync queue
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    data TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced_at DATETIME
);

-- Insert default user for local/hackathon usage
INSERT OR IGNORE INTO users (id, name, education_level)
VALUES ('local-user', 'Student', 'intermediate');

-- Insert default student for legacy compatibility
INSERT OR IGNORE INTO students (id, name, department, level)
VALUES ('demo-student-001', 'Adaeze', 'Physics', '200L');

-- Insert default settings
INSERT OR IGNORE INTO user_settings (id, user_id)
VALUES ('default-settings', 'local-user');

-- Insert default free subscription
INSERT OR IGNORE INTO subscriptions (id, user_id, plan, messages_limit, research_limit, documents_limit)
VALUES ('default-sub', 'local-user', 'free', 50, 5, 3);
"""
