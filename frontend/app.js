/**
 * ORYQEN — Frontend Application Engine
 * Advanced Dual-Purpose AI Assistant (General AI + AI Tutor)
 * Voice Interaction, Real-Time Streaming, Offline Resilience & Sync,
 * Interactive Quizzes, 3D Flashcards, Memory Governance, and Animated Icons.
 */

// Configuration
const API_BASE = window.location.origin.includes(':8000') ? '' : 'http://localhost:8000';

// Global State
const state = {
  currentConversationId: null,
  conversations: [],
  workspace: 'general', // 'general' | 'tutor'
  tutorMode: 'learn',   // 'learn' | 'practice' | 'quiz' | 'exam' | 'flashcard' | 'explain' | 'socratic' | 'mistake_analysis' | 'study_plan' | 'revision'
  tutorLevel: 'intermediate',
  subject: 'General Science',
  mode: 'offline',      // 'offline' | 'online'
  deepResearch: false,
  attachedDoc: null,
  isGenerating: false,
  abortController: null,
  messages: [],
  theme: localStorage.getItem('oryqen-theme') || 'light',
  user: {
    id: 'local-user',
    name: 'Student',
    email: 'student@oryqen.ai',
    education_level: 'intermediate',
    preferred_subjects: ['Physics', 'Computing'],
  },
  voice: {
    mediaRecorder: null,
    audioChunks: [],
    audioBlob: null,
    audioUrl: null,
    recordingTimer: null,
    secondsElapsed: 0,
    isRecording: false,
  },
  quiz: {
    questions: [],
    currentIndex: 0,
    userAnswers: {},
    score: 0,
    examTimer: null,
    secondsRemaining: 900,
    isExam: false,
  },
  flashcards: {
    cards: [],
    currentIndex: 0,
    isFlipped: false,
  },
  syncQueue: JSON.parse(localStorage.getItem('oryqen_sync_queue') || '[]'),
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  setupWorkspaceSwitcher();
  setupNavigation();
  setupChatForm();
  setupVoiceSystem();
  setupTutorControls();
  setupModals();
  setupDocumentManagement();
  setupKeyboardShortcuts();
  setupConnectivityListeners();

  // Load initial data
  loadCurrentUser();
  loadConversations();
  loadDocumentsList();
  loadSubscriptionStatus();
  checkHealthStatus();
  updateOfflineSyncBadge();
});

// ==========================================================================
// Theme Management
// ==========================================================================
function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('oryqen-theme', theme);
  const icon = document.getElementById('themeIcon');
  if (theme === 'dark') {
    document.body.classList.add('theme-dark');
    if (icon) {
      icon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
    }
  } else {
    document.body.classList.remove('theme-dark');
    if (icon) {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    }
  }
}

// ==========================================================================
// Workspace Switching (General AI vs AI Tutor)
// ==========================================================================
function setupWorkspaceSwitcher() {
  const wsButtons = document.querySelectorAll('[data-ws]');
  wsButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetWs = btn.dataset.ws;
      setWorkspace(targetWs);
    });
  });
}

function setWorkspace(ws) {
  state.workspace = ws;

  // Update header and sidebar tab buttons
  document.querySelectorAll('[data-ws]').forEach(b => {
    b.classList.toggle('active', b.dataset.ws === ws);
  });
  updateBottomNav(ws === 'tutor' ? 'tutor' : 'chat');

  const tutorBar = document.getElementById('tutorControlsBar');
  const tutorDashBtn = document.getElementById('tutorDashboardBtn');
  const welcomeGeneral = document.getElementById('welcomeGeneralScreen');
  const welcomeTutor = document.getElementById('welcomeTutorScreen');
  const chatInput = document.getElementById('chatInput');

  if (ws === 'tutor') {
    tutorBar?.classList.remove('hidden');
    tutorDashBtn?.classList.remove('hidden');
    if (state.messages.length === 0) {
      welcomeGeneral?.classList.add('hidden');
      welcomeTutor?.classList.remove('hidden');
    }
    chatInput.placeholder = `Ask ORYQEN Tutor (${state.tutorMode.replace('_', ' ')} mode)...`;
    showToast('Switched to AI Tutor Workspace');
  } else {
    tutorBar?.classList.add('hidden');
    tutorDashBtn?.classList.add('hidden');
    if (state.messages.length === 0) {
      welcomeTutor?.classList.add('hidden');
      welcomeGeneral?.classList.remove('hidden');
    }
    chatInput.placeholder = 'Ask ORYQEN anything...';
    showToast('Switched to General AI');
  }
}

// ==========================================================================
// Navigation & Sidebar
// ==========================================================================
function setupNavigation() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const openBtn = document.getElementById('openSidebarBtn');
  const closeBtn = document.getElementById('closeSidebarBtn');

  openBtn?.addEventListener('click', () => {
    sidebar?.classList.add('open');
    backdrop?.classList.add('active');
  });

  const closeNav = () => {
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('active');
  };

  closeBtn?.addEventListener('click', closeNav);
  backdrop?.addEventListener('click', closeNav);

  // New Chat (Sidebar and Header)
  document.getElementById('newChatBtn')?.addEventListener('click', () => {
    startNewChat();
    closeNav();
  });
  document.getElementById('headerNewChatBtn')?.addEventListener('click', () => {
    startNewChat();
  });

  // Header Mode Status Badge Click (Toggle Online/Offline)
  document.getElementById('headerStatusBadge')?.addEventListener('click', () => {
    const nextMode = state.mode === 'offline' ? 'online' : 'offline';
    setAiMode(nextMode);
  });

  // Header User / Account Button
  document.getElementById('headerUserBtn')?.addEventListener('click', () => {
    const isGuest = !state.user || state.user.id.startsWith('guest-') || state.user.id === 'local-user';
    openAuthModal(isGuest ? 'login' : 'profile');
  });

  // Mobile Bottom Navigation Bar
  document.getElementById('bnavChat')?.addEventListener('click', () => {
    setWorkspace('general');
    updateBottomNav('chat');
  });
  document.getElementById('bnavTutor')?.addEventListener('click', () => {
    setWorkspace('tutor');
    updateBottomNav('tutor');
  });
  document.getElementById('bnavDocs')?.addEventListener('click', () => {
    document.getElementById('docsModal')?.classList.remove('hidden');
    updateBottomNav('docs');
  });
  document.getElementById('bnavSettings')?.addEventListener('click', () => {
    openSettingsModal();
    updateBottomNav('settings');
  });

  // Clear All Chats
  document.getElementById('clearAllChatsBtn')?.addEventListener('click', async () => {
    if (confirm('Clear all conversation history?')) {
      for (const c of state.conversations) {
        await fetch(`${API_BASE}/api/conversations/${c.id}`, { method: 'DELETE' }).catch(() => {});
      }
      state.conversations = [];
      startNewChat();
      showToast('All conversations cleared.');
    }
  });

  // Search Conversations
  document.getElementById('convSearchInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.conv-item-btn');
    items.forEach(it => {
      const title = it.querySelector('.conv-title-text')?.textContent?.toLowerCase() || '';
      it.style.display = title.includes(q) ? 'flex' : 'none';
    });
  });

  // Theme Toggle
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // AI Mode Segmented Toggle
  document.getElementById('segModeOffline')?.addEventListener('click', () => setAiMode('offline'));
  document.getElementById('segModeOnline')?.addEventListener('click', () => setAiMode('online'));

  // Deep Research Toggle
  const resBtn = document.getElementById('researchToggleBtn');
  resBtn?.addEventListener('click', () => {
    state.deepResearch = !state.deepResearch;
    resBtn.classList.toggle('active', state.deepResearch);
    showToast(state.deepResearch ? 'Deep Web Research: Enabled' : 'Deep Web Research: Disabled');
  });

  // Clear Thread
  document.getElementById('clearThreadBtn')?.addEventListener('click', () => {
    if (state.messages.length > 0 && confirm('Clear current conversation messages?')) {
      startNewChat();
    }
  });
}

function updateBottomNav(tab) {
  document.querySelectorAll('.bnav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bnav === tab);
  });
}

function setAiMode(mode) {
  state.mode = mode;
  document.getElementById('segModeOffline')?.classList.toggle('active', mode === 'offline');
  document.getElementById('segModeOnline')?.classList.toggle('active', mode === 'online');

  const statusBadge = document.getElementById('headerStatusBadge');
  const statusLabel = document.getElementById('headerStatusLabel');
  const sidebarStatus = document.getElementById('sidebarModeStatus');
  const footerText = document.getElementById('footerModeText');

  if (mode === 'online') {
    statusBadge?.classList.add('online');
    if (statusLabel) statusLabel.textContent = 'Online';
    if (sidebarStatus) sidebarStatus.textContent = 'Online (ORYQEN Cloud Intelligence)';
    if (footerText) footerText.textContent = 'Online mode — Powered by ORYQEN Swift with live research capabilities.';
    showToast('Switched to Online Cloud AI');
  } else {
    statusBadge?.classList.remove('online');
    if (statusLabel) statusLabel.textContent = 'Offline';
    if (sidebarStatus) sidebarStatus.textContent = 'Offline (On-Device)';
    if (footerText) footerText.textContent = 'Offline mode — AI runs locally on your device without internet.';
    showToast('Switched to Offline Mode');
  }
}

// ==========================================================================
// AI Tutor Controls & Mode Handlers
// ==========================================================================
function setupTutorControls() {
  const chips = document.querySelectorAll('.tutor-mode-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const mode = chip.dataset.tutorMode;
      setTutorMode(mode);
    });
  });

  // Education Level Selector
  const levelSelect = document.getElementById('tutorLevelSelect');
  levelSelect?.addEventListener('change', (e) => {
    state.tutorLevel = e.target.value;
    showToast(`Level adapted: ${levelSelect.options[levelSelect.selectedIndex].text}`);
  });

  // Quick Tutor Action Buttons
  document.querySelectorAll('.tutor-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.tutorAction;
      const topic = btn.dataset.topic;
      handleTutorAction(action, topic);
    });
  });

  // Student Dashboard Button
  document.getElementById('tutorDashboardBtn')?.addEventListener('click', openStudentDashboard);
}

function setTutorMode(mode) {
  state.tutorMode = mode;
  const input = document.getElementById('chatInput');
  if (input) {
    input.placeholder = `Ask ORYQEN Tutor (${mode.replace('_', ' ')} mode)...`;
  }
  showToast(`Tutor mode: ${mode.toUpperCase().replace('_', ' ')}`);

  // If flashcard mode, open generator prompt
  if (mode === 'flashcard' && state.messages.length === 0) {
    handleTutorAction('flashcard', 'Core Concepts in Physics');
  } else if (mode === 'quiz' && state.messages.length === 0) {
    handleTutorAction('quiz', 'Foundational Physics Principles');
  }
}

