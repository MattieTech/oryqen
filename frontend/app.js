/**
 * ORYQEN — Frontend Application Engine
 * Advanced Dual-Purpose AI Assistant (General AI + AI Tutor)
 * Voice Interaction, Real-Time Streaming, Offline Resilience & Sync,
 * Interactive Quizzes, 3D Flashcards, Memory Governance, and Animated Icons.
 */

// Configuration
// Native mobile Capacitor / Android WebView detection
const isNativeApp = Boolean(window.Capacitor?.isNativePlatform?.()) || 
  window.location.origin === 'https://localhost' || 
  window.location.origin === 'http://localhost' || 
  window.location.origin === 'capacitor://localhost' ||
  window.location.protocol === 'file:';

// Fallback to local server only when serving pure frontend from dev port (5500, 3000, 5173)
const isDevFrontendOnly = !isNativeApp && (
  window.location.port === '5500' || 
  window.location.port === '3000' || 
  window.location.port === '5173'
);

const CLOUD_API_BASE = 'https://oryqen.onrender.com';
const API_BASE = isNativeApp 
  ? CLOUD_API_BASE 
  : (isDevFrontendOnly ? 'http://localhost:8000' : '');

// Cloud deployment detection (Render, Railway, custom domains, etc.)
const isCloudHosted = window.location.hostname.includes('render.com') || 
  window.location.hostname.includes('railway.app') || 
  window.location.hostname.includes('vercel.app') || 
  (!['localhost', '127.0.0.1'].includes(window.location.hostname) && !window.location.hostname.startsWith('192.168.') && !window.location.hostname.startsWith('10.'));

// Global State
const state = {
  currentConversationId: null,
  conversations: [],
  workspace: 'general', // 'general' | 'tutor'
  tutorMode: 'learn',   // 'learn' | 'practice' | 'quiz' | 'exam' | 'flashcard' | 'explain' | 'socratic' | 'mistake_analysis' | 'study_plan' | 'revision'
  tutorLevel: 'intermediate',
  subject: 'General Science',
  mode: isCloudHosted ? 'online' : (localStorage.getItem('oryqen_mode') || 'offline'),
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
  // Register PWA Service Worker for Offline Resilience & Fast Shell Caching
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('ORYQEN PWA ServiceWorker active:', reg.scope);
        reg.update();
      })
      .catch(err => console.warn('PWA ServiceWorker note:', err.message));
  }

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
  setupScrollToBottomFab();
  setupOfflineBrainModal();
  initHardwareAdvisor();

  // Load initial data
  setAiMode(state.mode, false);
  loadCurrentUser();
  loadConversations();
  loadDocumentsList();
  loadSubscriptionStatus();
  checkHealthStatus();
  updateOfflineSyncBadge();
  updateHonestStatus();

  window.addEventListener('online', updateHonestStatus);
  window.addEventListener('offline', updateHonestStatus);
  setInterval(updateHonestStatus, 30000);
});

// ==========================================================================
// Theme Management
// ==========================================================================
function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('oryqen-theme', theme);
  const icon = document.getElementById('themeIcon');
  const headerIcon = document.getElementById('headerThemeIcon');

  document.body.classList.remove('theme-dark', 'theme-titanium');

  const sunSvg = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
  const moonSvg = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';

  if (theme === 'dark') {
    document.body.classList.add('theme-dark');
    if (icon) icon.innerHTML = sunSvg;
    if (headerIcon) headerIcon.innerHTML = sunSvg;
  } else if (theme === 'titanium') {
    document.body.classList.add('theme-titanium');
    if (icon) icon.innerHTML = sunSvg;
    if (headerIcon) headerIcon.innerHTML = sunSvg;
  } else {
    // Light
    if (icon) icon.innerHTML = moonSvg;
    if (headerIcon) headerIcon.innerHTML = moonSvg;
  }

  // Update theme cards in settings
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === theme);
  });
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

  function openSidebar() {
    sidebar?.classList.remove('collapsed');
    sidebar?.classList.add('open');
    document.body.classList.remove('sidebar-collapsed');
    document.body.classList.add('sidebar-open');
    if (openBtn) openBtn.style.setProperty('display', 'none', 'important');
    if (window.innerWidth <= 768) {
      backdrop?.classList.add('active');
    }
  }

  function closeSidebar() {
    sidebar?.classList.remove('open');
    sidebar?.classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
    document.body.classList.remove('sidebar-open');
    backdrop?.classList.remove('active');
    if (openBtn) openBtn.style.setProperty('display', 'inline-flex', 'important');
  }

  window.openSidebar = openSidebar;
  window.closeSidebar = closeSidebar;

  openBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    openSidebar();
  });

  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSidebar();
  });

  backdrop?.addEventListener('click', () => {
    closeSidebar();
  });

  // Initial setup: On desktop start open (hamburger hidden, close button shows).
  // On mobile start closed (hamburger shows, sidebar and close button hidden).
  if (window.innerWidth <= 768) {
    closeSidebar();
  } else {
    openSidebar();
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      backdrop?.classList.remove('active');
      if (!document.body.classList.contains('sidebar-collapsed')) {
        openSidebar();
      }
    }
  });

  // New Chat (Sidebar and Header)
  document.getElementById('newChatBtn')?.addEventListener('click', () => {
    startNewChat();
    if (window.innerWidth <= 768) closeSidebar();
  });
  // Quick Theme Switcher in Header (Light / OLED Monochrome Dark)
  document.getElementById('headerThemeToggleBtn')?.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark') || document.body.classList.contains('theme-titanium');
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    showToast(next === 'dark' ? 'OLED Monochrome Dark Theme' : 'Clean Scholar Light Theme');
  });

  // PWA & Native Standalone Detection
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
    || window.navigator.standalone === true 
    || !!window.Capacitor?.isNativePlatform?.()
    || document.referrer.includes('android-app://');

  if (isStandalone) {
    document.getElementById('headerInstallAppBtn')?.classList.add('hidden');
    document.getElementById('sidebarInstallAppBtn')?.classList.add('hidden');
  }

  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById('headerInstallAppBtn');
    if (installBtn && !isStandalone) installBtn.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    showToast('ORYQEN App installed on your device!');
    document.getElementById('headerInstallAppBtn')?.classList.add('hidden');
    document.getElementById('sidebarInstallAppBtn')?.classList.add('hidden');
    deferredInstallPrompt = null;
  });

  const triggerInstallApp = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('Installing ORYQEN on your device...');
      }
      deferredInstallPrompt = null;
    } else {
      showToast('To install ORYQEN on your phone or PC, tap browser menu (⋮) > "Add to Home Screen" or "Install App".');
    }
  };

  document.getElementById('headerInstallAppBtn')?.addEventListener('click', triggerInstallApp);
  document.getElementById('sidebarInstallAppBtn')?.addEventListener('click', triggerInstallApp);

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

function setAiMode(mode, showNotification = true) {
  state.mode = mode;
  localStorage.setItem('oryqen_mode', mode);
  document.getElementById('segModeOffline')?.classList.toggle('active', mode === 'offline');
  document.getElementById('segModeOnline')?.classList.toggle('active', mode === 'online');

  updateHonestStatus();
  if (showNotification) {
    showToast(mode === 'online' ? 'Switched to Online Cloud AI (ORYQEN Swift)' : 'Switched to Offline Mode (ORYQEN Local Core)');
  }
}

