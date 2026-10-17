# WOBBLE — Phone-as-Game-Controller

WOBBLE is a real-time multiplayer browser game controlled by the motion sensors of a mobile phone. The project connects a mobile controller application to a browser-based game using WebSockets, allowing players to control their characters by physically tilting their phones.

## Project Overview

WOBBLE explores the use of mobile motion sensors and real-time network communication to create an interactive gaming experience. Instead of using a traditional keyboard or gamepad, players use their smartphones as wireless controllers.

The browser displays a game that players can control by tilting their phones. Players connect to a game session by scanning a QR code or entering a room code. The mobile application reads motion data, processes the input relative to a calibrated neutral position, and transmits controller updates to the backend. The backend routes these updates to the appropriate browser game.

The system is designed to support multiple players, connection-status monitoring, and recovery from temporary network interruptions.

## Features

### Core Features

- **Motion-based controls:** Control the game by tilting a smartphone.
- **QR code and room-code pairing:** Connect a mobile controller to the correct game session.
- **Real-time communication:** Exchange controller inputs and game-session messages using WebSockets.
- **Motion calibration:** Establish a neutral reference position to make controls more consistent.
- **Connection monitoring:** Display connection status and player availability.
- **Automatic reconnection:** Attempt to restore communication after a connection interruption.
- **Latency display:** Show ping information to help assess connection responsiveness.
- **Browser-based gameplay:** Play through a web browser without installing a separate desktop game.

### Additional Features

- Support for multiple player slots.
- Keyboard controls for testing and alternative gameplay.
- In-game actions such as jumping and dashing.
- A player scoreboard displaying game statistics.
- Visual indicators for connected and disconnected players.


## Technology Stack

| Component | Technologies |
|---|---|
| Mobile controller | React Native, Expo, JavaScript ||
| Backend | Node.js |
| Real-time communication | WebSockets using the `ws` library |
| Browser game | HTML, CSS, JavaScript, Canvas API |
| Mobile builds | Expo Application Services (EAS) |
| Backend deployment | Render |
| Frontend deployment | Vercel |

## System Architecture

The project consists of three main components.

### 1. Mobile Controller

The mobile application runs on the player's smartphone. It provides the pairing interface, reads motion data, handles calibration, and sends controller inputs to the backend.

The mobile application is built using React Native and Expo.

### 2. Backend Server

The Node.js backend manages game rooms and connections between mobile controllers and browser clients.

It provides an HTTP endpoint for obtaining room information and establishes WebSocket communication for real-time messages. The server identifies the relevant game session and routes incoming controller inputs to the corresponding browser game.

The backend acts as the communication layer rather than rendering the game itself.

### 3. Browser Game

The browser game contains the user interface, player state, game physics, collision handling, scoring, and rendering logic.

It obtains room information from the backend, establishes a WebSocket connection, receives controller updates, and uses those inputs to update the game.

### Communication Flow

1. The browser requests room information from the backend.
2. The backend provides the room details and QR code information.
3. The player scans the QR code or enters the room code in the mobile application.
4. The mobile application connects to the backend.
5. Motion input is transmitted through the WebSocket connection.
6. The backend routes the input to the appropriate browser game.
7. The browser updates the player's movement and renders the next frame.

This separation allows the mobile controller, backend, and browser game to operate as independent components.

## Repository Structure

```text
WOBBLE/
|
|-- tilt-project/
|   |-- game/
|   |   `-- index.html
|   |
|   `-- server/
|       |-- server.js
|       |-- package.json
|       `-- package-lock.json
|
|-- game-controller/
|   |-- App.js
|   |-- src/
|   |   |-- PairingScreen.js
|   |   |-- useGameSocket.js
|   |   `-- useMotionController.js
|   |-- assets/
|   |-- package.json
|   |-- app.json
|   `-- eas.json
|
`-- README.md
```

### Important Files

- `tilt-project/game/index.html`: Contains the browser game, interface, game loop, rendering, and browser-side networking logic.
- `tilt-project/server/server.js`: Implements the backend server, room management, and WebSocket communication.
- `game-controller/App.js`: Entry point of the mobile application.
- `game-controller/src/PairingScreen.js`: Provides the mobile pairing interface.
- `game-controller/src/useGameSocket.js`: Encapsulates WebSocket communication logic.
- `game-controller/src/useMotionController.js`: Handles motion-controller logic and calibration.

## Getting Started

### Prerequisites