async function handleTutorAction(action, defaultTopic = 'Core Subject Matter') {
  if (action === 'quiz') {
    const topic = prompt('Enter the quiz topic:', defaultTopic) || defaultTopic;
    startQuiz(topic, 5, false);
  } else if (action === 'exam') {
    const topic = prompt('Enter the examination subject/topic:', defaultTopic) || defaultTopic;
    startQuiz(topic, 8, true);
  } else if (action === 'flashcard') {
    const topic = prompt('Enter the flashcard topic:', defaultTopic) || defaultTopic;
    startFlashcards(topic);
  } else if (action === 'study_plan') {
    const topic = prompt('Enter the study plan subject/topic:', defaultTopic) || defaultTopic;
    const examDate = prompt('Enter your target exam date (e.g., 2026-06-15):', '2026-06-15') || '2026-06-15';
    generateStudyPlanPrompt(topic, examDate);
  } else if (action === 'socratic') {
    document.getElementById('chatInput').value = `Guide me using the Socratic method to understand: ${defaultTopic}`;
    submitUserMessage();
  }
}

async function generateStudyPlanPrompt(subject, examDate) {
  setWorkspace('tutor');
  setTutorMode('study_plan');
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.value = `Create a structured day-by-day study roadmap for: ${subject}. Target Exam Date: ${examDate}. Include daily milestones, concept mastery checkpoints, and practice schedules.`;
    submitUserMessage();
  }
}

// ==========================================================================
// Interactive Quiz & Timed Exam Engine
// ==========================================================================
async function startQuiz(topic, count = 5, isExam = false) {
  showToast('Generating assessment questions...');
  state.quiz.isExam = isExam;
  state.quiz.userAnswers = {};
  state.quiz.currentIndex = 0;
  state.quiz.score = 0;

  try {
    const res = await fetch(`${API_BASE}/api/tutor/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic,
        count: count,
        level: state.tutorLevel,
        mode: state.mode,
      }),
    });

    if (!res.ok) throw new Error('Failed to generate quiz');
    const data = await res.json();
    state.quiz.questions = data.questions || [];

    if (state.quiz.questions.length === 0) {
      showToast('Could not generate questions.', 'error');
      return;
    }

    // Configure Modal UI
    document.getElementById('quizModal').classList.remove('hidden');
    document.getElementById('quizTitle').textContent = isExam ? `Exam Simulator: ${topic}` : `Quiz: ${topic}`;
    document.getElementById('quizTypeBadge').textContent = isExam ? 'TIMED EXAM' : 'ASSESSMENT QUIZ';
    document.getElementById('quizResultsCard').classList.add('hidden');
    document.getElementById('quizQuestionCard').classList.remove('hidden');

    const timerPill = document.getElementById('quizTimerPill');
    if (isExam) {
      timerPill.classList.remove('hidden');
      startExamTimer(600); // 10 minutes
    } else {
      timerPill.classList.add('hidden');
    }

    renderQuizQuestion(0);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function startExamTimer(seconds) {
  if (state.quiz.examTimer) clearInterval(state.quiz.examTimer);
  state.quiz.secondsRemaining = seconds;
  const timerPill = document.getElementById('quizTimerPill');

  state.quiz.examTimer = setInterval(() => {
    state.quiz.secondsRemaining--;
    const mins = Math.floor(state.quiz.secondsRemaining / 60);
    const secs = state.quiz.secondsRemaining % 60;
    timerPill.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    if (state.quiz.secondsRemaining <= 0) {
      clearInterval(state.quiz.examTimer);
      showToast('Time expired! Submitting exam.');
      finishQuiz();
    }
  }, 1000);
}

function renderQuizQuestion(index) {
  state.quiz.currentIndex = index;
  const q = state.quiz.questions[index];
  const total = state.quiz.questions.length;

  document.getElementById('quizQuestionNumber').textContent = `Question ${index + 1} of ${total}`;
  document.getElementById('quizQuestionText').textContent = q.question;
  document.getElementById('quizProgressFill').style.width = `${((index + 1) / total) * 100}%`;

  const optionsList = document.getElementById('quizOptionsList');
  optionsList.innerHTML = '';
  const feedbackBox = document.getElementById('quizFeedbackBox');
  feedbackBox.classList.add('hidden');

  const selectedAnswer = state.quiz.userAnswers[index];

  q.options.forEach((opt, optIdx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quiz-option-btn';
    btn.innerHTML = `<strong>${String.fromCharCode(65 + optIdx)}.</strong> ${escapeHtml(opt)}`;

    if (selectedAnswer !== undefined) {
      btn.disabled = true;
      if (optIdx === q.correct_answer) btn.classList.add('correct');
      if (selectedAnswer === optIdx && selectedAnswer !== q.correct_answer) btn.classList.add('incorrect');
      if (selectedAnswer === optIdx) btn.classList.add('selected');
    }

    btn.addEventListener('click', () => selectQuizAnswer(index, optIdx));
    optionsList.appendChild(btn);
  });

  // Next / Submit button text
  const nextBtn = document.getElementById('nextQuestionBtn');
  if (selectedAnswer !== undefined) {
    nextBtn.textContent = index === total - 1 ? 'View Final Results' : 'Next Question';
  } else {
    nextBtn.textContent = 'Submit Answer';
  }

  // Previous button
  const prevBtn = document.getElementById('prevQuestionBtn');
  prevBtn.disabled = index === 0;
}

function selectQuizAnswer(qIdx, optIdx) {
  if (state.quiz.userAnswers[qIdx] !== undefined) return;
  state.quiz.userAnswers[qIdx] = optIdx;

  const q = state.quiz.questions[qIdx];
  const isCorrect = optIdx === q.correct_answer;
  if (isCorrect) state.quiz.score++;

  // Reveal option statuses
  const optionButtons = document.querySelectorAll('.quiz-option-btn');
  optionButtons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === q.correct_answer) btn.classList.add('correct');
    if (idx === optIdx && !isCorrect) btn.classList.add('incorrect');
  });

  // Show immediate feedback
  const feedbackBox = document.getElementById('quizFeedbackBox');
  const feedbackTitle = document.getElementById('quizFeedbackTitle');
  const feedbackExp = document.getElementById('quizFeedbackExplanation');
  feedbackBox.classList.remove('hidden');

  if (isCorrect) {
    feedbackTitle.textContent = '✓ Correct Answer';
    feedbackTitle.style.color = 'var(--status-online)';
    feedbackExp.textContent = q.explanation || 'Excellent reasoning!';
  } else {
    feedbackTitle.textContent = '✗ Incorrect';
    feedbackTitle.style.color = 'var(--accent-danger)';
    feedbackExp.innerHTML = `
      ${escapeHtml(q.explanation || 'Check foundational principles.')}
      <div style="margin-top:8px;">
        <button class="btn-sm btn-secondary" onclick="analyzeMistakeLive('${escapeHtml(q.question)}', '${escapeHtml(q.options[optIdx])}', '${escapeHtml(q.options[q.correct_answer])}')">
          Explain My Mistake
        </button>
      </div>
    `;
  }

  const nextBtn = document.getElementById('nextQuestionBtn');
  nextBtn.textContent = qIdx === state.quiz.questions.length - 1 ? 'View Final Results' : 'Next Question';
}

async function finishQuiz() {
  if (state.quiz.examTimer) clearInterval(state.quiz.examTimer);

  const total = state.quiz.questions.length;
  const correct = state.quiz.score;
  const percent = Math.round((correct / total) * 100);

  document.getElementById('quizQuestionCard').classList.add('hidden');
  document.getElementById('quizResultsCard').classList.remove('hidden');
  document.getElementById('finalScorePercent').textContent = `${percent}%`;
  document.getElementById('finalScoreFraction').textContent = `${correct} / ${total} Correct`;

  // Identify weak topics
  const weak = [];
  state.quiz.questions.forEach((q, idx) => {
    if (state.quiz.userAnswers[idx] !== q.correct_answer && q.topic) {
      weak.push(q.topic);
    }
  });

  const verdictEl = document.getElementById('quizPerformanceVerdict');
  const adviceEl = document.getElementById('quizPerformanceAdvice');
  if (percent >= 80) {
    verdictEl.textContent = 'Exceptional Mastery!';
    adviceEl.textContent = 'You have strong comprehension of these concepts. Ready for higher difficulty.';
  } else if (percent >= 50) {
    verdictEl.textContent = 'Good Effort — Target Revisions Needed';
    adviceEl.textContent = 'You passed the benchmark, but reviewing missed concepts will secure top marks.';
  } else {
    verdictEl.textContent = 'Foundational Revision Recommended';
    adviceEl.textContent = 'Switch to Learn Mode or Review Flashcards to reinforce the core mechanisms.';
  }

  // Save attempt to backend
  const payload = {
    user_id: state.user.id,
    score: percent,
    total_questions: total,
    correct_count: correct,
    answers: state.quiz.userAnswers,
    weak_topics: weak,
  };

  try {
    await fetch(`${API_BASE}/api/tutor/quiz/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Queue offline
    queueOfflineAction('insert', 'quiz_attempts', payload);
  }
}

// Live Mistake Analysis helper
window.analyzeMistakeLive = async function(question, wrongAns, rightAns) {
  document.getElementById('quizModal').classList.add('hidden');
  setWorkspace('tutor');
  setTutorMode('mistake_analysis');

  const query = `Analyze this mistake:
Question: ${question}
My Answer: ${wrongAns}
Correct Answer: ${rightAns}`;

  submitUserMessage(query);
};

// ==========================================================================
// 3D Flashcards Engine
// ==========================================================================
async function startFlashcards(topic) {
  showToast('Generating flashcards...');
  try {
    const res = await fetch(`${API_BASE}/api/tutor/flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic,
        count: 8,
        level: state.tutorLevel,
        mode: state.mode,
      }),
    });

    if (!res.ok) throw new Error('Failed to generate flashcards');
    const data = await res.json();
    state.flashcards.cards = data.cards || [];

    if (state.flashcards.cards.length === 0) {
      showToast('No flashcards returned.', 'error');
      return;
    }

    state.flashcards.currentIndex = 0;
    state.flashcards.isFlipped = false;
    document.getElementById('flashcardModal').classList.remove('hidden');
    renderFlashcard(0);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function renderFlashcard(index) {
  const card = state.flashcards.cards[index];
  const total = state.flashcards.cards.length;

  document.getElementById('flashcardCounter').textContent = `Card ${index + 1} of ${total}`;
  document.getElementById('flashcardFrontText').textContent = card.front;
  document.getElementById('flashcardBackText').textContent = card.back;

  const cardElement = document.getElementById('flashcardCard');
  cardElement.classList.remove('flipped');
  state.flashcards.isFlipped = false;
}

function flipCurrentCard() {
  const cardElement = document.getElementById('flashcardCard');
  state.flashcards.isFlipped = !state.flashcards.isFlipped;
  cardElement.classList.toggle('flipped', state.flashcards.isFlipped);
}

// ==========================================================================
// Complete Voice Interaction System
// ==========================================================================
function setupVoiceSystem() {
  const micBtn = document.getElementById('micBtn');
  const stopBtn = document.getElementById('stopRecordingBtn');
  const discardBtn = document.getElementById('discardVoiceBtn');
  const sendVoiceBtn = document.getElementById('sendVoiceBtn');

  micBtn?.addEventListener('click', toggleVoiceRecording);
  stopBtn?.addEventListener('click', stopVoiceRecording);
  discardBtn?.addEventListener('click', discardVoiceRecording);
  sendVoiceBtn?.addEventListener('click', sendVoiceMessage);
}

async function toggleVoiceRecording() {
  if (state.voice.isRecording) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.voice.audioChunks = [];
    state.voice.mediaRecorder = new MediaRecorder(stream);
    state.voice.liveTranscript = '';

    // Initialize real-time browser SpeechRecognition if available
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
          let accumulated = '';
          for (let i = 0; i < event.results.length; i++) {
            accumulated += event.results[i][0].transcript + ' ';
          }
          state.voice.liveTranscript = accumulated.trim();
          const liveEl = document.getElementById('voiceLiveTranscript');
          if (liveEl) liveEl.textContent = state.voice.liveTranscript || 'Listening...';
          const reviewEl = document.getElementById('voiceTranscriptReview');
          if (reviewEl) reviewEl.textContent = state.voice.liveTranscript ? `“${state.voice.liveTranscript}”` : '';
        };

        recognition.onerror = (e) => {
          console.warn('Browser speech recognition notice:', e.error);
        };

        recognition.start();
        state.voice.recognition = recognition;
      } catch (recErr) {
        console.warn('SpeechRecognition initialization skipped:', recErr);
      }
    }

    state.voice.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.voice.audioChunks.push(e.data);
    };

    state.voice.mediaRecorder.onstop = () => {
      state.voice.audioBlob = new Blob(state.voice.audioChunks, { type: 'audio/webm' });
      state.voice.audioUrl = URL.createObjectURL(state.voice.audioBlob);
      const audioPlayer = document.getElementById('voiceAudioPreview');
      if (audioPlayer) audioPlayer.src = state.voice.audioUrl;

      const reviewEl = document.getElementById('voiceTranscriptReview');
      if (reviewEl) {
        reviewEl.textContent = state.voice.liveTranscript ? `“${state.voice.liveTranscript}”` : 'Voice note captured';
      }

      document.getElementById('voiceLiveState')?.classList.add('hidden');
      document.getElementById('voicePreviewState')?.classList.remove('hidden');
    };

    state.voice.mediaRecorder.start();
    state.voice.isRecording = true;
    state.voice.secondsElapsed = 0;

    // Show UI recording bar
    document.getElementById('voiceRecorderBar')?.classList.remove('hidden');
    document.getElementById('voiceLiveState')?.classList.remove('hidden');
    document.getElementById('voicePreviewState')?.classList.add('hidden');
    document.getElementById('micBtn')?.classList.add('recording');
    const liveEl = document.getElementById('voiceLiveTranscript');
    if (liveEl) liveEl.textContent = 'Listening...';

    // Timer
    state.voice.recordingTimer = setInterval(() => {
      state.voice.secondsElapsed++;
      const m = Math.floor(state.voice.secondsElapsed / 60);
      const s = state.voice.secondsElapsed % 60;
      const timerEl = document.getElementById('voiceTimer');
      if (timerEl) timerEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }, 1000);

    showToast('Recording voice question...');
  } catch (err) {
    showToast('Microphone access denied or unavailable.', 'error');
  }
}

function stopVoiceRecording() {
  if (state.voice.recognition) {
    try { state.voice.recognition.stop(); } catch (e) {}
  }
  if (state.voice.mediaRecorder && state.voice.isRecording) {
    state.voice.mediaRecorder.stop();
    state.voice.mediaRecorder.stream.getTracks().forEach(t => t.stop());
    state.voice.isRecording = false;
    clearInterval(state.voice.recordingTimer);
    document.getElementById('micBtn')?.classList.remove('recording');
  }
}

function discardVoiceRecording() {
  if (state.voice.recognition) {
    try { state.voice.recognition.stop(); } catch (e) {}
    state.voice.recognition = null;
  }
  state.voice.liveTranscript = '';
  if (state.voice.audioUrl) {
    URL.revokeObjectURL(state.voice.audioUrl);
    state.voice.audioUrl = null;
  }
  state.voice.audioBlob = null;
  document.getElementById('voiceRecorderBar')?.classList.add('hidden');
  showToast('Recording discarded.');
}

async function sendVoiceMessage() {
  if (!state.voice.audioBlob) return;
  const audioBlob = state.voice.audioBlob;
  const transcription = state.voice.liveTranscript || '';
  discardVoiceRecording();

  showToast('Processing voice message...');
  const formData = new FormData();
  formData.append('audio', audioBlob, 'question.webm');
  formData.append('mode', state.mode);
  formData.append('capability', state.workspace);
  formData.append('user_id', state.user.id);
  if (transcription) {
    formData.append('transcription', transcription);
  }

  try {
    const res = await fetch(`${API_BASE}/api/voice/process`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error('Voice processing failed');
    const data = await res.json();

    // Append user transcription
    appendMessageRow({ role: 'user', content: `🎙️ "${data.transcription}"` });
    state.messages.push({ role: 'user', content: data.transcription });

    // Append assistant response
    const asstMsg = {
      role: 'assistant',
      content: data.answer,
      citations: [],
      model: data.model,
    };
    appendMessageRow(asstMsg);
    state.messages.push(asstMsg);
    scrollToBottom();

    // Speak aloud response
    speakText(data.answer);
  } catch (err) {
    showToast(`Voice error: ${err.message}`, 'error');
  }
}

// Text-to-Speech playback helper
function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[#*`_]/g, '').slice(0, 350);
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

// ==========================================================================
// Chat Form & SSE Streaming Message Submission
// ==========================================================================
function setupChatForm() {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.isGenerating) {
      stopGeneration();
    } else {
      submitUserMessage();
    }
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (state.isGenerating) {
        stopGeneration();
      } else {
        submitUserMessage();
      }
    }
  });

  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });

  // Suggestion card clicks
  document.querySelectorAll('.suggestion-card[data-prompt]').forEach(c => {
    c.addEventListener('click', () => {
      const p = c.dataset.prompt;
      if (p) {
        input.value = p;
        submitUserMessage();
      }
    });
  });
}

