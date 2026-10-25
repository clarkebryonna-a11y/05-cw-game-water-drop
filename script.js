// Game State Variables
let gameMode = "dual"; // "dual" | "solo"
let difficulty = "medium"; // "easy" | "medium" | "hard"
let gameStartedFlow = false; // True once user clicks "Start Game"
let gameRunning = false;
let gamePaused = false;

// Difficulty settings controlling dropFall animation duration (seconds) & spawn interval
const DIFFICULTY_SETTINGS = {
  easy: {
    label: "Easy • 4.5s–6.0s",
    minDuration: 4.5,
    maxDuration: 6.0,
    defaultCssDuration: "5.2s",
    soloSpawnMs: 900,
    dualSpawnMs: 650,
  },
  medium: {
    label: "Medium • 3.0s–4.2s",
    minDuration: 3.0,
    maxDuration: 4.2,
    defaultCssDuration: "3.6s",
    soloSpawnMs: 750,
    dualSpawnMs: 520,
  },
  hard: {
    label: "Hard • 1.6s–2.5s",
    minDuration: 1.6,
    maxDuration: 2.5,
    defaultCssDuration: "2.0s",
    soloSpawnMs: 550,
    dualSpawnMs: 380,
  },
};

let score = 0; // Solo score
let p1Score = 0; // Player 1 score
let p2Score = 0; // Player 2 score

let p1Joined = false;
let p2Joined = false;
let p1Name = "Player 1";
let p2Name = "Player 2";

let timeLeft = 30;
let pauseTimeLeft = 45;

let dropMaker = null;
let gameTimer = null;
let pauseTimer = null;
let nextDropZone = 1; // Alternates 1 (Left/P1) and 2 (Right/P2) in dual mode

// WebSocket Connection for Real-Time Multi-User Match Sync
let ws = null;

function initWebSocket() {
  try {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        // Ignore invalid JSON
      }
    });

    ws.addEventListener("close", () => {
      setTimeout(initWebSocket, 3000);
    });
  } catch (err) {
    // Fallback to local split-screen if WebSocket unavailable
  }
}