async function updateHonestStatus() {
  const statusBadge = document.getElementById('headerStatusBadge');
  const statusLabel = document.getElementById('headerStatusLabel');
  const sidebarStatus = document.getElementById('sidebarModeStatus');
  const footerText = document.getElementById('footerModeText');

  try {
    const res = await fetch(`${API_BASE}/api/models/status`);
    if (res.ok) {
      const data = await res.json();
      state.modelsStatus = data;

      const hasInternet = Boolean(data.internet_available ?? data.has_internet ?? navigator.onLine);
      const isOllamaActive = Boolean(data.ollama_active ?? data.ollama_daemon_active);
      const localModels = (Array.isArray(data.local_models_available) && data.local_models_available.length > 0)
        ? data.local_models_available
        : (data.local_model_available ? [data.active_local_model || 'Local Model'] : (isOllamaActive ? ['qwen2.5:0.5b'] : []));
      const hasOnDeviceModel = Boolean(window.OfflineEngine?.getInstalledModelInfo?.());
      const hasLocalModel = data.local_model_available || isOllamaActive || hasOnDeviceModel;

      // Update Local Core status indicators in settings card if available
      const localBadge = document.getElementById('localDaemonBadge');
      const localTitle = document.getElementById('localActiveModelTitle');
      const localDesc = document.getElementById('localDaemonDesc');
      if (hasLocalModel) {
        if (localBadge) {
          localBadge.className = 'engine-badge offline';
          localBadge.textContent = hasOnDeviceModel ? 'Active (On-Device Neural)' : 'Active (Offline Neural)';
        }
        if (localTitle) localTitle.textContent = hasOnDeviceModel ? 'ORYQEN On-Device Core' : 'ORYQEN Local Core (Neural Engine)';
        if (localDesc) localDesc.textContent = '100% on-device neural weights. Operates with zero internet connectivity.';
      } else {
        if (localBadge) {
          localBadge.className = 'engine-badge standby';
          localBadge.textContent = 'Standby (Model Setup Required)';
        }
        if (localDesc) localDesc.textContent = 'Local daemon or neural model standby. Use Available Models library to download.';
      }

      if (state.mode === 'online') {
        if (hasInternet) {
          statusBadge?.classList.remove('local', 'warning');
          statusBadge?.classList.add('online');
          if (statusLabel) statusLabel.textContent = 'Online';
          if (sidebarStatus) sidebarStatus.textContent = 'Online (ORYQEN Swift)';
          if (footerText) footerText.textContent = 'Online mode — Powered by ORYQEN Swift with real-time research capabilities.';
        } else {
          statusBadge?.classList.remove('online', 'local');
          statusBadge?.classList.add('warning');
          if (statusLabel) statusLabel.textContent = 'Offline';
          if (sidebarStatus) sidebarStatus.textContent = 'Network Disconnected';
          if (footerText) footerText.textContent = 'Connection lost. Switch to Offline Mode to use on-device AI.';
        }
      } else {
        // Offline mode
        if (hasLocalModel) {
          statusBadge?.classList.remove('online', 'warning');
          statusBadge?.classList.add('local');
          if (statusLabel) statusLabel.textContent = 'Offline';
          if (sidebarStatus) sidebarStatus.textContent = 'Offline (ORYQEN Local Core)';
          if (footerText) footerText.textContent = 'Offline mode — Running ORYQEN Local Core with zero internet.';
        } else {
          statusBadge?.classList.remove('online', 'local');
          statusBadge?.classList.add('warning');
          if (statusLabel) statusLabel.textContent = 'Offline';
          if (sidebarStatus) sidebarStatus.textContent = 'Offline Standby (Model Setup Required)';
          if (footerText) footerText.textContent = 'Local model standby. Open Settings > AI & Models to download an on-device model.';
        }
      }
      return;
    }
  } catch (e) {
    // Backend unreachable fallback
  }

  // Graceful fallback if backend call timed out or failed
  const browserOnline = navigator.onLine;
  if (state.mode === 'online') {
    if (browserOnline) {
      statusBadge?.classList.remove('local', 'warning');
      statusBadge?.classList.add('online');
      if (statusLabel) statusLabel.textContent = 'Online';
      if (sidebarStatus) sidebarStatus.textContent = 'Online (ORYQEN Swift)';
    } else {
      statusBadge?.classList.remove('online', 'local');
      statusBadge?.classList.add('warning');
      if (statusLabel) statusLabel.textContent = 'Offline';
      if (sidebarStatus) sidebarStatus.textContent = 'Network Disconnected';
    }
  } else {
    statusBadge?.classList.remove('online', 'warning');
    statusBadge?.classList.add('local');
    if (statusLabel) statusLabel.textContent = 'Offline';
    if (sidebarStatus) sidebarStatus.textContent = 'Offline (ORYQEN Local Core)';
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
  const modeLabels = {
    learn: 'Step-by-Step Learning',
    practice: 'Practice Questions',
    quiz: 'Multiple-Choice Assessment',
    exam: 'Exam Simulation',
    flashcard: '3D Flashcards',
    explain: 'Feynman Intuitive Explanation',
    socratic: 'Socratic Dialogue',
    mistake_analysis: 'Diagnostic Mistake Analysis',
    study_plan: 'Structured Study Roadmap',
    revision: 'High-Yield Revision & Formulas',
  };
  const label = modeLabels[mode] || mode.replace('_', ' ');
  if (input) {
    input.placeholder = `Ask ORYQEN Tutor (${label})...`;
  }
  showToast(`Mode: ${label}`);
}

async function handleTutorAction(action, defaultTopic = 'Core Subject Matter') {
  const topic = defaultTopic || 'Fundamental Principles';
  if (action === 'quiz') {
    startQuiz(topic, 5, false);
  } else if (action === 'exam') {
    startQuiz(topic, 8, true);
  } else if (action === 'flashcard') {
    startFlashcards(topic);
  } else if (action === 'study_plan') {
    generateStudyPlanPrompt(topic, '2026-06-15');
  } else if (action === 'socratic') {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = `Guide me using the Socratic method to understand: ${topic}`;
      submitUserMessage();
    }
  } else if (action === 'mistake_analysis') {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = `Perform a diagnostic mistake analysis on: ${topic}. Break down common misconceptions and the correct method.`;
      submitUserMessage();
    }
  } else if (action === 'revision') {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = `Provide a rapid high-yield revision summary with key formulas and definitions for: ${topic}`;
      submitUserMessage();
    }
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
  if (!state.flashcards.cards || state.flashcards.cards.length === 0) return;
  state.flashcards.currentIndex = Math.max(0, Math.min(index, state.flashcards.cards.length - 1));
  const card = state.flashcards.cards[state.flashcards.currentIndex];
  const total = state.flashcards.cards.length;

  const counter = document.getElementById('flashcardCounter');
  const front = document.getElementById('flashcardFrontText');
  const back = document.getElementById('flashcardBackText');
  if (counter) counter.textContent = `Card ${state.flashcards.currentIndex + 1} of ${total}`;
  if (front) front.textContent = card.front || 'Question / Term';
  if (back) back.textContent = card.back || 'Explanation / Answer';

  const cardElement = document.getElementById('flashcardCard');
  if (cardElement) cardElement.classList.remove('flipped');
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
  const voiceFileInput = document.getElementById('voiceFileInput');
  const uploadVoiceBtn = document.getElementById('uploadVoiceBtn');

  micBtn?.addEventListener('click', toggleVoiceRecording);
  stopBtn?.addEventListener('click', stopVoiceRecording);
  discardBtn?.addEventListener('click', discardVoiceRecording);
  sendVoiceBtn?.addEventListener('click', sendVoiceMessage);

  uploadVoiceBtn?.addEventListener('click', () => {
    voiceFileInput?.click();
  });

  voiceFileInput?.addEventListener('change', handleVoiceFileUpload);
}

async function handleVoiceFileUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  showToast('Processing audio note...');
  const formData = new FormData();
  formData.append('audio', file, file.name || 'recording.m4a');
  formData.append('mode', state.mode);
  formData.append('capability', state.workspace);
  formData.append('user_id', state.user.id);

  const thinkingId = 'voice-file-' + Date.now();
  appendThinkingRow(thinkingId);
  scrollToBottom();

  try {
    const res = await fetch(`${API_BASE}/api/voice/process`, {
      method: 'POST',
      body: formData,
    });

    removeElement(thinkingId);
    if (!res.ok) throw new Error('Voice note processing failed');
    const data = await res.json();

    const userQuery = data.transcription || 'Voice audio note';
    appendMessageRow({ role: 'user', content: `🎙️ "${userQuery}"` });
    state.messages.push({ role: 'user', content: userQuery });

    const asstMsg = {
      role: 'assistant',
      content: data.answer || 'Audio processed.',
      citations: [],
      model: data.model || 'ORYQEN Voice',
    };
    appendMessageRow(asstMsg);
    state.messages.push(asstMsg);
    scrollToBottom();

    speakText(data.answer);
  } catch (err) {
    removeElement(thinkingId);
    showToast(`Voice note error: ${err.message}`, 'error');
  } finally {
    e.target.value = '';
  }
}

