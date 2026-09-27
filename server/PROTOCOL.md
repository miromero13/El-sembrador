# WebSocket protocol

Protocol version 1 supports temporary Lobby rooms, authoritative per-player Camino runs, El Pedregal, individual Los Espinos maze runs, and per-player La Buena Tierra trivia. State remains in server memory.

Connect to `/ws` with a browser `Origin` present in the comma-separated `ALLOWED_ORIGINS` environment variable. Missing and unlisted origins are rejected before WebSocket upgrade. `GET /health` returns `{"status":"ok"}`. A successful connection first receives:

```json
{"type":"welcome","protocolVersion":1,"message":"Connected to El Sembrador"}
```

Messages are JSON objects with exactly the fields shown. Malformed, invalid, or unsupported envelopes close the connection with code `1008` (policy violation). Room errors are ordinary JSON responses and do not close the connection.

## Client messages

Create a room (organizer only; creation does not create a player or reserve a player seat):

```json
{"type":"createRoom"}
```

Response (the organizer credential is private and must not be put in a player invitation):

```json
{"type":"roomCreated","roomId":"<unguessable-id>","ownerCredential":"<private-secret>","invitePath":"/?room=<roomId>","participants":[]}
```

Join as a player. Names are trimmed and must contain 1–40 characters, with no control characters:

```json
{"type":"joinRoom","roomId":"<roomId>","name":"Ada"}
```

Success sends `joined` with the participant's private reconnect credential, and `roomState` is broadcast to connected players:

```json
{"type":"joined","roomId":"<roomId>","participantId":"<id>","reconnectCredential":"<private-secret>"}
{"type":"roomState","room":{"roomId":"<roomId>","participants":[{"participantId":"<id>","name":"Ada","connected":true}]}}
```

A room accepts at most six player memberships, including disconnected members during their grace period. Missing rooms return `{"type":"error","code":"room_not_found","message":"Room not found. Check the invitation link."}`; full rooms return `room_full` and a useful message. Organizer identity is not player membership. The organizer may resume the observer role by sending `{"type":"resumeOwner","roomId":"<roomId>","ownerCredential":"<private-secret>"}`; success returns `ownerResumed` with the current room snapshot. The credential is private and must be retained only in the organizer tab's `sessionStorage`, never in invite URLs, QR codes, or broadcasts. Invalid credentials return `invalid_owner`. A connection already bound to a room cannot change identity.

Only the authenticated organizer connection may send `{"type":"startGame"}`. The server requires 2–6 currently connected players and changes the room stage atomically from `waiting` to `camino`, broadcasting `roomState` with that stage to all connected members and the organizer. The organizer never occupies a player seat. New joins after start return `game_started`; existing members may still reconnect. A room snapshot includes `stage`, initially `waiting`. On start, each connected player receives a private `caminoSnapshot` with 10 seeds, zero resolved birds, and their currently active birds; reconnecting players receive their current snapshot. Every snapshot/progress payload includes `serverNow`, the server's authoritative `Date.now()`-based timestamp sampled when that payload is created. Clients can compare it with their local clock to estimate the server/client offset; use server time with each bird's `startedAt`/`arrivesAt` to animate at the same trajectory position the server validates for touches. Do not use the phone's wall clock as the trajectory authority. Every payload also includes `seedPositions`, an array of `{seedId, position:{x,y}}` entries for the seeds still present (normalized coordinates); `seeds` equals this array's length. These are detached authoritative values, so clients cannot mutate server state. Progress is sent only to that player as `caminoProgress`, with remaining seeds, resolved count, completion flag, active birds, and remaining seed positions. Bird identifiers and normalized positions are authoritative server data, not secrets. When a player's Camino completes, the server creates that player's Pedregal board from the remaining authoritative Camino seeds and sends a `pedregalSnapshot`; it also sends the final `caminoProgress` so the player can navigate to `/pedregal?room=<roomId>`. The `survivors` URL parameter is presentation-only and never determines board size, attempts, or lives. A reconnecting participant with a Pedregal session receives that private snapshot instead of a Camino snapshot. The room's shared stage remains `camino`; Pedregal completion does not transition the room or synchronize other players.