function sendSocketEvent(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function handleServerMessage(msg) {
  if (msg.type === "state:init" || msg.type === "state:sync") {
    const st = msg.state;
    if (st) {
      gameMode = st.mode === "solo" ? "solo" : "dual";
      if (st.difficulty && DIFFICULTY_SETTINGS[st.difficulty]) {
        difficulty = st.difficulty;
        applyDifficultyToActiveGame();
      }
      p1Joined = Boolean(st.p1Joined);
      p2Joined = Boolean(st.p2Joined);
      p1Name = st.p1Name || "Player 1";
      p2Name = st.p2Name || "Player 2";
      if (document.activeElement !== p1NameInput) p1NameInput.value = p1Name;
      if (document.activeElement !== p2NameInput) p2NameInput.value = p2Name;
      renderModeAndLobbyUI();
    }
  } else if (msg.type === "score:sync") {
    if (typeof msg.p1Score === "number") p1Score = msg.p1Score;
    if (typeof msg.p2Score === "number") p2Score = msg.p2Score;
    updateScorePanelUI();
  } else if (msg.type === "match:started") {
    if (!gameRunning) {
      launchActiveMatch(true);
    }
  } else if (msg.type === "drop:collected") {
    const existingDrop = gameContainer.querySelector(
      `[data-drop-id="${msg.dropId}"]`
    );
    if (existingDrop) {
      existingDrop.remove();
    }
  }
}

// Sound Effects & Background Music State (Web Audio API)
let soundEnabled = true;
let musicEnabled = true;
let audioCtx = null;
let bgMusicInterval = null;
let bgMusicStep = 0;

// Melodic aquatic C-major pentatonic pattern (frequencies in Hz)
const BG_MELODY_NOTES = [
  523.25, // C5
  659.25, // E5
  783.99, // G5
  880.0,  // A5
  783.99, // G5
  659.25, // E5
  587.33, // D5
  523.25, // C5
  392.0,  // G4
  523.25, // C5
  659.25, // E5
  783.99, // G5
  1046.5, // C6
  880.0,  // A5
  783.99, // G5
  659.25, // E5
];

const BG_BASS_NOTES = [
  261.63, // C4
  220.0,  // A3
  174.61, // F3
  196.0,  // G3
];

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playBgMusicStep() {
  if (!musicEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;

  const now = ctx.currentTime;
  const noteFreq = BG_MELODY_NOTES[bgMusicStep % BG_MELODY_NOTES.length];

  // Gentle water-marimba melody note
  const melOsc = ctx.createOscillator();
  const melGain = ctx.createGain();
  melOsc.type = "sine";
  melOsc.frequency.setValueAtTime(noteFreq, now);
  melGain.gain.setValueAtTime(0.001, now);
  melGain.gain.linearRampToValueAtTime(0.045, now + 0.03);
  melGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.34);
  melOsc.connect(melGain);
  melGain.connect(ctx.destination);
  melOsc.start(now);
  melOsc.stop(now + 0.35);

  // Warm ambient bass chord note every 4 steps
  if (bgMusicStep % 4 === 0) {
    const bassIndex = Math.floor(bgMusicStep / 4) % BG_BASS_NOTES.length;
    const bassFreq = BG_BASS_NOTES[bassIndex];
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = "triangle";
    bassOsc.frequency.setValueAtTime(bassFreq, now);
    bassGain.gain.setValueAtTime(0.001, now);
    bassGain.gain.linearRampToValueAtTime(0.035, now + 0.08);
    bassGain.gain.exponentialRampToValueAtTime(0.0008, now + 1.35);
    bassOsc.connect(bassGain);
    bassGain.connect(ctx.destination);
    bassOsc.start(now);
    bassOsc.stop(now + 1.4);
  }

  bgMusicStep = (bgMusicStep + 1) % BG_MELODY_NOTES.length;
}

function startBackgroundMusic() {
  if (!musicEnabled) return;
  getAudioContext();
  if (bgMusicInterval) return;
  playBgMusicStep();
  bgMusicInterval = setInterval(playBgMusicStep, 360);
}

function stopBackgroundMusic() {
  if (bgMusicInterval) {
    clearInterval(bgMusicInterval);
    bgMusicInterval = null;
  }
}

function playSound(type) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (type === "good") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  } else if (type === "bad") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.linearRampToValueAtTime(120, now + 0.22);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  } else if (type === "start") {
    [440, 554.37, 659.25].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.14, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.18);
    });
  } else if (type === "win") {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.16, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.28);
    });
  } else if (type === "lose") {
    [392.0, 349.23, 329.63].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.14, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.25);
    });
  } else if (type === "click") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }
}

// DOM Elements
const soloScoreBox = document.getElementById("solo-score-box");
const dualScoreBox = document.getElementById("dual-score-box");
const scoreEl = document.getElementById("score");
const p1ScoreEl = document.getElementById("p1-score");
const p2ScoreEl = document.getElementById("p2-score");
const p1PanelNameEl = document.getElementById("p1-panel-name");
const p2PanelNameEl = document.getElementById("p2-panel-name");

const inGameDifficultyBar = document.getElementById("in-game-difficulty-bar");
const inGameDiffChips = Array.from(
  document.querySelectorAll(".in-game-diff-chip")
);
const splitScreenZones = document.getElementById("split-screen-zones");
const p1ZoneLabel = document.getElementById("p1-zone-label");
const p2ZoneLabel = document.getElementById("p2-zone-label");

const startOverlay = document.getElementById("start-overlay");
const lobbyModal = document.getElementById("lobby-modal");
const modeDualBtn = document.getElementById("mode-dual-btn");
const modeSoloBtn = document.getElementById("mode-solo-btn");
const dualLobbyPanel = document.getElementById("dual-lobby-panel");
const p1LobbySlot = document.getElementById("p1-lobby-slot");
const p2LobbySlot = document.getElementById("p2-lobby-slot");
const p1StatusBadge = document.getElementById("p1-status-badge");
const p2StatusBadge = document.getElementById("p2-status-badge");
const p1NameInput = document.getElementById("p1-name-input");
const p2NameInput = document.getElementById("p2-name-input");
const p1JoinBtn = document.getElementById("p1-join-btn");
const p2JoinBtn = document.getElementById("p2-join-btn");
const lobbyGoalText = document.getElementById("lobby-goal-text");
const overlayStartBtn = document.getElementById("overlay-start-btn");
const difficultySpeedBadge = document.getElementById("difficulty-speed-badge");
const diffEasyBtn = document.getElementById("diff-easy-btn");
const diffMediumBtn = document.getElementById("diff-medium-btn");
const diffHardBtn = document.getElementById("diff-hard-btn");
const diffButtons = [diffEasyBtn, diffMediumBtn, diffHardBtn];

