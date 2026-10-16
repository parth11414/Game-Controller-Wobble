import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';

const PING_INTERVAL_MS = 3000;
const PONG_TIMEOUT_MS = 8000; // no pong for this long => connection is dead (even if the OS hasn't noticed)
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 5000;
const MAX_FIRST_ATTEMPTS = 3; // if we've never joined, give up after this many retries
const MAX_BUFFERED_BYTES = 2048; // drop sensor frames instead of queueing them (keeps latency low)

// Stable id for this app launch, so a reconnecting phone gets the same player slot back.
const PID = Math.random().toString(36).slice(2, 10);

// Vibration patterns for game events sent by the laptop (ms: [wait, buzz, wait, buzz, ...]).
const HAPTIC_PATTERNS = {
  star: 40,
  fall: [0, 150, 80, 150],
  level: [0, 80, 60, 80, 60, 160],
};

/**
 * WebSocket client with:
 *  - join handshake  (phone -> {type:'join', room, role:'phone'}, server -> {type:'joined', laptop:bool})
 *  - app-level ping/pong heartbeat (also measures round-trip latency)
 *  - automatic reconnection with exponential backoff + jitter, re-joining the same room
 *
 * status: 'idle' | 'connecting' | 'connected' | 'reconnecting'
 */
export function useGameSocket() {
  const [status, setStatus] = useState('idle');
  const [latency, setLatency] = useState(null);
  const [laptopOnline, setLaptopOnline] = useState(false);
  const [error, setError] = useState(null);
  const [player, setPlayer] = useState(null); // { slot, color } assigned by the server

  const wsRef = useRef(null);
  const cfgRef = useRef(null); // { server, room }
  const wantRef = useRef(false); // does the user want to be connected?
  const joinedRef = useRef(false);
  const everJoinedRef = useRef(false);
  const attemptRef = useRef(0);
  const retryTimer = useRef(null);
  const pingTimer = useRef(null);
  const lastPong = useRef(0);

  // NOTE: these helpers only touch refs and state setters, so it's safe that
  // the useCallback wrappers below capture the first-render versions.
  function teardown() {
    clearInterval(pingTimer.current);
    joinedRef.current = false;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try { ws.close(); } catch (e) {}
    }
  }

  function giveUp(message) {
    wantRef.current = false;
    clearTimeout(retryTimer.current);
    teardown();
    setStatus('idle');
    setLatency(null);
    setLaptopOnline(false);
    setError(message);
  }

  function scheduleReconnect() {
    if (!wantRef.current) return;
    setStatus('reconnecting');
    const n = attemptRef.current++;
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** n);
    const delay = base * (0.8 + Math.random() * 0.4); // jitter
    clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(open, delay);
  }

  function handleDrop(ws) {
    if (wsRef.current !== ws) return; // stale socket, ignore
    teardown();
    setLatency(null);
    setLaptopOnline(false);
    if (!everJoinedRef.current && attemptRef.current >= MAX_FIRST_ATTEMPTS) {
      giveUp("Couldn't reach the server. Check the address and make sure both devices are on the same Wi-Fi.");
      return;
    }
    scheduleReconnect();
  }

  function open() {
    const cfg = cfgRef.current;
    if (!cfg || !wantRef.current) return;
    teardown();
    setStatus(attemptRef.current > 0 ? 'reconnecting' : 'connecting');

    let ws;
    try {
      ws = new WebSocket(cfg.server);
    } catch (e) {
      giveUp('Invalid server address.');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', room: cfg.room, role: 'phone', pid: PID }));
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }

      switch (msg.type) {
        case 'joined':
          joinedRef.current = true;
          everJoinedRef.current = true;
          attemptRef.current = 0;
          lastPong.current = Date.now();
          setError(null);
          setLaptopOnline(!!msg.laptop);
          setPlayer({ slot: msg.slot, color: msg.color });
          setStatus('connected');
          clearInterval(pingTimer.current);
          pingTimer.current = setInterval(() => {
            if (Date.now() - lastPong.current > PONG_TIMEOUT_MS) {
              handleDrop(ws); // half-open connection: treat as dropped
              return;
            }
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
          }, PING_INTERVAL_MS);
          break;
        case 'pong':
          lastPong.current = Date.now();
          if (typeof msg.t === 'number') {
            const rtt = Date.now() - msg.t;
            setLatency(rtt);
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'lat', ms: rtt })); // shown on the laptop too
          }
          break;
        case 'peer': // laptop joined/left the room
          setLaptopOnline(!!msg.connected);
          break;
        case 'error':
          if (!everJoinedRef.current) giveUp(msg.message || 'Could not join that room.');
          else handleDrop(ws); // e.g. room vanished while we were reconnecting: keep retrying
          break;
        case 'haptic': // game event on the laptop: vibrate the phone
          Vibration.vibrate(HAPTIC_PATTERNS[msg.kind] || 30);
          break;
        default:
          break;
      }
    };

    ws.onerror = () => {}; // onclose always follows
    ws.onclose = () => handleDrop(ws);
  }

  const connect = useCallback((server, room) => {
    cfgRef.current = { server, room };
    wantRef.current = true;
    everJoinedRef.current = false;
    attemptRef.current = 0;
    setError(null);
    open();
  }, []);

  const disconnect = useCallback(() => {
    wantRef.current = false;
    clearTimeout(retryTimer.current);
    teardown();
    everJoinedRef.current = false;
    attemptRef.current = 0;
    setStatus('idle');
    setLatency(null);
    setLaptopOnline(false);
    setError(null);
    setPlayer(null);
  }, []);

  /** Send a message. Sensor frames are dropped if the socket is backed up; pass force=true for events (jump). */
  const send = useCallback((obj, force = false) => {
    const ws = wsRef.current;
    if (!ws || !joinedRef.current || ws.readyState !== 1) return false;
    if (!force && ws.bufferedAmount > MAX_BUFFERED_BYTES) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }, []);

  useEffect(() => () => {
    wantRef.current = false;
    clearTimeout(retryTimer.current);
    teardown();
  }, []);

  return { status, latency, laptopOnline, error, player, connect, disconnect, send };
}