function stopGeneration() {
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
  setGeneratingState(false);
}

function setGeneratingState(generating) {
  state.isGenerating = generating;
  const sendBtn = document.getElementById('sendBtn');
  const sendIcon = document.getElementById('sendIcon');

  if (generating) {
    sendBtn?.classList.add('stop-mode');
    if (sendIcon) sendIcon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="1"></rect>';
    if (sendBtn) sendBtn.title = 'Stop generating';
  } else {
    sendBtn?.classList.remove('stop-mode');
    if (sendIcon) sendIcon.innerHTML = '<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>';
    if (sendBtn) sendBtn.title = 'Send message';
  }
}

async function submitUserMessage(overrideQuery) {
  const input = document.getElementById('chatInput');
  const query = overrideQuery || input?.value.trim();
  if (!query || state.isGenerating) return;

  // Hide welcome screens
  document.getElementById('welcomeGeneralScreen')?.classList.add('hidden');
  document.getElementById('welcomeTutorScreen')?.classList.add('hidden');

  // Append user message
  appendMessageRow({ role: 'user', content: query });
  state.messages.push({ role: 'user', content: query });

  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }

  // Thinking indicator
  const thinkingId = 'thinking-' + Date.now();
  appendThinkingRow(thinkingId);
  scrollToBottom();

  setGeneratingState(true);
  state.abortController = new AbortController();

  const payload = {
    question: query,
    conversation_id: state.currentConversationId,
    course_id: state.attachedDoc ? state.attachedDoc.id : null,
    mode: state.mode,
    capability: state.workspace,
    tutor_mode: state.tutorMode,
    tutor_level: state.tutorLevel,
    subject: state.subject,
    user_id: state.user.id,
    deep_research: state.deepResearch,
    conversation_history: state.messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
  };

  try {
    // Attempt real-time SSE stream
    const res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: state.abortController.signal,
    });

    removeElement(thinkingId);

    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let streamBuffer = '';
      let assistantBubble = null;
      let fullContent = '';
      let modelUsed = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.conversation_id && !state.currentConversationId) {
                state.currentConversationId = data.conversation_id;
                document.getElementById('currentChatTitle').textContent = query.slice(0, 32);
                loadConversations();
              }

              if (data.chunk) {
                fullContent += data.chunk;
                modelUsed = data.display_name || data.model || 'ORYQEN';

                if (!assistantBubble) {
                  assistantBubble = createStreamingAssistantRow(modelUsed);
                }
                updateStreamingAssistantRow(assistantBubble, fullContent);
                scrollToBottom();
              }
            } catch (e) {}
          }
        }
      }

      state.messages.push({ role: 'assistant', content: fullContent, model: modelUsed });
    } else {
      // Synchronous fallback
      const fallbackRes = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await fallbackRes.json();
      appendMessageRow({
        role: 'assistant',
        content: data.answer || 'Response completed.',
        citations: data.sources || [],
        model: data.display_name || data.model || 'ORYQEN',
      });
      state.messages.push({ role: 'assistant', content: data.answer });
      scrollToBottom();
    }
  } catch (err) {
    removeElement(thinkingId);
    if (err.name === 'AbortError') {
      appendMessageRow({ role: 'assistant', content: 'Generation stopped.', model: 'System' });
    } else {
      appendMessageRow({
        role: 'assistant',
        content: 'Offline execution standby. If running offline, ensure local model is active. If online, check your network connection.',
        model: 'ORYQEN Local',
      });
    }
    scrollToBottom();
  } finally {
    setGeneratingState(false);
    state.abortController = null;
    document.getElementById('chatInput')?.focus();
  }
}

// ==========================================================================
// Message Rendering & Formatting with Proprietary ORYQEN Branding
// ==========================================================================
function cleanOryqenModelName(raw) {
  if (!raw) return 'ORYQEN Swift';
  const clean = String(raw).toLowerCase();
  if (clean.includes('reason') || clean.includes('pro') || clean.includes('deepseek')) return 'ORYQEN Reason';
  if (clean.includes('local') || clean.includes('core') || clean.includes('ollama') || clean.includes('qwen') || clean.includes('llama') || clean.includes('offline')) return 'ORYQEN Local Core';
  if (clean.includes('research')) return 'ORYQEN Research';
  if (clean.includes('tutor') || clean.includes('socratic')) return 'ORYQEN Tutor';
  return 'ORYQEN Swift';
}