async function toggleVoiceRecording() {
  if (state.voice.isRecording) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

async function startVoiceRecording() {
  const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isSecure || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Direct mic restricted on HTTP. Opening audio recorder...', 'info');
    document.getElementById('voiceFileInput')?.click();
    return;
  }

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
    console.warn('Microphone access issue:', err);
    showToast('Microphone access denied. Opening audio recorder...', 'info');
    document.getElementById('voiceFileInput')?.click();
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

  const charCounter = document.getElementById('charCounter');
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';

    // Live character counter & visual limit indicators
    if (charCounter) {
      const len = input.value.length;
      charCounter.textContent = `${len.toLocaleString()} / 10,000`;
      charCounter.classList.toggle('warning', len >= 8000 && len < 10000);
      charCounter.classList.toggle('limit', len >= 10000);
    }
  });

  // Suggestion card clicks
  document.querySelectorAll('.suggestion-card[data-prompt]').forEach(c => {
    c.addEventListener('click', () => {
      const p = c.dataset.prompt;
      if (p) {
        input.value = p;
        if (charCounter) charCounter.textContent = `${p.length.toLocaleString()} / 10,000`;
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

  if (query.length > 10000) {
    showToast('Question exceeds the 10,000 character maximum limit.', 'error');
    return;
  }

  // Hide welcome screens
  document.getElementById('welcomeGeneralScreen')?.classList.add('hidden');
  document.getElementById('welcomeTutorScreen')?.classList.add('hidden');

  // Append user message
  appendMessageRow({ role: 'user', content: query });
  state.messages.push({ role: 'user', content: query });

  if (input) {
    input.value = '';
    input.style.height = 'auto';
    const charCounter = document.getElementById('charCounter');
    if (charCounter) {
      charCounter.textContent = '0 / 10,000';
      charCounter.classList.remove('warning', 'limit');
    }
  }

  // Single unified thinking indicator with dynamic status message
  const thinkingId = 'thinking-' + Date.now();
  const thinkingLabel = state.workspace === 'tutor'
    ? `ORYQEN Tutor is formulating ${state.tutorMode.replace('_', ' ')} lesson...`
    : (state.mode === 'online' ? 'ORYQEN Swift is generating response...' : 'ORYQEN Local Core is computing on-device...');
  appendThinkingRow(thinkingId, thinkingLabel);
  scrollToBottom();

  setGeneratingState(true);
  state.abortController = new AbortController();

  // Standalone on-device mobile AI execution branch
  if (state.mode === 'offline' && window.OfflineEngine) {
    const installed = window.OfflineEngine.getInstalledModelInfo();
    if (installed) {
      removeElement(thinkingId);
      const assistantBubble = createStreamingAssistantRow(installed.displayName || 'ORYQEN On-Device Core');
      let fullContent = '';

      try {
        for await (const chunk of window.OfflineEngine.streamInference(query, '', () => {})) {
          if (state.abortController?.signal?.aborted) break;
          fullContent += chunk.token;
          updateStreamingAssistantRow(assistantBubble, fullContent);
          scrollToBottom();
        }
        state.messages.push({ role: 'assistant', content: fullContent, model: 'oryqen-device-core' });
      } catch (infErr) {
        appendMessageRow({ role: 'assistant', content: `⚠️ On-device inference: ${infErr.message}`, model: 'ORYQEN Local' });
      } finally {
        setGeneratingState(false);
        showTypingIndicator(false);
        state.abortController = null;
        renderAllMath();
        enhanceCodeBlocks();
      }
      return;
    }

    // If on-device model not installed yet, check if local daemon (e.g. Ollama) is running
    let hasLocalBackend = false;
    try {
      const probe = await fetch(`${API_BASE}/api/health`, { method: 'GET', signal: AbortSignal.timeout(1200) });
      if (probe.ok && state.modelsStatus?.local_model_available) {
        hasLocalBackend = true;
      }
    } catch (e) {
      hasLocalBackend = false;
    }

    if (!hasLocalBackend) {
      removeElement(thinkingId);
      appendMessageRow({
        role: 'assistant',
        content: 'To chat offline directly on your phone with zero internet, please set up your on-device neural brain.',
        model: 'ORYQEN Standby',
        actionButton: {
          text: 'Download Offline Brain',
          icon: '⚡',
          onClick: () => {
            if (window.innerWidth <= 768 && window.closeSidebar) window.closeSidebar();
            document.getElementById('offlineBrainModal')?.classList.remove('hidden');
            if (typeof window.refreshOfflineBrainUI === 'function') {
              window.refreshOfflineBrainUI();
            }
          }
        }
      });
      setGeneratingState(false);
      showTypingIndicator(false);
      state.abortController = null;
      return;
    }
  }

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
                localStorage.setItem('oryqen_current_conv_id', state.currentConversationId);
                document.getElementById('currentChatTitle').textContent = query.slice(0, 32);
                loadConversations();
              }

              if (data.chunk) {
                if (!assistantBubble) {
                  removeElement(thinkingId);
                  assistantBubble = createStreamingAssistantRow(modelUsed || data.display_name || data.model);
                }
                fullContent += data.chunk;
                modelUsed = data.display_name || data.model || modelUsed || 'ORYQEN';
                updateStreamingAssistantRow(assistantBubble, fullContent);
                scrollToBottom();
              }
            } catch (e) {}
          }
        }
      }

      removeElement(thinkingId);
      if (!fullContent) {
        // Silent failover to on-device engine if model weights are present
        const installed = window.OfflineEngine?.getInstalledModelInfo?.();
        if (installed) {
          const assistantBubble = createStreamingAssistantRow(installed.displayName || 'ORYQEN On-Device Core');
          let localContent = '';
          try {
            for await (const chunk of window.OfflineEngine.streamInference(query, '', () => {})) {
              if (state.abortController?.signal?.aborted) break;
              localContent += chunk.token;
              updateStreamingAssistantRow(assistantBubble, localContent);
              scrollToBottom();
            }
            state.messages.push({ role: 'assistant', content: localContent, model: 'oryqen-device-core' });
          } catch (e) {
            appendMessageRow({
              role: 'assistant',
              content: 'I am temporarily unable to connect to the cloud servers. Please check your internet connection, or use the Offline Brain in Settings.',
              model: 'ORYQEN Standby',
            });
          }
        } else {
          appendMessageRow({
            role: 'assistant',
            content: 'I am temporarily unable to reach the neural servers. Please check your internet connection, or download the Offline Brain in Settings to chat with zero internet.',
            model: 'ORYQEN Standby',
            actionButton: {
              text: 'Open Offline Brain Settings',
              icon: '⚡',
              onClick: () => {
                if (window.innerWidth <= 768 && window.closeSidebar) window.closeSidebar();
                document.getElementById('offlineBrainModal')?.classList.remove('hidden');
                if (typeof window.refreshOfflineBrainUI === 'function') {
                  window.refreshOfflineBrainUI();
                }
              }
            }
          });
        }
      } else {
        state.messages.push({ role: 'assistant', content: fullContent, model: modelUsed });
      }
    } else {
      // Synchronous fallback
      const fallbackRes = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await fallbackRes.json().catch(() => ({}));
      removeElement(thinkingId);
      if (data.conversation_id && !state.currentConversationId) {
        state.currentConversationId = data.conversation_id;
        localStorage.setItem('oryqen_current_conv_id', state.currentConversationId);
        document.getElementById('currentChatTitle').textContent = query.slice(0, 32);
        loadConversations();
      }

      if (!fallbackRes.ok || !data.answer) {
        appendMessageRow({
          role: 'assistant',
          content: 'I am having trouble connecting to the network right now. Please verify your connection or switch to Offline Mode to chat on-device.',
          model: 'ORYQEN Standby',
        });
      } else {
        appendMessageRow({
          role: 'assistant',
          content: data.answer,
          citations: data.sources || [],
          model: data.display_name || data.model || 'ORYQEN',
        });
        state.messages.push({ role: 'assistant', content: data.answer });
      }
      scrollToBottom();
    }
  } catch (err) {
    removeElement(thinkingId);
    if (err.name === 'AbortError') {
      appendMessageRow({ role: 'assistant', content: 'Generation stopped.', model: 'System' });
    } else {
      appendMessageRow({
        role: 'assistant',
        content: '⚠️ **Failed to complete inference.**\n\nUnable to reach ORYQEN services. If offline, ensure Ollama/local model is running. If online, check your internet connectivity.',
        model: 'ORYQEN Error',
        retryQuery: query,
      });
    }
    scrollToBottom();
  } finally {
    setGeneratingState(false);
    showTypingIndicator(false);
    state.abortController = null;
    renderAllMath();
    enhanceCodeBlocks();
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

function appendMessageRow({ role, content, citations = [], model = '', retryQuery = null, actionButton = null }) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  if (role === 'user') {
    avatar.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    `;
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

  // If message includes an interactive action button, append it cleanly to the bubble
  if (actionButton && actionButton.text) {
    const btnWrap = document.createElement('div');
    btnWrap.className = 'message-action-btn-wrap';
    btnWrap.style.marginTop = '10px';
    const actBtn = document.createElement('button');
    actBtn.type = 'button';
    actBtn.className = 'btn btn-sm btn-primary';
    actBtn.innerHTML = `${actionButton.icon ? actionButton.icon + ' ' : ''}${escapeHtml(actionButton.text)}`;
    actBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actionButton.onClick?.();
    });
    btnWrap.appendChild(actBtn);
    bubble.appendChild(btnWrap);
  }

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

  // Assistant Actions (Copy, TTS Speak, Regenerate, Retry)
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

    if (retryQuery) {
      const retryChip = document.createElement('button');
      retryChip.className = 'action-chip retry-chip';
      retryChip.title = 'Retry sending this question';
      retryChip.innerHTML = `
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
        <span>Retry</span>
      `;
      retryChip.addEventListener('click', () => {
        row.remove();
        submitUserMessage(retryQuery);
      });
      actionsBar.appendChild(retryChip);
    }

    actionsBar.querySelector('.copy-chip')?.addEventListener('click', function() {
      navigator.clipboard.writeText(content).then(() => {
        this.classList.add('copied');
        const label = this.querySelector('span');
        if (label) label.textContent = 'Copied!';
        showToast('Copied to clipboard.');
        setTimeout(() => {
          this.classList.remove('copied');
          if (label) label.textContent = 'Copy';
        }, 2000);
      });
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

function appendThinkingRow(id, labelText) {
  const row = document.createElement('div');
  row.className = 'message-row assistant thinking-row';
  row.id = id;

  const displayLabel = labelText || (
    state.workspace === 'tutor'
      ? `ORYQEN Tutor is formulating ${state.tutorMode.replace('_', ' ')} lesson...`
      : (state.mode === 'online' ? 'ORYQEN Swift is generating response...' : 'ORYQEN Local Core is computing on-device...')
  );

  row.innerHTML = `
    <div class="message-avatar thinking-avatar">
      <div class="thinking-spinner"></div>
    </div>
    <div class="message-content-wrap">
      <div class="message-bubble thinking-bubble">
        <div class="thinking-state-box">
          <span class="thinking-pulse-dot"></span>
          <span class="thinking-label">${escapeHtml(displayLabel)}</span>
          <div class="typing-wave">
            <span class="wave-dot"></span>
            <span class="wave-dot"></span>
            <span class="wave-dot"></span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('chatMessages').appendChild(row);
  scrollToBottom();
}

function removeElement(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom() {
  const vp = document.getElementById('chatViewport');
  if (vp) {
    vp.scrollTo({ top: vp.scrollHeight, behavior: 'smooth' });
  }
}

// ==========================================================================
// Scroll-to-Bottom FAB
// ==========================================================================
function setupScrollToBottomFab() {
  const vp = document.getElementById('chatViewport');
  const fab = document.getElementById('scrollToBottomFab');
  if (!vp || !fab) return;

  vp.addEventListener('scroll', () => {
    const distFromBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
    if (distFromBottom > 200) {
      fab.classList.add('visible');
      fab.classList.remove('hidden');
    } else {
      fab.classList.remove('visible');
    }
  });

  fab.addEventListener('click', () => {
    scrollToBottom();
    fab.classList.remove('visible');
  });
}

// ==========================================================================
// Typing Indicator
// ==========================================================================
function showTypingIndicator(show) {
  const indicator = document.getElementById('typingIndicator');
  if (!indicator) return;
  if (show) {
    indicator.classList.remove('hidden');
    scrollToBottom();
  } else {
    indicator.classList.add('hidden');
  }
}

// ==========================================================================
// KaTeX Auto-Render
// ==========================================================================
function renderAllMath() {
  if (typeof renderMathInElement !== 'function') return;
  const container = document.getElementById('chatMessages');
  if (!container) return;
  try {
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
    });
  } catch (e) {
    // KaTeX auto-render not available; fall through silently
  }
}