const timeEl = document.getElementById("time");
const startBtn = document.getElementById("start-btn");
const pauseBtn = document.getElementById("pause-btn");
const gameContainer = document.getElementById("game-container");
const pauseModal = document.getElementById("pause-modal");
const pauseCountdownEl = document.getElementById("pause-countdown");
const resumeBtn = document.getElementById("resume-btn");
const resetBtn = document.getElementById("reset-btn");
const quitBtn = document.getElementById("quit-btn");

const gameOverModal = document.getElementById("game-over-modal");
const modalHeading = document.getElementById("modal-heading");
const soloFinalScoreRow = document.getElementById("solo-final-score-row");
const dualFinalScoreRow = document.getElementById("dual-final-score-row");
const finalScoreEl = document.getElementById("final-score");
const p1FinalLabel = document.getElementById("p1-final-label");
const p2FinalLabel = document.getElementById("p2-final-label");
const p1FinalScoreEl = document.getElementById("p1-final-score");
const p2FinalScoreEl = document.getElementById("p2-final-score");
const gameMessageEl = document.getElementById("game-message");
const topScoresListEl = document.getElementById("top-scores-list");
const restartBtn = document.getElementById("restart-btn");
const musicToggleBtn = document.getElementById("music-toggle-btn");
const musicIconEl = document.getElementById("music-icon");
const musicLabelEl = document.getElementById("music-label");
const soundToggleBtn = document.getElementById("sound-toggle-btn");
const soundIconEl = document.getElementById("sound-icon");
const soundLabelEl = document.getElementById("sound-label");

const TOP_SCORES_KEY = "cw_water_drop_top_scores";

// Event Listeners
startBtn.addEventListener("click", handleStartButtonClick);
overlayStartBtn.addEventListener("click", () => launchActiveMatch(false));
pauseBtn.addEventListener("click", pauseGame);
resumeBtn.addEventListener("click", resumeGame);
resetBtn.addEventListener("click", resetGame);
quitBtn.addEventListener("click", quitToMenu);
restartBtn.addEventListener("click", openGameStartSetup);
musicToggleBtn.addEventListener("click", toggleMusic);
soundToggleBtn.addEventListener("click", toggleSound);

// Unlock and start background music on first user interaction if enabled
document.addEventListener(
  "pointerdown",
  () => {
    if (musicEnabled && !bgMusicInterval) {
      startBackgroundMusic();
    }
  },
  { once: true }
);

function handleStartButtonClick() {
  if (gameRunning) return;
  // If the setup overlay is already open when clicking Start Game, launch immediately
  if (gameStartedFlow && !lobbyModal.classList.contains("hidden")) {
    launchActiveMatch(false);
  } else {
    openGameStartSetup();
  }
}

// Opens the Dual-Player & Difficulty setup UI when "Start Game" is clicked
function openGameStartSetup() {
  if (gameRunning) return;
  playSound("click");
  gameStartedFlow = true;

  startOverlay.classList.add("hidden");
  gameOverModal.classList.add("hidden");
  pauseModal.classList.add("hidden");
  lobbyModal.classList.remove("hidden");

  renderModeAndLobbyUI();
}

modeDualBtn.addEventListener("click", () => {
  playSound("click");
  gameMode = "dual";
  renderModeAndLobbyUI();
  sendSocketEvent({ type: "mode:set", mode: "dual" });
});

modeSoloBtn.addEventListener("click", () => {
  playSound("click");
  gameMode = "solo";
  renderModeAndLobbyUI();
  sendSocketEvent({ type: "mode:set", mode: "solo" });
});