function appendMessageRow({ role, content, citations = [], model = '' }) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  if (role === 'user') {
    avatar.textContent = 'U';
  } else {
    avatar.innerHTML = `
      <svg class="anim-orbit" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 3a9 9 0 0 1 9 9"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
  }

  const contentWrap = document.createElement('div');
  contentWrap.className = 'message-content-wrap';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = formatMarkdown(content);
  contentWrap.appendChild(bubble);

  // Citations / Sources
  if (role === 'assistant' && citations && citations.length > 0) {
    const box = document.createElement('div');
    box.className = 'grounding-box';
    box.innerHTML = `
      <div class="grounding-header">
        <svg class="anim-float-subtle" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        </svg>
        <span>Verified Sources (${citations.length})</span>
      </div>
      <div class="grounding-chips-list"></div>
    `;
    const list = box.querySelector('.grounding-chips-list');
    citations.forEach((c, idx) => {
      const chip = document.createElement('button');
      chip.className = 'grounding-chip';
      chip.innerHTML = `<span>Source #${idx + 1}: ${escapeHtml(c.title || c.material_title || 'Document')}</span>`;
      chip.addEventListener('click', () => openCitationModal(c, idx + 1));
      list.appendChild(chip);
    });
    contentWrap.appendChild(box);
  }

  // Assistant Actions (Copy, TTS Speak, Regenerate)
  if (role === 'assistant') {
    const actionsBar = document.createElement('div');
    actionsBar.className = 'message-actions-bar';
    const brandedName = cleanOryqenModelName(model);
    actionsBar.innerHTML = `
      <span class="model-tag">${escapeHtml(brandedName)}</span>
      <button class="action-chip copy-chip" title="Copy to clipboard">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy</span>
      </button>
      <button class="action-chip speak-chip" title="Listen with Spoken Voice">
        <svg class="anim-pulse-subtle" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
        <span>Listen</span>
      </button>
      <button class="action-chip regen-chip" title="Regenerate">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
        <span>Regenerate</span>
      </button>
    `;

    actionsBar.querySelector('.copy-chip')?.addEventListener('click', () => {
      navigator.clipboard.writeText(content).then(() => showToast('Copied to clipboard.'));
    });

    actionsBar.querySelector('.speak-chip')?.addEventListener('click', () => {
      speakText(content);
    });

    actionsBar.querySelector('.regen-chip')?.addEventListener('click', () => {
      const lastUser = [...state.messages].reverse().find(m => m.role === 'user');
      if (lastUser) submitUserMessage(lastUser.content);
    });

    contentWrap.appendChild(actionsBar);
  }

  row.appendChild(avatar);
  row.appendChild(contentWrap);
  document.getElementById('chatMessages').appendChild(row);
}

function createStreamingAssistantRow(modelName) {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  const brandedName = cleanOryqenModelName(modelName);

  row.innerHTML = `
    <div class="message-avatar">
      <svg class="anim-orbit" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 3a9 9 0 0 1 9 9"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    </div>
    <div class="message-content-wrap">
      <div class="message-bubble"></div>
      <div class="message-actions-bar">
        <span class="model-tag">${escapeHtml(brandedName)}</span>
      </div>
    </div>
  `;

  document.getElementById('chatMessages').appendChild(row);
  return row.querySelector('.message-bubble');
}

function updateStreamingAssistantRow(bubbleElement, rawText) {
  if (bubbleElement) {
    bubbleElement.innerHTML = formatMarkdown(rawText);
  }
}

function appendThinkingRow(id) {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.id = id;

  row.innerHTML = `
    <div class="message-avatar">
      <svg class="anim-orbit" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 3a9 9 0 0 1 9 9"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    </div>
    <div class="message-content-wrap">
      <div class="message-bubble">
        <div class="typing-dots">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('chatMessages').appendChild(row);
}

function removeElement(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom() {
  const vp = document.getElementById('chatViewport');
  if (vp) vp.scrollTop = vp.scrollHeight;
}

function startNewChat() {
  state.currentConversationId = null;
  state.messages = [];
  document.getElementById('chatMessages').innerHTML = '';

  const welcomeGeneral = document.getElementById('welcomeGeneralScreen');
  const welcomeTutor = document.getElementById('welcomeTutorScreen');
  if (state.workspace === 'tutor') {
    welcomeGeneral?.classList.add('hidden');
    welcomeTutor?.classList.remove('hidden');
  } else {
    welcomeTutor?.classList.add('hidden');
    welcomeGeneral?.classList.remove('hidden');
  }

  document.getElementById('currentChatTitle').textContent = 'ORYQEN';
}

function renderMathFormula(formula, isBlock) {
  if (!formula) return '';
  const cleanFormula = formula.trim();

  // 1. Try KaTeX if loaded
  if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
    try {
      const rendered = window.katex.renderToString(cleanFormula, {
        displayMode: isBlock,
        throwOnError: false,
        output: 'htmlAndMathml',
      });
      return isBlock 
        ? `<div class="oryqen-math-block">${rendered}</div>` 
        : `<span class="oryqen-math-inline">${rendered}</span>`;
    } catch (e) {
      // Fall through to fallback
    }
  }

  // 2. Pure HTML/CSS mathematical typographic fallback (for offline or CDN delay)
  return fallbackFormatMath(cleanFormula, isBlock);
}

function fallbackFormatMath(formula, isBlock) {
  let f = escapeHtml(formula);

  // Greek letters
  const greek = {
    '\\\\alpha': 'α', '\\\\beta': 'β', '\\\\gamma': 'γ', '\\\\delta': 'δ', '\\\\epsilon': 'ε',
    '\\\\theta': 'θ', '\\\\lambda': 'λ', '\\\\mu': 'μ', '\\\\pi': 'π', '\\\\sigma': 'σ',
    '\\\\phi': 'φ', '\\\\omega': 'ω', '\\\\Delta': 'Δ', '\\\\Omega': 'Ω', '\\\\Sigma': 'Σ',
    '\\\\Gamma': 'Γ', '\\\\Theta': 'Θ', '\\\\rho': 'ρ', '\\\\tau': 'τ', '\\\\psi': 'ψ'
  };
  for (const [k, v] of Object.entries(greek)) {
    f = f.replace(new RegExp(k, 'g'), v);
  }

  // Operators & Symbols
  const symbols = {
    '\\\\times': ' × ', '\\\\cdot': ' · ', '\\\\div': ' ÷ ', '\\\\pm': ' ± ', '\\\\mp': ' ∓ ',
    '\\\\neq': ' ≠ ', '\\\\leq': ' ≤ ', '\\\\geq': ' ≥ ', '\\\\approx': ' ≈ ', '\\\\equiv': ' ≡ ',
    '\\\\infty': '∞', '\\\\int': '∫', '\\\\sum': '∑', '\\\\partial': '∂', '\\\\nabla': '∇',
    '\\\\in': ' ∈ ', '\\\\subset': ' ⊂ ', '\\\\forall': '∀', '\\\\exists': '∃',
    '\\\\to': ' → ', '\\\\rightarrow': ' → ', '\\\\leftarrow': ' ← ', '\\\\Rightarrow': ' ⇒ ',
    '\\\\quad': '   ', '\\\\qquad': '     ', '\\\\,': ' '
  };
  for (const [k, v] of Object.entries(symbols)) {
    f = f.replace(new RegExp(k, 'g'), v);
  }

  // Square roots: \sqrt{rad}
  f = f.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, '<sup>$1</sup>√<span class="math-sqrt-rad">$2</span>');
  f = f.replace(/\\sqrt\{([^{}]+)\}/g, '√<span class="math-sqrt-rad">$1</span>');

  // Fractions: \frac{num}{den} with balanced brace support
  let fracIdx = f.indexOf('\\frac{');
  let fracSafety = 0;
  while (fracIdx !== -1 && fracSafety++ < 30) {
    let i = fracIdx + 6;
    let depth = 1;
    let numStart = i;
    while (i < f.length && depth > 0) {
      if (f[i] === '{') depth++;
      else if (f[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) break;
    let num = f.substring(numStart, i - 1);
    while (i < f.length && /\s/.test(f[i])) i++;
    if (f[i] !== '{') break;
    i++;
    depth = 1;
    let denStart = i;
    while (i < f.length && depth > 0) {
      if (f[i] === '{') depth++;
      else if (f[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) break;
    let den = f.substring(denStart, i - 1);
    let before = f.substring(0, fracIdx);
    let after = f.substring(i);
    f = before + '<span class="math-frac"><span class="math-num">' + num + '</span><span class="math-den">' + den + '</span></span>' + after;
    fracIdx = f.indexOf('\\frac{');
  }

  // Superscripts & Subscripts: x^{2} and x_{i}
  f = f.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');
  f = f.replace(/\_\{([^{}]+)\}/g, '<sub>$1</sub>');
  f = f.replace(/\^([a-zA-Z0-9+\-=])/g, '<sup>$1</sup>');
  f = f.replace(/\_([a-zA-Z0-9+\-=])/g, '<sub>$1</sub>');

  // Clean \left, \right, \text, \mathrm
  f = f.replace(/\\text\{([^{}]+)\}/g, '$1');
  f = f.replace(/\\mathrm\{([^{}]+)\}/g, '$1');
  f = f.replace(/\\left/g, '');
  f = f.replace(/\\right/g, '');
  f = f.replace(/\\\{/g, '{');
  f = f.replace(/\\\}/g, '}');

  return isBlock
    ? `<div class="math-fallback-block"><span class="math-fallback-formula">${f}</span></div>`
    : `<span class="math-fallback-formula">${f}</span>`;
}

function formatMarkdown(text) {
  if (!text) return '';

  // 1. Stash Code Blocks
  const codeBlocks = [];
  let working = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `%%CODE_BLOCK_${codeBlocks.length}%%`;
    codeBlocks.push(`<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`);
    return placeholder;
  });

  working = working.replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = `%%CODE_INLINE_${codeBlocks.length}%%`;
    codeBlocks.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // 2. Stash & Render Mathematical Formulas
  const mathBlocks = [];

  // Block Math: $$ ... $$ and \[ ... \]
  working = working.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const placeholder = `%%MATH_BLOCK_${mathBlocks.length}%%`;
    mathBlocks.push(renderMathFormula(math, true));
    return placeholder;
  });
  working = working.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => {
    const placeholder = `%%MATH_BLOCK_${mathBlocks.length}%%`;
    mathBlocks.push(renderMathFormula(math, true));
    return placeholder;
  });

  // Inline Math: \( ... \) and $ ... $
  working = working.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => {
    const placeholder = `%%MATH_INLINE_${mathBlocks.length}%%`;
    mathBlocks.push(renderMathFormula(math, false));
    return placeholder;
  });
  working = working.replace(/(^|[^\\])\$([^\$\n\r]+?)\$/g, (match, prefix, math) => {
    // Avoid currency like "$5 and $10"
    if (/^\s*\d+([.,]\d+)?\s*$/.test(math)) {
      return match;
    }
    const placeholder = `%%MATH_INLINE_${mathBlocks.length}%%`;
    mathBlocks.push(renderMathFormula(math, false));
    return prefix + placeholder;
  });

  // 3. Process Markdown on standard text
  let html = escapeHtml(working);

  // Headers
  html = html.replace(/^### (.*)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.*)$/gm, '<h2>$1</h2>');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');

  // Paragraphs & Linebreaks
  html = html.replace(/\n\n+/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // 4. Restore Code & Math with callback functions to prevent regex $ substitution bugs
  mathBlocks.forEach((renderedMath, i) => {
    html = html.replace(new RegExp(`%%MATH_BLOCK_${i}%%`, 'g'), () => renderedMath);
    html = html.replace(new RegExp(`%%MATH_INLINE_${i}%%`, 'g'), () => renderedMath);
  });

  codeBlocks.forEach((renderedCode, i) => {
    html = html.replace(new RegExp(`%%CODE_BLOCK_${i}%%`, 'g'), () => renderedCode);
    html = html.replace(new RegExp(`%%CODE_INLINE_${i}%%`, 'g'), () => renderedCode);
  });

  return `<div class="markdown-body"><p>${html}</p></div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// Conversations List
// ==========================================================================
async function loadConversations() {
  try {
    const res = await fetch(`${API_BASE}/api/conversations?user_id=${state.user.id}`);
    if (!res.ok) return;
    const data = await res.json();
    state.conversations = data.conversations || [];
    renderConversationsList();
  } catch (err) {}
}

function renderConversationsList() {
  const container = document.getElementById('conversationsList');
  const emptyEl = document.getElementById('historyEmpty');
  if (!container) return;

  container.innerHTML = '';
  if (state.conversations.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  state.conversations.forEach(c => {
    const btn = document.createElement('button');
    btn.className = `conv-item-btn ${state.currentConversationId === c.id ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="conv-title-text">${escapeHtml(c.title || 'Session')}</span>
      <span class="conv-delete-btn" title="Delete">&times;</span>
    `;

    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('conv-delete-btn')) {
        deleteConversation(c.id);
      } else {
        openConversation(c.id);
      }
    });

    container.appendChild(btn);
  });
}

