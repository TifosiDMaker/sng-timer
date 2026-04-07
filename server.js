const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const tournamentConfig = require("./config/tournament");

const PORT = 3000;
const HOST = "0.0.0.0";
const { blindLevels, careerEarningsBoard, levelDuration, thinkingDuration, timeCardExtra } = tournamentConfig;

function createInitialState() {
  return {
    tournamentStatus: "waiting",
    blindLevelIndex: 0,
    blindLevels,
    levelDuration,
    levelRemaining: levelDuration,
    thinkingDuration,
    thinkingRemaining: thinkingDuration,
    thinkingActive: false,
    thinkingResumeOnTournamentResume: false,
    timeCardExtra,
    careerEarningsBoard,
    alivePlayers: 6,
    currentLevel: blindLevels[0]
  };
}

let state = createInitialState();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get("/", (_req, res) => {
  res.redirect("/display");
});

app.get("/display", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "display", "index.html"));
});

app.get("/control", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "control", "index.html"));
});

app.use(express.static(path.join(__dirname, "public"), { redirect: false }));

function syncCurrentLevel() {
  state.currentLevel = state.blindLevels[state.blindLevelIndex];
}

function broadcastState() {
  syncCurrentLevel();
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
  syncCurrentLevel();
}

function resetTournamentState() {
  state = createInitialState();
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

  socket.on("playerAdd", () => {
    state.alivePlayers += 1;
    broadcastState();
  });

  socket.on("playerRemove", () => {
    state.alivePlayers = Math.max(0, state.alivePlayers - 1);
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