function setDifficulty(newDiff) {
  if (!newDiff || !DIFFICULTY_SETTINGS[newDiff]) return;
  playSound("click");
  difficulty = newDiff;
  renderModeAndLobbyUI();
  applyDifficultyToActiveGame();
  sendSocketEvent({ type: "difficulty:set", difficulty });
}

diffButtons.forEach((btn) => {
  if (!btn) return;
  btn.addEventListener("click", () => {
    setDifficulty(btn.getAttribute("data-difficulty"));
  });
});

inGameDiffChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    setDifficulty(chip.getAttribute("data-difficulty"));
  });
});

function applyDifficultyToActiveGame() {
  const diffConfig =
    DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.medium;

  if (gameContainer) {
    gameContainer.style.setProperty(
      "--drop-fall-duration",
      diffConfig.defaultCssDuration
    );
  }

  // Update any currently falling drops on screen
  const activeDrops = gameContainer.querySelectorAll(".water-drop");
  activeDrops.forEach((drop) => {
    const durationRange = diffConfig.maxDuration - diffConfig.minDuration;
    const newDuration = (
      diffConfig.minDuration +
      Math.random() * durationRange
    ).toFixed(2);
    drop.style.setProperty("--drop-fall-duration", `${newDuration}s`);
    drop.style.animationDuration = `${newDuration}s`;
  });

  // Update active drop spawner interval if game is currently running
  if (gameRunning && !gamePaused && dropMaker) {
    clearInterval(dropMaker);
    const spawnInterval =
      gameMode === "dual" ? diffConfig.dualSpawnMs : diffConfig.soloSpawnMs;
    dropMaker = setInterval(createDrop, spawnInterval);
  }
}

p1JoinBtn.addEventListener("click", () => {
  playSound("click");
  p1Name = p1NameInput.value.trim() || "Player 1";
  p1Joined = !p1Joined;
  renderModeAndLobbyUI();
  sendSocketEvent({
    type: p1Joined ? "player:join" : "player:leave",
    slot: 1,
    name: p1Name,
  });
});

p2JoinBtn.addEventListener("click", () => {
  playSound("click");
  p2Name = p2NameInput.value.trim() || "Player 2";
  p2Joined = !p2Joined;
  renderModeAndLobbyUI();
  sendSocketEvent({
    type: p2Joined ? "player:join" : "player:leave",
    slot: 2,
    name: p2Name,
  });
});

p1NameInput.addEventListener("input", () => {
  p1Name = p1NameInput.value.trim() || "Player 1";
  p1PanelNameEl.textContent = p1Name;
  p1ZoneLabel.textContent = `${p1Name} Zone`;
  if (p1Joined) {
    sendSocketEvent({ type: "player:join", slot: 1, name: p1Name });
  }
});

p2NameInput.addEventListener("input", () => {
  p2Name = p2NameInput.value.trim() || "Player 2";
  p2PanelNameEl.textContent = p2Name;
  p2ZoneLabel.textContent = `${p2Name} Zone`;
  if (p2Joined) {
    sendSocketEvent({ type: "player:join", slot: 2, name: p2Name });
  }
});