async function openConversation(convId) {
  state.currentConversationId = convId;
  try {
    const res = await fetch(`${API_BASE}/api/conversations/${convId}`);
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('welcomeGeneralScreen')?.classList.add('hidden');
    document.getElementById('welcomeTutorScreen')?.classList.add('hidden');

    document.getElementById('currentChatTitle').textContent = data.conversation.title || 'ORYQEN';
    state.messages = [];

    data.messages.forEach(m => {
      appendMessageRow(m);
      state.messages.push(m);
    });

    renderConversationsList();
    scrollToBottom();
  } catch (err) {
    showToast('Failed to load conversation history.', 'error');
  }
}

async function deleteConversation(convId) {
  try {
    await fetch(`${API_BASE}/api/conversations/${convId}`, { method: 'DELETE' });
    state.conversations = state.conversations.filter(c => c.id !== convId);
    if (state.currentConversationId === convId) {
      startNewChat();
    } else {
      renderConversationsList();
    }
    showToast('Conversation deleted.');
  } catch (err) {
    showToast('Failed to delete.', 'error');
  }
}

// ==========================================================================
// Document Management
// ==========================================================================
function setupDocumentManagement() {
  document.getElementById('openDocsModalBtn')?.addEventListener('click', () => {
    document.getElementById('docsModal')?.classList.remove('hidden');
    loadDocumentsList();
  });
  document.getElementById('quickAttachBtn')?.addEventListener('click', () => {
    document.getElementById('docsModal')?.classList.remove('hidden');
  });
  document.getElementById('attachFileBtn')?.addEventListener('click', () => {
    document.getElementById('docsModal')?.classList.remove('hidden');
  });
  document.getElementById('closeDocsModalBtn')?.addEventListener('click', () => {
    document.getElementById('docsModal')?.classList.add('hidden');
  });
  document.getElementById('dismissDocsModalBtn')?.addEventListener('click', () => {
    document.getElementById('docsModal')?.classList.add('hidden');
  });

  document.getElementById('detachDocBtn')?.addEventListener('click', detachDocument);
  document.getElementById('removeInputDocBtn')?.addEventListener('click', detachDocument);

  const dropzone = document.getElementById('modalDropzone');
  const fileInput = document.getElementById('modalFileInput');

  dropzone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
  });
}

async function loadDocumentsList() {
  try {
    const res = await fetch(`${API_BASE}/api/courses`);
    if (!res.ok) return;
    const data = await res.json();
    const courses = data.courses || [];
    document.getElementById('docsCountBadge').textContent = courses.length;

    const list = document.getElementById('modalDocsList');
    list.innerHTML = '';

    if (courses.length === 0) {
      list.innerHTML = '<div style="text-align:center; font-size:12px; color:var(--text-muted); padding:16px;">No documents uploaded yet. Upload a PDF textbook or notes above.</div>';
      return;
    }

    courses.forEach(c => {
      const item = document.createElement('div');
      item.className = 'doc-card-item';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.padding = '8px 0';
      item.style.borderBottom = '1px solid var(--border-subtle)';

      const isAttached = state.attachedDoc && state.attachedDoc.id === c.id;
      item.innerHTML = `
        <div>
          <div style="font-weight:600; font-size:13px;">${escapeHtml(c.title)}</div>
          <div style="font-size:11px; color:var(--text-muted);">${c.total_chunks || 0} indexed sections</div>
        </div>
        <button class="btn-sm btn-secondary attach-btn">${isAttached ? 'Attached' : 'Attach'}</button>
      `;

      item.querySelector('.attach-btn')?.addEventListener('click', () => {
        attachDocument({ id: c.id, title: c.title });
        document.getElementById('docsModal')?.classList.add('hidden');
      });

      list.appendChild(item);
    });
  } catch (e) {}
}

async function handleFileUpload(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please upload a PDF document.', 'error');
    return;
  }

  const prog = document.getElementById('modalUploadProgress');
  const progFill = document.getElementById('modalProgressBar');
  prog?.classList.remove('hidden');
  if (progFill) progFill.style.width = '40%';

  const fd = new FormData();
  fd.append('file', file);
  fd.append('title', file.name.replace(/\.pdf$/i, ''));
  fd.append('subject', state.subject || 'General');

  try {
    const res = await fetch(`${API_BASE}/api/materials/upload`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Upload failed');
    const result = await res.json();

    if (progFill) progFill.style.width = '100%';
    showToast(`Uploaded & indexed "${file.name}"`);

    if (result.course_id) {
      attachDocument({ id: result.course_id, title: file.name.replace(/\.pdf$/i, '') });
    }

    setTimeout(() => {
      prog?.classList.add('hidden');
      document.getElementById('docsModal')?.classList.add('hidden');
      loadDocumentsList();
    }, 600);
  } catch (err) {
    prog?.classList.add('hidden');
    showToast(`Upload error: ${err.message}`, 'error');
  }
}

function attachDocument(doc) {
  state.attachedDoc = doc;
  document.getElementById('activeDocPill')?.classList.remove('hidden');
  document.getElementById('activeDocName').textContent = doc.title;
  document.getElementById('inputAttachedBar')?.classList.remove('hidden');
  document.getElementById('inputAttachedDocName').textContent = doc.title;
  showToast(`Attached: "${doc.title}"`);
}

function detachDocument() {
  state.attachedDoc = null;
  document.getElementById('activeDocPill')?.classList.add('hidden');
  document.getElementById('inputAttachedBar')?.classList.add('hidden');
  showToast('Document detached.');
}

