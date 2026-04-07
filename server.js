const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const tournamentConfig = require("./config/tournament");

const PORT = 3000;
const HOST = "0.0.0.0";
const STATE_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(STATE_DIR, "session-state.json");
const {
  blindLevels,
  bountyRate,
  careerEarningsBoard,
  defaultBuyIn,
  levelDuration,
  startingStack,
  thinkingDuration,
  timeCardExtra
} = tournamentConfig;

function getDefaultLevelDurationMinutes(startingEntries) {
  return startingEntries <= 7 ? 8 : 10;
}

function normalizeLevelDurationMinutes(value, fallbackMinutes) {
  const parsed = Number.parseInt(value, 10);
  const safeValue = Number.isFinite(parsed) ? parsed : fallbackMinutes;
  return Math.min(Math.max(safeValue, 1), 60);
}

function cloneBlindLevels() {
  return blindLevels.map((level) => ({ ...level }));
}

function calculatePayouts(prizePoolValue, startingEntriesValue) {
  const prizePool = Math.max(0, Math.round(prizePoolValue || 0));
  const isTwoPaid = startingEntriesValue <= 7;

  if (isTwoPaid) {
    const first = Math.round(prizePool * 0.65);
    const second = prizePool - first;
    return { first, second, third: 0 };
  }

  const first = Math.round(prizePool * 0.5);
  const second = Math.round(prizePool * 0.3);
  const third = prizePool - first - second;
  return { first, second, third };
}

function createInitialState(overrides = {}) {
  const baseStartingEntries = Number(overrides.startingEntries || 6);
  const fallbackMinutes = getDefaultLevelDurationMinutes(baseStartingEntries);
  const chosenMinutes = normalizeLevelDurationMinutes(
    overrides.levelDurationMinutes,
    fallbackMinutes
  );
  const normalizedLevelDuration = chosenMinutes * 60;

  const nextState = {
    sessionConfigured: Boolean(overrides.sessionConfigured),
    tournamentStatus: "waiting",
    blindLevelIndex: 0,
    blindLevels: cloneBlindLevels(),
    currentLevel: cloneBlindLevels()[0],
    levelDurationMinutes: chosenMinutes,
    levelDuration: normalizedLevelDuration,
    levelRemaining: normalizedLevelDuration,
    thinkingDuration,
    thinkingRemaining: thinkingDuration,
    thinkingActive: false,
    thinkingResumeOnTournamentResume: false,
    timeCardExtra,
    careerEarningsBoard: careerEarningsBoard.map((entry) => ({ ...entry })),
    startingEntries: baseStartingEntries,
    reentries: 0,
    alivePlayers: baseStartingEntries,
    startingStack,
    buyIn: Number(overrides.buyIn ?? defaultBuyIn),
    bountyRate,
    totalCollected: 0,
    bountyRemoved: 0,
    prizePool: 0,
    payouts: { first: 0, second: 0, third: 0 },
    avgStack: startingStack,
    avgBB: startingStack / blindLevels[0].bb
  };

  recomputeDerivedState(nextState);
  return nextState;
}