Each player has exactly eight birds on one fixed schedule: bird 0 appears at 0 seconds (6-second flight), bird 1 at 6 seconds (5-second flight), bird 2 at 9 seconds (4-second flight), birds 3 and 4 together at 12 seconds (4-second flights), birds 5 and 6 together at 14 seconds (4-second flights), and bird 7 at 15 seconds (3-second flight). These are absolute per-player offsets, so early scares never advance later appearances. The later pairs and final bird overlap; without touches all eight birds resolve and that player's Camino completes at 18 seconds. There are no randomized production gaps or optional initial pair. Entrances rotate by bird index across three families, guaranteeing at least one TOP, LEFT, and RIGHT entrance in every eight-bird run. TOP birds start at y=0 with x in 0.10–0.90; LEFT and RIGHT birds start at x=0 or x=1 with y in 0.15–0.55, always above the soil top at y=0.75. Each flies linearly to exactly one of ten seed positions. The ten seeds form a uniformly spaced horizontal row across approximately x=0.07–0.93 at normalized y=0.84. Each player's eight birds are assigned eight distinct target seed indices from the ten-seed field. A bird reaching its target removes exactly that seed if it is still present; touching it resolves it without seed loss, leaving its target seed present. The eighth resolution completes that player's Camino immediately, independently of other players. Schedule, clock, randomness, and flight duration remain injectable for deterministic tests. Pedregal is not implemented.

## El Pedregal

A player's board contains 25 numbered cells and exactly as many hidden seeds as that player's surviving Camino seeds. The server shuffles each participant's board independently. On creation, the server sends a private `pedregalSnapshot` with `serverNow`, `previewEndsAt` (exactly 3,000 ms after creation), `preview:true`, and 25 `{cellId,hasSeed}` cells. Once the preview deadline passes, snapshots set `preview:false` and set `hasSeed:false` for every cell, so the board contents remain hidden. Only `revealed` cell results are exposed after a pick. The snapshot also includes `attempts`, `remainingAttempts`, `recovered`, `lives`, and `complete`.

After the deadline, a player may send `{"type":"pickPedregal","cellId":7}`. Only the authenticated participant's own board is used. A unique pick consumes one attempt; a seed pick recovers exactly one seed and adds one life, while an empty pick awards no life. A repeated/revealed cell, pre-deadline pick, invalid cell, or pick after completion is ignored without another attempt or life. The server sends `pedregalProgress` after accepted picks. Selection ends when attempts reach zero or all of that player's seeds have been recovered. A player with zero saved Camino seeds has zero attempts and is complete immediately after their preview. Pedregal results do not advance the shared room stage or wait for other participants. Once a participant completes Pedregal, that participant alone enters Los Espinos; other players may still be in Camino or Pedregal.

A player reports a touch with `{"type":"touchBird","birdId":"<active-id>","x":0.5,"y":0.5}` where x and y are normalized screen coordinates from 0 through 1. The server binds the action to the authenticated socket's participant, computes the bird's current position from the server clock and flight trajectory, and accepts only a point within 0.08 normalized units. Unknown, foreign, duplicate, late, out-of-range, or misplaced touches return an `invalid_touch`/protocol error and do not change state. The message's bird ID alone is not proof of a hit.

## Los Espinos

After Pedregal completes, the server creates a private Los Espinos run using that participant's recovered Pedregal seeds as the initial counter. Zero recovered seeds means immediate local elimination. The maze is a short serpentine path with normalized centerline coordinates `{x,y}`: `(0.10,0.84) → (0.10,0.64) → (0.34,0.64) → (0.34,0.40) → (0.66,0.40) → (0.66,0.64) → (0.90,0.64) → (0.90,0.20)`. The corridor radius is 0.075; points outside it are thorn contact. The first outside point in a continuous contact subtracts exactly one seed. Contact remains latched until the player returns to the safe corridor; leaving and re-entering can cause another loss. A counter reaching zero eliminates only that player.

Authenticated clients report normalized drag samples as `{"type":"moveEspinos","x":0.1,"y":0.64}`. The server validates finite bounded coordinates, corridor contact, collision accounting, and goal arrival; client-reported seed totals or completion are never accepted. Completion requires progressing along the path to the final goal with at least one seed. Accepted movement returns a private `espinosProgress`; reconnect returns `espinosSnapshot`. Status is `playing`, `complete`, or `eliminated`, with authoritative `seeds`, `position`, `progress`, and collision latch. Completing advances only that participant to `/buena-tierra`; elimination is likewise local. The room's shared `stage` remains a coarse indicator and never gates or synchronizes individual stage progression.

## La Buena Tierra

