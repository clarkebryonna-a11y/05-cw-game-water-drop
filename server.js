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
  p1Name: 'You',
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
            matchState.p1Name = 'You';
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

// Outer Page Background: Gold Mine Cavern with Water Sluice Aqueducts & Underground River
const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <defs>
    <linearGradient id="goldCavern" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#231407"/>
      <stop offset="45%" stop-color="#3b230d"/>
      <stop offset="80%" stop-color="#2c1b0b"/>
      <stop offset="100%" stop-color="#122738"/>
    </linearGradient>
    <radialGradient id="goldLantern" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFF3A1" stop-opacity="0.95"/>
      <stop offset="30%" stop-color="#FFC907" stop-opacity="0.65"/>
      <stop offset="65%" stop-color="#FF902A" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#FF902A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="goldVein" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFF099"/>
      <stop offset="50%" stop-color="#FFC907"/>
      <stop offset="100%" stop-color="#C88A04"/>
    </linearGradient>
    <linearGradient id="aquiferRiver" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0e4f82"/>
      <stop offset="30%" stop-color="#2E9DF7"/>
      <stop offset="50%" stop-color="#6ce1ff"/>
      <stop offset="70%" stop-color="#2E9DF7"/>
      <stop offset="100%" stop-color="#0e4f82"/>
    </linearGradient>
    <linearGradient id="waterfall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8fe5ff" stop-opacity="0.9"/>
      <stop offset="50%" stop-color="#2E9DF7" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#6ce1ff" stop-opacity="0.95"/>
    </linearGradient>
  </defs>

  <!-- Warm Gold Mine Rock Backdrop -->
  <rect width="1600" height="900" fill="url(#goldCavern)"/>

  <!-- Layered Cavern Rock Walls -->
  <path d="M0,0 L1600,0 L1600,290 Q1380,210 1180,260 Q880,175 640,250 Q340,180 0,275 Z" fill="#1a0e04"/>
  <path d="M0,180 Q220,280 180,520 L0,680 Z" fill="#281607"/>
  <path d="M1600,180 Q1380,280 1420,520 L1600,680 Z" fill="#281607"/>

  <!-- Shimmering Gold Ore Veins & Nuggets in Cavern Walls -->
  <g stroke="url(#goldVein)" fill="none" stroke-linecap="round">
    <path d="M70,220 L135,260 L115,320 L175,370" stroke-width="6"/>
    <path d="M135,260 L195,245" stroke-width="4"/>
    <path d="M260,150 L310,205 L285,260" stroke-width="5"/>
    <path d="M1510,210 L1445,265 L1470,335 L1410,390" stroke-width="6"/>
    <path d="M1340,165 L1290,220 L1325,275" stroke-width="5"/>
    <path d="M75,480 L140,515 L120,565" stroke-width="5"/>
    <path d="M1520,470 L1455,510 L1480,560" stroke-width="5"/>
  </g>
  <!-- Glowing Gold Nuggets -->
  <g fill="url(#goldVein)">
    <polygon points="95,240 112,232 118,248 102,256"/>
    <polygon points="160,340 180,332 186,350 166,356"/>
    <polygon points="290,195 308,188 312,204 295,210"/>
    <polygon points="1480,250 1500,242 1505,260 1485,266"/>
    <polygon points="1420,360 1438,350 1445,368 1425,374"/>
    <polygon points="1305,215 1322,208 1328,225 1310,230"/>
    <circle cx="130" cy="500" r="8"/>
    <circle cx="1470" cy="495" r="9"/>
  </g>

  <!-- Left & Right Wooden Water Sluice Aqueducts Pouring Clean Water -->
  <g fill="#5c3818" stroke="#361e09" stroke-width="4">
    <!-- Left Sluice Flume -->
    <polygon points="0,330 290,375 290,405 0,365"/>
    <line x1="70" y1="342" x2="70" y2="520" stroke-width="10"/>
    <line x1="210" y1="364" x2="210" y2="550" stroke-width="10"/>
    <!-- Right Sluice Flume -->
    <polygon points="1600,330 1310,375 1310,405 1600,365"/>
    <line x1="1530" y1="342" x2="1530" y2="520" stroke-width="10"/>
    <line x1="1390" y1="364" x2="1390" y2="550" stroke-width="10"/>
  </g>

  <!-- Waterfalls Cascading from Gold Mine Sluice Boxes -->
  <path d="M265,385 Q295,450 285,680 L335,680 Q335,450 290,385 Z" fill="url(#waterfall)"/>
  <path d="M1335,385 Q1305,450 1315,680 L1265,680 Q1265,450 1310,385 Z" fill="url(#waterfall)"/>

  <!-- Heavy Timber Gold Mine Framing -->
  <g fill="#4d2e14" stroke="#291606" stroke-width="4">
    <rect x="90" y="90" width="48" height="650"/>
    <rect x="1462" y="90" width="48" height="650"/>
    <rect x="50" y="70" width="1500" height="42"/>
    <polygon points="138,220 270,112 305,112 138,260"/>
    <polygon points="1462,220 1330,112 1295,112 1462,260"/>
  </g>

  <!-- Warm Lantern Glows -->
  <circle cx="215" cy="215" r="180" fill="url(#goldLantern)"/>
  <circle cx="1385" cy="215" r="180" fill="url(#goldLantern)"/>
  <circle cx="215" cy="215" r="12" fill="#FFF9D2"/>
  <circle cx="1385" cy="215" r="12" fill="#FFF9D2"/>

  <!-- Underground Crystal-Blue & Gold-Panning River at Bottom -->
  <path d="M0,900 L0,655 Q270,620 540,665 Q800,630 1060,665 Q1330,620 1600,655 L1600,900 Z" fill="url(#aquiferRiver)"/>
  <!-- Golden Reflections on the Water Surface -->
  <path d="M80,715 Q290,695 500,720 T940,712 T1480,718" fill="none" stroke="#FFC907" stroke-width="3.5" stroke-opacity="0.65"/>
  <path d="M160,775 Q420,755 720,780 T1380,770" fill="none" stroke="#bce4ff" stroke-width="3" stroke-opacity="0.7"/>
  <path d="M240,835 Q600,815 980,840 T1460,830" fill="none" stroke="#FFC907" stroke-width="2.5" stroke-opacity="0.5"/>
