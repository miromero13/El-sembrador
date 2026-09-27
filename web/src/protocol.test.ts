import { describe, expect, it } from 'vitest';
import { inviteUrl, isWelcomeMessage, parseServerMessage, roomIdFromLocation } from './protocol';
describe('server protocol validation', () => {
  it('accepts only the exact supported welcome envelope', () => {
    expect(isWelcomeMessage({ type: 'welcome', protocolVersion: 1, message: 'Connected to El Sembrador' })).toBe(true);
    expect(isWelcomeMessage({ type: 'welcome', protocolVersion: 2, message: 'Connected to El Sembrador' })).toBe(false);
    expect(isWelcomeMessage({ type: 'welcome', protocolVersion: 1, message: 'Not a welcome' })).toBe(false);
    expect(isWelcomeMessage(null)).toBe(false);
  });
  it('validates room participants before they can be displayed', () => {
    expect(parseServerMessage({ type: 'roomState', room: { roomId: 'r', stage: 'waiting', participants: [{ participantId: 'p', name: 'Ada', connected: false }] } })?.type).toBe('roomState');
    expect(parseServerMessage({ type: 'roomState', room: { roomId: 'r', stage: 'waiting', participants: [{ participantId: 'p', name: 'Ada', connected: 'false' }] } })).toBeUndefined();
    expect(parseServerMessage({ type: 'roomCreated', roomId: 'r', ownerCredential: 'secret', invitePath: '/?room=r', stage: 'waiting', participants: [] })?.type).toBe('roomCreated');
    expect(parseServerMessage({ type: 'roomCreated', roomId: 'r', ownerCredential: 'secret', invitePath: 'https://evil.test', stage: 'waiting', participants: [] })).toBeUndefined();
  });
  it('validates game snapshots, normalized geometry and impossible counters', () => {
    const camino = { serverNow: 123, seeds: 1, seedPositions: [{ seedId: 9, position: { x: .2, y: .8 } }], resolved: 2, complete: false, birds: [{ birdId: 'b', index: 3, from: { x: 0, y: .5 }, targetSeed: 9, target: { x: .2, y: .8 }, startedAt: 100, arrivesAt: 200 }] };
    expect(parseServerMessage({ type: 'caminoSnapshot', camino })?.type).toBe('caminoSnapshot');
    const serverSample = { serverNow: 1790484097603, seeds: 10, seedPositions: Array.from({ length: 10 }, (_, seedId) => ({ seedId, position: { x: [.12, .31, .5, .6900000000000001, .88][seedId % 5], y: seedId < 5 ? .37 : .63 } })), resolved: 0, complete: false, birds: [{ birdId: 'p:0', index: 0, from: { x: .5, y: 0 }, targetSeed: 8, target: { x: .6900000000000001, y: .63 }, startedAt: 1790484097174, arrivesAt: 1790484102174 }, { birdId: 'p:1', index: 1, from: { x: 0, y: .5 }, targetSeed: 3, target: { x: .6900000000000001, y: .37 }, startedAt: 1790484097174, arrivesAt: 1790484102174 }] };
    expect(parseServerMessage({ type: 'caminoSnapshot', camino: serverSample })?.type).toBe('caminoSnapshot');
    expect(parseServerMessage({ type: 'caminoSnapshot', camino: { ...camino, seeds: 2 } })).toBeUndefined();
    expect(parseServerMessage({ type: 'caminoProgress', camino: { ...camino, resolved: 8 } })).toBeUndefined();
    expect(parseServerMessage({ type: 'caminoSnapshot', camino: { ...camino, seedPositions: [{ seedId: 9, position: { x: 1.1, y: .8 } }] } })).toBeUndefined();
    expect(parseServerMessage({ type: 'caminoSnapshot', camino: { ...camino, birds: [{ ...camino.birds[0], arrivesAt: 99 }] } })).toBeUndefined();
  });
  it('validates final podium participant rows and tied places', () => {
    const podium = [
      { participantId: 'a', name: 'Ada', score: 200, seeds: 1, answeredQuestions: 1, place: 1, eliminated: false },
      { participantId: 'b', name: 'Bo', score: 200, seeds: 1, answeredQuestions: 1, place: 1, eliminated: false },
    ];
    expect(parseServerMessage({ type: 'podium', podium })?.type).toBe('podium');
    expect(parseServerMessage({ type: 'podium', podium: [{ ...podium[0], score: -1 }, podium[1]] })).toBeUndefined();
    expect(parseServerMessage({ type: 'roomState', room: { roomId: 'r', stage: 'podium', participants: [] } })?.type).toBe('roomState');
  });
  it('builds public invitations and rejects ambiguous room query parameters', () => {
    expect(inviteUrl('room / 1', 'https://example.test')).toBe('https://example.test/?room=room%20%2F%201');
    expect(roomIdFromLocation('?room=abc')).toBe('abc'); expect(roomIdFromLocation('?room=a&room=b')).toBeNull(); expect(roomIdFromLocation('?room=')).toBeNull();
  });
});
