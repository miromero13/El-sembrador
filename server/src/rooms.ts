import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Camino, type CaminoOptions, type Point } from './camino.js';
import { Pedregal, type PedregalSnapshot } from './pedregal.js';
import { Espinos, type EspinosSnapshot, type EspinosPoint } from './espinos.js';
import { Trivia, type TriviaSnapshot } from './trivia.js';
import { createPodium, type PodiumEntry } from './podium.js';

export type Participant = { participantId: string; name: string; connected: boolean };
type StoredParticipant = Participant & { credential: string; socket?: { send(data: string): void; close(code?: number, reason?: string): void } };
type Room = { roomId: string; ownerCredential: string; participants: StoredParticipant[]; observers: Array<{ send(data: string): void }>; stage: 'waiting' | 'camino' | 'podium'; camino?: Camino; pedregal: Map<string, Pedregal>; espinos: Map<string, Espinos>; trivia: Map<string, Trivia>; podium?: PodiumEntry[]; terminal: Map<string, { seeds: number; answeredQuestions: number; eliminated: boolean }> };
export type PublicRoom = { roomId: string; participants: Participant[]; stage: 'waiting' | 'camino' | 'podium' };
const MAX_PLAYERS = 6;
const MAX_RECONNECT_ATTEMPTS = 3;
const DEFAULT_GRACE_PERIOD_MS = 30_000;