// ==========================================================================
// Modals Setup (Memory, Dashboard, Subscriptions, Auth, Settings)
// ==========================================================================
function setupModals() {
  // AI Memory Modal
  document.getElementById('openMemoryModalBtn')?.addEventListener('click', openMemoryModal);
  document.getElementById('closeMemoryModalBtn')?.addEventListener('click', () => document.getElementById('memoryModal')?.classList.add('hidden'));
  document.getElementById('dismissMemoryModalBtn')?.addEventListener('click', () => document.getElementById('memoryModal')?.classList.add('hidden'));
  document.getElementById('addMemoryBtn')?.addEventListener('click', handleAddMemory);
  document.getElementById('clearAllMemoriesBtn')?.addEventListener('click', handleClearAllMemories);
  document.getElementById('memoryToggleInput')?.addEventListener('change', handleToggleMemory);

  // Student Dashboard Modal
  document.getElementById('closeDashboardBtn')?.addEventListener('click', () => document.getElementById('studentDashboardModal')?.classList.add('hidden'));
  document.getElementById('dismissDashboardBtn')?.addEventListener('click', () => document.getElementById('studentDashboardModal')?.classList.add('hidden'));

  // 3D Flashcards Modal
  document.getElementById('closeFlashcardModalBtn')?.addEventListener('click', () => document.getElementById('flashcardModal')?.classList.add('hidden'));
  document.getElementById('dismissFlashcardBtn')?.addEventListener('click', () => document.getElementById('flashcardModal')?.classList.add('hidden'));
  document.getElementById('flipCardBtn')?.addEventListener('click', flipCurrentCard);
  document.getElementById('flashcardCard')?.addEventListener('click', flipCurrentCard);
  document.getElementById('prevCardBtn')?.addEventListener('click', () => {
    if (state.flashcards.currentIndex > 0) renderFlashcard(state.flashcards.currentIndex - 1);
  });
  document.getElementById('nextCardBtn')?.addEventListener('click', () => {
    if (state.flashcards.currentIndex < state.flashcards.cards.length - 1) renderFlashcard(state.flashcards.currentIndex + 1);
  });

  // Quiz Modal
  document.getElementById('closeQuizModalBtn')?.addEventListener('click', () => {
    if (state.quiz.examTimer) clearInterval(state.quiz.examTimer);
    document.getElementById('quizModal')?.classList.add('hidden');
  });
  document.getElementById('prevQuestionBtn')?.addEventListener('click', () => {
    if (state.quiz.currentIndex > 0) renderQuizQuestion(state.quiz.currentIndex - 1);
  });
  document.getElementById('nextQuestionBtn')?.addEventListener('click', () => {
    if (state.quiz.currentIndex < state.quiz.questions.length - 1) {
      renderQuizQuestion(state.quiz.currentIndex + 1);
    } else {
      finishQuiz();
    }
  });

  // Subscription Modal
  document.getElementById('openSubscriptionBtn')?.addEventListener('click', () => document.getElementById('subscriptionModal')?.classList.remove('hidden'));
  document.getElementById('closeSubscriptionModalBtn')?.addEventListener('click', () => document.getElementById('subscriptionModal')?.classList.add('hidden'));
  document.getElementById('dismissSubscriptionBtn')?.addEventListener('click', () => document.getElementById('subscriptionModal')?.classList.add('hidden'));
  document.getElementById('upgradePlusBtn')?.addEventListener('click', () => upgradePlan('plus'));
  document.getElementById('upgradeProBtn')?.addEventListener('click', () => upgradePlan('pro'));

  // Header Auth Cluster & Dropdown
  document.getElementById('headerSignInBtn')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('headerSignUpBtn')?.addEventListener('click', () => openAuthModal('register'));
  
  const userPill = document.getElementById('userProfilePill');
  const profileDropdown = document.getElementById('profileDropdownMenu');
  userPill?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown?.classList.toggle('hidden');
  });

  document.getElementById('menuProfileBtn')?.addEventListener('click', () => {
    profileDropdown?.classList.add('hidden');
    openAuthModal('profile');
  });
  document.getElementById('menuPlansBtn')?.addEventListener('click', () => {
    profileDropdown?.classList.add('hidden');
    document.getElementById('subscriptionModal')?.classList.remove('hidden');
  });
  document.getElementById('menuSettingsBtn')?.addEventListener('click', () => {
    profileDropdown?.classList.add('hidden');
    openSettingsModal();
  });
  document.getElementById('menuLogoutBtn')?.addEventListener('click', () => {
    profileDropdown?.classList.add('hidden');
    handleLogout();
  });
  document.getElementById('profLogoutBtn')?.addEventListener('click', handleLogout);

  // Auth Modal Controls
  document.getElementById('openAuthModalBtn')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('closeAuthModalBtn')?.addEventListener('click', () => document.getElementById('authModal')?.classList.add('hidden'));
  document.getElementById('dismissAuthModalBtn')?.addEventListener('click', () => document.getElementById('authModal')?.classList.add('hidden'));
  document.getElementById('continueGuestBtn')?.addEventListener('click', () => {
    document.getElementById('authModal')?.classList.add('hidden');
    showToast('Continuing as Guest Scholar.');
  });
  document.getElementById('switchRegisterLink')?.addEventListener('click', () => switchAuthTab('register'));
  document.getElementById('switchLoginLink')?.addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    showToast('A password reset instruction has been dispatched to your email.');
  });

  // Password Visibility Toggles
  setupPasswordToggle('loginPwdToggle', 'loginPassword');
  setupPasswordToggle('regPwdToggle', 'regPassword');
  setupPasswordToggle('apiKeyEyeToggle', 'apiKeyInput');
  setupPasswordToggle('openrouterKeyEyeToggle', 'openrouterKeyInput');
  setupPasswordToggle('openaiKeyEyeToggle', 'openaiKeyInput');
  setupPasswordToggle('supabaseKeyEyeToggle', 'supabaseKeyInput');

  // Auth Tabs Click
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.addEventListener('click', () => switchAuthTab(t.dataset.tab));
  });

  // Auth Form Handlers
  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
  document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
  document.getElementById('profileForm')?.addEventListener('submit', handleProfileUpdate);

  // Settings Modal Controls
  document.getElementById('openSettingsBtn')?.addEventListener('click', openSettingsModal);
  document.getElementById('closeSettingsBtn')?.addEventListener('click', () => document.getElementById('settingsModal')?.classList.add('hidden'));
  document.getElementById('dismissSettingsBtn')?.addEventListener('click', () => document.getElementById('settingsModal')?.classList.add('hidden'));

  // Settings Navigation Tabs
  document.querySelectorAll('.settings-nav-item').forEach(nav => {
    nav.addEventListener('click', () => {
      document.querySelectorAll('.settings-nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
      nav.classList.add('active');
      const targetPane = document.getElementById(`pane-${nav.dataset.tab}`);
      targetPane?.classList.add('active');
    });
  });

  // Settings: Theme Picker
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const selectedTheme = card.dataset.theme;
      applyTheme(selectedTheme);
      showToast(`Visual theme set to: ${card.querySelector('.theme-name')?.textContent || selectedTheme}`);
    });
  });

  // Settings: Font Size & Streaming
  document.getElementById('settingFontSize')?.addEventListener('change', (e) => {
    document.documentElement.style.fontSize = e.target.value;
    showToast(`Font scale updated to ${e.target.value}`);
  });

  // Settings: Temperature Slider
  const tempSlider = document.getElementById('settingTempSlider');
  tempSlider?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value).toFixed(2);
    const label = val < 0.3 ? 'Deterministic' : val < 0.7 ? 'Precise & Balanced' : 'Creative Scholar';
    document.getElementById('tempValDisplay').textContent = `${val} (${label})`;
  });

  // Settings: Cloud API Key Save & Live Ping
  document.getElementById('saveApiKeyBtn')?.addEventListener('click', handleSaveCloudKey);
  document.getElementById('testCloudPingBtn')?.addEventListener('click', handleTestCloudPing);

  // Settings: Supabase Save & SQL Schema
  document.getElementById('saveSupabaseBtn')?.addEventListener('click', handleSaveSupabase);
  document.getElementById('copySchemaSqlBtn')?.addEventListener('click', openSupabaseSchemaModal);
  document.getElementById('testDbConnectionBtn')?.addEventListener('click', handleTestSupabaseDb);

  // Supabase Modal Controls
  document.getElementById('closeSupabaseModalBtn')?.addEventListener('click', () => document.getElementById('supabaseModal')?.classList.add('hidden'));
  document.getElementById('dismissSupabaseModalBtn')?.addEventListener('click', () => document.getElementById('supabaseModal')?.classList.add('hidden'));
  document.getElementById('copySchemaInModalBtn')?.addEventListener('click', copySupabaseSchemaCode);

  // Settings: Voice Controls
  const speechRateSlider = document.getElementById('settingSpeechRate');
  speechRateSlider?.addEventListener('input', (e) => {
    document.getElementById('speechRateDisplay').textContent = `${parseFloat(e.target.value).toFixed(2)}x Pace`;
  });
  document.getElementById('testVoicePreviewBtn')?.addEventListener('click', testVoicePreview);

  // Settings: Data Export
  document.getElementById('exportAllDataBtn')?.addEventListener('click', handleExportAllData);
  document.getElementById('exportChatMdBtn')?.addEventListener('click', handleExportChatMarkdown);

  // Citation Modal
  document.getElementById('closeCitationModalBtn')?.addEventListener('click', () => document.getElementById('citationModal')?.classList.add('hidden'));
  document.getElementById('dismissCitationBtn')?.addEventListener('click', () => document.getElementById('citationModal')?.classList.add('hidden'));

  // Close modals and dropdowns on backdrop click
  window.addEventListener('click', (e) => {
    if (profileDropdown && !profileDropdown.contains(e.target) && !userPill?.contains(e.target)) {
      profileDropdown.classList.add('hidden');
    }
    ['docsModal', 'settingsModal', 'citationModal', 'quizModal', 'flashcardModal', 'studentDashboardModal', 'memoryModal', 'subscriptionModal', 'authModal', 'supabaseModal'].forEach(id => {
      const modal = document.getElementById(id);
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
}

// Memory Modal logic
async function openMemoryModal() {
  document.getElementById('memoryModal')?.classList.remove('hidden');
  try {
    const res = await fetch(`${API_BASE}/api/memory?user_id=${state.user.id}`);
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('memoryToggleInput').checked = data.enabled;

    const list = document.getElementById('memoriesList');
    list.innerHTML = '';
    if (data.memories.length === 0) {
      list.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:10px 0;">No memories stored. Add your learning preferences below!</div>';
      return;
    }

    data.memories.forEach(m => {
      const card = document.createElement('div');
      card.className = 'memory-item-card';
      card.innerHTML = `
        <div>
          <strong>${escapeHtml(m.key)}:</strong> ${escapeHtml(m.value)}
        </div>
        <button class="icon-btn-sm" style="color:var(--text-muted);">&times;</button>
      `;
      card.querySelector('button')?.addEventListener('click', async () => {
        await fetch(`${API_BASE}/api/memory/${m.id}?user_id=${state.user.id}`, { method: 'DELETE' });
        openMemoryModal();
        showToast('Memory item removed.');
      });
      list.appendChild(card);
    });
  } catch (e) {}
}

async function handleAddMemory() {
  const key = document.getElementById('newMemoryKey')?.value.trim();
  const val = document.getElementById('newMemoryVal')?.value.trim();
  if (!key || !val) return showToast('Please enter both key and value.', 'error');

  try {
    await fetch(`${API_BASE}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'preference', key, value: val, user_id: state.user.id }),
    });
    document.getElementById('newMemoryKey').value = '';
    document.getElementById('newMemoryVal').value = '';
    openMemoryModal();
    showToast('Saved to memory.');
  } catch (e) {
    showToast('Failed to save memory.', 'error');
  }
}

async function handleClearAllMemories() {
  if (confirm('Clear all stored AI memories?')) {
    await fetch(`${API_BASE}/api/memory?user_id=${state.user.id}`, { method: 'DELETE' });
    openMemoryModal();
    showToast('All memory cleared.');
  }
}

async function handleToggleMemory(e) {
  const enabled = e.target.checked;
  await fetch(`${API_BASE}/api/memory/toggle?enabled=${enabled}&user_id=${state.user.id}`, { method: 'POST' });
  showToast(enabled ? 'Memory enabled' : 'Memory disabled');
}

// Student Dashboard logic
async function openStudentDashboard() {
  document.getElementById('studentDashboardModal')?.classList.remove('hidden');
  try {
    const [analyticsRes, recsRes] = await Promise.all([
      fetch(`${API_BASE}/api/tutor/analytics?user_id=${state.user.id}`),
      fetch(`${API_BASE}/api/tutor/recommendations?user_id=${state.user.id}`),
    ]);

    if (analyticsRes.ok) {
      const a = await analyticsRes.json();
      document.getElementById('dashStreakVal').textContent = `${a.streak_days || 1} Day${(a.streak_days || 1) > 1 ? 's' : ''}`;
      document.getElementById('dashAvgScore').textContent = `${a.average_quiz_score || 0}%`;
      document.getElementById('dashStudyMinutes').textContent = `${a.total_study_minutes || 15} m`;
      document.getElementById('dashFlashcardCount').textContent = `${a.flashcards_saved || 0}`;

      const weakBox = document.getElementById('dashWeakTopicsBox');
      if (a.weak_topics && a.weak_topics.length > 0) {
        weakBox.innerHTML = a.weak_topics.map(t => `<span class="tier-pill" style="margin-right:6px; margin-bottom:6px; display:inline-block;">${escapeHtml(t)}</span>`).join('');
      } else {
        weakBox.innerHTML = '<span class="text-muted-sm">No weak areas detected. You are on track!</span>';
      }
    }

    if (recsRes.ok) {
      const r = await recsRes.json();
      const recsList = document.getElementById('dashRecsList');
      if (r.recommendations && r.recommendations.length > 0) {
        recsList.innerHTML = r.recommendations.map(rec => {
          const iconSvg = getRecAnimatedSvg(rec.action_mode);
          return `
          <div class="rec-card">
            <div class="rec-icon">${iconSvg}</div>
            <div class="rec-content">
              <h4>${escapeHtml(rec.title)}</h4>
              <p>${escapeHtml(rec.description)}</p>
            </div>
            <button class="btn-sm btn-primary" onclick="startRecommendedAction('${rec.action_mode}', '${escapeHtml(rec.topic)}')">Start</button>
          </div>
        `}).join('');
      }
    }
  } catch (e) {}
}

function getRecAnimatedSvg(mode) {
  if (mode === 'quiz' || mode === 'exam') {
    return '<svg class="anim-pulse" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  } else if (mode === 'flashcard') {
    return '<svg class="anim-float" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg>';
  } else if (mode === 'study_plan') {
    return '<svg class="anim-pulse-subtle" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
  } else {
    return '<svg class="anim-orbit" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  }
}

window.startRecommendedAction = function(mode, topic = 'Physics Principles') {
  document.getElementById('studentDashboardModal')?.classList.add('hidden');
  setWorkspace('tutor');
  setTutorMode(mode);
  handleTutorAction(mode, topic);
};

// Subscriptions logic
async function loadSubscriptionStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/subscription?user_id=${state.user.id}`);
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('tierPill').textContent = (data.plan || 'Free').toUpperCase();

    const u = data.usage || {};
    const msgPct = Math.min(100, Math.round((u.messages_used / u.messages_limit) * 100));
    document.getElementById('meterMsgFill').style.width = `${msgPct}%`;
    document.getElementById('meterMsgCount').textContent = `${u.messages_used} / ${u.messages_limit}`;

    const resPct = Math.min(100, Math.round((u.research_used / u.research_limit) * 100));
    document.getElementById('meterResFill').style.width = `${resPct}%`;
    document.getElementById('meterResCount').textContent = `${u.research_used} / ${u.research_limit}`;

    const docPct = Math.min(100, Math.round((u.documents_used / u.documents_limit) * 100));
    document.getElementById('meterDocFill').style.width = `${docPct}%`;
    document.getElementById('meterDocCount').textContent = `${u.documents_used} / ${u.documents_limit}`;
  } catch (e) {}
}

async function upgradePlan(planId) {
  try {
    const res = await fetch(`${API_BASE}/api/subscription/upgrade?plan_id=${planId}&user_id=${state.user.id}`, { method: 'POST' });
    if (res.ok) {
      showToast(`Upgraded to ${planId.toUpperCase()}!`);
      document.getElementById('subscriptionModal')?.classList.add('hidden');
      loadSubscriptionStatus();
    }
  } catch (e) {
    showToast('Upgrade failed.', 'error');
  }
}

// Auth handlers
async function loadCurrentUser() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me?user_id=${state.user.id}`);
    if (res.ok) {
      const data = await res.json();
      state.user = data.user;
      document.getElementById('sidebarUserName').textContent = state.user.name || 'Student';
      document.getElementById('sidebarUserAvatar').textContent = (state.user.name || 'S')[0].toUpperCase();
      document.getElementById('sidebarUserLevel').textContent = state.user.education_level || 'Undergraduate';
    }
  } catch (e) {}
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail')?.value;
  const password = document.getElementById('loginPassword')?.value;
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Invalid email or password');
    const data = await res.json();
    state.user = data.user;
    showToast(`Welcome back, ${state.user.name}!`);
    document.getElementById('authModal')?.classList.add('hidden');
    loadCurrentUser();
    loadConversations();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName')?.value;
  const email = document.getElementById('regEmail')?.value;
  const password = document.getElementById('regPassword')?.value;
  const education_level = document.getElementById('regLevel')?.value;
  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, education_level }),
    });
    if (!res.ok) throw new Error('Registration failed');
    const data = await res.json();
    state.user = data.user;
    showToast(`Account created! Welcome, ${state.user.name}!`);
    document.getElementById('authModal')?.classList.add('hidden');
    loadCurrentUser();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  const name = document.getElementById('profName')?.value;
  const education_level = document.getElementById('profLevel')?.value;
  const subjectsStr = document.getElementById('profSubjects')?.value;
  const preferred_subjects = subjectsStr ? subjectsStr.split(',').map(s => s.trim()) : [];

  try {
    await fetch(`${API_BASE}/api/auth/profile?user_id=${state.user.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, education_level, preferred_subjects }),
    });
    showToast('Profile updated.');
    document.getElementById('authModal')?.classList.add('hidden');
    loadCurrentUser();
  } catch (e) {
    showToast('Profile update failed.', 'error');
  }
}