function renderModeAndLobbyUI() {
  const isDual = gameMode === "dual";

  modeDualBtn.classList.toggle("active", isDual);
  modeDualBtn.setAttribute("aria-selected", String(isDual));
  modeSoloBtn.classList.toggle("active", !isDual);
  modeSoloBtn.setAttribute("aria-selected", String(!isDual));

  // Only show Dual-Player score panel & split-screen zones once the game starts
  const showDualElements = gameStartedFlow && isDual;
  soloScoreBox.classList.toggle("hidden", showDualElements);
  dualScoreBox.classList.toggle("hidden", !showDualElements);
  splitScreenZones.classList.toggle("hidden", !showDualElements);
  inGameDifficultyBar.classList.toggle("hidden", !gameRunning);
  dualLobbyPanel.classList.toggle("hidden", !isDual);

  p1PanelNameEl.textContent = p1Name;
  p2PanelNameEl.textContent = p2Name;
  p1ZoneLabel.textContent = `${p1Name} Zone`;
  p2ZoneLabel.textContent = `${p2Name} Zone`;

  // Player 1 slot status
  p1LobbySlot.classList.toggle("joined", p1Joined);
  p1StatusBadge.textContent = p1Joined ? "✓ Joined" : "Waiting...";
  p1StatusBadge.className = p1Joined
    ? "slot-status ready"
    : "slot-status waiting";
  p1JoinBtn.textContent = p1Joined ? "✓ Player 1 Ready" : "Join as Player 1";
  p1JoinBtn.classList.toggle("joined-btn", p1Joined);

  // Player 2 slot status
  p2LobbySlot.classList.toggle("joined", p2Joined);
  p2StatusBadge.textContent = p2Joined ? "✓ Joined" : "Waiting...";
  p2StatusBadge.className = p2Joined
    ? "slot-status ready"
    : "slot-status waiting";
  p2JoinBtn.textContent = p2Joined ? "✓ Player 2 Ready" : "Join as Player 2";
  p2JoinBtn.classList.toggle("joined-btn", p2Joined);

  if (isDual) {
    if (p1Joined && p2Joined) {
      lobbyGoalText.innerHTML =
        "Both players joined! Click <strong>Launch Dual Match</strong> to race!";
    } else {
      lobbyGoalText.innerHTML =
        "Join Player 1 & Player 2 slots — each player catches drops on their side!";
    }
    overlayStartBtn.textContent = "Launch Dual Match";
  } else {
    lobbyGoalText.innerHTML = "Score <strong>20 or more</strong> to win!";
    overlayStartBtn.textContent = "Launch Solo Game";
  }

  // Update Difficulty Selector UI & CSS custom property for dropFall duration
  const diffConfig =
    DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.medium;
  if (difficultySpeedBadge) {
    difficultySpeedBadge.textContent = diffConfig.label;
  }
  diffButtons.forEach((btn) => {
    if (!btn) return;
    const isSelected = btn.getAttribute("data-difficulty") === difficulty;
    btn.classList.toggle("active", isSelected);
    btn.setAttribute("aria-checked", String(isSelected));
  });
  inGameDiffChips.forEach((chip) => {
    const isSelected = chip.getAttribute("data-difficulty") === difficulty;
    chip.classList.toggle("active", isSelected);
  });
  if (gameContainer) {
    gameContainer.style.setProperty(
      "--drop-fall-duration",
      diffConfig.defaultCssDuration
    );
  }
}

function updateScorePanelUI() {
  scoreEl.textContent = score;
  p1ScoreEl.textContent = p1Score;
  p2ScoreEl.textContent = p2Score;
}

function toggleMusic() {
  musicEnabled = !musicEnabled;
  if (musicEnabled) {
    musicToggleBtn.classList.remove("muted");
    musicIconEl.textContent = "🎵";
    musicLabelEl.textContent = "Music On";
    startBackgroundMusic();
  } else {
    musicToggleBtn.classList.add("muted");
    musicIconEl.textContent = "🔇";
    musicLabelEl.textContent = "Music Off";
    stopBackgroundMusic();
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    soundToggleBtn.classList.remove("muted");
    soundIconEl.textContent = "🔊";
    soundLabelEl.textContent = "Sound On";
    playSound("click");
  } else {
    soundToggleBtn.classList.add("muted");
    soundIconEl.textContent = "🔇";
    soundLabelEl.textContent = "Sound Off";
  }
}

function clearAllDrops() {
  const drops = gameContainer.querySelectorAll(".water-drop, .point-indicator");
  drops.forEach((el) => el.remove());
}

function clearTimers() {
  if (dropMaker) {
    clearInterval(dropMaker);
    dropMaker = null;
  }
  if (gameTimer) {
    clearInterval(gameTimer);
    gameTimer = null;
  }
  if (pauseTimer) {
    clearInterval(pauseTimer);
    pauseTimer = null;
  }
}