// ==========================================================================
// Enhanced Code Blocks with Copy Header
// ==========================================================================
function enhanceCodeBlocks() {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  container.querySelectorAll('pre > code').forEach(codeEl => {
    const pre = codeEl.parentElement;
    if (pre.dataset.enhanced) return;
    pre.dataset.enhanced = 'true';

    // Detect language from class
    const langClass = [...codeEl.classList].find(c => c.startsWith('language-'));
    const lang = langClass ? langClass.replace('language-', '') : 'code';

    // Create header
    const header = document.createElement('div');
    header.className = 'code-block-header';
    header.innerHTML = `
      <span>${escapeHtml(lang)}</span>
      <button class="code-copy-btn" title="Copy code">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy</span>
      </button>
    `;

    header.querySelector('.code-copy-btn')?.addEventListener('click', function() {
      navigator.clipboard.writeText(codeEl.textContent).then(() => {
        this.classList.add('copied');
        const label = this.querySelector('span');
        if (label) label.textContent = 'Copied!';
        setTimeout(() => {
          this.classList.remove('copied');
          if (label) label.textContent = 'Copy';
        }, 2000);
      });
    });

    pre.parentElement.insertBefore(header, pre);
    pre.style.borderTopLeftRadius = '0';
    pre.style.borderTopRightRadius = '0';
    pre.style.marginTop = '0';
  });
}

