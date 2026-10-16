/**
 * Phone-as-controller server.
 *  - Serves the browser game (../game)
 *  - GET /api/room?code=XXXXX  -> returns (or creates) a room plus a QR code for phones to scan
 *  - WebSocket relay: up to 4 phones + 1 laptop per room
 *
 * Protocol (JSON):
 *  any    -> {type:'join', room, role:'phone'|'laptop', pid?}
 *  server -> phone:  {type:'joined', role:'phone', room, laptop:bool, slot, color}
 *  server -> laptop: {type:'joined', role:'laptop', room, players:[{slot,color,connected}]}
 *  any    -> {type:'ping', t}                          server -> {type:'pong', t}
 *  phone  -> {type:'s', x, y} | {type:'jump'} | {type:'btn', name:'jump'|'dash'} | {type:'lat', ms}
 *            forwarded to the laptop with the sender's slot added as `p`
 *  laptop -> {type:'haptic', p:<slot>, kind:'star'|'fall'|'level'}   forwarded to that phone only
 *  server -> laptop: {type:'peer', role:'phone', connected, slot, color, fresh?}
 *  server -> phone:  {type:'peer', role:'laptop', connected}
 *  server -> any:    {type:'error', message}
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
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid typos
const MAX_LAPTOP_BUFFER = 8 * 1024; // drop sensor frames if the laptop socket is backed up
const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];
const MAX_PLAYERS = COLORS.length;
const BUTTONS = new Set(['jump', 'dash']);
const HAPTICS = new Set(['star', 'fall', 'level']);

// ---------- helpers ----------
const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0;
};

function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push({ name, address: a.address });
    }
  }
  const score = (c) =>
    /vethernet|virtual|vmware|vbox|wsl|docker|hyper-v|loopback/i.test(c.name) ? 0
      : /^192\.168\./.test(c.address) ? 3
      : /^10\./.test(c.address) ? 2 : 1;
  return out.sort((a, b) => score(b) - score(a));
}

function getLanIp() {
  if (process.env.HOST_IP) return process.env.HOST_IP;
  const all = lanAddresses();
  return all.length ? all[0].address : 'localhost';
}

const send = (ws, obj) => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
};

// ---------- rooms ----------
// room = { code, laptop: ws|null, players: Map(pid -> {pid, slot, ws|null, lastSeen}), lastActive }
const rooms = new Map();
const isValidCode = (c) => c.length === 5 && [...c].every((ch) => ALPHABET.includes(ch));

// A valid, free wantedCode is reused so a server restart keeps the same room code
// and phones (which keep retrying that code) can rejoin without re-scanning.
function createRoom(wantedCode) {
  let code = wantedCode && isValidCode(wantedCode) && !rooms.has(wantedCode) ? wantedCode : null;
  while (!code || rooms.has(code)) {
    code = Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  }
  const room = { code, laptop: null, players: new Map(), lastActive: Date.now() };
  rooms.set(code, room);
  return room;
}

const connectedPhones = (room) => [...room.players.values()].filter((p) => p.ws);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.laptop && !connectedPhones(room).length && now - room.lastActive > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60 * 1000).unref();

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/room') {
      const wanted = (url.searchParams.get('code') || '').toUpperCase();
      const room = rooms.get(wanted) || createRoom(wanted);
      const wsUrl = `ws://${getLanIp()}:${PORT}`;
      const qr = await QRCode.toDataURL(JSON.stringify({ server: wsUrl, room: room.code }), {
        margin: 1, width: 320, errorCorrectionLevel: 'M',
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ room: room.code, server: wsUrl, qr, maxPlayers: MAX_PLAYERS }));
      return;
    }

    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });
const clearCtx = (ws) => { ws.ctx = { room: null, role: null, pid: null }; };

function leave(ws) {
  const { room, role, pid } = ws.ctx || {};
  if (!room) return;
  if (role === 'laptop' && room.laptop === ws) {
    room.laptop = null;
    connectedPhones(room).forEach((p) => send(p.ws, { type: 'peer', role: 'laptop', connected: false }));
  } else if (role === 'phone') {
    const p = room.players.get(pid);
    if (p && p.ws === ws) { // keep the slot reserved so a reconnect gets the same player back
      p.ws = null;
      p.lastSeen = Date.now();
      send(room.laptop, { type: 'peer', role: 'phone', connected: false, slot: p.slot });
    }
  }
  room.lastActive = Date.now();
  clearCtx(ws);
}

function replaceSocket(old, ws) {
  if (old && old !== ws) { // a reconnect replaces a stale/half-open socket
    clearCtx(old);
    try { old.close(4000, 'replaced'); } catch (e) {}
  }
}

function joinLaptop(ws, room) {
  replaceSocket(room.laptop, ws);
  room.laptop = ws;
  ws.ctx = { room, role: 'laptop', pid: null };
  const players = connectedPhones(room).map((p) => ({ slot: p.slot, color: COLORS[p.slot], connected: true }));
  send(ws, { type: 'joined', role: 'laptop', room: room.code, laptop: true, players });
  connectedPhones(room).forEach((p) => send(p.ws, { type: 'peer', role: 'laptop', connected: true }));
}

function joinPhone(ws, room, msg) {
  const pid = String(msg.pid || '').slice(0, 32) || `anon-${Math.random().toString(36).slice(2, 10)}`;
  let p = room.players.get(pid);
  let fresh = false;

  if (!p) {
    const used = new Set([...room.players.values()].map((x) => x.slot));
    let slot = [...Array(MAX_PLAYERS).keys()].find((i) => !used.has(i));
    if (slot === undefined) { // full: evict the longest-offline player if there is one
      const offline = [...room.players.values()].filter((x) => !x.ws).sort((a, b) => a.lastSeen - b.lastSeen)[0];
      if (!offline) return send(ws, { type: 'error', message: `Room is full (${MAX_PLAYERS} players max).` });
      room.players.delete(offline.pid);
      slot = offline.slot;
    }
    p = { pid, slot, ws: null, lastSeen: Date.now() };
    room.players.set(pid, p);
    fresh = true;
  }

  replaceSocket(p.ws, ws);
  p.ws = ws;
  p.lastSeen = Date.now();
  ws.ctx = { room, role: 'phone', pid };

  send(ws, { type: 'joined', role: 'phone', room: room.code, laptop: !!room.laptop, slot: p.slot, color: COLORS[p.slot] });
  send(room.laptop, { type: 'peer', role: 'phone', connected: true, slot: p.slot, color: COLORS[p.slot], fresh });
}

function join(ws, msg) {
  const role = msg.role;
  if (role !== 'phone' && role !== 'laptop') return send(ws, { type: 'error', message: 'Unknown role.' });
  const room = rooms.get(String(msg.room || '').toUpperCase());
  if (!room) return send(ws, { type: 'error', message: 'Room not found. Check the code on the laptop screen.' });

  leave(ws);
  if (role === 'laptop') joinLaptop(ws, room); else joinPhone(ws, room, msg);
  room.lastActive = Date.now();
  console.log(`[${room.code}] ${role} joined (phones online: ${connectedPhones(room).length}, laptop: ${!!room.laptop})`);
}

wss.on('connection', (ws, req) => {
  req.socket.setNoDelay(true); // disable Nagle: send small frames immediately
  clearCtx(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

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
        if (!room || role !== 'phone' || !room.laptop || room.laptop.readyState !== 1) return;
        const p = room.players.get(pid);
        if (!p) return;
        let out;
        if (msg.type === 's') {
          if (room.laptop.bufferedAmount > MAX_LAPTOP_BUFFER) return; // laptop busy: drop the stale frame
          out = { type: 's', x: num(msg.x, -1, 1), y: num(msg.y, -1, 1), p: p.slot };
        } else if (msg.type === 'jump') {
          out = { type: 'jump', p: p.slot };
        } else if (msg.type === 'btn') {
          if (!BUTTONS.has(msg.name)) return;
          out = { type: 'btn', name: msg.name, p: p.slot };
        } else {
          out = { type: 'lat', ms: num(msg.ms, 0, 5000), p: p.slot };
        }
        room.laptop.send(JSON.stringify(out));
        break;
      }
      case 'haptic': {
        const { room, role } = ws.ctx;
        if (!room || role !== 'laptop' || !HAPTICS.has(msg.kind)) return;
        for (const p of room.players.values()) {
          if (p.slot === msg.p && p.ws) send(p.ws, { type: 'haptic', kind: msg.kind });
        }
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});

// Protocol-level heartbeat: drop sockets that vanished without a close (phone left the network, lid closed...)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 8000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nPhone controller server running\n');
  console.log(`  Open on the laptop:  http://localhost:${PORT}`);
  console.log(`  Phones connect to:   ws://${getLanIp()}:${PORT}`);
  const all = lanAddresses();
  if (all.length > 1) {
    console.log('\n  Detected network adapters (if the QR code has the wrong IP, run with HOST_IP=<one of these>):');
    all.forEach((a) => console.log(`    ${a.address}  (${a.name})`));
  }
  console.log('');
});
