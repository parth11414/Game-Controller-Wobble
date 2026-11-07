# WOBBLE visual system

## Direction

WOBBLE's browser games feel like a lively local arcade printed on a shared score card. The interface is warm and tactile around a clear, animated playfield. It should make room for friends, phone pairing, and the game itself without looking like a generic gaming dashboard.

The approved concept reference is `.impeccable/mocks/approved/browser-games-concept.png`. Its room code, scores, player counts, and QR patterns are illustrative; the implementation uses live values from the game server.

## Palette

- Paper: `#F4EAD7`
- Deep ink: `#152821`
- Forest: `#176B4B`
- Dark forest: `#104A36`
- Coral: `#EF5A3A`
- Butter: `#F4CC59`
- Mint: `#85D5AD`
- Cobalt: `#4258DD`
- Muted ink: `#53665A`

Use paper for the page and score surfaces, forest for active playfields, coral for the active game and hazards, butter for collectibles and highlights, and cobalt as a player accent. Keep body copy and interface text on high contrast solid surfaces.

## Typography

Use a sturdy, friendly sans serif for controls, instructions, and player data. Georgia is the local display fallback for expressive headings and the WOBBLE wordmark. Use compact uppercase labels only for game status and measured values. Keep scores tabular and readable at a glance.

## Materials and imagery

The browser surface borrows from printed neighborhood arcade scorecards and bright tabletop game packaging: warm paper, flat ink, crisp player marks, simple checkerboard game geometry, and illustrated playfields. Keep texture restrained to the background. Canvas game content is composed from clear shapes that retain their gameplay meaning as they move.

## Interface character

- Put the game selector, live connection state, and invitation action in the top rail.
- Keep the game canvas as the dominant region and the room QR/code in a persistent companion panel.
- Make each player's score the strongest element in their score strip. Keep falls, connection type, and latency secondary, and repeat Ping Pong's live points clearly in the court.
- Use the game colors consistently between each score strip and the playfield.
- Use squared, confident controls with modest corner rounding. Reserve pills for small live status labels.
- Maintain visible focus, reduced-motion support, readable contrast, and useful instructions at narrow widths.

## Motion

Use quick, soft ease-out for game switching, action feedback, and toast messages. Motion should clarify selection or celebrate a game event; honor reduced-motion preferences.
