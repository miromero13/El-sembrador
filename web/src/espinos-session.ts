import { parseServerMessage, type EspinosState, type ServerMessage, type TriviaState } from './protocol';
const credentialKey = (roomId: string) => `sembrador.reconnect.${roomId}`;
export type EspinosSessionState = { status: 'connecting' | 'playing' | 'complete' | 'eliminated' | 'trivia' | 'error'; espinos?: EspinosState; trivia?: TriviaState; message?: string };
export class EspinosSession {
  state: EspinosSessionState = { status: 'connecting' };
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private welcomed = false;
  private participantId?: string;
  constructor(private readonly roomId: string, private readonly changed: (state: EspinosSessionState) => void, private readonly socketFactory: () => WebSocket = () => new WebSocket(import.meta.env.VITE_WS_URL ?? 'https://el-sembrador.onrender.com/'), private readonly storage: Storage = sessionStorage) {}
  connect() { this.timer = setTimeout(() => this.open(), 400); }
  move(x: number, y: number) { if (this.state.status === 'playing' && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'moveEspinos', x, y })); }
  answer(index: number, answer: 'A' | 'B' | 'C') { if (this.state.status === 'trivia' && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'answerTrivia', index, answer })); }
  private open() { try { this.socket = this.socketFactory(); } catch { this.fail('No pudimos conectar con el servidor.'); return; } const socket = this.socket; socket.onmessage = event => this.receive(event.data, socket); socket.onclose = () => this.fail('Se perdió la conexión con la partida.'); }
  private receive(raw: unknown, socket: WebSocket) {
    let message: ServerMessage | undefined;
    try { message = parseServerMessage(JSON.parse(String(raw))); } catch { /* Invalid JSON. */ }
    if (!message) { socket.close(1008, 'Invalid server message'); return; }
    if (message.type === 'welcome') {
      if (this.welcomed) { socket.close(1008, 'Duplicate welcome'); return; }
      this.welcomed = true;
      let saved: { participantId?: string; credential?: string } | null = null;
      try { saved = JSON.parse(this.storage.getItem(credentialKey(this.roomId)) ?? 'null'); } catch { /* Invalid stored credential. */ }
      if (!saved?.participantId || !saved.credential) { this.fail('No encontramos una sesión de jugador para esta sala.'); socket.close(); return; }
      this.participantId = saved.participantId;
      socket.send(JSON.stringify({ type: 'reconnect', roomId: this.roomId, reconnectCredential: saved.credential })); return;
    }
    if (message.type === 'reconnected') { if (message.roomId !== this.roomId || message.participantId !== this.participantId) socket.close(1008, 'Impossible player identity'); return; }
    if (message.type === 'espinosSnapshot' || message.type === 'espinosProgress') { this.set({ status: message.espinos.status, espinos: message.espinos }); return; }
    if (message.type === 'triviaSnapshot' || message.type === 'triviaProgress') { this.set({ status: 'trivia', trivia: message.trivia }); return; }
    if (message.type === 'error') { this.fail(message.message); return; }
    if (message.type === 'roomState') {
      if (message.room.roomId !== this.roomId) socket.close(1008, 'Impossible La Buena Tierra room state');
      else if (message.room.stage === 'podium') window.location.assign(`/podio?room=${encodeURIComponent(this.roomId)}`);
      else if (message.room.stage === 'waiting') window.location.assign(`/?room=${encodeURIComponent(this.roomId)}`);
      return;
    }
    if (message.type === 'podium') window.location.assign(`/podio?room=${encodeURIComponent(this.roomId)}`);
    else if (message.type === 'roundReset') window.location.assign(`/?room=${encodeURIComponent(this.roomId)}`);
    else if (message.type !== 'pedregalSnapshot' && message.type !== 'pedregalProgress') socket.close(1008, 'Unexpected Los Espinos message');
  }
  private fail(message: string) { this.set({ status: 'error', message }); }
  private set(state: EspinosSessionState) { this.state = state; this.changed(state); }
  dispose() { clearTimeout(this.timer); this.socket?.close(); }
}
