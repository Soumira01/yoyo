/**
 * YOYO Game Server
 * WebSocket server for real-time multiplayer
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ── HTTP Server (serve static files) ────────────────────────────────────────
const mimeTypes = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const httpServer = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback to index.html for SPA
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (err2, d2) => {
          if (err2) { res.writeHead(500); res.end('Server Error'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(d2);
        });
      } else {
        res.writeHead(500); res.end('Server Error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// ── Game State ────────────────────────────────────────────────────────────────
const rooms = new Map(); // roomCode → Room

function generateCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); }
  while (rooms.has(code));
  return code;
}

const NAMES   = ['Aria','Blaze','Cleo','Dex','Echo','Finn','Gaia','Hex','Iris','Jax','Kira','Leo','Mira','Neo','Ora','Pax','Quinn','Rex','Sage','Taz'];
const AVATARS = ['🤖','👾','🦊','🐺','🦋','🐉','👻','🎭','🦅','🐬','🦁','🐸','🎪','🦑','🐙','🌟','⚡','🔥','🌊','🎯'];

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function createRoom(code, mode = 'multi') {
  return {
    code,
    mode,            // 'multi' | 'ai'
    players: [],     // [{ws, id, name, avatar, color}]
    state: {
      points: [],    // [{x, y, color}]
      squares: [],   // [{x, y, size, color, number, player}]
      scores: { red: 0, blue: 0 },
      turn: null,    // 'red' | 'blue'
      turnTimer: null,
      gameTimer: null,
      gameStarted: false,
      gameOver: false,
      timeLeft: 600, // 10 minutes in seconds
      turnTimeLeft: 8,
    }
  };
}

// ── Square Detection ──────────────────────────────────────────────────────────
function detectNewSquares(points, color, squaresAlready) {
  const colorPts = points.filter(p => p.color === color);
  const ptSet = new Set(colorPts.map(p => `${p.x},${p.y}`));
  const squareSet = new Set(squaresAlready.map(s => `${s.x},${s.y},${s.size},${s.color}`));
  const found = [];

  for (let i = 0; i < colorPts.length; i++) {
    for (let j = i + 1; j < colorPts.length; j++) {
      const p1 = colorPts[i], p2 = colorPts[j];
      // p1 is top-left, p2 is top-right candidate (same row)
      if (p1.y !== p2.y) continue;
      const size = p2.x - p1.x;
      if (size <= 0) continue;
      // check bottom two
      if (ptSet.has(`${p1.x},${p1.y + size}`) && ptSet.has(`${p2.x},${p2.y + size}`)) {
        const key = `${p1.x},${p1.y},${size},${color}`;
        if (!squareSet.has(key) && !found.find(s => s.x===p1.x&&s.y===p1.y&&s.size===size&&s.color===color)) {
          found.push({ x: p1.x, y: p1.y, size, color });
        }
      }
    }
  }
  return found;
}

// ── AI Logic ──────────────────────────────────────────────────────────────────
function aiMove(room) {
  const state = room.state;
  const aiColor = room.players.find(p => p.isAI)?.color;
  const humanColor = aiColor === 'red' ? 'blue' : 'red';
  if (!aiColor) return null;

  const ptSet = new Set(state.points.map(p => `${p.x},${p.y}`));
  const allPts = state.points;

  // Gather all candidate positions near existing points
  const candidates = new Set();
  const range = 5;
  if (allPts.length === 0) {
    candidates.add('10,10');
  } else {
    for (const p of allPts) {
      for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
          const nx = p.x + dx, ny = p.y + dy;
          if (nx >= 0 && ny >= 0 && nx < 100 && ny < 100 && !ptSet.has(`${nx},${ny}`)) {
            candidates.add(`${nx},${ny}`);
          }
        }
      }
    }
    if (candidates.size === 0) {
      for (let x = 0; x < 100; x++) for (let y = 0; y < 100; y++) {
        if (!ptSet.has(`${x},${y}`)) candidates.add(`${x},${y}`);
      }
    }
  }

  // Try to complete an AI square
  for (const cStr of candidates) {
    const [cx, cy] = cStr.split(',').map(Number);
    const testPoints = [...allPts, { x: cx, y: cy, color: aiColor }];
    const newSq = detectNewSquares(testPoints, aiColor, state.squares);
    if (newSq.length > 0) return { x: cx, y: cy };
  }

  // Try to block human square
  for (const cStr of candidates) {
    const [cx, cy] = cStr.split(',').map(Number);
    const testPoints = [...allPts, { x: cx, y: cy, color: humanColor }];
    const newSq = detectNewSquares(testPoints, humanColor, state.squares);
    if (newSq.length > 0) return { x: cx, y: cy };
  }

  // Random near existing points
  const arr = Array.from(candidates);
  const pick = arr[Math.floor(Math.random() * arr.length)];
  const [px, py] = pick.split(',').map(Number);
  return { x: px, y: py };
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────
function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  for (const p of room.players) send(p.ws, msg);
}

function broadcastState(room) {
  const state = room.state;
  for (const p of room.players) {
    send(p.ws, {
      type: 'STATE_UPDATE',
      points: state.points,
      squares: state.squares,
      scores: state.scores,
      turn: state.turn,
      turnTimeLeft: state.turnTimeLeft,
      timeLeft: state.timeLeft,
      gameOver: state.gameOver,
      yourColor: p.color,
      players: room.players.map(pl => ({ name: pl.name, avatar: pl.avatar, color: pl.color, isAI: pl.isAI || false })),
    });
  }
}

// ── Turn & Game Timers ────────────────────────────────────────────────────────
function clearTurnTimer(room) {
  if (room.state.turnTimer) { clearInterval(room.state.turnTimer); room.state.turnTimer = null; }
}

function startTurnTimer(room) {
  clearTurnTimer(room);
  room.state.turnTimeLeft = 8;
  room.state.turnTimer = setInterval(() => {
    room.state.turnTimeLeft--;
    broadcastState(room);
    if (room.state.turnTimeLeft <= 0) {
      // Pass turn
      switchTurn(room);
      // If AI turn, do AI move after short delay
      if (room.mode === 'ai') {
        const currentPlayer = room.players.find(p => p.color === room.state.turn);
        if (currentPlayer?.isAI) {
          setTimeout(() => doAIMove(room), 800);
        }
      }
    }
  }, 1000);
}

function switchTurn(room) {
  room.state.turn = room.state.turn === 'red' ? 'blue' : 'red';
  startTurnTimer(room);
}

function startGameTimers(room) {
  room.state.gameTimer = setInterval(() => {
    room.state.timeLeft--;
    broadcastState(room);
    if (room.state.timeLeft <= 0) endGame(room);
  }, 1000);
}

function endGame(room) {
  clearTurnTimer(room);
  if (room.state.gameTimer) { clearInterval(room.state.gameTimer); room.state.gameTimer = null; }
  room.state.gameOver = true;
  room.state.gameStarted = false;
  const s = room.state.scores;
  let winner = null;
  if (s.red > s.blue) winner = 'red';
  else if (s.blue > s.red) winner = 'blue';
  broadcast(room, { type: 'GAME_OVER', scores: s, winner });
  // Cleanup room after delay
  setTimeout(() => rooms.delete(room.code), 60000);
}

function startGame(room) {
  room.state.gameStarted = true;
  room.state.turn = Math.random() < 0.5 ? 'red' : 'blue';
  startTurnTimer(room);
  startGameTimers(room);
  broadcastState(room);
  broadcast(room, { type: 'GAME_START', turn: room.state.turn });
  // If AI starts
  if (room.mode === 'ai') {
    const currentPlayer = room.players.find(p => p.color === room.state.turn);
    if (currentPlayer?.isAI) {
      setTimeout(() => doAIMove(room), 1200);
    }
  }
}

function doAIMove(room) {
  if (room.state.gameOver || !room.state.gameStarted) return;
  const aiPlayer = room.players.find(p => p.isAI);
  if (!aiPlayer || room.state.turn !== aiPlayer.color) return;

  const move = aiMove(room);
  if (!move) return;
  handlePlacePoint(room, aiPlayer, move.x, move.y);
}

function handlePlacePoint(room, player, x, y) {
  const state = room.state;
  if (state.gameOver || !state.gameStarted) return;
  if (state.turn !== player.color) return;
  if (x < 0 || y < 0 || x >= 100 || y >= 100) return;
  if (state.points.find(p => p.x === x && p.y === y)) return;

  state.points.push({ x, y, color: player.color });

  // Detect new squares
  const newSquares = detectNewSquares(state.points, player.color, state.squares);
  let scored = newSquares.length;
  for (const sq of newSquares) {
    sq.number = state.squares.length + 1;
    sq.player = player.color;
    state.squares.push(sq);
    state.scores[player.color]++;
  }

  // Announce new squares
  if (scored > 0) {
    broadcast(room, { type: 'SQUARES_FORMED', squares: newSquares, color: player.color, scored });
  }

  // Switch turn (player keeps turn only if they scored — removed per rules, always switch)
  switchTurn(room);

  broadcastState(room);

  // AI move
  if (room.mode === 'ai') {
    const nextPlayer = room.players.find(p => p.color === state.turn);
    if (nextPlayer?.isAI) {
      setTimeout(() => doAIMove(room), 900 + Math.random() * 400);
    }
  }
}

// ── WebSocket Server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentPlayer = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'CREATE_ROOM': {
        const code = generateCode();
        const room = createRoom(code, 'multi');
        const color = Math.random() < 0.5 ? 'red' : 'blue';
        const player = {
          ws, id: code + '_1',
          name: randomFrom(NAMES),
          avatar: randomFrom(AVATARS),
          color,
          isAI: false,
        };
        room.players.push(player);
        rooms.set(code, room);
        currentRoom = room;
        currentPlayer = player;
        send(ws, { type: 'ROOM_CREATED', code, yourColor: color, yourName: player.name, yourAvatar: player.avatar });
        break;
      }

      case 'JOIN_ROOM': {
        const code = String(msg.code);
        const room = rooms.get(code);
        if (!room) { send(ws, { type: 'ERROR', message: 'Code invalide. Partie introuvable.' }); break; }
        if (room.players.length >= 2) { send(ws, { type: 'ERROR', message: 'La partie est déjà complète.' }); break; }
        if (room.state.gameStarted) { send(ws, { type: 'ERROR', message: 'La partie a déjà commencé.' }); break; }

        const takenColor = room.players[0].color;
        const color = takenColor === 'red' ? 'blue' : 'red';
        const player = {
          ws, id: code + '_2',
          name: randomFrom(NAMES),
          avatar: randomFrom(AVATARS),
          color,
          isAI: false,
        };
        room.players.push(player);
        currentRoom = room;
        currentPlayer = player;

        send(ws, { type: 'ROOM_JOINED', code, yourColor: color, yourName: player.name, yourAvatar: player.avatar });

        // Notify player 1
        broadcast(room, {
          type: 'OPPONENT_JOINED',
          players: room.players.map(p => ({ name: p.name, avatar: p.avatar, color: p.color }))
        });

        // Start game
        startGame(room);
        break;
      }

      case 'START_AI_GAME': {
        const code = generateCode();
        const room = createRoom(code, 'ai');
        const humanColor = Math.random() < 0.5 ? 'red' : 'blue';
        const aiColor = humanColor === 'red' ? 'blue' : 'red';

        const humanPlayer = {
          ws, id: code + '_human',
          name: 'Yoyo Moi',
          avatar: randomFrom(AVATARS),
          color: humanColor,
          isAI: false,
        };
        const aiPlayer = {
          ws: null, id: code + '_ai',
          name: 'Yoyo IA',
          avatar: '🤖',
          color: aiColor,
          isAI: true,
        };

        room.players.push(humanPlayer, aiPlayer);
        rooms.set(code, room);
        currentRoom = room;
        currentPlayer = humanPlayer;

        send(ws, {
          type: 'AI_GAME_READY',
          code,
          yourColor: humanColor,
          yourName: humanPlayer.name,
          yourAvatar: humanPlayer.avatar,
          aiName: 'Yoyo IA',
          aiAvatar: '🤖',
          aiColor,
        });

        startGame(room);
        break;
      }

      case 'PLACE_POINT': {
        if (!currentRoom || !currentPlayer) break;
        handlePlacePoint(currentRoom, currentPlayer, msg.x, msg.y);
        break;
      }

      case 'ABANDON': {
        if (!currentRoom || !currentPlayer) break;
        broadcast(currentRoom, { type: 'PLAYER_ABANDONED', color: currentPlayer.color });
        endGame(currentRoom);
        break;
      }

      case 'PING': {
        send(ws, { type: 'PONG' });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && !currentRoom.state.gameOver) {
      // If opponent disconnects mid-game
      if (currentRoom.state.gameStarted) {
        broadcast(currentRoom, { type: 'OPPONENT_DISCONNECTED' });
        endGame(currentRoom);
      } else {
        rooms.delete(currentRoom.code);
      }
    }
  });

  ws.on('error', () => {});
});

httpServer.listen(PORT, () => {
  console.log(`\n🎮 YOYO Game Server running on http://localhost:${PORT}`);
  console.log(`   WebSocket ready on ws://localhost:${PORT}\n`);
});