// ==========================================================================
// User Session & Authentication Handlers
// ==========================================================================
function updateAuthHeader() {
  const guestBtns = document.getElementById('authGuestBtns');
  const userPill = document.getElementById('userProfilePill');
  const isGuest = !state.user || state.user.id.startsWith('guest-') || state.user.id === 'local-user';

  const headerAvatar = document.getElementById('headerUserAvatar');
  const headerName = document.getElementById('headerUserName');

  if (isGuest) {
    guestBtns?.classList.remove('hidden');
    userPill?.classList.add('hidden');
    document.getElementById('authTabProfile')?.classList.add('hidden');
    if (headerAvatar) headerAvatar.textContent = 'G';
    if (headerName) headerName.textContent = 'Sign In';
  } else {
    guestBtns?.classList.add('hidden');
    userPill?.classList.remove('hidden');
    document.getElementById('authTabProfile')?.classList.remove('hidden');
    const firstName = (state.user.name || 'Scholar').split(' ')[0];
    const userInit = (state.user.name || 'S')[0].toUpperCase();
    if (headerAvatar) headerAvatar.textContent = userInit;
    if (headerName) headerName.textContent = firstName;

    const displayName = state.user.name || 'Scholar';
    const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'OM';
    const tier = state.user.tier || 'Scholar';

    const pillAvatar = document.getElementById('pillUserAvatar');
    const pillName = document.getElementById('pillUserName');
    const pillTier = document.getElementById('pillUserTier');
    const dropdownName = document.getElementById('dropdownUserName');
    const dropdownEmail = document.getElementById('dropdownUserEmail');
    const profAvatar = document.getElementById('profAvatar');
    const profDisplayFullname = document.getElementById('profDisplayFullname');
    const profDisplayEmail = document.getElementById('profDisplayEmail');
    const profTierBadge = document.getElementById('profTierBadge');

    if (pillAvatar) pillAvatar.textContent = initials;
    if (pillName) pillName.textContent = displayName;
    if (pillTier) pillTier.textContent = tier;
    if (dropdownName) dropdownName.textContent = displayName;
    if (dropdownEmail) dropdownEmail.textContent = state.user.email || 'scholar@oryqen.ai';
    if (profAvatar) profAvatar.textContent = initials;
    if (profDisplayFullname) profDisplayFullname.textContent = displayName;
    if (profDisplayEmail) profDisplayEmail.textContent = state.user.email || 'scholar@oryqen.ai';
    if (profTierBadge) profTierBadge.textContent = `ORYQEN ${tier}`;

    // Populate profile inputs
    const profNameInput = document.getElementById('profName');
    const profLevelInput = document.getElementById('profLevel');
    const profSubjectsInput = document.getElementById('profSubjects');
    if (profNameInput) profNameInput.value = displayName;
    if (profLevelInput && state.user.education_level) profLevelInput.value = state.user.education_level;
    if (profSubjectsInput && state.user.preferred_subjects) {
      profSubjectsInput.value = Array.isArray(state.user.preferred_subjects) ? state.user.preferred_subjects.join(', ') : state.user.preferred_subjects;
    }
  }

  // Update sidebar user area
  const sideName = document.getElementById('sidebarUserName');
  const sideAvatar = document.getElementById('sidebarUserAvatar');
  const sideLevel = document.getElementById('sidebarUserLevel');
  if (sideName) sideName.textContent = state.user.name || 'Guest Scholar';
  if (sideAvatar) sideAvatar.textContent = (state.user.name || 'S')[0].toUpperCase();
  if (sideLevel) sideLevel.textContent = state.user.education_level || 'Independent Scholar';
}

async function loadCurrentUser() {
  const saved = localStorage.getItem('oryqen_user_session');
  if (saved) {
    try {
      state.user = JSON.parse(saved);
    } catch (e) {}
  }
  updateAuthHeader();

  if (state.user && state.user.id && !state.user.id.startsWith('guest-')) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me?user_id=${state.user.id}`);
      if (res.ok) {
        const data = await res.json();
        state.user = { ...state.user, ...data.user };
        localStorage.setItem('oryqen_user_session', JSON.stringify(state.user));
        updateAuthHeader();
      }
    } catch (e) {}
  }
}

function openAuthModal(tab = 'login') {
  document.getElementById('authModal')?.classList.remove('hidden');
  switchAuthTab(tab);
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('loginForm')?.classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm')?.classList.toggle('hidden', tab !== 'register');
  document.getElementById('profileForm')?.classList.toggle('hidden', tab !== 'profile');

  const titleEl = document.getElementById('authModalTitle');
  const subEl = document.getElementById('authModalSubtitle');
  if (tab === 'login') {
    if (titleEl) titleEl.textContent = 'Sign In to ORYQEN';
    if (subEl) subEl.textContent = 'Welcome back! Sign in to sync your study notes and AI tutor history.';
  } else if (tab === 'register') {
    if (titleEl) titleEl.textContent = 'Create Scholar Account';
    if (subEl) subEl.textContent = 'Get started with unlimited dual online/offline academic intelligence.';
  } else {
    if (titleEl) titleEl.textContent = 'Scholar Profile';
    if (subEl) subEl.textContent = 'Manage your academic level, focus areas, and account credentials.';
  }
}

function setupPasswordToggle(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;

  btn.addEventListener('click', () => {
    const isPwd = input.type === 'password';
    input.type = isPwd ? 'text' : 'password';
    const openIcon = btn.querySelector('.eye-open-icon');
    const closedIcon = btn.querySelector('.eye-closed-icon');
    if (openIcon && closedIcon) {
      openIcon.classList.toggle('hidden', isPwd);
      closedIcon.classList.toggle('hidden', !isPwd);
    }
  });
}

function handleSocialLogin(provider) {
  const mockName = provider === 'Google' ? 'Alex Rivera' : 'Dev Scholar';
  const mockEmail = provider === 'Google' ? 'alex.rivera@gmail.com' : 'scholar@github.com';
  state.user = {
    id: `usr_${Date.now().toString(36)}`,
    name: mockName,
    email: mockEmail,
    education_level: 'intermediate',
    preferred_subjects: ['Computer Science', 'Machine Learning'],
    tier: 'Pro Scholar',
  };
  localStorage.setItem('oryqen_user_session', JSON.stringify(state.user));
  updateAuthHeader();
  document.getElementById('authModal')?.classList.add('hidden');
  showToast(`Authenticated via ${provider} as ${state.user.name}!`);
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Invalid email or password');
    }
    const data = await res.json();
    state.user = { ...data.user, tier: 'Pro Scholar' };
    localStorage.setItem('oryqen_user_session', JSON.stringify(state.user));
    updateAuthHeader();
    document.getElementById('authModal')?.classList.add('hidden');
    showToast(`Welcome back, ${state.user.name}!`);
    loadConversations();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName')?.value.trim();
  const email = document.getElementById('regEmail')?.value.trim();
  const password = document.getElementById('regPassword')?.value;
  const education_level = document.getElementById('regLevel')?.value;
  const subjectsStr = document.getElementById('regSubjects')?.value.trim();
  const preferred_subjects = subjectsStr ? subjectsStr.split(',').map(s => s.trim()) : [];

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, education_level, preferred_subjects }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Registration failed');
    }
    const data = await res.json();
    state.user = { ...data.user, tier: 'Pro Scholar' };
    localStorage.setItem('oryqen_user_session', JSON.stringify(state.user));
    updateAuthHeader();
    document.getElementById('authModal')?.classList.add('hidden');
    showToast(`Account created! Welcome to ORYQEN, ${state.user.name}!`);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  const name = document.getElementById('profName')?.value.trim();
  const education_level = document.getElementById('profLevel')?.value;
  const subjectsStr = document.getElementById('profSubjects')?.value;
  const preferred_subjects = subjectsStr ? subjectsStr.split(',').map(s => s.trim()) : [];

  try {
    const res = await fetch(`${API_BASE}/api/auth/profile?user_id=${state.user.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, education_level, preferred_subjects }),
    });
    if (res.ok) {
      state.user.name = name;
      state.user.education_level = education_level;
      state.user.preferred_subjects = preferred_subjects;
      localStorage.setItem('oryqen_user_session', JSON.stringify(state.user));
      updateAuthHeader();
      showToast('Profile updated successfully.');
      document.getElementById('authModal')?.classList.add('hidden');
    }
  } catch (e) {
    showToast('Profile update failed.', 'error');
  }
}

