import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useGameSocket } from './src/useGameSocket';
import PairingScreen from './src/PairingScreen';
import ControllerScreen from './src/ControllerScreen';

export default function App() {
  const { status, latency, laptopOnline, error, player, connect, disconnect, send } = useGameSocket();
  const [room, setRoom] = useState('');

  const handlePair = (server, roomCode) => {
    setRoom(roomCode);
    connect(server, roomCode);
  };

  // Anything other than "idle" means we're in a session (connecting, connected or reconnecting).
  const inSession = status !== 'idle';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      {inSession ? (
        <ControllerScreen
          room={room}
          status={status}
          latency={latency}
          laptopOnline={laptopOnline}
          player={player}
          send={send}
          onLeave={disconnect}
        />
      ) : (
        <PairingScreen onPair={handlePair} error={error} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
});