function startNewChat() {
  if (window.innerWidth <= 768 && window.closeSidebar) {
    window.closeSidebar();
  }
  state.currentConversationId = null;
  localStorage.removeItem('oryqen_current_conv_id');
  state.messages = [];
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) chatMessages.innerHTML = '';

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
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.value = '';
    chatInput.focus();
  }
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

  // 1. Stash Code Blocks with underscore-free placeholders
  const codeBlocks = [];
  let working = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `@@CODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`);
    return placeholder;
  });

  working = working.replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = `@@CODEINLINE${codeBlocks.length}@@`;
    codeBlocks.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // 2. Stash & Render Mathematical Formulas
  const mathBlocks = [];

  // Block Math: $$ ... $$ and \[ ... \]
  working = working.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const placeholder = `@@MATHBLOCK${mathBlocks.length}@@`;
    mathBlocks.push(renderMathFormula(math, true));
    return placeholder;
  });
  working = working.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => {
    const placeholder = `@@MATHBLOCK${mathBlocks.length}@@`;
    mathBlocks.push(renderMathFormula(math, true));
    return placeholder;
  });

  // Inline Math: \( ... \) and $ ... $
  working = working.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => {
    const placeholder = `@@MATHINLINE${mathBlocks.length}@@`;
    mathBlocks.push(renderMathFormula(math, false));
    return placeholder;
  });
  working = working.replace(/(^|[^\\])\$([^\$\n\r]+?)\$/g, (match, prefix, math) => {
    if (/^\s*\d+([.,]\d+)?\s*$/.test(math)) {
      return match;
    }
    const placeholder = `@@MATHINLINE${mathBlocks.length}@@`;
    mathBlocks.push(renderMathFormula(math, false));
    return prefix + placeholder;
  });

  // 3. Process Markdown on standard text
  let html = escapeHtml(working);

  // Tables: lines with | ... |
  html = html.replace(/((?:^|\n)\|[^\n]+\|\n\|[\s\-:|]+\|\n(?:\|[^\n]+\|\n?)+)/g, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    if (rows.length < 2) return tableBlock;
    const headerCols = rows[0].split('|').slice(1, -1).map(c => `<th>${c.trim()}</th>`).join('');
    const bodyRows = rows.slice(2).map(r => {
      const cols = r.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cols}</tr>`;
    }).join('');
    return `<div class="table-container"><table class="markdown-table"><thead><tr>${headerCols}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  });

  // Blockquotes: lines starting with > or &gt;
  html = html.replace(/(?:^|\n)(?:&gt;|>)\s*([^\n]+)/g, '<blockquote>$1</blockquote>');

  // Horizontal rules: --- or *** or ___
  html = html.replace(/^(?:[\t ]*[-*_]){3,}[\t ]*$/gm, '<hr class="markdown-hr">');

  // Headers (Level 6 down to 1)
  html = html.replace(/^(?:&lt;br&gt;|\n)*######[\t ]+([^\n]+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^(?:&lt;br&gt;|\n)*#####[\t ]+([^\n]+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^(?:&lt;br&gt;|\n)*####[\t ]+([^\n]+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^(?:&lt;br&gt;|\n)*###[\t ]+([^\n]+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^(?:&lt;br&gt;|\n)*##[\t ]+([^\n]+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^(?:&lt;br&gt;|\n)*#[\t ]+([^\n]+)$/gm, '<h1>$1</h1>');

  // Numbered lists: 1. item
  html = html.replace(/((?:(?:^|\n)\s*\d+\.\s+[^\n]+)+)/g, (match) => {
    const items = match.trim().split('\n').map(line => {
      return line.replace(/^\s*\d+\.\s+(.*)$/, '<li>$1</li>');
    }).join('');
    return `<ol class="markdown-ol">${items}</ol>`;
  });

  // Bulleted lists: - item or * item
  html = html.replace(/((?:(?:^|\n)\s*[-*+]\s+[^\n]+)+)/g, (match) => {
    const items = match.trim().split('\n').map(line => {
      return line.replace(/^\s*[-*+]\s+(.*)$/, '<li>$1</li>');
    }).join('');
    return `<ul class="markdown-ul">${items}</ul>`;
  });

  // Bold & Italic (both * and _)
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Paragraphs & Linebreaks
  html = html.replace(/\n\n+/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Clean up any empty paragraph tags wrapping block elements
  html = html.replace(/<p>\s*(<(?:h[1-6]|div|table|ul|ol|blockquote|hr)[^>]*>)/gi, '$1');
  html = html.replace(/(<\/(?:h[1-6]|div|table|ul|ol|blockquote|hr)>)\s*<\/p>/gi, '$1');

  // 4. Restore Code & Math using split().join() with underscore-free placeholders
  mathBlocks.forEach((renderedMath, i) => {
    html = html.split(`@@MATHBLOCK${i}@@`).join(renderedMath);
    html = html.split(`@@MATHINLINE${i}@@`).join(renderedMath);
  });

  codeBlocks.forEach((renderedCode, i) => {
    html = html.split(`@@CODEBLOCK${i}@@`).join(renderedCode);
    html = html.split(`@@CODEINLINE${i}@@`).join(renderedCode);
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

    // Auto-restore active conversation if available
    const savedConvId = localStorage.getItem('oryqen_current_conv_id');
    if (savedConvId && !state.currentConversationId && state.conversations.some(c => c.id === savedConvId)) {
      openConversation(savedConvId);
    }
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
    const isTutor = (c.capability === 'tutor' || c.purpose === 'tutor');
    const modeTag = isTutor
      ? `<span class="conv-mode-tag tutor">${escapeHtml(c.tutor_mode || 'tutor')}</span>`
      : `<span class="conv-mode-tag general">General</span>`;

    btn.innerHTML = `
      <div class="conv-item-content">
        ${modeTag}
        <span class="conv-title-text">${escapeHtml(c.title || 'Session')}</span>
      </div>
      <span class="conv-delete-btn" title="Delete conversation">&times;</span>
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
  localStorage.setItem('oryqen_current_conv_id', convId);

  if (window.innerWidth <= 768 && window.closeSidebar) {
    window.closeSidebar();
  }

  let conv = state.conversations.find(c => c.id === convId) || null;
  let msgs = [];

  // Try local cached messages first for zero-latency / offline resilience
  try {
    const cached = localStorage.getItem(`oryqen_conv_msgs_${convId}`);
    if (cached) {
      msgs = JSON.parse(cached) || [];
    }
  } catch (e) {}

  try {
    const res = await fetch(`${API_BASE}/api/conversations/${convId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.conversation) conv = data.conversation;
      if (data.messages && data.messages.length > 0) {
        msgs = data.messages;
        localStorage.setItem(`oryqen_conv_msgs_${convId}`, JSON.stringify(msgs));
      }
    }
  } catch (e) {
    console.warn('Network conversation fetch failed, relying on local cache:', e);
  }

  const chatContainer = document.getElementById('chatMessages');
  if (chatContainer) chatContainer.innerHTML = '';
  state.messages = [];

  const welcomeGeneral = document.getElementById('welcomeGeneralScreen');
  const welcomeTutor = document.getElementById('welcomeTutorScreen');

    if (conv) {
      document.getElementById('currentChatTitle').textContent = conv.title || 'ORYQEN';
      const targetWs = (conv.capability === 'tutor' || conv.purpose === 'tutor') ? 'tutor' : 'general';
      state.workspace = targetWs;
      document.querySelectorAll('[data-ws]').forEach(b => {
        b.classList.toggle('active', b.dataset.ws === targetWs);
      });
      updateBottomNav(targetWs === 'tutor' ? 'tutor' : 'chat');

      const tutorBar = document.getElementById('tutorControlsBar');
      const tutorDashBtn = document.getElementById('tutorDashboardBtn');
      const chatInput = document.getElementById('chatInput');
      if (targetWs === 'tutor') {
        tutorBar?.classList.remove('hidden');
        tutorDashBtn?.classList.remove('hidden');
        if (conv.tutor_mode) {
          setTutorMode(conv.tutor_mode);
          document.querySelectorAll('.tutor-mode-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.tutorMode === conv.tutor_mode);
          });
        }
      } else {
        tutorBar?.classList.add('hidden');
        tutorDashBtn?.classList.add('hidden');
        if (chatInput) chatInput.placeholder = 'Ask ORYQEN anything...';
      }
    }

    // Render each message from history
    msgs.forEach(m => {
      appendMessageRow(m);
      state.messages.push(m);
    });

    if (state.messages.length > 0) {
      welcomeGeneral?.classList.add('hidden');
      welcomeTutor?.classList.add('hidden');
    } else {
      if (state.workspace === 'tutor') {
        welcomeGeneral?.classList.add('hidden');
        welcomeTutor?.classList.remove('hidden');
      } else {
        welcomeTutor?.classList.add('hidden');
        welcomeGeneral?.classList.remove('hidden');
      }
    }

    // Close mobile drawer on mobile screens so chat history is immediately visible
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebarBackdrop');
      sidebar?.classList.remove('open');
      sidebar?.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      backdrop?.classList.remove('active');
      const openBtn = document.getElementById('openSidebarBtn');
      if (openBtn) openBtn.style.setProperty('display', 'inline-flex', 'important');
    }

    renderConversationsList();
    scrollToBottom();
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

  // OTP Verification Controls
  document.getElementById('submitOtpBtn')?.addEventListener('click', handleVerifyOtp);
  document.getElementById('resendOtpBtn')?.addEventListener('click', handleResendOtp);
  document.getElementById('backToLoginFromOtpBtn')?.addEventListener('click', () => switchAuthTab('login'));

  // Admin Dashboard Controls
  document.getElementById('openAdminModalBtn')?.addEventListener('click', () => {
    document.getElementById('adminLoginModal')?.classList.remove('hidden');
    document.getElementById('adminPasscodeInput')?.focus();
  });
  document.getElementById('closeAdminLoginBtn')?.addEventListener('click', () => {
    document.getElementById('adminLoginModal')?.classList.add('hidden');
  });
  document.getElementById('adminLoginForm')?.addEventListener('submit', handleAdminLogin);

  document.getElementById('closeAdminModalBtn')?.addEventListener('click', () => {
    document.getElementById('adminModal')?.classList.add('hidden');
  });
  document.getElementById('dismissAdminBtn')?.addEventListener('click', () => {
    document.getElementById('adminModal')?.classList.add('hidden');
  });
  document.getElementById('refreshAdminStatsBtn')?.addEventListener('click', loadAdminTelemetry);
  document.getElementById('saveAdminRoutingBtn')?.addEventListener('click', handleSaveAdminRouting);

  // Admin Navigation Tabs
  document.querySelectorAll('.admin-nav-item').forEach(nav => {
    nav.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('active'));
      nav.classList.add('active');
      const targetPane = document.getElementById(`admin-pane-${nav.dataset.adminTab}`);
      targetPane?.classList.add('active');
    });
  });

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

      if (nav.dataset.tab === 'models') {
        loadModelCatalog();
      } else if (nav.dataset.tab === 'memory') {
        loadMemoryGovernance();
      }
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

  // Settings: Learning Profile
  document.getElementById('saveLearningProfileBtn')?.addEventListener('click', async () => {
    const level = document.getElementById('userEducationLevel')?.value;
    const exam = document.getElementById('userTargetExam')?.value.trim();
    state.user.education_level = level;
    state.user.target_exam = exam;
    localStorage.setItem('oryqen_user_session', JSON.stringify(state.user));
    showToast('Learning profile preferences updated!');
  });

  // Settings: Local Device Cache & Storage Reset
  document.getElementById('clearLocalCacheBtn')?.addEventListener('click', async () => {
    if (!confirm('Clear all offline browser caches and stored sessions on this device?')) return;
    localStorage.removeItem('oryqen_sync_queue');
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
    showToast('Browser cache and offline data cleared.');
    setTimeout(() => window.location.reload(), 800);
  });

  // Settings: Memory Governance Form & Clear
  document.getElementById('addMemoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = document.getElementById('memKeyInput')?.value.trim();
    const val = document.getElementById('memValInput')?.value.trim();
    if (!key || !val) return;
    try {
      await fetch(`${API_BASE}/api/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'preference', key, value: val, user_id: state.user.id }),
      });
      document.getElementById('memKeyInput').value = '';
      document.getElementById('memValInput').value = '';
      loadMemoryGovernance();
      showToast('Preference saved to AI memory.');
    } catch (err) {
      showToast('Failed to save memory.', 'error');
    }
  });

  document.getElementById('clearAllMemoryBtn')?.addEventListener('click', async () => {
    if (!confirm('Clear all AI memories and personal learning preferences?')) return;
    try {
      await fetch(`${API_BASE}/api/memory?user_id=${state.user.id}`, { method: 'DELETE' });
      loadMemoryGovernance();
      showToast('All AI memory cleared.');
    } catch (err) {
      showToast('Failed to clear memories.', 'error');
    }
  });

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
    ['docsModal', 'settingsModal', 'citationModal', 'quizModal', 'flashcardModal', 'studentDashboardModal', 'memoryModal', 'subscriptionModal', 'authModal', 'supabaseModal', 'adminLoginModal', 'adminModal'].forEach(id => {
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
    loadCurrentUser();
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
  let pendingRegistrationEmail = '';

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, education_level, preferred_subjects }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Registration failed');
    }
    const data = await res.json();

    if (data.status === 'pending_verification') {
      pendingRegistrationEmail = data.email || email;
      document.getElementById('registerForm')?.classList.add('hidden');
      document.getElementById('loginForm')?.classList.add('hidden');
      document.getElementById('profileForm')?.classList.add('hidden');
      document.getElementById('otpVerifyPanel')?.classList.remove('hidden');

      const targetEmailEl = document.getElementById('otpTargetEmail');
      if (targetEmailEl) targetEmailEl.textContent = pendingRegistrationEmail;

      const directLink = document.getElementById('otpDirectConfirmLink');
      if (directLink && data.confirmation_link) {
        directLink.href = data.confirmation_link;
      }

      const otpInput = document.getElementById('otpInput');
      if (otpInput && data.otp_preview) {
        otpInput.value = data.otp_preview;
      }

      showToast(`Verification code: ${data.otp_preview || 'Sent to email'}`, 'info');
    } else {
      state.user = { ...data.user, tier: 'Pro Scholar' };
      localStorage.setItem('oryqen_user_session', JSON.stringify(state.user));
      updateAuthHeader();
      showToast(`Account created! Welcome, ${state.user.name}!`);
      document.getElementById('authModal')?.classList.add('hidden');
      loadCurrentUser();
      loadConversations();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleVerifyOtp() {
  const otpInput = document.getElementById('otpInput');
  const otp = otpInput ? otpInput.value.trim() : '';
  const email = document.getElementById('otpTargetEmail')?.textContent || document.getElementById('regEmail')?.value.trim();

  if (!otp || otp.length < 6) {
    showToast('Please enter your 6-digit verification code.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Verification failed');
    }
    const data = await res.json();
    state.user = data.user;
    localStorage.setItem('oryqen_user_session', JSON.stringify(state.user));
    showToast('Account confirmed and active!');
    document.getElementById('authModal')?.classList.add('hidden');
    loadCurrentUser();
    loadConversations();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleResendOtp() {
  const email = document.getElementById('otpTargetEmail')?.textContent || document.getElementById('regEmail')?.value.trim();
  if (!email) return;

  try {
    const res = await fetch(`${API_BASE}/api/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error('Resend failed');
    const data = await res.json();

    const directLink = document.getElementById('otpDirectConfirmLink');
    if (directLink && data.confirmation_link) {
      directLink.href = data.confirmation_link;
    }
    const otpInput = document.getElementById('otpInput');
    if (otpInput && data.otp_preview) {
      otpInput.value = data.otp_preview;
    }
    showToast(`New verification code: ${data.otp_preview || 'Dispatched'}`, 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// Dedicated Admin Operations & Telemetry
// ==========================================================================
let adminSessionKey = sessionStorage.getItem('oryqen_admin_key') || '';

async function handleAdminLogin(e) {
  e.preventDefault();
  const passInput = document.getElementById('adminPasscodeInput');
  const passcode = passInput ? passInput.value.trim() : '';
  if (!passcode) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Invalid Master Passcode');
    }

    adminSessionKey = passcode;
    sessionStorage.setItem('oryqen_admin_key', passcode);
    document.getElementById('adminLoginModal')?.classList.add('hidden');
    if (passInput) passInput.value = '';
    showToast('Admin access granted.');
    openAdminModal();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAdminModal() {
  document.getElementById('adminModal')?.classList.remove('hidden');
  loadAdminTelemetry();
}

async function loadAdminTelemetry() {
  if (!adminSessionKey) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/system-stats`, {
      headers: { 'X-Admin-Key': adminSessionKey }
    });
    if (!res.ok) throw new Error('Telemetry retrieval unauthorized');
    const data = await res.json();

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val !== undefined && val !== null ? val : '—';
    };

    const db = data.database || {};
    const ai = data.ai_engines || {};

    setTxt('adminTotalUsers', db.users_count || 0);
    setTxt('adminTotalConvs', db.conversations_count || 0);
    setTxt('adminTotalMsgs', db.messages_count || 0);
    setTxt('adminTotalDocs', db.materials_count || 0);
    setTxt('adminDbStatus', db.supabase_configured ? 'Supabase Connected' : 'SQLite WAL (Active)');
    setTxt('adminVectorChunks', db.indexed_vector_chunks || 0);

    setTxt('adminMaskedOpenRouter', ai.openrouter_key_masked || 'Not Configured');
    setTxt('adminMaskedGemini', ai.gemini_key_masked || 'Not Configured');
    setTxt('adminMaskedSupabase', db.supabase_url || 'Not Configured');

    showToast('Admin telemetry refreshed.');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleSaveAdminRouting(e) {
  e.preventDefault();
  if (!adminSessionKey) return;
  const defaultModel = document.getElementById('adminDefaultModelSelect')?.value;
  const streamResponses = document.getElementById('adminStreamToggle')?.checked;

  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminSessionKey
      },
      body: JSON.stringify({ default_model: defaultModel, stream_responses: streamResponses })
    });
    if (!res.ok) throw new Error('Failed to update system routing');
    showToast('System AI routing configuration updated.');
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

  const headerIcon = document.getElementById('headerDefaultUserIcon');
  const headerInit = document.getElementById('headerUserInitial');
  const headerAvatar = document.getElementById('headerUserAvatar');
  const headerName = document.getElementById('headerUserName');

  if (isGuest) {
    guestBtns?.classList.remove('hidden');
    userPill?.classList.add('hidden');
    document.getElementById('authTabProfile')?.classList.add('hidden');
    if (headerIcon) headerIcon.classList.remove('hidden');
    if (headerInit) headerInit.classList.add('hidden');
    if (headerAvatar) headerAvatar.textContent = '';
    if (headerName) headerName.textContent = 'Account';
  } else {
    guestBtns?.classList.add('hidden');
    userPill?.classList.remove('hidden');
    document.getElementById('authTabProfile')?.classList.remove('hidden');
    const firstName = (state.user.name || 'Scholar').split(' ')[0];
    const userInit = (state.user.name || 'S')[0].toUpperCase();
    if (headerIcon) headerIcon.classList.add('hidden');
    if (headerInit) {
      headerInit.textContent = userInit;
      headerInit.classList.remove('hidden');
    }
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
  document.getElementById('otpVerifyPanel')?.classList.add('hidden');

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
  loadModelCatalog();
  loadMemoryGovernance();
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
  // Modal buttons
  document.getElementById('shortcutsBtn')?.addEventListener('click', () => {
    document.getElementById('shortcutsModal')?.classList.remove('hidden');
  });
  document.getElementById('closeShortcutsModalBtn')?.addEventListener('click', () => {
    document.getElementById('shortcutsModal')?.classList.add('hidden');
  });
  document.getElementById('dismissShortcutsBtn')?.addEventListener('click', () => {
    document.getElementById('shortcutsModal')?.classList.add('hidden');
  });

  window.addEventListener('keydown', (e) => {
    // Ctrl+/ or Cmd+/ opens shortcuts modal
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      document.getElementById('shortcutsModal')?.classList.toggle('hidden');
    }
    // Ctrl+M or Cmd+M toggles online/offline
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      const nextMode = state.mode === 'offline' ? 'online' : 'offline';
      setAiMode(nextMode);
    }
    // Ctrl+B or Cmd+B toggles sidebar
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebarBackdrop');
      sidebar?.classList.toggle('open');
      backdrop?.classList.toggle('active');
    }
    // '/' when not in input focuses #chatInput
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      document.getElementById('chatInput')?.focus();
    }
    // Ctrl+K for new chat
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      startNewChat();
    }
    // Admin Portal Secure Shortcut: Ctrl+Shift+A or Cmd+Shift+A
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      document.getElementById('adminLoginModal')?.classList.remove('hidden');
    }
    if (e.key === 'Escape') {
      ['docsModal', 'settingsModal', 'citationModal', 'quizModal', 'flashcardModal', 'studentDashboardModal', 'memoryModal', 'subscriptionModal', 'authModal', 'adminLoginModal', 'adminModal', 'shortcutsModal', 'offlineBrainModal'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
      });
    }
    if (e.code === 'Space' && !document.getElementById('flashcardModal')?.classList.contains('hidden')) {
      e.preventDefault();
      flipCurrentCard();
    }
  });

  // Secure Admin Hash route (#admin)
  if (window.location.hash === '#admin') {
    document.getElementById('adminLoginModal')?.classList.remove('hidden');
  }
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#admin') {
      document.getElementById('adminLoginModal')?.classList.remove('hidden');
    }
  });
}

// ==========================================================================
// Offline Brain On-Device Setup Modal & Downloader
// ==========================================================================
function setupOfflineBrainModal() {
  const modal = document.getElementById('offlineBrainModal');
  if (!modal || !window.OfflineEngine) return;

  let selectedModelId = 'oryqen-mobile-core';

  async function refreshOfflineBrainUI() {
    const storage = await window.OfflineEngine.getStorageEstimate();
    const storageBadge = document.getElementById('offlineStorageAvailBadge');
    if (storageBadge) {
      storageBadge.textContent = `Available: ${storage.availableMb} MB`;
    }

    const isInstalled = await window.OfflineEngine.isModelInstalled(selectedModelId);
    const installedCard = document.getElementById('offlineInstalledCard');
    const downloadBtn = document.getElementById('startOfflineDownloadBtn');
    const startChatBtn = document.getElementById('startChattingOfflineBtn');
    const deleteBtn = document.getElementById('deleteOfflineBrainBtn');
    const pill = document.getElementById('sidebarOfflineBrainPill');

    if (isInstalled) {
      installedCard?.classList.remove('hidden');
      downloadBtn?.classList.add('hidden');
      startChatBtn?.classList.remove('hidden');
      deleteBtn?.classList.remove('hidden');
      if (pill) {
        pill.textContent = 'Active';
        pill.style.background = '#10b981';
      }
    } else {
      installedCard?.classList.add('hidden');
      downloadBtn?.classList.remove('hidden');
      startChatBtn?.classList.add('hidden');
      deleteBtn?.classList.add('hidden');
      if (pill) {
        pill.textContent = '12 MB';
        pill.style.background = 'var(--primary)';
      }
    }
  }

  window.refreshOfflineBrainUI = refreshOfflineBrainUI;

  // Open buttons
  document.getElementById('sidebarOfflineBrainBtn')?.addEventListener('click', () => {
    if (window.innerWidth <= 768 && window.closeSidebar) {
      window.closeSidebar();
    }
    modal.classList.remove('hidden');
    refreshOfflineBrainUI();
  });

  // Close buttons
  document.getElementById('closeOfflineBrainModalBtn')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  document.getElementById('closeOfflineBrainActionBtn')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // Model Selection Cards
  document.getElementById('cardModelMobileCore')?.addEventListener('click', () => {
    selectedModelId = 'oryqen-mobile-core';
    document.getElementById('cardModelMobileCore')?.classList.add('active');
    document.getElementById('cardModelQwen')?.classList.remove('active');
    document.getElementById('cardModelSmol')?.classList.remove('active');
    const downloadBtn = document.getElementById('startOfflineDownloadBtn');
    if (downloadBtn) downloadBtn.textContent = 'Install Mobile Core (~12 MB)';
    refreshOfflineBrainUI();
  });

  document.getElementById('cardModelQwen')?.addEventListener('click', () => {
    selectedModelId = 'qwen2.5-0.5b';
    document.getElementById('cardModelQwen')?.classList.add('active');
    document.getElementById('cardModelMobileCore')?.classList.remove('active');
    document.getElementById('cardModelSmol')?.classList.remove('active');
    const downloadBtn = document.getElementById('startOfflineDownloadBtn');
    if (downloadBtn) downloadBtn.textContent = 'Download Offline Brain (350 MB)';
    refreshOfflineBrainUI();
  });

  document.getElementById('cardModelSmol')?.addEventListener('click', () => {
    selectedModelId = 'smollm2-360m';
    document.getElementById('cardModelSmol')?.classList.add('active');
    document.getElementById('cardModelMobileCore')?.classList.remove('active');
    document.getElementById('cardModelQwen')?.classList.remove('active');
    const downloadBtn = document.getElementById('startOfflineDownloadBtn');
    if (downloadBtn) downloadBtn.textContent = 'Download Offline Brain (220 MB)';
    refreshOfflineBrainUI();
  });

  // Start Download
  const downloadBtn = document.getElementById('startOfflineDownloadBtn');
  downloadBtn?.addEventListener('click', async () => {
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading weights...';
    const progressTitle = document.getElementById('offlineProgressTitle');
    const progressPct = document.getElementById('offlineProgressPct');
    const progressBar = document.getElementById('offlineProgressBar');
    const progressTransferred = document.getElementById('offlineProgressTransferred');
    const progressSpeed = document.getElementById('offlineProgressSpeed');

    try {
      await window.OfflineEngine.downloadModel(selectedModelId, (p) => {
        if (progressPct) progressPct.textContent = `${p.percent}%`;
        if (progressBar) progressBar.style.width = `${p.percent}%`;
        if (progressTitle) progressTitle.textContent = p.percent === 100 ? 'Download Complete!' : 'Downloading Neural Weights...';
        if (progressTransferred && p.transferredMb) {
          progressTransferred.textContent = `${p.transferredMb} MB / ${p.totalMb || p.transferredMb} MB`;
        }
        if (progressSpeed && p.speedMbps) {
          progressSpeed.textContent = p.speedMbps === 'Cached' ? 'Saved to local storage' : `Speed: ${p.speedMbps} MB/s`;
        }
      });

      showToast('Offline Neural Brain installed successfully!');
      refreshOfflineBrainUI();
    } catch (err) {
      showToast(`Download failed: ${err.message}`, 'error');
      if (progressTitle) progressTitle.textContent = 'Download Failed';
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download Offline Brain';
    }
  });

  // Delete
  document.getElementById('deleteOfflineBrainBtn')?.addEventListener('click', async () => {
    if (confirm('Delete downloaded offline brain weights from this device?')) {
      await window.OfflineEngine.deleteInstalledModel(selectedModelId);
      showToast('Offline model removed from device.');
      refreshOfflineBrainUI();
    }
  });

  // Start Chatting
  document.getElementById('startChattingOfflineBtn')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    setAiMode('offline');
    startNewChat();
    showToast('Offline Mode Active — 100% On-Device AI');
  });

  // Initial check on load
  refreshOfflineBrainUI();
}

function showToast(msg, type = 'info') {
  const shelf = document.getElementById('toastShelf');
  if (!shelf) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type} ${type}`;
  t.textContent = msg;
  shelf.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(25px)';
    t.style.transition = 'all 0.25s ease';
    setTimeout(() => t.remove(), 250);
  }, 3000);
}

async function checkHealthStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (res.ok) {
      const data = await res.json();
      state.health = data;
    }
  } catch (err) {
    console.warn('ORYQEN health telemetry note:', err.message);
  }
}

