import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobbySession } from './lobby-session';
class Socket {
  static instances: Socket[] = [];
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => this.onclose?.());
  constructor() { Socket.instances.push(this); }
  message(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}
const welcome = { type: 'welcome', protocolVersion: 1, message: 'Connected to El Sembrador' };
afterEach(() => { vi.useRealTimers(); Socket.instances = []; sessionStorage.clear(); window.history.replaceState({}, '', '/'); });
describe('lobby client behavior', () => {
  it('keeps owner credentials out of invitation and retains live membership', () => {
    const session = new LobbySession(vi.fn(), () => new Socket() as unknown as WebSocket);
    session.connect(); Socket.instances[0].message(welcome);
    Socket.instances[0].message({ type: 'roomCreated', roomId: 'r', ownerCredential: 'private', invitePath: '/?room=r', participants: [], stage: 'waiting' });
    expect(session.state).toMatchObject({ mode: 'organizer', inviteUrl: `${window.location.origin}/?room=r` });
    expect(JSON.stringify(session.state)).not.toContain('private');
    expect(sessionStorage.getItem('sembrador.owner.r')).toBe('private');
    session.dispose();
  });
  it('prefers the active organizer room over an older owner credential on root reload', () => {
    sessionStorage.setItem('sembrador.owner.old', 'stale-secret');
    sessionStorage.setItem('sembrador.owner.current', 'current-secret');
    sessionStorage.setItem('sembrador.active-owner-room', 'current');
    const session = new LobbySession(vi.fn(), () => new Socket() as unknown as WebSocket);
    session.connect(); Socket.instances[0].message(welcome);
    expect(JSON.parse(Socket.instances[0].send.mock.calls[0][0])).toEqual({ type: 'resumeOwner', roomId: 'current', ownerCredential: 'current-secret' });
    session.dispose();
  });
  it('recovers the organizer from tab storage on a root-page reload', () => {
    window.history.replaceState({}, '', '/?room=r');
    sessionStorage.setItem('sembrador.owner.r', 'owner-secret');
    const session = new LobbySession(vi.fn(), () => new Socket() as unknown as WebSocket);
    session.connect(); Socket.instances[0].message(welcome);
    expect(JSON.parse(Socket.instances[0].send.mock.calls[0][0])).toEqual({ type: 'resumeOwner', roomId: 'r', ownerCredential: 'owner-secret' });
    Socket.instances[0].message({ type: 'ownerResumed', roomId: 'r', invitePath: '/?room=r', room: { roomId: 'r', stage: 'waiting', participants: [] } });
    expect(session.state).toMatchObject({ mode: 'organizer', roomId: 'r' });
    expect(JSON.stringify(session.state)).not.toContain('owner-secret');
    session.dispose();
  });
  it('clears only a missing stale owner entry and returns to the usable idle state', () => {
    sessionStorage.setItem('sembrador.owner.stale', 'stale-secret');
    sessionStorage.setItem('sembrador.active-owner-room', 'stale');
    sessionStorage.setItem('sembrador.owner.other', 'other-secret');
    const session = new LobbySession(vi.fn(), () => new Socket() as unknown as WebSocket);
    session.connect(); Socket.instances[0].message(welcome);
    Socket.instances[0].message({ type: 'error', code: 'room_not_found', message: 'Room not found' });
    expect(session.state).toEqual({ mode: 'idle' });
    expect(sessionStorage.getItem('sembrador.owner.stale')).toBeNull();
    expect(sessionStorage.getItem('sembrador.active-owner-room')).toBeNull();
    expect(sessionStorage.getItem('sembrador.owner.other')).toBe('other-secret');
    session.dispose();
  });
  it('retries organizer recovery for the same room and preserves its room snapshot', () => {
    vi.useFakeTimers(); window.history.replaceState({}, '', '/?room=unrelated');
    sessionStorage.setItem('sembrador.owner.r', 'owner-secret');
    const changed = vi.fn(); const session = new LobbySession(changed, () => new Socket() as unknown as WebSocket);
    session.connect(); Socket.instances[0].message(welcome);
    Socket.instances[0].message({ type: 'ownerResumed', roomId: 'r', invitePath: '/?room=r', room: { roomId: 'r', stage: 'waiting', participants: [{ participantId: 'p', name: 'Ada', connected: true }] } });
    Socket.instances[0].onclose?.();
    expect(session.state).toMatchObject({ mode: 'organizer', connected: false, room: { participants: [{ name: 'Ada' }] } });
    expect(session.start()).toBeUndefined();
    vi.advanceTimersByTime(500);
    const retry = Socket.instances[1];
    expect(retry.send).not.toHaveBeenCalled();
    retry.message(welcome);
    expect(JSON.parse(retry.send.mock.calls[0][0])).toEqual({ type: 'resumeOwner', roomId: 'r', ownerCredential: 'owner-secret' });
    retry.message({ type: 'ownerResumed', roomId: 'r', invitePath: '/?room=r', room: { roomId: 'r', stage: 'waiting', participants: [{ participantId: 'p', name: 'Ada', connected: true }] } });
    expect(session.state).toMatchObject({ mode: 'organizer', connected: true, retriesExhausted: false, room: { participants: [{ name: 'Ada' }] } });
    session.dispose();
  });
  it('exhausts three organizer retries, disables start state, and resets budget after recovery', () => {
    vi.useFakeTimers(); sessionStorage.setItem('sembrador.owner.r', 'owner-secret');
    const session = new LobbySession(vi.fn(), () => new Socket() as unknown as WebSocket);
    session.connect(); Socket.instances[0].message(welcome);
    Socket.instances[0].message({ type: 'ownerResumed', roomId: 'r', invitePath: '/?room=r', room: { roomId: 'r', stage: 'waiting', participants: [{ participantId: 'p', name: 'Ada', connected: true }] } });
    Socket.instances[0].onclose?.();
    for (const delay of [500, 1000, 2000]) { vi.advanceTimersByTime(delay); Socket.instances.at(-1)!.message(welcome); Socket.instances.at(-1)!.onclose?.(); }
    expect(Socket.instances).toHaveLength(4);
    expect(session.state).toMatchObject({ mode: 'organizer', connected: false, retriesExhausted: true });
    session.connect(); Socket.instances[4].message(welcome);
    Socket.instances[4].message({ type: 'ownerResumed', roomId: 'r', invitePath: '/?room=r', room: { roomId: 'r', stage: 'waiting', participants: [] } });
    Socket.instances[4].onclose?.(); vi.advanceTimersByTime(500);
    expect(Socket.instances).toHaveLength(6);
    session.dispose();
  });
  it('retries three timed times and marks removal after failure', () => {
    vi.useFakeTimers();
    const changed = vi.fn(); const session = new LobbySession(changed, () => new Socket() as unknown as WebSocket);
    session.connect(); Socket.instances[0].message(welcome);
    Socket.instances[0].message({ type: 'joined', roomId: 'r', participantId: 'p', reconnectCredential: 'secret' });
    Socket.instances[0].message({ type: 'roomState', room: { roomId: 'r', stage: 'waiting', participants: [{ participantId: 'p', name: 'Ada', connected: true }] } });
    Socket.instances[0].onclose?.();
    for (const delay of [500, 1000, 2000]) {
      vi.advanceTimersByTime(delay);
      const socket = Socket.instances.at(-1)!;
      socket.onclose?.();
    }
    expect(Socket.instances).toHaveLength(4);
    expect(session.state).toMatchObject({ mode: 'player', connected: false, retriesExhausted: true });
    expect(sessionStorage.getItem('sembrador.reconnect.r')).toBeNull();
    session.dispose();
  });
  it('sends one credential reconnect only after welcome, never on socket open', () => {
    vi.useFakeTimers(); window.history.replaceState({}, '', '/?room=r');
    const session = new LobbySession(vi.fn(), () => new Socket() as unknown as WebSocket);
    session.connect(); Socket.instances[0].message(welcome);
    Socket.instances[0].message({ type: 'joined', roomId: 'r', participantId: 'p', reconnectCredential: 'secret' });
    expect(Socket.instances[0].send).not.toHaveBeenCalled();
    Socket.instances[0].onclose?.();
    vi.useFakeTimers(); vi.advanceTimersByTime(500);
    const retry = Socket.instances[1];
    retry.onopen?.();
    expect(retry.send).not.toHaveBeenCalled();
    retry.message(welcome);
    expect(retry.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(retry.send.mock.calls[0][0])).toMatchObject({ type: 'reconnect', roomId: 'r', reconnectCredential: 'secret' });
    session.dispose();
  });
  it('resets the retry budget after a successful reconnect', () => {
    vi.useFakeTimers(); window.history.replaceState({}, '', '/?room=r');
    const session = new LobbySession(vi.fn(), () => new Socket() as unknown as WebSocket);
    session.connect(); Socket.instances[0].message(welcome); Socket.instances[0].message({ type: 'joined', roomId: 'r', participantId: 'p', reconnectCredential: 'secret' });
    Socket.instances[0].onclose?.(); vi.advanceTimersByTime(500);
    Socket.instances[1].onopen?.();
    Socket.instances[1].message(welcome);
    Socket.instances[1].message({ type: 'reconnected', roomId: 'r', participantId: 'p', room: { roomId: 'r', stage: 'waiting', participants: [{ participantId: 'p', name: 'Ada', connected: true }] } });
    expect(session.state).toMatchObject({ mode: 'player', connected: true, retriesExhausted: false });
    expect(Socket.instances[1].send).toHaveBeenCalledTimes(1);
    expect(Socket.instances[1].send).toHaveBeenCalledWith(expect.stringContaining('"type":"reconnect"'));
    session.dispose();
  });
});