function launchActiveMatch(fromRemote = false) {
  if (gameRunning && !gamePaused) return;

  clearTimers();
  clearAllDrops();

  gameStartedFlow = true;
  p1Name = p1NameInput.value.trim() || "Player 1";
  p2Name = p2NameInput.value.trim() || "Player 2";

  if (gameMode === "dual" && (!p1Joined || !p2Joined)) {
    p1Joined = true;
    p2Joined = true;
  }

  gameRunning = true;
  gamePaused = false;
  score = 0;
  p1Score = 0;
  p2Score = 0;
  timeLeft = 30;

  renderModeAndLobbyUI();
  updateScorePanelUI();
  timeEl.textContent = timeLeft;

  gameContainer.classList.remove("game-paused");
  startOverlay.classList.add("hidden");
  lobbyModal.classList.add("hidden");
  pauseModal.classList.add("hidden");
  gameOverModal.classList.add("hidden");

  startBtn.disabled = true;
  pauseBtn.classList.remove("hidden");

  playSound("start");

  if (!fromRemote) {
    sendSocketEvent({ type: "match:start" });
  }

  // Spawn initial drops based on mode & difficulty
  const diffConfig =
    DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.medium;
  const spawnInterval =
    gameMode === "dual" ? diffConfig.dualSpawnMs : diffConfig.soloSpawnMs;
  createDrop();
  dropMaker = setInterval(createDrop, spawnInterval);

  // 1-second game countdown timer
  gameTimer = setInterval(() => {
    timeLeft--;
    timeEl.textContent = timeLeft;

    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

function pauseGame() {
  if (!gameRunning || gamePaused) return;

  playSound("click");
  gamePaused = true;
  gameContainer.classList.add("game-paused");

  if (dropMaker) {
    clearInterval(dropMaker);
    dropMaker = null;
  }
  if (gameTimer) {
    clearInterval(gameTimer);
    gameTimer = null;
  }

  pauseTimeLeft = 45;
  pauseCountdownEl.textContent = pauseTimeLeft;
  pauseCountdownEl.classList.remove("warning");
  pauseModal.classList.remove("hidden");
  pauseBtn.classList.add("hidden");

  pauseTimer = setInterval(() => {
    pauseTimeLeft--;
    pauseCountdownEl.textContent = pauseTimeLeft;

    if (pauseTimeLeft <= 10) {
      pauseCountdownEl.classList.add("warning");
    }

    if (pauseTimeLeft <= 0) {
      quitToMenu();
    }
  }, 1000);
}

function resumeGame() {
  if (!gameRunning || !gamePaused) return;

  playSound("click");
  if (pauseTimer) {
    clearInterval(pauseTimer);
    pauseTimer = null;
  }

  gamePaused = false;
  gameContainer.classList.remove("game-paused");
  pauseModal.classList.add("hidden");
  pauseBtn.classList.remove("hidden");

  const diffConfig =
    DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.medium;
  const spawnInterval =
    gameMode === "dual" ? diffConfig.dualSpawnMs : diffConfig.soloSpawnMs;
  dropMaker = setInterval(createDrop, spawnInterval);
  gameTimer = setInterval(() => {
    timeLeft--;
    timeEl.textContent = timeLeft;

    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

function resetGame() {
  playSound("click");
  gameRunning = false;
  gamePaused = false;
  launchActiveMatch(false);
}

function quitToMenu() {
  playSound("click");
  clearTimers();
  clearAllDrops();

  gameStartedFlow = false;
  gameRunning = false;
  gamePaused = false;
  score = 0;
  p1Score = 0;
  p2Score = 0;
  timeLeft = 30;

  renderModeAndLobbyUI();
  updateScorePanelUI();
  timeEl.textContent = timeLeft;

  gameContainer.classList.remove("game-paused");
  pauseModal.classList.add("hidden");
  gameOverModal.classList.add("hidden");
  lobbyModal.classList.add("hidden");
  startOverlay.classList.remove("hidden");

  startBtn.disabled = false;
  pauseBtn.classList.add("hidden");
}

function showPointIndicator(x, y, isBad, labelPrefix = "") {
  const indicator = document.createElement("div");
  indicator.className = `point-indicator ${isBad ? "point-minus" : "point-plus"}`;
  const delta = isBad ? "-1" : "+1";
  indicator.textContent = labelPrefix ? `${labelPrefix} ${delta}` : delta;
  indicator.style.left = `${x}px`;
  indicator.style.top = `${y}px`;
  gameContainer.appendChild(indicator);

  indicator.addEventListener("animationend", () => {
    indicator.remove();
  });
}

function createDrop() {
  if (!gameRunning || gamePaused) return;

  const drop = document.createElement("div");
  const isBadDrop = Math.random() < 0.25;
  drop.className = isBadDrop ? "water-drop bad-drop" : "water-drop";

  const dropId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  drop.setAttribute("data-drop-id", dropId);

  const initialSize = 60;
  const sizeMultiplier = Math.random() * 0.55 + 0.65;
  const size = Math.round(initialSize * sizeMultiplier);
  drop.style.width = `${size}px`;
  drop.style.height = `${size}px`;

  const gameWidth = gameContainer.clientWidth || 800;
  const halfWidth = gameWidth / 2;

  let xPosition = 0;
  let assignedPlayer = 1;

  if (gameMode === "dual") {
    assignedPlayer = nextDropZone;
    nextDropZone = nextDropZone === 1 ? 2 : 1;

    const zoneMargin = 14;
    const usableHalfWidth = Math.max(20, halfWidth - size - zoneMargin * 2);

    if (assignedPlayer === 1) {
      xPosition = zoneMargin + Math.random() * usableHalfWidth;
    } else {
      xPosition = halfWidth + zoneMargin + Math.random() * usableHalfWidth;
    }
  } else {
    const maxLeft = Math.max(10, gameWidth - size - 15);
    xPosition = Math.random() * maxLeft;
  }

  drop.style.left = `${xPosition}px`;

  // Calculate dropFall animationDuration based on selected difficulty
  const diffConfig =
    DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.medium;
  const durationRange = diffConfig.maxDuration - diffConfig.minDuration;
  const fallDuration = (
    diffConfig.minDuration +
    Math.random() * durationRange
  ).toFixed(2);
  drop.style.setProperty("--drop-fall-duration", `${fallDuration}s`);
  drop.style.animationDuration = `${fallDuration}s`;

  drop.addEventListener("pointerdown", (e) => {
    if (!gameRunning || gamePaused) return;
    e.stopPropagation();

    const rect = gameContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left - 12;
    const clickY = e.clientY - rect.top - 12;

    if (gameMode === "dual") {
      const isPlayer1Side = e.clientX - rect.left < rect.width / 2;
      if (isPlayer1Side) {
        p1Score = isBadDrop ? Math.max(0, p1Score - 1) : p1Score + 1;
        showPointIndicator(clickX, clickY, isBadDrop, "P1");
      } else {
        p2Score = isBadDrop ? Math.max(0, p2Score - 1) : p2Score + 1;
        showPointIndicator(clickX, clickY, isBadDrop, "P2");
      }
      playSound(isBadDrop ? "bad" : "good");
      updateScorePanelUI();
      sendSocketEvent({
        type: "score:update",
        p1Score,
        p2Score,
      });
      sendSocketEvent({
        type: "drop:collect",
        dropId,
        player: isPlayer1Side ? 1 : 2,
        isBad: isBadDrop,
      });
    } else {
      if (isBadDrop) {
        score = Math.max(0, score - 1);
        playSound("bad");
        showPointIndicator(clickX, clickY, true);
      } else {
        score += 1;
        playSound("good");
        showPointIndicator(clickX, clickY, false);
      }
      updateScorePanelUI();
    }

    drop.remove();
  });

  gameContainer.appendChild(drop);

  drop.addEventListener("animationend", () => {
    drop.remove();
  });
}

function updateAndRenderTopScores(newEntries) {
  let savedScores = [];
  try {
    const raw = localStorage.getItem(TOP_SCORES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        savedScores = parsed.map((entry) =>
          typeof entry === "number"
            ? { score: entry, name: "Player", id: 0 }
            : {
                score: Number(entry.score) || 0,
                name: entry.name || "Player",
                id: entry.id || 0,
              }
        );
      }
    }
  } catch (err) {
    savedScores = [];
  }

  const addedIds = new Set();
  newEntries.forEach((entry, idx) => {
    const id = Date.now() + idx;
    addedIds.add(id);
    savedScores.push({
      score: entry.score,
      name: entry.name || "Player",
      id,
    });
  });

  savedScores.sort((a, b) => b.score - a.score);
  const topFive = savedScores.slice(0, 5);

  try {
    localStorage.setItem(TOP_SCORES_KEY, JSON.stringify(topFive));
  } catch (err) {
    // Ignore storage quota errors
  }

  if (!topScoresListEl) return;
  topScoresListEl.innerHTML = "";

  topFive.forEach((item, index) => {
    const li = document.createElement("li");
    const isCurrentRun = addedIds.has(item.id);
    li.className = isCurrentRun
      ? "top-score-item current-score"
      : "top-score-item";

    const rankSpan = document.createElement("span");
    rankSpan.className = "top-score-rank";
    rankSpan.textContent = `#${index + 1} ${item.name}`;

    const valueSpan = document.createElement("span");
    valueSpan.className = "top-score-value";
    valueSpan.textContent = `${item.score} ${item.score === 1 ? "pt" : "pts"}`;

    li.appendChild(rankSpan);
    li.appendChild(valueSpan);

    if (isCurrentRun) {
      const badgeSpan = document.createElement("span");
      badgeSpan.className = "top-score-badge";
      badgeSpan.textContent = "New";
      li.appendChild(badgeSpan);
    }

    topScoresListEl.appendChild(li);
  });
}

function endGame() {
  clearTimers();
  clearAllDrops();

  gameRunning = false;
  gamePaused = false;

  renderModeAndLobbyUI();
  startBtn.disabled = false;
  pauseBtn.classList.add("hidden");
  gameMessageEl.classList.remove("win-message", "lose-message");

  if (gameMode === "dual") {
    soloFinalScoreRow.classList.add("hidden");
    dualFinalScoreRow.classList.remove("hidden");

    p1FinalLabel.textContent = p1Name;
    p2FinalLabel.textContent = p2Name;
    p1FinalScoreEl.textContent = p1Score;
    p2FinalScoreEl.textContent = p2Score;

    const combined = p1Score + p2Score;

    if (p1Score > p2Score) {
      modalHeading.textContent = `🏆 ${p1Name} Wins!`;
      gameMessageEl.textContent = `${p1Name} led the charge with ${p1Score} drops! Together you collected ${combined} clean water drops for communities in need.`;
      gameMessageEl.classList.add("win-message");
      playSound("win");
    } else if (p2Score > p1Score) {
      modalHeading.textContent = `🏆 ${p2Name} Wins!`;
      gameMessageEl.textContent = `${p2Name} led the charge with ${p2Score} drops! Together you collected ${combined} clean water drops for communities in need.`;
      gameMessageEl.classList.add("win-message");
      playSound("win");
    } else {
      modalHeading.textContent = "🤝 It's a Tie!";
      gameMessageEl.textContent = `Both players tied at ${p1Score} points (${combined} total clean water drops collected together)!`;
      gameMessageEl.classList.add(
        combined >= 20 ? "win-message" : "lose-message"
      );
      playSound(combined >= 20 ? "win" : "lose");
    }

    updateAndRenderTopScores([
      { name: p1Name, score: p1Score },
      { name: p2Name, score: p2Score },
    ]);
  } else {
    soloFinalScoreRow.classList.remove("hidden");
    dualFinalScoreRow.classList.add("hidden");
    finalScoreEl.textContent = score;

    if (score >= 20) {
      modalHeading.textContent = "🎉 Mission Accomplished!";
      gameMessageEl.textContent =
        "Amazing work! You collected enough clean water to help bring safe drinking water to a community in need!";
      gameMessageEl.classList.add("win-message");
      playSound("win");
    } else {
      modalHeading.textContent = "Time's Up!";
      gameMessageEl.textContent = `You scored ${score} points. You need 20 points to complete the clean water goal — give it another try!`;
      gameMessageEl.classList.add("lose-message");
      playSound("lose");
    }

    updateAndRenderTopScores([{ name: "Solo Player", score }]);
  }

  gameOverModal.classList.remove("hidden");
}

// Initialize UI and WebSocket connection
renderModeAndLobbyUI();
initWebSocket();