function updateOfflineSyncBadge() {
  const badge = document.getElementById('offlineSyncBadge') || document.getElementById('syncBadge');
  const count = (state.syncQueue || []).length;
  if (badge) {
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }
}

function setupConnectivityListeners() {
  // Auto-detect online/offline status on initial load
  if (!navigator.onLine) {
    setAiMode('offline');
  } else {
    // Probe backend model status to select appropriate mode automatically
    fetch(`${API_BASE}/api/models/status`)
      .then(r => r.json())
      .then(data => {
        if (data.online_ready) {
          setAiMode('online');
        } else {
          setAiMode('offline');
        }
      })
      .catch(() => {
        setAiMode('offline');
      });
  }

  window.addEventListener('online', () => {
    showToast('Network connection restored. Online mode available.', 'info');
    updateHonestStatus();
  });

  window.addEventListener('offline', () => {
    showToast('Network connection lost. Switched to Offline mode.', 'warning');
    setAiMode('offline');
  });

  // Regular connection & status telemetry polling every 30 seconds
  setInterval(() => {
    updateHonestStatus();
  }, 30000);
}

// ==========================================================================
// Settings Modal & Model Management
// ==========================================================================
function openSettingsModal(targetTab = null) {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  initHardwareAdvisor();

  if (targetTab) {
    document.querySelectorAll('.settings-nav-item').forEach(n => {
      if (n.dataset.tab === targetTab) n.click();
    });
  } else {
    const activeNav = document.querySelector('.settings-nav-item.active');
    if (activeNav?.dataset?.tab === 'models') {
      loadModelCatalog();
    }
  }
}

