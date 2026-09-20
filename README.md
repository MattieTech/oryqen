# ORYQEN — Dual-Purpose AI Platform & AI Tutor

**ORYQEN** (pronounced *"Oi-ken"*) is an advanced, hackathon-ready dual-purpose artificial intelligence platform engineered by **SyntaxNexus Developer**, founded and led by CEO **Matthew Aliu**. 

Designed to solve real-world problems in education and everyday cognitive workflows, ORYQEN provides seamless dual-workspace capabilities: **General AI Assistant** and an adaptive **AI Tutor**, functioning both **100% offline (on-device)** and **online (cloud intelligence with deep research)**.

---

## 🌟 Key Capabilities & Highlights

### 📱 Mobile-First Native Experience
- Sleek top app bar with workspace switching (`General` vs `Tutor`), connection status pill (`Offline` vs `Online`), and authentic user profile controls.
- Ergonomic floating chat input capsule with voice input, file attachments, and deep research toggle.
- Bottom Navigation Bar with fast switching between:
  - 💬 **Chat**: Real-time conversation with token streaming and markdown rendering.
  - 🎓 **AI Tutor**: Socratic learning, practice problems, live quizzes, and exams.
  - 📚 **Library**: Upload, index, and query PDF textbooks & course notes.
  - ⚙️ **Settings**: Cognitive engine settings, voice speed, Supabase sync, and data exports.

### 🧠 Dual-Workspace Cognitive Engines
- **General AI Workspace**: Multi-turn dialogue, coding assistant, analytical reasoning, and real-time streaming.
- **AI Tutor Workspace**:
  - **Learn Mode**: Concept mastery with structured breakdowns.
  - **Practice Mode**: Tailored problems matched to student academic level.
  - **Interactive Quiz & Exam Simulator**: Timed multi-question assessments with instant grading, explanations, and weak-topic diagnostics.
  - **3D Interactive Flashcards**: Flippable study cards with 3D perspective animations.
  - **Live Mistake Analysis**: Socratic step-by-step review of incorrect answers.
  - **Study Plan Generator**: Automated revision schedules aligned with exam target dates.

### 🔒 Authentic Security & Real Authentication
- Real email and password authentication backed by SQLite / Supabase PostgreSQL.
- No mock or fake accounts; clean guest scholar fallback mode.
- Local SQLite database storage with automatic offline action synchronization queue.

### 🌐 Dual Intelligence Modes (Online & Offline)
- **Offline Mode**: Powered by **ORYQEN Local Core** running on-device with zero internet dependency, full privacy, and FAISS local vector storage.
- **Online Mode**: Powered by **ORYQEN Reason** and **ORYQEN Swift** with live web search, grounded citations, and multimodal understanding.

---

## 📁 Project Architecture

```
ORYQEN AI/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI application endpoints & routing
│   │   ├── db/
│   │   │   ├── database.py             # SQLite connection manager & migrations
│   │   │   └── init_sql.py             # Database schema (CREATE TABLE statements)
│   │   └── services/
│   │       ├── llm.py                  # AI provider abstraction (Local/Cloud/OpenRouter)
│   │       ├── offline_ai.py           # On-device cognitive engine (fallback responses)
│   │       ├── tutor.py                # Educational pedagogy & quiz generation
│   │       ├── pdf_processor.py        # PDF extraction & chunk indexing
│   │       ├── vector_store.py         # FAISS vector similarity search
│   │       ├── voice.py                # Speech-to-text & audio processing
│   │       └── memory.py              # User memory & preference retention
│   ├── data/                           # Runtime data (db, materials, vectors, voice)
│   ├── tests/                          # Automated backend & endpoint test suites
│   ├── requirements.txt                # Python dependencies
│   └── .env                            # Environment variables (API keys, config)
├── frontend/
│   ├── index.html                      # Single-page mobile app shell
│   ├── styles.css                      # Modern monochrome design system
│   ├── app.js                          # Client-side engine & UI reactivity
│   ├── sw.js                           # PWA Service Worker (offline caching)
│   └── manifest.json                   # PWA manifest for installable app
├── supabase_schema.sql                 # PostgreSQL / pgvector schema (14 tables & RLS)
├── start_oryqen.bat                    # One-click Windows launch script
└── README.md
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Python 3.10+
- Modern Web Browser (Chrome, Edge, Safari, Firefox)

### 2. Setup Backend
```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate

# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

### 3. Configure API Key (Optional for Online Mode)
Edit `backend/.env`:
```env
GEMINI_API_KEY=your_actual_api_key_here
```
*Note: If no API key is set, ORYQEN operates seamlessly in Offline Mode using local cognitive fallbacks.*

### 4. Run ORYQEN
```bash
# From the backend directory
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Open your browser at: **`http://127.0.0.1:8000/`**

---

## 🧪 Testing

Run all automated test suites:
```bash
python -m pytest backend/tests/ -v
```

---

## 👨‍💻 Author & Credits

- **Developer & Creator**: Matthew Aliu (SyntaxNexus Developer / MattieTech)
- **Platform**: ORYQEN AI
