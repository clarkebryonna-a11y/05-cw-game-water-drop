const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = 3000;

// Authoritative shared match state for real-time dual-player synchronization
const matchState = {
  mode: 'dual', // 'solo' | 'dual'
  difficulty: 'medium', // 'easy' | 'medium' | 'hard'
  p1Joined: false,
  p2Joined: false,
  p1Name: 'Player 1',
  p2Name: 'Player 2',
  p1Score: 0,
  p2Score: 0,
};

function broadcast(payload, excludeWs = null) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  // Send initial lobby & score state to newly connected client
  ws.send(JSON.stringify({ type: 'state:init', state: matchState }));

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      switch (data.type) {
        case 'mode:set': {
          matchState.mode = data.mode === 'solo' ? 'solo' : 'dual';
          broadcast({ type: 'state:sync', state: matchState });
          break;
        }
        case 'difficulty:set': {
          if (['easy', 'medium', 'hard'].includes(data.difficulty)) {
            matchState.difficulty = data.difficulty;
            broadcast({ type: 'state:sync', state: matchState });
          }
          break;
        }
        case 'player:join': {
          if (data.slot === 1) {
            matchState.p1Joined = true;
            if (data.name) matchState.p1Name = String(data.name).slice(0, 16);
          } else if (data.slot === 2) {
            matchState.p2Joined = true;
            if (data.name) matchState.p2Name = String(data.name).slice(0, 16);
          }
          broadcast({ type: 'state:sync', state: matchState });
          break;
        }
        case 'player:leave': {
          if (data.slot === 1) {
            matchState.p1Joined = false;
            matchState.p1Name = 'Player 1';
          } else if (data.slot === 2) {
            matchState.p2Joined = false;
            matchState.p2Name = 'Player 2';
          }
          broadcast({ type: 'state:sync', state: matchState });
          break;
        }
        case 'score:update': {
          if (typeof data.p1Score === 'number') matchState.p1Score = data.p1Score;
          if (typeof data.p2Score === 'number') matchState.p2Score = data.p2Score;
          broadcast({ type: 'score:sync', p1Score: matchState.p1Score, p2Score: matchState.p2Score }, ws);
          break;
        }
        case 'match:start': {
          matchState.p1Score = 0;
          matchState.p2Score = 0;
          broadcast({ type: 'match:started', state: matchState }, ws);
          break;
        }
        case 'drop:spawn': {
          broadcast({ type: 'drop:spawned', drop: data.drop }, ws);
          break;
        }
        case 'drop:collect': {
          broadcast({ type: 'drop:collected', dropId: data.dropId, player: data.player, isBad: data.isBad }, ws);
          break;
        }
        default:
          break;
      }
    } catch (err) {
      // Ignore malformed messages
    }
  });
});

const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <defs>
    <linearGradient id="cavern" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#071320"/>
      <stop offset="55%" stop-color="#0c2238"/>
      <stop offset="100%" stop-color="#061524"/>
    </linearGradient>
    <linearGradient id="waterGlow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0d4a7a" stop-opacity="0.6"/>
      <stop offset="50%" stop-color="#2E9DF7" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#0d4a7a" stop-opacity="0.6"/>
    </linearGradient>
    <radialGradient id="lantern" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFC907" stop-opacity="0.85"/>
      <stop offset="40%" stop-color="#FF902A" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#FF902A" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#cavern)"/>
  <path d="M0,0 L1600,0 L1600,260 Q1350,190 1120,250 Q850,160 600,240 Q320,170 0,250 Z" fill="#050e18"/>
  <path d="M0,900 L0,650 Q260,610 520,660 Q820,620 1120,665 Q1380,620 1600,660 L1600,900 Z" fill="url(#waterGlow)"/>
  <g fill="#3a2312" stroke="#241409" stroke-width="4">
    <rect x="110" y="140" width="44" height="620"/>
    <rect x="1446" y="140" width="44" height="620"/>
    <rect x="80" y="120" width="1440" height="38"/>
    <polygon points="154,260 280,158 310,158 154,295"/>
    <polygon points="1446,260 1320,158 1290,158 1446,295"/>
  </g>
  <circle cx="220" cy="240" r="140" fill="url(#lantern)"/>
  <circle cx="1380" cy="240" r="140" fill="url(#lantern)"/>
  <circle cx="220" cy="240" r="10" fill="#FFF3B0"/>
  <circle cx="1380" cy="240" r="10" fill="#FFF3B0"/>
</svg>`;

const containerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="mineDepth" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#081c2e"/>
      <stop offset="65%" stop-color="#0f3150"/>
      <stop offset="100%" stop-color="#0b2842"/>
    </linearGradient>
    <linearGradient id="stream" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2E9DF7" stop-opacity="0.55"/>
      <stop offset="50%" stop-color="#1b7fd1" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#094173" stop-opacity="0.95"/>
    </linearGradient>
    <radialGradient id="lampGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFC907" stop-opacity="0.9"/>
      <stop offset="45%" stop-color="#FF902A" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#FF902A" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="600" fill="url(#mineDepth)"/>
  <!-- Distant rock arches -->
  <path d="M0,0 L800,0 L800,130 Q660,75 530,115 Q400,55 270,115 Q130,70 0,130 Z" fill="#061320"/>
  <!-- Timber scaffolding beams -->
  <g fill="#472b16" stroke="#29170a" stroke-width="3">
    <rect x="28" y="60" width="26" height="460"/>
    <rect x="746" y="60" width="26" height="460"/>
    <rect x="14" y="48" width="772" height="24"/>
    <polygon points="54,150 140,72 165,72 54,174"/>
    <polygon points="746,150 660,72 635,72 746,174"/>
    <!-- Wooden side walkways -->
    <rect x="0" y="430" width="120" height="14"/>
    <rect x="680" y="430" width="120" height="14"/>
  </g>
  <!-- Lanterns -->
  <circle cx="95" cy="135" r="85" fill="url(#lampGlow)"/>
  <circle cx="705" cy="135" r="85" fill="url(#lampGlow)"/>
  <circle cx="95" cy="135" r="6" fill="#fff7c2"/>
  <circle cx="705" cy="135" r="6" fill="#fff7c2"/>
  <!-- Crystal subterranean water pool at bottom -->
  <path d="M0,485 Q200,468 400,485 T800,480 L800,600 L0,600 Z" fill="url(#stream)"/>
  <path d="M60,520 Q240,508 420,522 T740,518" fill="none" stroke="#8BD1CB" stroke-width="2.5" stroke-opacity="0.55"/>
  <path d="M120,555 Q310,545 510,558 T700,550" fill="none" stroke="#bce4ff" stroke-width="2" stroke-opacity="0.45"/>
</svg>`;

app.get('/img/water_mine_bg.jpg', (req, res, next) => {
  const filePath = path.join(__dirname, 'img', 'water_mine_bg.jpg');
  if (fs.existsSync(filePath)) return next();
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(bgSvg);
});

app.get('/img/water_mine_container.jpg', (req, res, next) => {
  const filePath = path.join(__dirname, 'img', 'water_mine_container.jpg');
  if (fs.existsSync(filePath)) return next();
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(containerSvg);
});

app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