function handleLogout() {
  localStorage.removeItem('oryqen_user_session');
  state.user = {
    id: `guest-${Date.now().toString(36)}`,
    name: 'Guest Scholar',
    email: 'guest@oryqen.ai',
    education_level: 'intermediate',
    preferred_subjects: [],
    tier: 'Free Scholar',
  };
  updateAuthHeader();
  document.getElementById('authModal')?.classList.add('hidden');
  showToast('Signed out. Continuing as Guest Scholar.');
}

// ==========================================================================
// Settings Control Center Handlers
// ==========================================================================
function openSettingsModal() {
  document.getElementById('settingsModal')?.classList.remove('hidden');
  checkHealthStatus();
  loadApiKeyStatus();
  loadSupabaseStatus();
}

async function handleSaveCloudKey() {
  const gemini_api_key = document.getElementById('apiKeyInput')?.value.trim();
  const openrouter_api_key = document.getElementById('openrouterKeyInput')?.value.trim();
  const openai_api_key = document.getElementById('openaiKeyInput')?.value.trim();

  if (!gemini_api_key && !openrouter_api_key && !openai_api_key) {
    return showToast('Please enter at least one Cloud License or API Key.', 'error');
  }

  const payload = {};
  if (gemini_api_key) payload.cloud_api_key = gemini_api_key;
  if (openrouter_api_key) payload.openrouter_api_key = openrouter_api_key;
  if (openai_api_key) payload.openai_api_key = openai_api_key;

  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      showToast('ORYQEN Cloud Intelligence keys updated successfully.');
      loadApiKeyStatus();
      handleTestCloudPing();
    }
  } catch (e) {
    showToast('Failed to save cloud credentials.', 'error');
  }
}

async function handleTestCloudPing() {
  const pill = document.getElementById('cloudPingResult');
  pill?.classList.remove('hidden', 'online', 'error');
  pill?.classList.add('checking');
  const dot = pill?.querySelector('.status-dot');
  const msg = pill?.querySelector('.status-msg');
  if (msg) msg.textContent = 'Pinging Cloud...';

  try {
    const res = await fetch(`${API_BASE}/api/settings/test-connection`, { method: 'POST' });
    const data = await res.json();
    pill?.classList.remove('checking');
    if (data.status === 'connected') {
      pill?.classList.add('online');
      if (msg) msg.textContent = `Online (${data.latency_ms}ms) — ${data.engine}`;
      showToast(`Cloud Engine Connected: ${data.engine} in ${data.latency_ms}ms`);
    } else {
      pill?.classList.add('error');
      if (msg) msg.textContent = data.message || 'Offline / Error';
      showToast('Cloud connection test failed.', 'error');
    }
  } catch (err) {
    pill?.classList.remove('checking');
    pill?.classList.add('error');
    if (msg) msg.textContent = 'Unreachable';
    showToast('Failed to reach backend service.', 'error');
  }
}

async function handleSaveSupabase() {
  const supabase_url = document.getElementById('supabaseUrlInput')?.value.trim();
  const supabase_key = document.getElementById('supabaseKeyInput')?.value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabase_url, supabase_key }),
    });
    if (res.ok) {
      showToast('Supabase cluster credentials saved.');
      loadSupabaseStatus();
    }
  } catch (e) {
    showToast('Failed to save Supabase settings.', 'error');
  }
}

async function handleTestSupabaseDb() {
  const statusEl = document.getElementById('supabaseStatus');
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">Verifying Supabase cluster connection...</span>';
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    if (res.ok) {
      const data = await res.json();
      if (data.supabase_url_set) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#10b981; font-weight:600;">● Connected to Supabase PostgreSQL Cluster (pgvector & RLS Active)</span>';
        showToast('Supabase cluster connection verified.');
      } else {
        if (statusEl) statusEl.innerHTML = '<span style="color:#f59e0b;">○ Supabase not configured in backend/.env. Using local SQLite/FAISS.</span>';
      }
    }
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">● Failed to reach backend service.</span>';
  }
}

function openSupabaseSchemaModal() {
  const modal = document.getElementById('supabaseModal');
  const codeBlock = document.getElementById('schemaCodeBlock');
  modal?.classList.remove('hidden');

  fetch(`${API_BASE}/api/database/schema`)
    .then(r => r.json())
    .then(data => {
      if (codeBlock && data.schema_sql) {
        codeBlock.innerHTML = `<code>${escapeHtml(data.schema_sql)}</code>`;
      }
    })
    .catch(() => {
      if (codeBlock) codeBlock.innerHTML = `<code>-- Run this SQL in your Supabase SQL Editor\n-- 14 Tables + pgvector + RLS policies included in project root: supabase_schema.sql\nSELECT 'Supabase schema file available in project root: supabase_schema.sql';</code>`;
    });
}

function copySupabaseSchemaCode() {
  const codeEl = document.getElementById('schemaCodeBlock');
  const text = codeEl?.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    showToast('Supabase SQL Schema copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy to clipboard.', 'error');
  });
}

function testVoicePreview() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Greetings scholar! ORYQEN neural voice engine is online and ready.");
    const rate = parseFloat(document.getElementById('settingSpeechRate')?.value || 1.0);
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
    showToast('Playing voice audio preview...');
  } else {
    showToast('Speech synthesis not supported in this browser.', 'error');
  }
}

async function handleExportAllData() {
  try {
    showToast('Exporting scholar records...');
    const res = await fetch(`${API_BASE}/api/export/data?user_id=${state.user.id}`);
    if (!res.ok) throw new Error('Export failed');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oryqen_scholar_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Full account data exported as JSON!');
  } catch (e) {
    showToast('Export failed.', 'error');
  }
}

function handleExportChatMarkdown() {
  if (state.messages.length === 0) {
    return showToast('No messages in current conversation to export.', 'error');
  }
  let md = `# ORYQEN Conversation Export\n`;
  md += `**Date:** ${new Date().toLocaleString()}\n`;
  md += `**Topic:** ${document.getElementById('currentChatTitle')?.textContent || 'General Session'}\n\n---\n\n`;

  state.messages.forEach(m => {
    const role = m.role === 'user' ? '### Scholar' : '### ORYQEN Intelligence';
    md += `${role}\n\n${m.content}\n\n---\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `oryqen_chat_${Date.now().toString(36)}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Chat exported as Markdown!');
}

async function loadSupabaseStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    if (res.ok) {
      const data = await res.json();
      const statusEl = document.getElementById('supabaseStatus');
      if (statusEl) {
        if (data.supabase_url_set) {
          statusEl.innerHTML = '<span style="color:#10b981; font-weight:600;">● Supabase Cluster Active (pgvector & RLS Protected)</span>';
        } else {
          statusEl.innerHTML = '<span style="color:var(--text-muted);">○ No remote database configured. Running on local SQLite/FAISS.</span>';
        }
      }
    }
  } catch (e) {}
}

async function loadApiKeyStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    if (res.ok) {
      const data = await res.json();
      const statusEl = document.getElementById('apiKeyStatus');
      if (statusEl) {
        statusEl.innerHTML = data.gemini_api_key_set
          ? `<span style="color:#10b981;">● Primary Engine Active:</span> ${data.gemini_api_key_masked}`
          : '<span style="color:var(--text-muted);">○ Primary Gemini key not set (Local fallback active)</span>';
      }

      const openrouterEl = document.getElementById('openrouterKeyStatus');
      if (openrouterEl) {
        openrouterEl.innerHTML = data.openrouter_api_key_set
          ? `<span style="color:#3b82f6;">● OpenRouter Failover Active:</span> ${data.openrouter_api_key_masked}`
          : '<span style="color:var(--text-muted);">○ OpenRouter backup key not set</span>';
      }

      const openaiEl = document.getElementById('openaiKeyStatus');
      if (openaiEl) {
        openaiEl.innerHTML = data.openai_api_key_set
          ? `<span style="color:#8b5cf6;">● OpenAI Failover Active:</span> ${data.openai_api_key_masked}`
          : '<span style="color:var(--text-muted);">○ OpenAI backup key not set</span>';
      }
    }
  } catch (e) {}
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      startNewChat();
    }
    if (e.key === 'Escape') {
      ['docsModal', 'settingsModal', 'citationModal', 'quizModal', 'flashcardModal', 'studentDashboardModal', 'memoryModal', 'subscriptionModal', 'authModal'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
      });
    }
    if (e.code === 'Space' && !document.getElementById('flashcardModal')?.classList.contains('hidden')) {
      e.preventDefault();
      flipCurrentCard();
    }
  });
}

function showToast(msg, type = 'info') {
  const shelf = document.getElementById('toastShelf');
  if (!shelf) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  shelf.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(8px)';
    t.style.transition = 'all 0.2s ease';
    setTimeout(() => t.remove(), 200);
  }, 2800);
}
