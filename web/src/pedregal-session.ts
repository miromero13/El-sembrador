import { parseServerMessage, type PedregalState, type ServerMessage } from './protocol';

const credentialKey = (roomId: string) => `sembrador.reconnect.${roomId}`;
export type PedregalSessionState = { status: 'connecting' | 'playing' | 'complete' | 'advancing' | 'error'; pedregal?: PedregalState; message?: string };
export class PedregalSession {
  state: PedregalSessionState = { status: 'connecting' };
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private intentionalClose = false;
  private welcomed = false;
  private participantId?: string;
  private pending = new Set<number>();
  constructor(private readonly roomId: string, private readonly changed: (state: PedregalSessionState) => void, private readonly socketFactory: () => WebSocket = () => new WebSocket(import.meta.env.VITE_WS_URL ?? 'https://el-sembrador.onrender.com/'), private readonly storage: Storage = sessionStorage) {}
  connect() { this.timer = setTimeout(() => this.open(), 400); }
  pick(cellId: number) {
    const state = this.state.pedregal;
    if (this.state.status !== 'playing' || !state || state.complete || state.revealed.some(cell => cell.cellId === cellId) || this.pending.has(cellId) || this.socket?.readyState !== WebSocket.OPEN) return;
    this.pending.add(cellId);
    this.socket.send(JSON.stringify({ type: 'pickPedregal', cellId }));
  }
  private open() {
    try { this.socket = this.socketFactory(); } catch { this.fail('No pudimos conectar con el servidor.'); return; }
    const socket = this.socket;
    socket.onmessage = event => this.receive(event.data, socket);
    socket.onclose = () => { if (!this.intentionalClose) this.fail('Se perdió la conexión con la partida.'); };
  }
  private receive(raw: unknown, socket: WebSocket) {
    let message: ServerMessage | undefined;
    try { message = parseServerMessage(JSON.parse(String(raw))); } catch { /* invalid envelope */ }
    if (!message) { socket.close(1008, 'Invalid server message'); return; }
    if (message.type === 'welcome') {
      if (this.welcomed) { socket.close(1008, 'Duplicate welcome'); return; }
      this.welcomed = true;
      let saved: { participantId?: string; credential?: string } | null = null;
      try { saved = JSON.parse(this.storage.getItem(credentialKey(this.roomId)) ?? 'null'); } catch { /* invalid local credential */ }
      if (!saved?.participantId || !saved.credential) { this.fail('No encontramos una sesión de jugador para esta sala.'); socket.close(); return; }
      this.participantId = saved.participantId;
      socket.send(JSON.stringify({ type: 'reconnect', roomId: this.roomId, reconnectCredential: saved.credential }));
      return;
    }
    if (message.type === 'reconnected') {
      if (message.roomId !== this.roomId || message.participantId !== this.participantId || message.room.roomId !== this.roomId) socket.close(1008, 'Impossible Pedregal identity');
      return;
    }
    if (message.type === 'pedregalSnapshot' || message.type === 'pedregalProgress') {
      if (!this.welcomed || socket !== this.socket) { socket.close(1008, 'Unexpected Pedregal state'); return; }
      this.pending.clear();
      this.set({ status: message.pedregal.complete ? 'complete' : 'playing', pedregal: message.pedregal });
      return;
    }
    if (message.type === 'espinosSnapshot' || message.type === 'espinosProgress') {
      if (!this.welcomed || socket !== this.socket) { socket.close(1008, 'Unexpected Los Espinos state'); return; }
      this.set({ status: 'advancing' });
      return;
    }
    if (message.type === 'error') { this.fail(message.message); return; }
    if (message.type === 'roomState') {
      if (message.room.roomId !== this.roomId) socket.close(1008, 'Impossible Pedregal room state');
      else if (message.room.stage === 'podium') window.location.assign(`/podio?room=${encodeURIComponent(this.roomId)}`);
      else if (message.room.stage === 'waiting') window.location.assign(`/?room=${encodeURIComponent(this.roomId)}`);
      return;
    }
    if (message.type === 'podium') window.location.assign(`/podio?room=${encodeURIComponent(this.roomId)}`);
    else if (message.type === 'roundReset') window.location.assign(`/?room=${encodeURIComponent(this.roomId)}`);
    else socket.close(1008, 'Unexpected Pedregal message');
  }
  private fail(message: string) { this.set({ status: 'error', message }); }
  private set(state: PedregalSessionState) { this.state = state; this.changed(state); }
  dispose() { this.intentionalClose = true; clearTimeout(this.timer); this.socket?.close(); }
}