function recomputeDerivedState(targetState) {
  targetState.currentLevel =
    targetState.blindLevels[targetState.blindLevelIndex] ||
    targetState.blindLevels[0];

  const totalEntries = Math.max(0, Number(targetState.startingEntries) || 0) +
    Math.max(0, Number(targetState.reentries) || 0);
  const safeAlivePlayers = Math.max(0, Number(targetState.alivePlayers) || 0);
  const totalCollected = totalEntries * (Number(targetState.buyIn) || 0);
  const bountyRemoved = Math.round(
    Math.max(0, Number(targetState.reentries) || 0) *
      (Number(targetState.buyIn) || 0) *
      (Number(targetState.bountyRate) || 0)
  );
  const prizePool = Math.max(0, Math.round(totalCollected - bountyRemoved));
  const totalChips = totalEntries * (Number(targetState.startingStack) || 0);
  const avgStack = safeAlivePlayers > 0 ? totalChips / safeAlivePlayers : 0;
  const bb = Number(targetState.currentLevel?.bb) || 0;
  const avgBB = safeAlivePlayers > 0 && bb > 0 ? avgStack / bb : 0;

  targetState.totalCollected = totalCollected;
  targetState.bountyRemoved = bountyRemoved;
  targetState.prizePool = prizePool;
  targetState.payouts = calculatePayouts(prizePool, targetState.startingEntries);
  targetState.avgStack = avgStack;
  targetState.avgBB = avgBB;
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function persistState() {
  ensureStateDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return createInitialState();
    }

    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const restored = createInitialState({
      sessionConfigured: parsed.sessionConfigured,
      startingEntries: parsed.startingEntries,
      levelDurationMinutes: parsed.levelDurationMinutes || Math.round((parsed.levelDuration || levelDuration) / 60),
      buyIn: parsed.buyIn
    });

    Object.assign(restored, parsed, {
      blindLevels: cloneBlindLevels(),
      careerEarningsBoard: Array.isArray(parsed.careerEarningsBoard) && parsed.careerEarningsBoard.length > 0
        ? parsed.careerEarningsBoard.map((entry) => ({ ...entry }))
        : careerEarningsBoard.map((entry) => ({ ...entry }))
    });
    recomputeDerivedState(restored);
    return restored;
  } catch (_error) {
    return createInitialState();
  }
}

let state = loadState();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.redirect(state.sessionConfigured ? "/display" : "/setup");
});

app.get("/setup", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "setup", "index.html"));
});

app.post("/setup", (req, res) => {
  const startingEntries = Math.min(
    10,
    Math.max(6, Number.parseInt(req.body.startingEntries, 10) || 6)
  );
  const levelDurationMinutes = normalizeLevelDurationMinutes(
    req.body.levelDurationMinutes,
    getDefaultLevelDurationMinutes(startingEntries)
  );
  const buyIn = Math.max(0, Number.parseInt(req.body.buyIn, 10) || defaultBuyIn);

  state = createInitialState({
    sessionConfigured: true,
    startingEntries,
    levelDurationMinutes,
    buyIn
  });
  persistState();
  broadcastState();
  res.redirect("/display");
});

app.get("/display", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "display", "index.html"));
});

app.get("/control", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "control", "index.html"));
});

app.get("/api/state", (_req, res) => {
  res.json(state);
});

app.use(express.static(path.join(__dirname, "public"), { redirect: false }));

function broadcastState() {
  recomputeDerivedState(state);
  persistState();
  io.emit("stateUpdate", state);
}

function resetLevelTimer() {
  state.levelRemaining = state.levelDuration;
}

function resetThinkingTimer() {
  state.thinkingRemaining = state.thinkingDuration;
  state.thinkingActive = false;
  state.thinkingResumeOnTournamentResume = false;
}

function setThinkingState(shouldRun) {
  if (state.tournamentStatus === "paused") {
    state.thinkingActive = false;
    state.thinkingResumeOnTournamentResume = shouldRun && state.thinkingRemaining > 0;
    return;
  }

  state.thinkingActive = shouldRun && state.thinkingRemaining > 0;
  state.thinkingResumeOnTournamentResume = false;
}

function clampBlindLevelIndex(nextIndex) {
  return Math.min(Math.max(nextIndex, 0), state.blindLevels.length - 1);
}

function goToLevel(nextIndex) {
  state.blindLevelIndex = clampBlindLevelIndex(nextIndex);
  resetLevelTimer();
  recomputeDerivedState(state);
}

function resetTournamentState() {
  state = createInitialState({
    sessionConfigured: state.sessionConfigured,
    startingEntries: state.startingEntries,
    levelDurationMinutes: state.levelDurationMinutes,
    buyIn: state.buyIn
  });
}

function adjustAlivePlayers(delta) {
  state.alivePlayers = Math.max(0, state.alivePlayers + delta);
}