export class RoomError extends Error { constructor(readonly code: string, message: string) { super(message); } }

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly expiry = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly options: { gracePeriodMs?: number; camino?: CaminoOptions; pedregal?: { now?: () => number; random?: () => number; previewMs?: number }; triviaRandom?: () => number } = {}) {}

  create(): { roomId: string; ownerCredential: string } {
    let roomId: string;
    do { roomId = randomBytes(24).toString('base64url'); } while (this.rooms.has(roomId));
    const ownerCredential = this.secret();
    this.rooms.set(roomId, { roomId, ownerCredential, participants: [], observers: [], stage: 'waiting', pedregal: new Map(), espinos: new Map(), trivia: new Map(), terminal: new Map() });
    return { roomId, ownerCredential };
  }

  join(roomId: string, rawName: string): PublicRoom & { participantId: string; reconnectCredential: string } {
    const room = this.requireRoom(roomId);
    if (room.stage !== 'waiting') throw new RoomError('game_started', 'This room has already started.');
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) throw new RoomError('invalid_name', 'Name must be 1 to 40 characters.');
    if (room.participants.length >= MAX_PLAYERS) throw new RoomError('room_full', 'This room already has 6 participants.');
    const participantId = randomUUID();
    const reconnectCredential = this.secret();
    room.participants.push({ participantId, name, connected: true, credential: reconnectCredential });
    return { ...this.publicSnapshot(room), participantId, reconnectCredential };
  }

  attach(participantId: string, socket: StoredParticipant['socket']): void {
    const participant = this.findParticipant(participantId);
    participant.socket = socket;
    participant.connected = true;
  }

  disconnect(participantId: string): void {
    const room = [...this.rooms.values()].find(item => item.participants.some(player => player.participantId === participantId));
    if (!room) return;
    const participant = room.participants.find(player => player.participantId === participantId)!;
    participant.socket = undefined;
    participant.connected = false;
    this.broadcast(room);
    const old = this.expiry.get(participantId);
    if (old) clearTimeout(old);
    const timeout = setTimeout(() => {
      if (!participant.connected) {
        room.participants = room.participants.filter(player => player !== participant);
        room.camino?.remove(participantId);
        room.pedregal.delete(participantId);
        room.espinos.delete(participantId);
        room.trivia.delete(participantId);
        room.terminal.delete(participantId);
        this.updatePodium(room);
        this.expiry.delete(participantId);
        this.broadcast(room);
      }
    }, this.options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS);
    timeout.unref?.();
    this.expiry.set(participantId, timeout);
  }

  participantIdForCredential(roomId: string, credential: string): string {
    const room = this.requireRoom(roomId);
    const player = room.participants.find(item => this.matches(item.credential, credential));
    if (!player) throw new RoomError('invalid_reconnect', 'Reconnect credentials are invalid or already in use.');
    return player.participantId;
  }

  reconnect(roomId: string, credential: string): PublicRoom {
    const room = this.requireRoom(roomId);
    const player = room.participants.find(item => this.matches(item.credential, credential));
    if (!player || player.connected) throw new RoomError('invalid_reconnect', 'Reconnect credentials are invalid or already in use.');
    player.connected = true;
    const timeout = this.expiry.get(player.participantId);
    if (timeout) clearTimeout(timeout);
    this.expiry.delete(player.participantId);
    this.broadcast(room);
    return this.publicSnapshot(room);
  }

  resumeOwner(roomId: string, credential: string, socket: { send(data: string): void }): PublicRoom {
    const room = this.requireRoom(roomId);
    if (!this.matches(room.ownerCredential, credential)) throw new RoomError('invalid_owner', 'Organizer credentials are invalid.');
    room.observers = [socket];
    return this.publicSnapshot(room);
  }

  observe(roomId: string, socket: { send(data: string): void }): void { this.requireRoom(roomId).observers.push(socket); }

  start(roomId: string): PublicRoom {
    const room = this.requireRoom(roomId);
    const connected = room.participants.filter(player => player.connected).length;
    if (room.stage !== 'waiting') throw new RoomError('already_started', 'This room has already started.');
    if (connected < 2 || connected > MAX_PLAYERS) throw new RoomError('player_count', 'Start requires 2 to 6 connected players.');
    room.stage = 'camino';
    room.camino = new Camino({ ...this.options.camino, onChange: (participantId, snapshot) => {
      const player = room.participants.find(item => item.participantId === participantId);
      if (player?.socket) this.send(player.socket, { type: 'caminoProgress', camino: snapshot });
      if (snapshot.complete && !room.pedregal.has(participantId)) {
        const pedregal = new Pedregal(participantId, snapshot.seeds, this.options.pedregal);
        room.pedregal.set(participantId, pedregal);
        if (player?.socket) this.send(player.socket, { type: 'pedregalSnapshot', pedregal: pedregal.snapshot() });
        if (pedregal.snapshot().complete) this.beginEspinos(room, participantId, pedregal.snapshot().lives);
      }
    } });
    room.camino.start(room.participants.filter(player => player.connected).map(player => player.participantId));
    this.broadcast(room);
    for (const player of room.participants) if (player.connected && player.socket) this.send(player.socket, { type: 'caminoSnapshot', camino: room.camino.snapshot(player.participantId) });
    return this.publicSnapshot(room);
  }

  touch(participantId: string, birdId: string, point: Point): boolean {
    const room = [...this.rooms.values()].find(item => item.participants.some(player => player.participantId === participantId));
    if (!room || room.stage !== 'camino' || !room.camino) throw new RoomError('not_in_camino', 'No active Camino run.');
    return room.camino.touch(participantId, birdId, point);
  }

  pickPedregal(participantId: string, cellId: number): boolean {
    const room = [...this.rooms.values()].find(item => item.participants.some(player => player.participantId === participantId));
    const pedregal = room?.pedregal.get(participantId);
    if (!room || !pedregal) throw new RoomError('not_in_pedregal', 'No active Pedregal run.');
    const result = pedregal.pick(cellId);
    const player = room.participants.find(item => item.participantId === participantId);
    if (player?.socket) this.send(player.socket, { type: 'pedregalProgress', pedregal: result.snapshot });
    if (result.snapshot.complete && !room.espinos.has(participantId)) this.beginEspinos(room, participantId, result.snapshot.lives);
    return result.accepted;
  }

  pedregalSnapshot(participantId: string): PedregalSnapshot | undefined {
    return [...this.rooms.values()].find(item => item.participants.some(player => player.participantId === participantId))?.pedregal.get(participantId)?.snapshot();
  }

  moveEspinos(participantId: string, point: EspinosPoint): boolean {
    const room = [...this.rooms.values()].find(item => item.participants.some(player => player.participantId === participantId));
    const game = room?.espinos.get(participantId);
    if (!room || !game) throw new RoomError('not_in_espinos', 'No active Los Espinos run.');
    const result = game.move(point);
    if (result.accepted) {
      const player = room.participants.find(item => item.participantId === participantId);
      if (player?.socket) this.send(player.socket, { type: 'espinosProgress', espinos: result.snapshot });
      if (result.snapshot.status === 'complete' && !room.trivia.has(participantId)) this.beginTrivia(room, participantId);
      if (result.snapshot.status === 'eliminated') {
        room.terminal.set(participantId, { seeds: 0, answeredQuestions: 0, eliminated: true });
        this.updatePodium(room);
      }
    }
    return result.accepted;
  }

  answerTrivia(participantId: string, index: number, answer: string): boolean {
    const room = [...this.rooms.values()].find(item => item.participants.some(player => player.participantId === participantId));
    const trivia = room?.trivia.get(participantId);
    if (!room || !trivia) throw new RoomError('not_in_trivia', 'No active La Buena Tierra quiz.');
    const accepted = trivia.answer(index, answer);
    if (accepted) {
      const player = room.participants.find(item => item.participantId === participantId);
      const snapshot = trivia.snapshot();
      if (player?.socket) this.send(player.socket, { type: 'triviaProgress', trivia: snapshot });
      if (snapshot.complete) {
        const espinos = room.espinos.get(participantId)?.snapshot();
        if (espinos?.status === 'complete') room.terminal.set(participantId, { seeds: espinos.seeds, answeredQuestions: snapshot.answers.filter(answer => answer !== null).length, eliminated: false });
        this.updatePodium(room);
      }
    }
    return accepted;
  }

  triviaSnapshot(participantId: string): TriviaSnapshot | undefined {
    return [...this.rooms.values()].find(item => item.participants.some(player => player.participantId === participantId))?.trivia.get(participantId)?.snapshot();
  }

  private beginTrivia(room: Room, participantId: string): void {
    const trivia = new Trivia(this.options.triviaRandom);
    room.trivia.set(participantId, trivia);
    const player = room.participants.find(item => item.participantId === participantId);
    if (player?.socket) this.send(player.socket, { type: 'triviaSnapshot', trivia: trivia.snapshot() });
  }

  podium(roomId: string): PodiumEntry[] | undefined { return this.requireRoom(roomId).podium; }

  finalize(roomId: string): PublicRoom {
    const room = this.requireRoom(roomId);
    if (room.stage !== 'podium' || !room.podium) throw new RoomError('podium_not_ready', 'The final podium is not available yet.');
    room.camino?.dispose();
    room.camino = undefined;
    room.pedregal.clear(); room.espinos.clear(); room.trivia.clear(); room.terminal.clear(); room.podium = undefined;
    for (const player of room.participants) if (!player.connected) {
      const timeout = this.expiry.get(player.participantId);
      if (timeout) clearTimeout(timeout);
      this.expiry.delete(player.participantId);
    }
    room.participants = room.participants.filter(player => player.connected);
    room.stage = 'waiting';
    this.broadcast(room);
    for (const player of room.participants) if (player.socket) this.send(player.socket, { type: 'roundReset' });
    return this.publicSnapshot(room);
  }

  private updatePodium(room: Room): void {
    if (room.stage !== 'camino' || room.terminal.size !== room.participants.length) return;
    room.podium = createPodium(room.participants.map(player => {
      const result = room.terminal.get(player.participantId)!;
      return { participantId: player.participantId, name: player.name, ...result };
    }));
    room.stage = 'podium';
    this.broadcast(room);
    for (const player of room.participants) if (player.socket) this.send(player.socket, { type: 'podium', podium: room.podium });
  }

  private beginEspinos(room: Room, participantId: string, lives: number): void {
    const game = new Espinos(participantId, lives);
    room.espinos.set(participantId, game);
    const player = room.participants.find(item => item.participantId === participantId);
    const snapshot = game.snapshot();
    if (player?.socket) this.send(player.socket, { type: 'espinosSnapshot', espinos: snapshot });
    if (snapshot.status === 'eliminated') {
      room.terminal.set(participantId, { seeds: 0, answeredQuestions: 0, eliminated: true });
      this.updatePodium(room);
    }
  }

  unobserve(socket: { send(data: string): void }): void {
    for (const room of this.rooms.values()) room.observers = room.observers.filter(observer => observer !== socket);
  }

  bindSocket(roomId: string, participantId: string, socket: NonNullable<StoredParticipant['socket']>): void {
    const room = this.requireRoom(roomId);
    this.attach(participantId, socket);
    this.broadcast(room);
    const espinos = room.espinos.get(participantId);
    const pedregal = room.pedregal.get(participantId);
    if (room.podium) { this.send(socket, { type: 'podium', podium: room.podium }); return; }
    const trivia = room.trivia.get(participantId);
    if (trivia) this.send(socket, { type: 'triviaSnapshot', trivia: trivia.snapshot() });
    else if (espinos) this.send(socket, { type: 'espinosSnapshot', espinos: espinos.snapshot() });
    else if (pedregal?.snapshot().complete) this.beginEspinos(room, participantId, pedregal.snapshot().lives);
    else if (pedregal) this.send(socket, { type: 'pedregalSnapshot', pedregal: pedregal.snapshot() });
    else if (room.camino) this.send(socket, { type: 'caminoSnapshot', camino: room.camino.snapshot(participantId) });
  }

  snapshot(roomId: string): PublicRoom { return this.publicSnapshot(this.requireRoom(roomId)); }
  dispose(): void { for (const timeout of this.expiry.values()) clearTimeout(timeout); this.expiry.clear(); for (const room of this.rooms.values()) room.camino?.dispose(); this.rooms.clear(); }

  private requireRoom(id: string): Room {
    const room = this.rooms.get(id);
    if (!room) throw new RoomError('room_not_found', 'Room not found. Check the invitation link.');
    return room;
  }
  private publicSnapshot(room: Room): PublicRoom { return { roomId: room.roomId, participants: room.participants.map(({ participantId, name, connected }) => ({ participantId, name, connected })), stage: room.stage }; }
  private send(socket: NonNullable<StoredParticipant['socket']>, message: unknown): void { try { socket.send(JSON.stringify(message)); } catch { /* A close event owns cleanup. */ } }
  private broadcast(room: Room): void {
    const message = JSON.stringify({ type: 'roomState', room: this.publicSnapshot(room) });
    for (const player of room.participants) { try { player.socket?.send(message); } catch { /* A close event owns cleanup. */ } }
    for (const observer of room.observers) { try { observer.send(message); } catch { /* A closed organizer socket is harmless. */ } }
  }
  private findParticipant(id: string): StoredParticipant {
    const participant = [...this.rooms.values()].flatMap(room => room.participants).find(player => player.participantId === id);
    if (!participant) throw new RoomError('participant_not_found', 'Participant no longer exists.');
    return participant;
  }
  private secret(): string { return randomBytes(32).toString('base64url'); }
  private matches(expected: string, supplied: string): boolean {
    const a = Buffer.from(expected); const b = Buffer.from(supplied);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
