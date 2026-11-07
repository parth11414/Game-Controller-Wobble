# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Casual groups of friends playing together. One person opens a browser game on a shared screen, while players use their phones as motion controllers.

## Product Purpose

WOBBLE lets people play browser games together using smartphone motion controls. Success means players can pair their phones with the right game session and control the game responsively with minimal setup.

## Positioning

WOBBLE turns players’ phones into wireless tilt controllers for browser games. Players join by scanning a QR code or entering a room code, without needing a desktop gamepad.

## Operating Context

The browser game runs on a shared screen. Players launch the companion mobile controller, join the game’s room, calibrate a neutral phone position, and tilt or use on-screen actions during play. The system uses a backend to connect controllers and browser sessions over WebSockets.

## Capabilities and Constraints

- The browser currently offers WOBBLE and Ping Pong.
- WOBBLE supports up to four player slots, motion controls, jumping and dashing, keyboard controls for testing, and a player scoreboard.
- Ping Pong supports a one-phone game against the computer or two-phone head-to-head play. Players tilt to move paddles and use SERVE and POWER actions; games play to five points.
- Players pair by QR code or room code. The controller app supports motion calibration, connection status, latency display, and automatic reconnection attempts.
- The product consists of a browser game, a separate Expo mobile controller app, and a Node.js WebSocket backend. The controller app is the companion mobile experience; the primary platform is web.
- Responsiveness depends on network conditions, phone sensor behavior, and backend availability. Motion calibration can vary across devices.

## Brand Commitments

The product name is WOBBLE.

## Evidence on Hand

- Browser game and client-side networking: `tilt-project/game/index.html`.
- Room and WebSocket server: `tilt-project/server/server.js`.
- Mobile pairing and controller implementation: `game-controller/`.
- `README.md` documents deployed browser and backend URLs, an Android build, and a demonstration video. These are documented project links; deployment availability is not asserted here.
- Do not fabricate additional games, player counts, testimonials, performance benchmarks, or compatibility claims.

## Product Principles

- Make it easy for a group to start playing together.
- Use phones as readily available motion controllers for shared-screen browser games.
- Make pairing and connection state understandable during setup and play.
- Preserve keyboard play as a testing and alternative control path where supported.