</svg>`;

// Inner Game Container Background: Gold Mine Shaft with Overhead Water Sluice & Golden Stream
const containerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="goldShaft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#291708"/>
      <stop offset="50%" stop-color="#3d240e"/>
      <stop offset="82%" stop-color="#2a1c11"/>
      <stop offset="100%" stop-color="#0d3b61"/>
    </linearGradient>
    <linearGradient id="crystalStream" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2E9DF7" stop-opacity="0.82"/>
      <stop offset="45%" stop-color="#1579cc" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#094173" stop-opacity="0.98"/>
    </linearGradient>
    <radialGradient id="minerLamp" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFF5B8" stop-opacity="0.95"/>
      <stop offset="35%" stop-color="#FFC907" stop-opacity="0.65"/>
      <stop offset="70%" stop-color="#FF902A" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FF902A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="nuggetGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFF3A8"/>
      <stop offset="55%" stop-color="#FFC907"/>
      <stop offset="100%" stop-color="#B87D00"/>
    </linearGradient>
  </defs>

  <!-- Warm Gold Mine Rock Interior -->
  <rect width="800" height="600" fill="url(#goldShaft)"/>

  <!-- Textured Rock Cavern Archways -->
  <path d="M0,0 L800,0 L800,115 Q670,68 530,105 Q400,52 270,105 Q130,68 0,115 Z" fill="#1b0f05"/>
  <path d="M0,110 Q95,210 75,350 T110,490 L0,500 Z" fill="#231306" opacity="0.85"/>
  <path d="M800,110 Q705,210 725,350 T690,490 L800,500 Z" fill="#231306" opacity="0.85"/>

  <!-- Glowing Gold Ore Veins in the Mine Walls -->
  <g stroke="url(#nuggetGrad)" fill="none" stroke-linecap="round">
    <path d="M45,160 L95,205 L78,265 L125,310" stroke-width="4.5"/>
    <path d="M95,205 L145,190" stroke-width="3"/>
    <path d="M755,155 L700,205 L718,265 L672,315" stroke-width="4.5"/>
    <path d="M700,205 L650,192" stroke-width="3"/>
    <path d="M185,95 L220,140 L195,185" stroke-width="3.5"/>
    <path d="M615,95 L580,140 L605,185" stroke-width="3.5"/>
    <path d="M55,365 L110,395 L90,435" stroke-width="4"/>
    <path d="M745,365 L690,395 L710,435" stroke-width="4"/>
  </g>

  <!-- Gold Nuggets Embedded in the Cavern -->
  <g fill="url(#nuggetGrad)">
    <polygon points="65,185 80,178 85,192 70,198"/>
    <polygon points="112,285 128,278 134,294 116,299"/>
    <polygon points="205,130 220,124 224,138 208,143"/>
    <polygon points="725,185 740,178 745,192 730,198"/>
    <polygon points="675,285 690,278 696,294 678,299"/>
    <polygon points="582,130 598,124 602,138 586,143"/>
    <circle cx="88" cy="382" r="6.5"/>
    <circle cx="712" cy="382" r="6.5"/>
    <circle cx="395" cy="92" r="5.5"/>
  </g>

  <!-- Overhead Wooden Water Sluice / Aqueduct Channel at Top of Shaft -->
  <g fill="#593516" stroke="#2e1908" stroke-width="3">
    <rect x="18" y="34" width="764" height="24" rx="4"/>
    <!-- Sluice water channel lip -->
    <rect x="60" y="26" width="680" height="10" fill="#2E9DF7" stroke="#1b6fb3" stroke-width="1.5"/>
    <!-- Timber Support Pillars & Crossbeams -->
    <rect x="22" y="56" width="28" height="440"/>
    <rect x="750" y="56" width="28" height="440"/>
    <polygon points="50,145 140,58 168,58 50,172"/>
    <polygon points="750,145 660,58 632,58 750,172"/>
    <!-- Side Wooden Walkways & Sluice Platforms -->
    <rect x="0" y="425" width="145" height="14"/>
    <rect x="655" y="425" width="145" height="14"/>
  </g>

  <!-- Gold-Laden Mine Cart on Left Walkway & Water Barrel on Right Walkway -->
  <g>
    <!-- Pile of Gold Ore in Cart -->
    <path d="M58,392 Q78,372 98,392 Z" fill="url(#nuggetGrad)"/>
    <!-- Mine Cart Body -->
    <polygon points="52,390 104,390 96,416 60,416" fill="#3a4b59" stroke="#FFC907" stroke-width="2"/>
    <circle cx="65" cy="420" r="5" fill="#FFC907"/>
    <circle cx="91" cy="420" r="5" fill="#FFC907"/>
    <!-- Yellow Jerry Can / Water Tank on Right Platform -->
    <rect x="700" y="386" width="28" height="36" rx="5" fill="#FFC907" stroke="#b87d00" stroke-width="2"/>
    <rect x="708" y="392" width="12" height="6" rx="2" fill="#291708"/>
    <path d="M706,405 L722,405 M714,398 L714,414" stroke="#b87d00" stroke-width="2.5"/>
  </g>

  <!-- Hanging Gold Mine Lanterns -->
  <circle cx="105" cy="130" r="105" fill="url(#minerLamp)"/>
  <circle cx="695" cy="130" r="105" fill="url(#minerLamp)"/>
  <circle cx="400" cy="105" r="90" fill="url(#minerLamp)"/>
  <circle cx="105" cy="130" r="7" fill="#FFF8CC"/>
  <circle cx="695" cy="130" r="7" fill="#FFF8CC"/>

  <!-- Subterranean Crystal-Blue Water Pool & Gold Panning Stream at Bottom -->
  <path d="M0,478 Q200,460 400,478 T800,474 L800,600 L0,600 Z" fill="url(#crystalStream)"/>
  <!-- Shimmering Gold Dust & Water Ripples in the Pool -->
  <path d="M45,512 Q230,496 410,514 T755,508" fill="none" stroke="#FFC907" stroke-width="2.5" stroke-opacity="0.7"/>
  <path d="M95,545 Q300,532 510,548 T720,540" fill="none" stroke="#8fe5ff" stroke-width="2.5" stroke-opacity="0.65"/>
  <path d="M140,575 Q380,564 590,578 T740,572" fill="none" stroke="#FFC907" stroke-width="2" stroke-opacity="0.55"/>
  <!-- Gold Nuggets Resting on the Stream Bed -->
  <g fill="url(#nuggetGrad)" opacity="0.85">
    <ellipse cx="180" cy="585" rx="9" ry="5"/>
    <ellipse cx="340" cy="590" rx="7" ry="4"/>
    <ellipse cx="520" cy="584" rx="10" ry="5"/>
    <ellipse cx="660" cy="588" rx="8" ry="4.5"/>
  </g>
</svg>`;

app.get('/img/water_mine_bg.jpg', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(bgSvg);
});

app.get('/img/water_mine_container.jpg', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(containerSvg);
});

app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
