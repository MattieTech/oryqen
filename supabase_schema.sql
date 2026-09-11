-- =============================================================================
-- ORYQEN AI Platform — Complete Supabase Database Schema
-- Architecture: PostgreSQL 15+ with pgvector, Row Level Security (RLS)
-- Developed by SyntaxNexus Developer (formerly MattieTech) | CEO: Matthew Aliu
--
-- INSTRUCTIONS FOR SETUP:
-- 1. Open your Supabase Project Dashboard: https://supabase.com/dashboard
-- 2. Navigate to "SQL Editor" in the left sidebar.
-- 3. Click "New query", paste this entire file, and click "Run".
-- 4. Copy your "Project URL" and "anon public key" from Settings -> API.
-- 5. In ORYQEN Settings -> "Database & Supabase Sync", paste your URL and Key!
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =============================================================================
-- 1. PROFILES & USER ACCOUNTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT 'Student',
    education_level TEXT NOT NULL DEFAULT 'intermediate' CHECK (education_level IN ('beginner', 'intermediate', 'advanced')),
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'researcher', 'admin')),
    preferred_subjects JSONB DEFAULT '["General Science", "Computing", "Physics"]'::jsonb,
    learning_style TEXT DEFAULT 'visual',
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Auto-create profile trigger on Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, education_level, role)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', 'Student'),
        COALESCE(new.raw_user_meta_data->>'education_level', 'intermediate'),
        COALESCE(new.raw_user_meta_data->>'role', 'student')
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_settings (user_id, education_level)
    VALUES (new.id, COALESCE(new.raw_user_meta_data->>'education_level', 'intermediate'))
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.subscriptions (user_id, plan, messages_limit, research_limit, documents_limit)
    VALUES (new.id, 'free', 50, 5, 3)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.progress (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =============================================================================
-- 2. USER SETTINGS & PREFERENCES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
    active_model TEXT NOT NULL DEFAULT 'oryqen-swift',
    education_level TEXT NOT NULL DEFAULT 'intermediate',
    memory_enabled BOOLEAN NOT NULL DEFAULT true,
    auto_speak BOOLEAN NOT NULL DEFAULT false,
    deep_research_default BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 3. COURSES & LEARNING DOMAINS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    subject TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 4. CONVERSATIONS & CHAT HISTORY
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    mode TEXT NOT NULL DEFAULT 'offline' CHECK (mode IN ('offline', 'online')),
    capability TEXT NOT NULL DEFAULT 'general' CHECK (capability IN ('general', 'tutor', 'auto')),
    purpose TEXT NOT NULL DEFAULT 'general',
    tutor_mode TEXT DEFAULT 'learn',
    pinned BOOLEAN NOT NULL DEFAULT false,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 5. MESSAGES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    sources JSONB,
    model_used TEXT,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'research', 'quiz')),
    voice_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 6. MATERIALS & TEXTBOOKS (RAG PIPELINE)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    total_pages INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'indexed' CHECK (status IN ('uploading', 'processing', 'indexed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.materials_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    page_number INT,
    chunk_index INT NOT NULL,
    embedding vector(384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for semantic similarity vector search
CREATE INDEX IF NOT EXISTS idx_materials_chunks_embedding
    ON public.materials_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Vector search stored procedure
CREATE OR REPLACE FUNCTION public.match_document_chunks (
    query_embedding vector(384),
    match_threshold float DEFAULT 0.25,
    match_count int DEFAULT 5,
    filter_course_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    material_id uuid,
    content text,
    page_number int,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        mc.id,
        mc.material_id,
        mc.content,
        mc.page_number,
        1 - (mc.embedding <=> query_embedding) AS similarity
    FROM public.materials_chunks mc
    WHERE (filter_course_id IS NULL OR mc.course_id = filter_course_id)
      AND (1 - (mc.embedding <=> query_embedding)) > match_threshold
    ORDER BY mc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- =============================================================================
-- 7. QUIZZES & LEARNING ATTEMPTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    topic TEXT,
    difficulty TEXT DEFAULT 'intermediate',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    total_questions INT NOT NULL DEFAULT 5,
    correct_count INT NOT NULL DEFAULT 0,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    weak_topics JSONB DEFAULT '[]'::jsonb,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 8. 3D FLASHCARD DECKS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.flashcard_decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    subject TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.flashcards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id UUID NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    mastered BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 9. STUDY PLANS & ROADMAPS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.study_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    exam_date DATE NOT NULL,
    total_hours INT NOT NULL DEFAULT 60,
    schedule TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 10. AI MEMORY & ADAPTIVE PREFERENCES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'preference' CHECK (category IN ('preference', 'weakness', 'strength', 'goal', 'history')),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'extracted', 'quiz')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 11. SUBSCRIPTIONS & USAGE QUOTAS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'plus', 'pro')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
    messages_limit INT NOT NULL DEFAULT 50,
    research_limit INT NOT NULL DEFAULT 5,
    documents_limit INT NOT NULL DEFAULT 3,
    messages_used INT NOT NULL DEFAULT 0,
    research_used INT NOT NULL DEFAULT 0,
    documents_uploaded INT NOT NULL DEFAULT 0,
    renewal_date TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 12. STUDENT PROGRESS & ANALYTICS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    streak_days INT NOT NULL DEFAULT 1,
    last_active_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_study_minutes INT NOT NULL DEFAULT 15,
    flashcards_reviewed INT NOT NULL DEFAULT 0,
    quizzes_completed INT NOT NULL DEFAULT 0,
    average_quiz_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    mastered_topics JSONB DEFAULT '[]'::jsonb,
    weak_topics JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;

-- Standard user ownership policies
CREATE POLICY "Users view own profile" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users view own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own conversations" ON public.conversations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view messages in own conversations" ON public.messages FOR ALL USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
);
CREATE POLICY "Users manage own materials" ON public.materials FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own quizzes" ON public.quizzes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own quiz attempts" ON public.quiz_attempts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own flashcards" ON public.flashcard_decks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own study plans" ON public.study_plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own memories" ON public.user_memories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own subscription" ON public.subscriptions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own progress" ON public.progress FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- INITIAL DEFAULT DATA
-- =============================================================================
INSERT INTO public.courses (code, title, subject, description)
VALUES 
    ('PHY101', 'Classical Mechanics & Thermodynamics', 'Physics', 'Foundations of motion, energy conservation, Newton laws, and entropy.'),
    ('MTH101', 'Calculus & Linear Algebra', 'Mathematics', 'Differential and integral calculus, vector spaces, and eigenvalues.'),
    ('CSC101', 'Computer Systems & Python Programming', 'Computer Science', 'Algorithm design, object-oriented principles, and data structures.')
ON CONFLICT (code) DO NOTHING;

-- Schema deployment verification
SELECT 'ORYQEN Supabase schema initialized successfully!' AS status;