Install the following tools before running the project locally:

- Node.js and npm
- Git
- A modern web browser
- Expo Go or a compatible mobile development setup for testing the controller application

### 1. Clone the Repository

```bash
git clone https://github.com/parth11414/Game-Controller-Wobble.git
cd Game-Controller-Wobble
```

### 2. Start the Backend

Open a terminal in the server directory:

```bash
cd tilt-project/server
npm install
npm start
```

Ensure that the server starts successfully and that the required port is available.

### 3. Run the Browser Game

Open `tilt-project/game/index.html` in a browser or serve the game directory using a local static web server.

For local development, verify that the browser's configured backend URL points to the backend you are running.

If testing from a physical phone, use a publicly reachable backend or configure your development environment so the phone can reach the server. A phone cannot generally access a development server through another device's `localhost` address.

### 4. Run the Mobile Application

Open another terminal:

```bash
cd game-controller
npm install
npx expo start
```

Follow the Expo instructions to run the application on a compatible device or emulator.

Make sure the mobile application's backend configuration matches the backend being used by the browser game.

### 5. Connect and Play

1. Open the browser game.
2. Wait for the room information and QR code to appear.
3. Launch the mobile controller application.
4. Scan the QR code or enter the room code.
5. Complete the calibration process while holding the phone in the intended neutral position.
6. Tilt the phone and verify that the corresponding player responds in the browser game.

## Deployed Application

The project is deployed using Vercel for the browser game and Render for the backend.

- **Browser game:** https://game-controller-wobble-game.vercel.app/
- **Backend:** https://game-controller-wobble.onrender.com/
- **GitHub repository:** https://github.com/parth11414/Game-Controller-Wobble

The browser game and mobile application communicate with the deployed backend. This allows devices on different networks to participate, provided they have access to the required services and network connections.

The backend may take some time to respond after a period of inactivity, depending on the hosting configuration.

## Motion Control and Calibration

Motion-based control uses sensor readings from the mobile device to determine how the player should move.

Calibration establishes a reference position. Subsequent readings are interpreted relative to this reference so that the controller can distinguish the intended tilt direction from the device's resting orientation.

A typical control pipeline consists of:

1. Reading motion sensor data.
2. Establishing the neutral reference.
3. Calculating movement relative to that reference.
4. Converting the result into controller input.
5. Transmitting the input to the browser game.

The browser then uses the received input in its game loop to update player movement.

## Networking and Reconnection

The application uses HTTP for room setup and WebSockets for persistent, bidirectional communication.

WebSockets are suitable for this project because controller inputs are transmitted repeatedly and need to reach the browser without creating a new HTTP request for every update.

The system also includes connection-status handling and automatic reconnection attempts. When a connection is interrupted, the application attempts to restore communication so that the player can resume controlling the game.

The effectiveness of reconnection depends on the current room state, the availability of the backend, and the behaviour of the client and server.

## Testing

The following checks are important when validating the application:

| Test | Expected result |
|---|---|
| Room creation | The browser receives valid room information. |
| QR pairing | A mobile controller joins the intended game session. |
| Motion control | Tilting the phone moves the corresponding player. |
| Calibration | The neutral position provides a usable movement reference. |
| Cross-network operation | The controller works when both devices can reach the deployed backend. |
| Reconnection | Communication can recover after a temporary interruption. |
| Latency display | Ping information is displayed when available. |
| Multiple players | Different phones control their respective players. |
| Game actions | Supported actions such as jumping and dashing respond correctly. |

Core pairing, motion-control, calibration, cross-network, and reconnection checks have been tested during development. The remaining checks should be verified against the final submission build.

## Known Limitations

- Responsiveness depends on network conditions, device sensor behaviour, and backend availability.
- Motion readings and calibration can vary across mobile devices.
- Temporary network interruptions may affect gameplay.
- The project requires network access to communicate with the deployed backend.
- Performance and compatibility should be checked across different phones and browsers.

## Project Deliverables

- **Source code:** Available in this repository.
- **Browser game:** https://game-controller-wobble-game.vercel.app/
- **Backend:** https://game-controller-wobble.onrender.com/
- **Android APK:** https://expo.dev/accounts/parthhh_987/projects/game-controller/builds/84713d41-61de-463d-b944-e439a0975a6e
- **Demonstration video:** https://drive.google.com/file/d/13JTG351-xbN2V65gT1RyRGuk-DWXmOXA/view?usp=sharing

