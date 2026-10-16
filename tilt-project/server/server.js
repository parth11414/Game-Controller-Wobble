
/**
 * VINNOVATE — Phone-as-controller server
 *
 * HTTP:
 *   GET /api/room?code=XXXXX
 *
 * WebSocket protocol:
 *   phone  -> { type: 'join', room, role: 'phone', pid? }
 *   laptop -> { type: 'join', room, role: 'laptop' }
 *
 * Supports up to 4 phones per room.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'game');

const ROOM_TTL_MS = 10 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_LAPTOP_BUFFER = 8 * 1024;
const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];
const MAX_PLAYERS = COLORS.length;

const BUTTONS = new Set(['jump', 'dash']);
const HAPTICS = new Set(['star', 'fall', 'level']);

// Production configuration
const PUBLIC_WS_URL = (
  process.env.PUBLIC_WS_URL ||
  'wss://game-controller-wobble.onrender.com'
).replace(/\/+$/, '');

const ALLOWED_ORIGINS = new Set([
  'https://game-controller-wobble-game.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  ...(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
]);

// ---------- Helpers ----------

const num = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.max(min, Math.min(max, n))
    : 0;
};

function lanAddresses() {
  const result = [];

  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (
        (address.family === 'IPv4' || address.family === 4) &&
        !address.internal
      ) {
        result.push({ name, address: address.address });
      }
    }
  }

  const score = (item) =>
    /vethernet|virtual|vmware|vbox|wsl|docker|hyper-v|loopback/i.test(
      item.name
    )
      ? 0
      : /^192\.168\./.test(item.address)
        ? 3
        : /^10\./.test(item.address)
          ? 2
          : 1;

  return result.sort((a, b) => score(b) - score(a));
}

function getLanIp() {
  if (process.env.HOST_IP) return process.env.HOST_IP;

  const addresses = lanAddresses();
  return addresses.length ? addresses[0].address : 'localhost';
}

const send = (ws, message) => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
};

// ---------- Rooms ----------

// room = {
//   code,
//   laptop: WebSocket | null,
//   players: Map(pid -> { pid, slot, ws, lastSeen }),
//   lastActive
// }

const rooms = new Map();

const isValidCode = (code) =>
  code.length === 5 &&
  [...code].every((character) => ALPHABET.includes(character));

function createRoom(wantedCode) {
  let code =
    wantedCode && isValidCode(wantedCode) && !rooms.has(wantedCode)
      ? wantedCode
      : null;

  while (!code || rooms.has(code)) {
    code = Array.from(
      { length: 5 },
      () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    ).join('');
  }

  const room = {
    code,
    laptop: null,
    players: new Map(),
    lastActive: Date.now(),
  };

  rooms.set(code, room);
  return room;
}

const connectedPhones = (room) =>
  [...room.players.values()].filter((player) => player.ws);

setInterval(() => {
  const now = Date.now();

  for (const [code, room] of rooms) {
    if (
      !room.laptop &&
      connectedPhones(room).length === 0 &&
      now - room.lastActive > ROOM_TTL_MS
    ) {
      rooms.delete(code);
    }
  }
}, 60_000).unref();

// ---------- HTTP ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const isRoomApi = url.pathname === '/api/room';

    // CORS for the browser website's API requests.
    const origin = req.headers.origin;

    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type'
      );
    }

    // Handle browser preflight requests.
    if (isRoomApi && req.method === 'OPTIONS') {
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        res.writeHead(403);
        return res.end('Origin not allowed');
      }

      res.writeHead(204);
      return res.end();
    }

    if (isRoomApi) {
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET, OPTIONS' });
        return res.end('Method not allowed');
      }

      // Reject browser requests from unapproved origins.
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        res.writeHead(403);
        return res.end('Origin not allowed');
      }

      const wantedCode = (
        url.searchParams.get('code') || ''
      ).toUpperCase();

      // Reuse the requested room when it already exists.
      let room = rooms.get(wantedCode);

      if (!room) {
        room = createRoom(wantedCode);
      }

      // Public secure WebSocket URL for production.
      // For local development, HOST_IP can be used to generate
      // a LAN WebSocket URL when PUBLIC_WS_URL is not set.
      let wsUrl = PUBLIC_WS_URL;

      if (
        process.env.NODE_ENV !== 'production' &&
        !process.env.PUBLIC_WS_URL
      ) {
        wsUrl = `ws://${getLanIp()}:${PORT}`;
      }

      const qr = await QRCode.toDataURL(
        JSON.stringify({
          server: wsUrl,
          room: room.code,
        }),
        {
          margin: 1,
          width: 320,
          errorCorrectionLevel: 'M',
        }
      );

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });

      return res.end(
        JSON.stringify({
          room: room.code,
          server: wsUrl,
          qr,
          maxPlayers: MAX_PLAYERS,
        })
      );
    }

    // Serve the browser game for direct/local access too.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end('Method not allowed');
    }

    const relativePath =
      url.pathname === '/'
        ? 'index.html'
        : decodeURIComponent(url.pathname).replace(/^\/+/, '');

    const filePath = path.resolve(PUBLIC_DIR, relativePath);
    const rootPath = path.resolve(PUBLIC_DIR);

    if (
      filePath !== rootPath &&
      !filePath.startsWith(rootPath + path.sep)
    ) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end('Not found');
      }

      res.writeHead(200, {
        'Content-Type':
          MIME[path.extname(filePath).toLowerCase()] ||
          'application/octet-stream',
      });

      if (req.method === 'HEAD') {
        return res.end();
      }

      res.end(data);
    });
  } catch (error) {
    console.error('HTTP request error:', error);

    if (!res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
      });
    }

    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// ---------- WebSocket ----------

const wss = new WebSocketServer({ server });

const clearCtx = (ws) => {
  ws.ctx = { room: null, role: null, pid: null };
};

function leave(ws) {
  const { room, role, pid } = ws.ctx || {};

  if (!room) return;

  if (role === 'laptop' && room.laptop === ws) {
    room.laptop = null;

    connectedPhones(room).forEach((player) => {
      send(player.ws, {
        type: 'peer',
        role: 'laptop',
        connected: false,
      });
    });
  } else if (role === 'phone') {
    const player = room.players.get(pid);

    if (player && player.ws === ws) {
      player.ws = null;
      player.lastSeen = Date.now();

      send(room.laptop, {
        type: 'peer',
        role: 'phone',
        connected: false,
        slot: player.slot,
      });
    }
  }

  room.lastActive = Date.now();
  clearCtx(ws);
}

function replaceSocket(oldSocket, newSocket) {
  if (oldSocket && oldSocket !== newSocket) {
    clearCtx(oldSocket);

    try {
      oldSocket.close(4000, 'replaced');
    } catch (error) {
      // Socket may already be closed.
    }
  }
}

function joinLaptop(ws, room) {
  replaceSocket(room.laptop, ws);

  room.laptop = ws;
  ws.ctx = { room, role: 'laptop', pid: null };

  const players = connectedPhones(room).map((player) => ({
    slot: player.slot,
    color: COLORS[player.slot],
    connected: true,
  }));

  send(ws, {
    type: 'joined',
    role: 'laptop',
    room: room.code,
    laptop: true,
    players,
  });

  connectedPhones(room).forEach((player) => {
    send(player.ws, {
      type: 'peer',
      role: 'laptop',
      connected: true,
    });
  });
}

function joinPhone(ws, room, msg) {
  const pid =
    String(msg.pid || '').slice(0, 32) ||
    `anon-${Math.random().toString(36).slice(2, 10)}`;

  let player = room.players.get(pid);
  let fresh = false;

  if (!player) {
    const usedSlots = new Set(
      [...room.players.values()].map((item) => item.slot)
    );

    let slot = [...Array(MAX_PLAYERS).keys()].find(
      (index) => !usedSlots.has(index)
    );

    if (slot === undefined) {
      const offline = [...room.players.values()]
        .filter((item) => !item.ws)
        .sort((a, b) => a.lastSeen - b.lastSeen)[0];

      if (!offline) {
        return send(ws, {
          type: 'error',
          message: `Room is full (${MAX_PLAYERS} players max).`,
        });
      }

      room.players.delete(offline.pid);
      slot = offline.slot;
    }

    player = {
      pid,
      slot,
      ws: null,
      lastSeen: Date.now(),
    };

    room.players.set(pid, player);
    fresh = true;
  }

  replaceSocket(player.ws, ws);

  player.ws = ws;
  player.lastSeen = Date.now();
  ws.ctx = { room, role: 'phone', pid };

  send(ws, {
    type: 'joined',
    role: 'phone',
    room: room.code,
    laptop: !!room.laptop,
    slot: player.slot,
    color: COLORS[player.slot],
  });

  send(room.laptop, {
    type: 'peer',
    role: 'phone',
    connected: true,
    slot: player.slot,
    color: COLORS[player.slot],
    fresh,
  });
}

function join(ws, msg) {
  const role = msg.role;

  if (role !== 'phone' && role !== 'laptop') {
    return send(ws, {
      type: 'error',
      message: 'Unknown role.',
    });
  }

  const room = rooms.get(
    String(msg.room || '').toUpperCase()
  );

  if (!room) {
    return send(ws, {
      type: 'error',
      message: 'Room not found. Check the code on the laptop screen.',
    });
  }

  leave(ws);

  if (role === 'laptop') {
    joinLaptop(ws, room);
  } else {
    joinPhone(ws, room, msg);
  }

  room.lastActive = Date.now();

  console.log(
    `[${room.code}] ${role} joined ` +
    `(phones online: ${connectedPhones(room).length}, ` +
    `laptop: ${!!room.laptop})`
  );
}

wss.on('connection', (ws, req) => {
  req.socket.setNoDelay(true);

  clearCtx(ws);
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch (error) {
      return;
    }

    switch (msg.type) {
      case 'ping':
        send(ws, { type: 'pong', t: msg.t });
        break;

      case 'join':
        join(ws, msg);
        break;

      case 's':
      case 'jump':
      case 'btn':
      case 'lat': {
        const { room, role, pid } = ws.ctx;

        if (
          !room ||
          role !== 'phone' ||
          !room.laptop ||
          room.laptop.readyState !== 1
        ) {
          return;
        }

        const player = room.players.get(pid);
        if (!player) return;

        let outgoing;

        if (msg.type === 's') {
          if (room.laptop.bufferedAmount > MAX_LAPTOP_BUFFER) {
            return;
          }

          outgoing = {
            type: 's',
            x: num(msg.x, -1, 1),
            y: num(msg.y, -1, 1),
            p: player.slot,
          };
        } else if (msg.type === 'jump') {
          outgoing = {
            type: 'jump',
            p: player.slot,
          };
        } else if (msg.type === 'btn') {
          if (!BUTTONS.has(msg.name)) return;

          outgoing = {
            type: 'btn',
            name: msg.name,
            p: player.slot,
          };
        } else {
          outgoing = {
            type: 'lat',
            ms: num(msg.ms, 0, 5000),
            p: player.slot,
          };
        }

        room.laptop.send(JSON.stringify(outgoing));
        break;
      }

      case 'haptic': {
        const { room, role } = ws.ctx;

        if (
          !room ||
          role !== 'laptop' ||
          !HAPTICS.has(msg.kind)
        ) {
          return;
        }

        for (const player of room.players.values()) {
          if (player.slot === msg.p && player.ws) {
            send(player.ws, {
              type: 'haptic',
              kind: msg.kind,
            });
          }
        }

        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => leave(ws));
  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
});

// Heartbeat: remove sockets that disappear without a close event.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }

    ws.isAlive = false;

    try {
      ws.ping();
    } catch (error) {
      ws.terminate();
    }
  }
}, 8000).unref();

// ---------- Start ----------

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nVINNOVATE controller server running\n');
  console.log(`  Port:                ${PORT}`);
  console.log(`  Public WebSocket:    ${PUBLIC_WS_URL}`);
  console.log(`  Allowed web origins: ${[...ALLOWED_ORIGINS].join(', ')}`);
  console.log('');
});