When one participant completes Los Espinos, the server independently selects one random entry from `data/preguntas-mateo.json`, followed by one random entry from `data/preguntas-parabola.json`. These files are server-owned copies of the named `web/` banks; the server tests enforce byte-for-byte parity. The participant receives `triviaSnapshot` with exactly two ordered questions (`id`, `pregunta`, three `opciones`, and zero-based `index`), `answers:[null,null]`, `correct:0`, and `complete:false`. The answer key is never sent. The selected questions and submitted answers stay in that participant's in-memory room state.

Answer the current question with `{"type":"answerTrivia","index":0,"answer":"B"}` where index is 0 or 1 and answer is A/B/C. Only the first unanswered question accepts a response, once. Invalid, out-of-order, or repeated answers do not change state. Accepted answers generate a private `triviaProgress` snapshot; it records only the submitted choices, total correct count, and completion status—not the correct answer or answer key. Reconnect sends that same participant's selected questions and existing answers; it does not redraw. Other players may remain in earlier stages and do not gate trivia completion. The client shows `/planta-marchita.png`, `/planta-mediana.png`, or `/planta-grande.png` for 0, 1, or 2 correct answers over Camino's earth/soil visual styling. This phase does not calculate the final score or implement the final podium.

## Puntaje y Podio Final

A participant becomes terminal when they are eliminated in Los Espinos or answer both La Buena Tierra questions. Completing Espinos keeps the participant's final seed count; trivia answers count toward points whether correct or incorrect (correctness still determines plant growth). The server calculates `seeds_remaining_after_espinos * 100 + answered_question_count * 100`. An Espinos elimination is listed with zero points and `eliminated:true`.

When every current room participant is terminal, the server freezes one in-memory podium and broadcasts the same `podium` message to all participant sockets. Entries contain only actual participants and include `participantId`, `name`, `score`, `seeds`, `answeredQuestions`, `place`, and `eliminated`. Equal scores share a place; the next place is skipped (for example 1, 1, 3). The public room stage becomes `podium`. A reconnecting participant or organizer receives the existing podium.

Only the authenticated organizer may send `{"type":"finalizeGame"}`, and only after the podium exists. Finalization clears all round game state, retains connected participants and their identities, sets the room stage back to `waiting`, and broadcasts the reset so another round can start. Results and game state are never persisted outside the current in-memory room; server restart discards them.

## Disconnect and reconnect

When a player's socket closes, that player remains in the list with `connected:false` and retains their seat for the 30-second grace period. The server removes them at grace expiry even if the browser never returns, releases their Camino run and timers, then broadcasts the updated list. The browser may make up to three timed reconnect attempts during each disconnection; this is a client retry policy, not a server-side lifetime quota on successful reconnects. Every successful reconnect restores the participant and cancels that disconnection's grace timer. A later disconnect starts a fresh grace period. A reconnect must supply the room ID and the private credential returned on join:

```json
{"type":"reconnect","roomId":"<roomId>","reconnectCredential":"<private-secret>"}
```

Reconnect success returns `reconnected` with the participant identity and current room snapshot; credentials and organizer secrets are never included in participant lists. Invalid credentials return `invalid_reconnect`. Repeated successful disconnect/reconnect cycles remain valid; an unsuccessful disconnection ends with grace expiry and removal. A WebSocket connection can create or join only one room identity; another create, join, or reconnect request on that connection returns `already_in_room`. Closing an organizer connection removes its room observer. The owner credential can reattach a new organizer connection after reload or disconnect.

## Identity and privacy

Room IDs are generated from 192 cryptographically random bits. The organizer receives a separate 256-bit private credential; each player receives a separate 256-bit reconnect credential. Credentials are accepted only over the allowed-origin WebSocket and are never part of the room URL, participant broadcast, or error response. Keep them only for the active session and do not log/share them. All room state is in process memory and is lost on server restart. Multiple server processes do not share rooms.

## LAN development

Run the server bound to `0.0.0.0` and set `ALLOWED_ORIGINS` to the exact web origin, e.g. `http://192.168.1.24:5173`. Set web's `VITE_WS_URL` to `ws://192.168.1.24:3000/ws`, substituting the computer's LAN address. Start both projects in separate terminals and open the web origin on the phone on the same Wi-Fi. Do not use `localhost` in phone-facing URLs. Configure firewall access to the chosen ports. Defaults are suitable only for same-machine development and allow only `http://localhost:5173`.
