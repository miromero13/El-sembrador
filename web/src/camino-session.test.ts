import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaminoSession } from './camino-session';

class Socket {
  static instances: Socket[] = [];
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn(); close = vi.fn(() => this.onclose?.());
  constructor() { Socket.instances.push(this); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
const welcome = { type: 'welcome', protocolVersion: 1, message: 'Connected to El Sembrador' };
const room = { roomId: 'r', stage: 'camino', participants: [{ participantId: 'p', name: 'Ada', connected: true }] };
const snapshot = { serverNow: 10, seeds: 10, seedPositions: Array.from({ length: 10 }, (_, seedId) => ({ seedId, position: { x: .5, y: .5 } })), resolved: 0, complete: false, birds: [] };
afterEach(() => { vi.useRealTimers(); Socket.instances = []; sessionStorage.clear(); });
describe('Camino session', () => {
  it('reattaches only after validated welcome and restores authoritative snapshot', () => {
    vi.useFakeTimers(); sessionStorage.setItem('sembrador.reconnect.r', JSON.stringify({ participantId: 'p', credential: 'secret' }));
    const changed = vi.fn(); const session = new CaminoSession('r', changed, () => new Socket() as unknown as WebSocket);
    session.connect(); vi.advanceTimersByTime(400); const socket = Socket.instances[0];
    expect(socket.send).not.toHaveBeenCalled(); socket.message(welcome);
    expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({ type: 'reconnect', roomId: 'r', reconnectCredential: 'secret' });
    socket.message({ type: 'reconnected', roomId: 'r', participantId: 'p', room });
    socket.message({ type: 'caminoSnapshot', camino: snapshot });
    expect(session.state).toMatchObject({ status: 'playing', camino: { seeds: 10, resolved: 0 } });
    session.dispose();
  });
  it('rejects malformed or impossible game state and never sends a bird id without coordinates', () => {
    vi.useFakeTimers(); sessionStorage.setItem('sembrador.reconnect.r', JSON.stringify({ participantId: 'p', credential: 'secret' }));
    const session = new CaminoSession('r', vi.fn(), () => new Socket() as unknown as WebSocket);
    session.connect(); vi.advanceTimersByTime(400); const socket = Socket.instances[0]; socket.message(welcome);
    socket.message({ type: 'caminoSnapshot', camino: { ...snapshot, complete: true } });
    expect(socket.close).toHaveBeenCalledWith(1008, 'Invalid server message');
    session.dispose();
  });
  it('reports normalized hit positions and uses at most three timed retries', () => {
    vi.useFakeTimers(); sessionStorage.setItem('sembrador.reconnect.r', JSON.stringify({ participantId: 'p', credential: 'secret' }));
    const session = new CaminoSession('r', vi.fn(), () => new Socket() as unknown as WebSocket);
    session.connect(); vi.advanceTimersByTime(400); let socket = Socket.instances[0]; socket.message(welcome); socket.message({ type: 'reconnected', roomId: 'r', participantId: 'p', room }); socket.message({ type: 'caminoSnapshot', camino: snapshot });
    session.touch('bird', .27, .63); expect(JSON.parse(socket.send.mock.calls.at(-1)![0])).toEqual({ type: 'touchBird', birdId: 'bird', x: .27, y: .63 });
    socket.onclose?.();
    for (const delay of [500, 1000, 2000]) { vi.advanceTimersByTime(delay); socket = Socket.instances.at(-1)!; socket.onclose?.(); }
    expect(Socket.instances).toHaveLength(4); expect(session.state.message).toContain('No se pudo reconectar');
    session.dispose();
  });
});
