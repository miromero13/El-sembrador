import { parseServerMessage, type Room, type ServerMessage } from './protocol';

const credentialKey = (roomId: string) => `sembrador.reconnect.${roomId}`;
const ownerCredentialKey = (roomId: string) => `sembrador.owner.${roomId}`;
const activeOwnerRoomKey = 'sembrador.active-owner-room';
export type SessionState = { mode: 'idle' } | { mode: 'organizer'; roomId: string; inviteUrl: string; room: Room; connected: boolean; retriesExhausted: boolean } | { mode: 'player'; roomId: string; participantId: string; room: Room; connected: boolean; retriesExhausted: boolean };
export const friendlyError = (code: string) => code === 'room_not_found' ? 'No encontramos esa sala. Revisá el enlace e intentá de nuevo.' : code === 'room_full' ? 'La sala está completa (máximo 6 participantes).' : 'No pudimos completar la acción. Volvé a intentar.';

export class LobbySession {
  state: SessionState = { mode: 'idle' };
  private socket?: WebSocket;
  private attempts = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private intentionalClose = false;
  private reconnecting = false;
  private pending: unknown[] = [];
  private earlyRoom?: Room;
  private pendingOwnerRoomId?: string;
  constructor(private readonly changed: (state: SessionState, error?: string) => void, private readonly socketFactory: () => WebSocket = () => new WebSocket(import.meta.env.VITE_WS_URL ?? 'https://el-sembrador.onrender.com/'), private readonly storage: Storage = sessionStorage) {}
  connect() {
    this.intentionalClose = false;
    let socket: WebSocket;
    try { socket = this.socketFactory(); } catch { this.set({ mode: 'idle' }); return; }
    this.socket = socket;
    socket.onmessage = event => this.receive(event.data);
    socket.onclose = () => { if (this.socket === socket) this.closed(); };
    socket.onerror = () => socket.close();
  }
  create() { this.send({ type: 'createRoom' }); }
  join(roomId: string, name: string) { this.send({ type: 'joinRoom', roomId, name }); }
  start() { if (this.state.mode === 'organizer' && this.state.connected && !this.state.retriesExhausted && this.state.room.stage === 'waiting') this.send({ type: 'startGame' }); }
  finalize() { if (this.state.mode === 'organizer' && this.state.connected && this.state.room.stage === 'podium') this.send({ type: 'finalizeGame' }); }
  private send(message: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    else this.pending.push(message);
  }
  private receive(raw: unknown) {
    let message: ServerMessage | undefined;
    try { message = parseServerMessage(JSON.parse(String(raw))); } catch { /* rejected below */ }
    if (!message) { this.socket?.close(1008, 'Invalid server message'); return; }
    if (message.type === 'welcome') {
      let roomId = new URLSearchParams(window.location.search).get('room');
      if (!roomId) {
        const activeRoomId = this.storage.getItem(activeOwnerRoomKey);
        if (activeRoomId && this.storage.getItem(ownerCredentialKey(activeRoomId))) roomId = activeRoomId;
        else if (activeRoomId) this.storage.removeItem(activeOwnerRoomKey);
      }
      if (this.state.mode === 'organizer' && !this.state.connected) {
        const organizer = this.state;
        const ownerCredential = this.storage.getItem(ownerCredentialKey(organizer.roomId));
        if (ownerCredential) { this.pendingOwnerRoomId = organizer.roomId; this.send({ type: 'resumeOwner', roomId: organizer.roomId, ownerCredential }); }
        return;
      }
      for (const pending of this.pending.splice(0)) this.send(pending);
      if (roomId) {
        try {
          const ownerCredential = this.storage.getItem(ownerCredentialKey(roomId));
          if (ownerCredential) { this.pendingOwnerRoomId = roomId; this.send({ type: 'resumeOwner', roomId, ownerCredential }); return; }
          const saved = JSON.parse(this.storage.getItem(credentialKey(roomId)) ?? 'null') as { participantId?: string; credential?: string } | null;
          if (saved?.participantId && saved.credential) {
            this.set({ mode: 'player', roomId, participantId: saved.participantId, room: { roomId, participants: [], stage: 'waiting' }, connected: false, retriesExhausted: false });
            // Reconnect only after this socket's validated welcome. This is the
            // sole reconnect send path for both initial resume and retries.
            this.send({ type: 'reconnect', roomId, reconnectCredential: saved.credential });
          }
        } catch { /* stale or malformed tab-local identity; show join form */ }
      }
      return;
    }
    if (message.type === 'roomCreated') {
      this.storage.setItem(ownerCredentialKey(message.roomId), message.ownerCredential);
      this.storage.setItem(activeOwnerRoomKey, message.roomId);
      const room: Room = { roomId: message.roomId, participants: message.participants, stage: message.stage };
      this.attempts = 0;
      this.set({ mode: 'organizer', roomId: message.roomId, inviteUrl: new URL(message.invitePath, window.location.origin).toString(), room, connected: true, retriesExhausted: false });
    } else if (message.type === 'ownerResumed') {
      this.pendingOwnerRoomId = undefined;
      this.storage.setItem(activeOwnerRoomKey, message.roomId);
      this.attempts = 0;
      this.set({ mode: 'organizer', roomId: message.roomId, inviteUrl: new URL(message.invitePath, window.location.origin).toString(), room: message.room, connected: true, retriesExhausted: false });
      if (message.room.stage === 'podium') window.location.assign(`/podio?room=${encodeURIComponent(message.roomId)}`);
    } else if (message.type === 'joined') {
      this.attempts = 0;
      this.storage.setItem(credentialKey(message.roomId), JSON.stringify({ participantId: message.participantId, credential: message.reconnectCredential }));
      this.set({ mode: 'player', roomId: message.roomId, participantId: message.participantId, room: this.earlyRoom?.roomId === message.roomId ? this.earlyRoom : { roomId: message.roomId, participants: [], stage: 'waiting' }, connected: true, retriesExhausted: false });
      this.earlyRoom = undefined;
    } else if (message.type === 'reconnected') {
      this.reconnecting = false;
      this.attempts = 0;
      const current = this.state;
      this.set({ mode: 'player', roomId: message.roomId, participantId: message.participantId, room: message.room, connected: true, retriesExhausted: false });
      if (current.mode === 'player') this.storage.setItem(credentialKey(message.roomId), this.storage.getItem(credentialKey(message.roomId)) ?? '');
    } else if (message.type === 'roomState') {
      const current = this.state;
      if (current.mode === 'idle') this.earlyRoom = message.room;
      if (current.mode === 'organizer') this.set({ ...current, room: message.room });
      if (current.mode === 'player') this.set({ ...current, room: message.room });
      if (current.mode === 'player' && message.room.stage === 'podium') window.location.assign(`/podio?room=${encodeURIComponent(current.roomId)}`);
      if (current.mode === 'player' && message.room.stage === 'waiting' && current.room.stage === 'podium') window.location.assign(`/?room=${encodeURIComponent(current.roomId)}`);
      if (current.mode === 'organizer' && message.room.stage === 'podium') window.location.assign(`/podio?room=${encodeURIComponent(current.roomId)}`);
    } else if (message.type === 'error') {
      const staleOwnerRoomId = this.state.mode === 'organizer' ? this.state.roomId : this.pendingOwnerRoomId;
      if (message.code === 'room_not_found' && staleOwnerRoomId) {
        this.pendingOwnerRoomId = undefined;
        this.storage.removeItem(ownerCredentialKey(staleOwnerRoomId));
        if (this.storage.getItem(activeOwnerRoomKey) === staleOwnerRoomId) this.storage.removeItem(activeOwnerRoomKey);
        this.reconnecting = false;
        this.attempts = 0;
        this.set({ mode: 'idle' });
        this.error = '';
        this.changed(this.state, this.error);
        return;
      }
      this.error = this.reconnecting ? '' : friendlyError(message.code);
      this.changed(this.state, this.error);
      if (this.reconnecting) { this.reconnecting = false; this.socket?.close(); }
    }
  }
  error = '';
  private closed() {
    if (this.intentionalClose || (this.state.mode !== 'player' && this.state.mode !== 'organizer')) return;
    const disconnected = this.state;
    this.set({ ...disconnected, connected: false });
    if (this.attempts >= 3) {
      if (disconnected.mode === 'player') this.storage.removeItem(credentialKey(disconnected.roomId));
      this.set({ ...disconnected, connected: false, retriesExhausted: true });
      return;
    }
    const delay = [500, 1000, 2000][this.attempts++];
    this.retryTimer = setTimeout(() => this.reconnect(), delay);
  }
  private reconnect() {
    if (this.state.mode !== 'player' && this.state.mode !== 'organizer') return;
    const current = this.state;
    if (current.mode === 'organizer') {
      if (!this.storage.getItem(ownerCredentialKey(current.roomId))) { this.set({ ...current, retriesExhausted: true }); return; }
      this.openRetrySocket();
      return;
    }
    const player = current;
    let saved: { participantId: string; credential: string } | null = null;
    try { saved = JSON.parse(this.storage.getItem(credentialKey(player.roomId)) ?? 'null'); } catch { /* invalid session credential */ }
    if (!saved?.credential || saved.participantId !== player.participantId) { this.set({ ...player, retriesExhausted: true }); return; }
    this.openRetrySocket();
  }
  private openRetrySocket() {
    let socket: WebSocket;
    try { socket = this.socketFactory(); } catch { this.closed(); return; }
    this.socket = socket;
    this.reconnecting = true;
    socket.onmessage = event => this.receive(event.data);
    socket.onerror = () => socket.close();
    socket.onclose = () => { if (this.socket === socket) this.closed(); };
  }
  handoffToCamino(continueNavigation: () => void) {
    if (this.intentionalClose) return;
    this.intentionalClose = true;
    clearTimeout(this.retryTimer);
    const socket = this.socket;
    if (!socket || socket.readyState === WebSocket.CLOSED) { continueNavigation(); return; }
    socket.addEventListener('close', continueNavigation, { once: true });
    socket.close();
  }
  dispose() { this.intentionalClose = true; clearTimeout(this.retryTimer); this.socket?.close(); }
  private set(state: SessionState) { this.state = state; this.changed(state); }
}
