import { parseServerMessage, type PodiumEntry, type ServerMessage } from './protocol';
const credentialKey = (roomId: string) => `sembrador.reconnect.${roomId}`;
const ownerKey = (roomId: string) => `sembrador.owner.${roomId}`;
export type PodioState = { podium?: PodiumEntry[]; organizer: boolean; connected: boolean; error?: string };
export class PodioSession {
  state: PodioState = { organizer: false, connected: false };
  private socket?: WebSocket;
  private roomId: string;
  private ownerCredential?: string;
  private participantId?: string;
  constructor(roomId: string, private readonly changed: (state: PodioState) => void, private readonly socketFactory: () => WebSocket = () => new WebSocket(import.meta.env.VITE_WS_URL ?? 'https://el-sembrador.onrender.com/'), private readonly storage: Storage = sessionStorage) { this.roomId = roomId; }
  connect() {
    this.ownerCredential = this.storage.getItem(ownerKey(this.roomId)) ?? undefined;
    let identity: { participantId?: string; credential?: string } | null = null;
    try { identity = JSON.parse(this.storage.getItem(credentialKey(this.roomId)) ?? 'null'); } catch { /* Invalid tab identity. */ }
    this.participantId = identity?.participantId;
    try { this.socket = this.socketFactory(); } catch { this.set({ ...this.state, error: 'No pudimos conectar con la sala.' }); return; }
    const socket = this.socket;
    socket.onmessage = event => this.receive(event.data, socket);
    socket.onclose = () => this.set({ ...this.state, connected: false });
  }
  finalize() { if (this.state.organizer && this.state.podium && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'finalizeGame' })); }
  private receive(raw: unknown, socket: WebSocket) {
    let message: ServerMessage | undefined;
    try { message = parseServerMessage(JSON.parse(String(raw))); } catch { /* Invalid envelope. */ }
    if (!message) { socket.close(1008, 'Invalid server message'); return; }
    if (message.type === 'welcome') {
      if (this.ownerCredential) socket.send(JSON.stringify({ type: 'resumeOwner', roomId: this.roomId, ownerCredential: this.ownerCredential }));
      else {
        const saved = this.storage.getItem(credentialKey(this.roomId));
        let credential: string | undefined;
        try { credential = (JSON.parse(saved ?? 'null') as { credential?: string } | null)?.credential; } catch { /* Invalid identity. */ }
        if (!credential || !this.participantId) { this.set({ ...this.state, error: 'No encontramos tu sesión de jugador.' }); return; }
        socket.send(JSON.stringify({ type: 'reconnect', roomId: this.roomId, reconnectCredential: credential }));
      }
    } else if (message.type === 'ownerResumed') {
      if (message.roomId !== this.roomId || message.room.stage !== 'podium') { socket.close(1008, 'Podium is not available'); return; }
      this.set({ ...this.state, organizer: true, connected: true });
    } else if (message.type === 'reconnected') {
      if (message.roomId !== this.roomId || message.participantId !== this.participantId || message.room.stage !== 'podium') { socket.close(1008, 'Podium is not available'); return; }
      this.set({ ...this.state, connected: true });
    } else if (message.type === 'podium') this.set({ ...this.state, podium: message.podium });
    else if (message.type === 'roundReset') window.location.assign(`/?room=${encodeURIComponent(this.roomId)}`);
    else if (message.type === 'roomState' && message.room.stage === 'waiting') window.location.assign(`/?room=${encodeURIComponent(this.roomId)}`);
    else if (message.type === 'error') this.set({ ...this.state, error: message.message });
    else if (message.type !== 'roomState') socket.close(1008, 'Unexpected podium message');
  }
  private set(state: PodioState) { this.state = state; this.changed(state); }
  dispose() { this.socket?.close(); }
}