function adjustReentries(delta) {
  state.reentries = Math.max(0, state.reentries + delta);
}

function eliminatePlayer() {
  adjustAlivePlayers(-1);
}

function reenterPlayer() {
  adjustReentries(1);
  adjustAlivePlayers(1);
}

setInterval(() => {
  let changed = false;

  if (state.tournamentStatus === "running") {
    if (state.levelRemaining > 0) {
      state.levelRemaining -= 1;
      changed = true;
    }

    if (state.levelRemaining <= 0) {
      if (state.blindLevelIndex < state.blindLevels.length - 1) {
        state.blindLevelIndex += 1;
        resetLevelTimer();
      } else {
        state.levelRemaining = 0;
        state.tournamentStatus = "ended";
      }
      changed = true;
    }
  }

  if (state.thinkingActive) {
    if (state.thinkingRemaining > 0) {
      state.thinkingRemaining -= 1;
      changed = true;
    }

    if (state.thinkingRemaining <= 0) {
      state.thinkingRemaining = 0;
      state.thinkingActive = false;
      changed = true;
    }
  }

  if (changed) {
    broadcastState();
  }
}, 1000);

io.on("connection", (socket) => {
  socket.emit("stateUpdate", state);

  socket.on("startTournament", () => {
    if (!state.sessionConfigured) {
      return;
    }

    if (state.tournamentStatus === "waiting" || state.tournamentStatus === "ended") {
      goToLevel(0);
      resetThinkingTimer();
    }

    state.tournamentStatus = "running";
    broadcastState();
  });

  socket.on("pauseTournament", () => {
    if (state.tournamentStatus === "running") {
      if (state.thinkingActive) {
        state.thinkingResumeOnTournamentResume = true;
        state.thinkingActive = false;
      }
      state.tournamentStatus = "paused";
      broadcastState();
    }
  });

  socket.on("resumeTournament", () => {
    if (state.tournamentStatus === "paused") {
      state.tournamentStatus = "running";
      if (state.thinkingResumeOnTournamentResume && state.thinkingRemaining > 0) {
        state.thinkingActive = true;
      }
      state.thinkingResumeOnTournamentResume = false;
      broadcastState();
    }
  });

  socket.on("nextLevel", () => {
    if (state.blindLevelIndex < state.blindLevels.length - 1) {
      goToLevel(state.blindLevelIndex + 1);
      broadcastState();
    }
  });

  socket.on("prevLevel", () => {
    if (state.blindLevelIndex > 0) {
      goToLevel(state.blindLevelIndex - 1);
      broadcastState();
    }
  });

  socket.on("startThinking", () => {
    if (state.thinkingRemaining <= 0) {
      state.thinkingRemaining = state.thinkingDuration;
    }
    setThinkingState(true);
    broadcastState();
  });

  socket.on("resetThinking", () => {
    state.thinkingRemaining = state.thinkingDuration;
    setThinkingState(true);
    broadcastState();
  });

  socket.on("pauseThinking", () => {
    setThinkingState(false);
    broadcastState();
  });

  socket.on("useTimeCard", () => {
    state.thinkingRemaining += state.timeCardExtra;
    setThinkingState(true);
    broadcastState();
  });

  socket.on("eliminatePlayer", () => {
    eliminatePlayer();
    broadcastState();
  });

  socket.on("reenterPlayer", () => {
    reenterPlayer();
    broadcastState();
  });

  socket.on("playerAdd", () => {
    adjustAlivePlayers(1);
    broadcastState();
  });

  socket.on("playerRemove", () => {
    adjustAlivePlayers(-1);
    broadcastState();
  });

  socket.on("adjustAlivePlayers", (delta) => {
    adjustAlivePlayers(Number(delta) || 0);
    broadcastState();
  });

  socket.on("adjustReentries", (delta) => {
    adjustReentries(Number(delta) || 0);
    broadcastState();
  });

  socket.on("resetTournament", () => {
    resetTournamentState();
    broadcastState();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`SNG timer listening on http://${HOST}:${PORT}`);
});
