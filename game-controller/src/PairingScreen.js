import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

const normalizeServer = (s) => {
  const t = s.trim();
  return /^wss?:\/\//i.test(t) ? t : `ws://${t}`;
};

export default function PairingScreen({ onPair, error }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState('scan'); // 'scan' | 'manual'
  const [server, setServer] = useState('wss://game-controller-wobble.onrender.com');
  const [room, setRoom] = useState('');
  const [scanError, setScanError] = useState(null);
  const handled = useRef(false);

  // Allow scanning again after a failed attempt.
  useEffect(() => { if (error) handled.current = false; }, [error]);

  // The laptop's QR code encodes: {"server":"ws://<laptop-ip>:8080","room":"ABC123"}
  const handleScan = ({ data }) => {
    if (handled.current) return;
    try {
      const parsed = JSON.parse(data);
      if (!parsed.server || !parsed.room) throw new Error('bad qr');
      handled.current = true;
      setScanError(null);
      onPair(parsed.server, String(parsed.room).toUpperCase());
    } catch (e) {
      setScanError("That QR code isn't from the game. Try the one on the laptop screen.");
    }
  };

  const handleManual = () => {
    if (!server.trim() || !room.trim()) return;
    onPair(normalizeServer(server), room.trim().toUpperCase());
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>Pair with laptop</Text>

      <View style={styles.tabs}>
        {['scan', 'manual'].map((m) => (
          <TouchableOpacity key={m} style={[styles.tab, mode === m && styles.tabActive]} onPress={() => setMode(m)}>
            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
              {m === 'scan' ? 'Scan QR' : 'Enter code'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'scan' ? (
        <View style={styles.body}>
          {permission?.granted ? (
            <View style={styles.cameraWrap}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleScan}
              />
              <View style={styles.reticle} />
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.hint}>Camera access is needed to scan the QR code.</Text>
              <TouchableOpacity style={styles.button} onPress={requestPermission}>
                <Text style={styles.buttonText}>Allow camera</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.hint}>Point the camera at the QR code on the laptop screen.</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Server address</Text>
          <TextInput
            style={styles.input}
            value={server}
            onChangeText={setServer}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="wss://game-controller-wobble.onrender.com"
            placeholderTextColor="#64748b"
          />
          <Text style={styles.label}>Room code</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={room}
            onChangeText={(t) => setRoom(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            placeholder="ABC123"
            placeholderTextColor="#64748b"
          />
          <TouchableOpacity
            style={[styles.button, (!server.trim() || !room.trim()) && styles.buttonDisabled]}
            onPress={handleManual}
            disabled={!server.trim() || !room.trim()}
          >
            <Text style={styles.buttonText}>Connect</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {(error || scanError) && <Text style={styles.error}>{error || scanError}</Text>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  title: { color: '#f8fafc', fontSize: 26, fontWeight: '700', marginBottom: 16 },
  tabs: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 12, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#3b82f6' },
  tabText: { color: '#94a3b8', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraWrap: { flex: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 12, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 220, height: 220, borderWidth: 3, borderColor: '#3b82f6', borderRadius: 20 },
  hint: { color: '#94a3b8', textAlign: 'center', marginVertical: 8 },
  label: { color: '#cbd5e1', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#1e293b', color: '#f8fafc', borderRadius: 10, padding: 14, fontSize: 16 },
  codeInput: { fontSize: 26, letterSpacing: 6, textAlign: 'center', fontWeight: '700' },
  button: { backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: '#f87171', textAlign: 'center', marginTop: 12 },
});
