"""
ORYQEN Automated Verification Suite
Tests database initialization, health status, auth endpoints,
tutor modes, quiz generation, memory system, and offline sync.
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import httpx

try:
    # Test directly against the live running server
    probe = httpx.get("http://127.0.0.1:8000/api/health", timeout=2.0)
    if probe.status_code == 200:
        client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=30.0)
    else:
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
except Exception:
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)

def run_tests():
    print("=== [1/9] Testing System Health & Telemetry ===")
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    health = res.json()
    print(f"  [OK] Status: {health['status']}, App: {health['app']}, Active: {health['active_local_model']}")

    print("\n=== [2/9] Testing Auth & Account Profile ===")
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    user = res.json()["user"]
    print(f"  [OK] User: {user['name']}, Level: {user['education_level']}")

    print("\n=== [3/9] Testing Conversations Management ===")
    res = client.post("/api/conversations", json={
        "title": "Automated Test Session",
        "mode": "offline",
        "capability": "tutor"
    })
    assert res.status_code == 200
    conv = res.json()
    conv_id = conv["id"]
    print(f"  [OK] Created conversation ID: {conv_id}")

    print("\n=== [4/9] Testing AI Tutor Interactive Quiz Generation ===")
    res = client.post("/api/tutor/quiz", json={
        "topic": "Quantum Mechanics",
        "count": 2,
        "level": "intermediate",
        "mode": "offline"
    })
    assert res.status_code == 200
    quiz_data = res.json()
    print(f"  [OK] Generated {len(quiz_data['questions'])} questions on {quiz_data['topic']}")
    assert len(quiz_data["questions"]) > 0

    print("\n=== [5/9] Testing Quiz Submission & Learning Analytics ===")
    res = client.post("/api/tutor/quiz/submit", json={
        "quiz_id": "test-quiz-1",
        "user_id": "local-user",
        "score": 100.0,
        "total_questions": 2,
        "correct_count": 2,
        "answers": [{"0": 0}, {"1": 0}],
        "weak_topics": ["Wave-Particle Duality"]
    })
    assert res.status_code == 200
    print("  [OK] Quiz submission processed and stored in database")

    res = client.get("/api/tutor/analytics?user_id=local-user")
    assert res.status_code == 200
    analytics = res.json()
    print(f"  [OK] Analytics: Streak: {analytics['streak_days']}d, Avg Score: {analytics['average_quiz_score']}%, Weak Topics: {analytics['weak_topics']}")

    print("\n=== [6/9] Testing Flashcard Generation & Study Plans ===")
    res = client.post("/api/tutor/flashcards", json={
        "topic": "Newtonian Physics",
        "count": 3,
        "level": "intermediate",
        "mode": "offline"
    })
    assert res.status_code == 200
    fc = res.json()
    print(f"  [OK] Flashcards generated: {len(fc['cards'])} cards")

    res = client.post("/api/tutor/study-plan", json={
        "subject": "Physics 101",
        "exam_date": "2026-06-20",
        "daily_hours": 2.0,
        "current_knowledge": "intermediate",
        "mode": "offline"
    })
    assert res.status_code == 200
    print("  [OK] Personalized study plan generated successfully")

    print("\n=== [7/9] Testing AI Memory Governance ===")
    res = client.post("/api/memory", json={
        "category": "preference",
        "key": "Goal",
        "value": "Top Honors in Physical Science",
        "user_id": "local-user"
    })
    assert res.status_code == 200
    res = client.get("/api/memory?user_id=local-user")
    assert res.status_code == 200
    mems = res.json()["memories"]
    print(f"  [OK] Stored memories count: {len(mems)}")

    print("\n=== [8/9] Testing Subscription & Pricing Tiers ===")
    res = client.get("/api/subscription?user_id=local-user")
    assert res.status_code == 200
    sub = res.json()
    print(f"  [OK] Current Plan: {sub['plan'].upper()}, Available Plans: {[p['name'] for p in sub['plans']]}")

    print("\n=== [9/9] Testing Offline Chat Inference (Offline Resilience) ===")
    res = client.post("/api/chat", json={
        "question": "What is Newton's second law of motion?",
        "mode": "offline",
        "capability": "tutor",
        "tutor_mode": "explain",
        "conversation_id": conv_id
    })
    assert res.status_code == 200
    chat_resp = res.json()
    print(f"  [OK] Chat response received: Model={chat_resp['display_name']}, Answer Length={len(chat_resp['answer'])} chars")

    print("\n=======================================================")
    print("  ALL 9 PLATFORM VERIFICATION TESTS PASSED SUCCESSFULLY! ")
    print("=======================================================")

if __name__ == "__main__":
    run_tests()
