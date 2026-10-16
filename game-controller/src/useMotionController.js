import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { Accelerometer, DeviceMotion } from 'expo-sensors';

// Tune these to taste.
export const CONFIG = {
  updateMs: 16,          // ~60 Hz sensor updates
  maxTiltRad: 0.6,       // tilt that maps to full deflection (~34 degrees)
  deadzone: 0.05,        // ignore tiny tilts around neutral
  smoothing: 0.35,       // low-pass filter: 1 = no smoothing, lower = smoother but laggier
  shakeG: 1.8,           // accelerometer magnitude (in g) that counts as a shake
  shakeCooldownMs: 700,  // minimum time between jumps
  invertX: false,        // flip if steering feels backwards
  invertY: false,
};

const clamp = (v) => Math.max(-1, Math.min(1, v));
const deadzone = (v) => (Math.abs(v) < CONFIG.deadzone ? 0 : v);
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Reads the phone's motion sensors.
 *  - Tilt: DeviceMotion (OS-level fusion of gyroscope + accelerometer) -> steering values x,y in [-1, 1]
 *  - Shake: Accelerometer magnitude spike -> jump event
 *  - calibrate(): stores the current orientation as the neutral position
 *
 * The first reading after mount is used as the initial neutral position,
 * so holding the phone however feels natural "just works".
 */
export function useMotionController({ active, onFrame, onJump }) {
  const neutral = useRef(null);          // { beta, gamma } or null until first reading
  const latest = useRef(null);           // most recent raw { beta, gamma }
  const smooth = useRef({ x: 0, y: 0 });
  const lastShake = useRef(0);
  const lastUi = useRef(0);
  const callbacks = useRef({ onFrame, onJump });
  callbacks.current = { onFrame, onJump };

  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!active) return undefined;

    DeviceMotion.setUpdateInterval(CONFIG.updateMs);
    Accelerometer.setUpdateInterval(CONFIG.updateMs);

    const motionSub = DeviceMotion.addListener(({ rotation }) => {
      if (!rotation) return;
      const cur = { beta: rotation.beta, gamma: rotation.gamma }; // beta = pitch (front/back), gamma = roll (left/right)
      latest.current = cur;
      if (!neutral.current) neutral.current = cur;

      const sx = CONFIG.invertX ? -1 : 1;
      const sy = CONFIG.invertY ? -1 : 1;
      const tx = clamp((sx * (cur.gamma - neutral.current.gamma)) / CONFIG.maxTiltRad);
      const ty = clamp((sy * (cur.beta - neutral.current.beta)) / CONFIG.maxTiltRad);

      const s = smooth.current;
      s.x += CONFIG.smoothing * (tx - s.x);
      s.y += CONFIG.smoothing * (ty - s.y);

      const frame = { x: round3(deadzone(s.x)), y: round3(deadzone(s.y)) };
      callbacks.current.onFrame(frame);

      const now = Date.now();
      if (now - lastUi.current > 80) { // throttle UI re-renders to ~12 Hz
        lastUi.current = now;
        setTilt(frame);
      }
    });

    const accelSub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z); // ~1 g at rest
      const now = Date.now();
      if (magnitude > CONFIG.shakeG && now - lastShake.current > CONFIG.shakeCooldownMs) {
        lastShake.current = now;
        Vibration.vibrate(40);
        callbacks.current.onJump();
      }
    });

    return () => {
      motionSub.remove();
      accelSub.remove();
    };
  }, [active]);

  const calibrate = useCallback(() => {
    if (latest.current) {
      neutral.current = { ...latest.current };
      smooth.current = { x: 0, y: 0 };
      setTilt({ x: 0, y: 0 });
      Vibration.vibrate(20);
    }
  }, []);

  return { tilt, calibrate };
}
