import { parseServerMessage, type CaminoState, type ServerMessage } from './protocol';

const credentialKey = (roomId: string) => `sembrador.reconnect.${roomId}`;
export type CaminoSessionState = { status: 'connecting' | 'playing' | 'complete' | 'error'; roomId: string; camino?: CaminoState; message?: string };
export class CaminoSession {
  state: CaminoSessionState;
  private socket?: WebSocket;
  private attempts = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private startupTimer?: ReturnType<typeof setTimeout>;
  private snapshotTimer?: ReturnType<typeof setTimeout>;
  private intentionalClose = false;
  private welcomed = false;
  private expectedParticipantId?: string;
  constructor(readonly roomId: string, private readonly changed: (state: CaminoSessionState) => void, private readonly socketFactory: () => WebSocket = () => new WebSocket(import.meta.env.VITE_WS_URL ?? 'https://el-sembrador.onrender.com/'), private readonly storage: Storage = sessionStorage) {
    this.state = { status: 'connecting', roomId };
  }
  connect() {
    this.intentionalClose = false;
    // Let the Lobby/reloaded page's previous socket finish its close handshake
    // before presenting the same tab credential on a replacement connection.
    this.startupTimer = setTimeout(() => this.openSocket(), 400);
  }
  touch(birdId: string, x: number, y: number) {
    if (this.state.status !== 'playing' || !this.socket || this.socket.readyState !== WebSocket.OPEN || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return;
    this.socket.send(JSON.stringify({ type: 'touchBird', birdId, x, y }));
  }
  private openSocket() {
    let socket: WebSocket;
    try { socket = this.socketFactory(); } catch { this.closed(); return; }
    this.socket = socket; this.welcomed = false;
    socket.onmessage = event => this.receive(event.data, socket);
    socket.onclose = () => { if (this.socket === socket) this.closed(); };
    socket.onerror = () => socket.close();
  }
  private receive(raw: unknown, socket: WebSocket) {
    let message: ServerMessage | undefined;
    try { message = parseServerMessage(JSON.parse(String(raw))); } catch { /* invalid frame below */ }
    if (!message) { socket.close(1008, 'Invalid server message'); return; }
    if (message.type === 'welcome') {
      if (this.welcomed) { socket.close(1008, 'Duplicate welcome'); return; }
      this.welcomed = true;
      let saved: { participantId?: string; credential?: string } | null = null;
      try { saved = JSON.parse(this.storage.getItem(credentialKey(this.roomId)) ?? 'null'); } catch { /* malformed tab credential */ }
      if (!saved?.participantId || !saved.credential || saved.credential.length > 128) { this.fail('No encontramos una sesión de jugador en esta pestaña. Volvé a entrar desde la invitación.'); socket.close(); return; }
      this.expectedParticipantId = saved.participantId;
      socket.send(JSON.stringify({ type: 'reconnect', roomId: this.roomId, reconnectCredential: saved.credential }));
      return;
    }
    if (message.type === 'reconnected') {
      if (message.roomId !== this.roomId || message.room.roomId !== this.roomId || message.room.stage !== 'camino' || message.participantId !== this.expectedParticipantId) { socket.close(1008, 'Impossible Camino state'); return; }
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = setTimeout(() => { if (socket === this.socket && this.state.status === 'connecting') socket.close(); }, 1200);
      return;
    }
    if (message.type === 'roomState') {
      if (message.room.roomId !== this.roomId) socket.close(1008, 'Impossible Camino room state');
      else if (message.room.stage === 'podium') window.location.assign(`/podio?room=${encodeURIComponent(this.roomId)}`);
      else if (message.room.stage === 'waiting') window.location.assign(`/?room=${encodeURIComponent(this.roomId)}`);
      else if (message.room.stage !== 'camino') socket.close(1008, 'Impossible Camino room state');
      return;
    }
    if (message.type === 'caminoSnapshot' || message.type === 'caminoProgress') {
      if (!this.welcomed || socket !== this.socket) { socket.close(1008, 'Unexpected Camino state'); return; }
      clearTimeout(this.snapshotTimer);
      this.attempts = 0;
      this.set({ status: message.camino.complete ? 'complete' : 'playing', roomId: this.roomId, camino: message.camino });
      return;
    }
    if (message.type === 'error') {
      if (message.code === 'invalid_reconnect' || message.code === 'room_not_found') { this.fail('No pudimos recuperar tu lugar en la sala.'); socket.close(); }
      else if (message.code === 'invalid_touch') this.set({ ...this.state, message: 'No alcanzaste a espantarla; probá otra vez si sigue volando.' });
      else if (message.code !== 'already_in_room') this.set({ ...this.state, message: message.message });
    } else if (message.type === 'podium') window.location.assign(`/podio?room=${encodeURIComponent(this.roomId)}`);
    else if (message.type === 'roundReset') window.location.assign(`/?room=${encodeURIComponent(this.roomId)}`);
    else socket.close(1008, 'Unexpected message for Camino');
  }
  private closed() {
    if (this.intentionalClose) return;
    if (this.attempts >= 3) { this.fail('No se pudo reconectar. Volvé a abrir la invitación dentro del tiempo permitido.'); return; }
    const delay = [500, 1000, 2000][this.attempts++];
    this.set({ ...this.state, status: 'connecting', message: 'Conexión interrumpida. Intentando volver…' });
    this.retryTimer = setTimeout(() => this.openSocket(), delay);
  }
  private fail(message: string) { this.set({ status: 'error', roomId: this.roomId, message }); }
  private set(state: CaminoSessionState) { this.state = state; this.changed(state); }
  dispose() { this.intentionalClose = true; clearTimeout(this.startupTimer); clearTimeout(this.retryTimer); clearTimeout(this.snapshotTimer); this.socket?.close(); }
}