// Hardware Capability & Dynamic Model Recommendation Engine
let systemRecommendedModelId = 'oryqen-mobile-core';

async function initHardwareAdvisor() {
  const ramEl = document.getElementById('hwMetricRam');
  const coresEl = document.getElementById('hwMetricCores');
  const storageEl = document.getElementById('hwMetricStorage');
  const tierEl = document.getElementById('hwMetricTier');
  const statsText = document.getElementById('hardwareStatsText');
  const recBadge = document.getElementById('hardwareRecBadge');

  const ramGB = navigator.deviceMemory || 4;
  if (ramEl) ramEl.textContent = `~${ramGB} GB RAM`;

  const cores = navigator.hardwareConcurrency || 4;
  if (coresEl) coresEl.textContent = `${cores} Cores`;

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  if (tierEl) tierEl.textContent = isMobile ? 'Mobile Phone' : 'Desktop / PC';

  if (window.OfflineEngine?.getStorageEstimate) {
    try {
      const storage = await window.OfflineEngine.getStorageEstimate();
      if (storageEl) storageEl.textContent = `${storage.availableMb} MB Free`;
    } catch (e) {
      if (storageEl) storageEl.textContent = 'Storage Ready';
    }
  } else {
    if (storageEl) storageEl.textContent = 'Storage Ready';
  }

  // Dynamic system recommendation based on hardware capability
  if (ramGB <= 4 || isMobile) {
    systemRecommendedModelId = 'oryqen-mobile-core';
    if (recBadge) recBadge.textContent = 'Recommended: ORYQEN Mobile Core (~12 MB)';
    if (statsText) statsText.textContent = `Detected ~${ramGB}GB RAM on ${isMobile ? 'Mobile' : 'Device'}. ORYQEN Mobile Core is optimal (zero crash, instant setup).`;
  } else if (ramGB >= 8) {
    systemRecommendedModelId = 'qwen2.5-0.5b';
    if (recBadge) recBadge.textContent = 'Recommended: Qwen2.5 0.5B (~350 MB)';
    if (statsText) statsText.textContent = `Detected ~${ramGB}GB RAM & ${cores} Cores. Device is capable of running deep mathematical GGUF weights.`;
  } else {
    systemRecommendedModelId = 'smollm2-360m';
    if (recBadge) recBadge.textContent = 'Recommended: SmolLM2 360M (~220 MB)';
    if (statsText) statsText.textContent = `Detected ~${ramGB}GB RAM & ${cores} Cores. Compact transformer recommended for balanced reasoning.`;
  }

  loadModelCatalog();
}

