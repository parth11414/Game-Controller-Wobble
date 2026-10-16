import React, { useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, Vibration, StyleSheet } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { useMotionController } from './useMotionController';

const COLORS = { connected: '#22c55e', connecting: '#f59e0b', reconnecting: '#f59e0b', idle: '#ef4444' };
const LABELS = { connected: 'Connected', connecting: 'Connecting…', reconnecting: 'Reconnecting…', idle: 'Disconnected' };

// Easter egg: hold "Calibrate" for ~2.5 s and the phone vibrates a secret message in Morse code.
const SECRET_MESSAGE = 'HELLO';       // letters and spaces only
const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
};
const UNIT = 100; // ms

function morse(text) {
  const words = text.toUpperCase().split(' ').map((w) => [...w].map((c) => MORSE[c]).filter(Boolean));
  const pattern = [0]; // [wait, buzz, wait, buzz, ...]
  const shown = [];
  words.forEach((letters, wi) => {
    letters.forEach((code, li) => {
      [...code].forEach((sym, si) => {
        pattern.push(sym === '.' ? UNIT : UNIT * 3);
        const lastSym = si === code.length - 1;
        const lastLetter = li === letters.length - 1;
        const lastWord = wi === words.length - 1;
        if (lastSym && lastLetter && lastWord) return;
        pattern.push(!lastSym ? UNIT : !lastLetter ? UNIT * 3 : UNIT * 7);
      });
    });
    shown.push(letters.join(' '));
  });
  return { pattern, text: shown.join('    '), duration: pattern.reduce((a, b) => a + b, 0) };
}

const PAD = 170;
const DOT = 36;
const RANGE = (PAD - DOT) / 2;

function StatusBadge({ status, latency, laptopOnline }) {
  return (
    <View style={styles.badge}>
      <View style={[styles.statusDot, { backgroundColor: COLORS[status] }]} />
      <Text style={styles.badgeText}>{LABELS[status]}</Text>
      {status === 'connected' && (
        <Text style={styles.badgeSub}>
          {latency != null ? `${latency} ms` : '…'} · laptop {laptopOnline ? 'online' : 'offline'}
        </Text>
      )}
    </View>
  );
}

export default function ControllerScreen({ room, status, latency, laptopOnline, player, send, onLeave }) {
  useKeepAwake(); // don't let the screen sleep mid-game

  const { tilt, calibrate } = useMotionController({
    active: true,
    onFrame: (f) => send({ type: 's', x: f.x, y: f.y }),   // droppable stream
    onJump: () => send({ type: 'jump' }, true),              // shake: important event, never dropped
  });

  const accent = player?.color || '#3b82f6';
  const [secret, setSecret] = useState(null);
  const playSecret = () => {
    const m = morse(SECRET_MESSAGE);
    Vibration.vibrate(m.pattern);
    setSecret(m.text);
    setTimeout(() => setSecret(null), m.duration + 1500);
  };
  const press = (msg) => {
    Vibration.vibrate(15);
    send(msg, true);
  };

  return (
    <View style={styles.root}>
      <StatusBadge status={status} latency={latency} laptopOnline={laptopOnline} />
      <View style={styles.row}>
        {player && (
          <View style={[styles.chip, { backgroundColor: accent }]}>
            <Text style={styles.chipText}>Player {player.slot + 1}</Text>
          </View>
        )}
        <Text style={styles.room}>Room {room}</Text>
      </View>

      <View style={styles.padWrap}>
        <View style={styles.pad}>
          <View style={styles.crossH} />
          <View style={styles.crossV} />
          <View
            style={[
              styles.dot,
              { backgroundColor: accent, transform: [{ translateX: tilt.x * RANGE }, { translateY: tilt.y * RANGE }] },
            ]}
          />
        </View>
        <Text style={styles.hint}>Tilt to steer · shake to jump</Text>
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={({ pressed }) => [styles.bigBtn, { backgroundColor: accent }, pressed && styles.pressed]}
          onPressIn={() => press({ type: 'btn', name: 'jump' })}
        >
          <Text style={styles.bigText}>JUMP</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.bigBtn, styles.dashBtn, pressed && styles.pressed]}
          onPressIn={() => press({ type: 'btn', name: 'dash' })}
        >
          <Text style={styles.bigText}>DASH</Text>
        </Pressable>
      </View>

      {secret && <Text style={styles.secret}>{secret}</Text>}
      <TouchableOpacity style={styles.calibrate} onPress={calibrate} onLongPress={playSecret} delayLongPress={2500}>
        <Text style={styles.calibrateText}>Calibrate (set neutral)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.leave} onPress={onLeave}>
        <Text style={styles.leaveText}>Leave room</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'center', flexWrap: 'wrap' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  badgeText: { color: '#f8fafc', fontWeight: '700' },
  badgeSub: { color: '#94a3b8', marginLeft: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, gap: 10 },
  chip: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 },
  chipText: { color: '#fff', fontWeight: '700' },
  room: { color: '#94a3b8', letterSpacing: 2 },
  padWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { width: PAD, height: PAD, borderRadius: PAD / 2, backgroundColor: '#1e293b', borderWidth: 2, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  crossH: { position: 'absolute', width: PAD - 20, height: 1, backgroundColor: '#334155' },
  crossV: { position: 'absolute', height: PAD - 20, width: 1, backgroundColor: '#334155' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  hint: { color: '#94a3b8', marginTop: 16 },
  buttons: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  bigBtn: { flex: 1, height: 76, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dashBtn: { backgroundColor: '#8b5cf6' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
  bigText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  calibrate: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  calibrateText: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  secret: { color: '#fbbf24', textAlign: 'center', fontSize: 18, letterSpacing: 2, marginBottom: 10 },
  leave: { paddingVertical: 12, alignItems: 'center' },
  leaveText: { color: '#f87171', fontWeight: '600' },
});