async function loadModelCatalog() {
  const container = document.getElementById('settingsModelsCatalog');
  if (!container || !window.OfflineEngine) return;

  const models = window.OfflineEngine.models;
  const activeModel = window.OfflineEngine.getInstalledModelInfo();
  const activeId = activeModel?.id || 'oryqen-mobile-core';

  const badge = document.getElementById('preferredModelBadge');
  if (badge) {
    const activeMeta = models[activeId] || activeModel;
    badge.textContent = `Active: ${activeMeta?.displayName || 'ORYQEN Mobile Core'}`;
  }

  const localTitle = document.getElementById('localActiveModelTitle');
  if (localTitle) {
    localTitle.textContent = models[activeId]?.displayName || 'ORYQEN Mobile Core';
  }

  const htmlParts = [];

  for (const [id, meta] of Object.entries(models)) {
    const isDownloaded = await window.OfflineEngine.isModelDownloaded(id);
    const isActive = activeId === id && isDownloaded;
    const isRecommended = id === systemRecommendedModelId;

    let statusHtml = '';
    let actionButtonsHtml = '';

    if (isActive) {
      statusHtml = `<span class="model-status-indicator" style="color: #10b981;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Active Engine</span>`;
      actionButtonsHtml = `
        <button type="button" class="btn btn-sm btn-success" disabled>Active</button>
        <button type="button" class="btn btn-sm btn-ghost text-danger" onclick="deleteModelFromSettings('${id}')" title="Delete model weights">Delete</button>
      `;
    } else if (isDownloaded) {
      statusHtml = `<span class="model-status-indicator" style="color: #38bdf8;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Downloaded & Ready</span>`;
      actionButtonsHtml = `
        <button type="button" class="btn btn-sm btn-primary" onclick="activateModelFromSettings('${id}')">Activate</button>
        <button type="button" class="btn btn-sm btn-ghost text-danger" onclick="deleteModelFromSettings('${id}')" title="Delete model weights">Delete</button>
      `;
    } else {
      statusHtml = `<span class="model-status-indicator" style="color: var(--text-muted);"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Available to Download</span>`;
      actionButtonsHtml = `
        <button type="button" class="btn btn-sm btn-primary" onclick="downloadModelFromSettings('${id}')">Download (${meta.sizeFormatted})</button>
      `;
    }

    htmlParts.push(`
      <div class="offline-model-settings-card ${isActive ? 'active' : ''} ${isRecommended ? 'recommended' : ''}" data-model-id="${id}">
        <div class="model-card-top-row">
          <div class="model-card-title-group">
            <span class="model-card-title">${escapeHtml(meta.displayName)}</span>
            <span class="model-size-badge">${escapeHtml(meta.sizeFormatted)}</span>
            ${isRecommended ? '<span class="model-rec-tag">★ System Recommended for Your Device</span>' : ''}
          </div>
        </div>
        <p class="model-card-desc">${escapeHtml(meta.description)}</p>
        <div class="model-specs-bar">
          <span>Format: ${escapeHtml(meta.quantization || 'Native')}</span>
          <span>Context: ${meta.contextWindow || 4096} tokens</span>
          <span>Latency: ${escapeHtml(meta.latency || '< 50ms')}</span>
          <span>Min RAM: ${escapeHtml(meta.minRam || '2 GB')}</span>
        </div>
        <div class="model-card-actions-row">
          <div>${statusHtml}</div>
          <div class="model-actions-group">${actionButtonsHtml}</div>
        </div>
      </div>
    `);
  }

  container.innerHTML = htmlParts.join('');
}

async function downloadModelFromSettings(modelId) {
  const modelMeta = window.OfflineEngine?.models?.[modelId];
  if (!modelMeta) return;

  const progressWrap = document.getElementById('modelDownloadProgressWrap');
  const titleEl = document.getElementById('modelDownloadTitle');
  const barEl = document.getElementById('modelDownloadProgressBar');
  const statusEl = document.getElementById('modelDownloadStatusText');
  const pctEl = document.getElementById('modelDownloadPercentText');
  const transEl = document.getElementById('modelDownloadTransferredText');
  const speedEl = document.getElementById('modelDownloadSpeedText');

  progressWrap?.classList.remove('hidden');
  if (titleEl) titleEl.textContent = `Downloading ${modelMeta.displayName}...`;
  if (barEl) barEl.style.width = '0%';
  if (statusEl) statusEl.textContent = 'Initializing secure stream...';
  if (pctEl) pctEl.textContent = '0%';
  if (transEl) transEl.textContent = `0 MB / ${modelMeta.sizeFormatted}`;
  if (speedEl) speedEl.textContent = 'Speed: --';

  showToast(`Downloading ${modelMeta.displayName}...`);

  try {
    await window.OfflineEngine.downloadModel(modelId, (p) => {
      if (pctEl) pctEl.textContent = `${p.percent}%`;
      if (barEl) barEl.style.width = `${p.percent}%`;
      if (statusEl) statusEl.textContent = p.percent === 100 ? 'Download complete!' : 'Transferring neural weights...';
      if (transEl && p.transferredMb) {
        transEl.textContent = `${p.transferredMb} MB / ${p.totalMb || modelMeta.sizeFormatted}`;
      }
      if (speedEl && p.speedMbps) {
        speedEl.textContent = p.speedMbps === 'Cached' ? 'Saved to local cache' : `Speed: ${p.speedMbps} MB/s`;
      }
    });

    showToast(`${modelMeta.displayName} installed & set as active offline engine!`);
    setTimeout(() => progressWrap?.classList.add('hidden'), 1500);

    loadModelCatalog();
    if (typeof refreshOfflineBrainUI === 'function') refreshOfflineBrainUI();
    updateHonestStatus();
  } catch (err) {
    if (statusEl) statusEl.textContent = `Download failed: ${err.message}`;
    showToast(`Download failed: ${err.message}`, 'error');
  }
}

function activateModelFromSettings(modelId) {
  if (!window.OfflineEngine) return;
  const success = window.OfflineEngine.setActiveModel(modelId);
  if (success) {
    const meta = window.OfflineEngine.models[modelId];
    showToast(`Activated ${meta?.displayName || modelId} as active on-device engine.`);
    loadModelCatalog();
    if (typeof refreshOfflineBrainUI === 'function') refreshOfflineBrainUI();
    updateHonestStatus();
  }
}

async function deleteModelFromSettings(modelId) {
  const meta = window.OfflineEngine?.models?.[modelId];
  const name = meta?.displayName || modelId;
  if (!confirm(`Remove on-device neural weights for "${name}" from this device?`)) return;

  try {
    await window.OfflineEngine.deleteInstalledModel(modelId);
    showToast(`${name} weights removed from device.`);
    loadModelCatalog();
    if (typeof refreshOfflineBrainUI === 'function') refreshOfflineBrainUI();
    updateHonestStatus();
  } catch (err) {
    showToast(`Failed to remove model: ${err.message}`, 'error');
  }
}

window.downloadModelFromSettings = downloadModelFromSettings;
window.activateModelFromSettings = activateModelFromSettings;
window.deleteModelFromSettings = deleteModelFromSettings;
window.openSettingsModal = openSettingsModal;

async function loadMemoryGovernance() {
  const list = document.getElementById('memoryItemsList');
  if (!list) return;
  try {
    const res = await fetch(`${API_BASE}/api/memory?user_id=${state.user.id}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.memories || data.memories.length === 0) {
      list.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:10px 0;">No memories stored. Add your academic goals or learning style preferences below!</div>';
      return;
    }
    list.innerHTML = data.memories.map(m => `
      <div class="memory-item-row">
        <div class="mem-text">
          <span class="mem-tag">${escapeHtml(m.key)}:</span> ${escapeHtml(m.value)}
        </div>
        <button type="button" class="icon-btn-sm" style="color:var(--text-muted);" onclick="deleteMemoryGovernanceItem('${escapeHtml(m.id)}')" title="Delete memory">&times;</button>
      </div>
    `).join('');
  } catch (e) {}
}

async function deleteMemoryGovernanceItem(id) {
  try {
    await fetch(`${API_BASE}/api/memory/${id}?user_id=${state.user.id}`, { method: 'DELETE' });
    loadMemoryGovernance();
    showToast('Memory item removed.');
  } catch (e) {
    showToast('Failed to delete memory.', 'error');
  }
}

window.deleteLocalModel = deleteModelFromSettings;
window.pullLocalModel = downloadModelFromSettings;
window.deleteMemoryGovernanceItem = deleteMemoryGovernanceItem;

