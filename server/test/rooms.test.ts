import { afterEach, describe, expect, it } from 'vitest';
import { RoomManager } from '../src/rooms.js';

const managers: RoomManager[] = [];
function manager() { const value = new RoomManager({ gracePeriodMs: 20 }); managers.push(value); return value; }
afterEach(() => { for (const value of managers.splice(0)) value.dispose(); });

describe('authoritative rooms', () => {
  it('creates private organizer credentials and joins up to six named participants', () => {
    const rooms = manager();
    const created = rooms.create();
    expect(created.roomId).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(created.ownerCredential).not.toBe(created.roomId);
    expect(rooms.join(created.roomId, 'Ada').participants).toHaveLength(1);
    for (let i = 2; i <= 6; i++) rooms.join(created.roomId, `Player ${i}`);
    expect(() => rooms.join(created.roomId, 'Seven')).toThrow(/6 participants/);
  });
  it('rejects invalid rooms and invalid names', () => {
    const rooms = manager();
    expect(() => rooms.join('missing', 'Ada')).toThrow('not found');
    const { roomId } = rooms.create();
    for (const name of ['', '  ', 'x'.repeat(41)]) expect(() => rooms.join(roomId, name)).toThrow();
  });
  it('authenticates owner recovery and starts only with two connected players', () => {
    const rooms = manager();
    const { roomId, ownerCredential } = rooms.create();
    expect(() => rooms.resumeOwner(roomId, 'wrong', { send() {} })).toThrow('credentials are invalid');
    expect(() => rooms.start(roomId)).toThrow('2 to 6 connected');
    const player = rooms.join(roomId, 'Ada');
    rooms.join(roomId, 'Bo');
    rooms.disconnect(player.participantId);
    expect(() => rooms.start(roomId)).toThrow('2 to 6 connected');
    rooms.reconnect(roomId, player.reconnectCredential);
    const observer = { send() {} };
    expect(rooms.resumeOwner(roomId, ownerCredential, observer).stage).toBe('waiting');
    expect(rooms.start(roomId).stage).toBe('camino');
    expect(() => rooms.join(roomId, 'Late')).toThrow(/already started/);
  });
  it('releases an expired participant Camino run and its timers', async () => {
    const rooms = new RoomManager({ gracePeriodMs: 10, camino: { schedule: () => Array(8).fill(50) } });
    managers.push(rooms);
    const { roomId } = rooms.create();
    const player = rooms.join(roomId, 'Ada');
    const messages: string[] = [];
    const socket = { send(data: string) { messages.push(data); }, close() {} };
    rooms.bindSocket(roomId, player.participantId, socket);
    rooms.join(roomId, 'Bo');
    rooms.start(roomId);
    rooms.disconnect(player.participantId);
    await new Promise(resolve => setTimeout(resolve, 80));
    const countAtExpiry = messages.length;
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(messages).toHaveLength(countAtExpiry);
    expect(rooms.snapshot(roomId).participants).toHaveLength(1);
  });
  it('hands each completed Camino run into a private authoritative Pedregal session', async () => {
    let now = 0;
    const rooms = new RoomManager({ pedregal: { now: () => now, random: () => 0 }, camino: { flightMs: 2, schedule: () => Array(8).fill(0) } });
    managers.push(rooms);
    const { roomId } = rooms.create();
    const ada = rooms.join(roomId, 'Ada');
    const messages: any[] = [];
    const socket = { send(data: string) { messages.push(JSON.parse(data)); }, close() {} };
    rooms.bindSocket(roomId, ada.participantId, socket);
    rooms.join(roomId, 'Bo');
    rooms.start(roomId);
    await new Promise(resolve => setTimeout(resolve, 30));
    const initial = messages.find(message => message.type === 'pedregalSnapshot')?.pedregal;
    expect(initial).toMatchObject({ attempts: 2, preview: true, cells: expect.arrayContaining([{ cellId: expect.any(Number), hasSeed: true }]) });
    now = 3_000;
    const hit = initial.cells.find((cell: any) => cell.hasSeed).cellId;
    expect(rooms.pickPedregal(ada.participantId, hit)).toBe(true);
    expect(rooms.pickPedregal(ada.participantId, hit)).toBe(false);
    expect(messages.filter(message => message.type === 'pedregalProgress').at(-1).pedregal).toMatchObject({ recovered: 1, lives: 1, remainingAttempts: 1 });
    expect(rooms.pedregalSnapshot(ada.participantId)?.attempts).toBe(2);
  });
  it('starts independent Espinos sessions from each player’s recovered Pedregal lives', async () => {
    let now = 0;
    const rooms = new RoomManager({ pedregal: { now: () => now, random: () => 0, previewMs: 1_000 }, camino: { flightMs: 1, schedule: () => Array(8).fill(0) } });
    managers.push(rooms);
    const { roomId } = rooms.create();
    const a = rooms.join(roomId, 'A'); const b = rooms.join(roomId, 'B');
    const messagesA: any[] = []; const messagesB: any[] = [];
    rooms.bindSocket(roomId, a.participantId, { send(data) { messagesA.push(JSON.parse(data)); }, close() {} });
    rooms.bindSocket(roomId, b.participantId, { send(data) { messagesB.push(JSON.parse(data)); }, close() {} });
    rooms.start(roomId);
    await new Promise(resolve => setTimeout(resolve, 30));
    now = 1_001;
    for (const [id, messages] of [[a.participantId, messagesA], [b.participantId, messagesB]] as const) {
      const board = messages.find(message => message.type === 'pedregalSnapshot').pedregal;
      for (const cell of board.cells.filter((item: any) => item.hasSeed)) rooms.pickPedregal(id, cell.cellId);
    }
    expect(messagesA.some(message => message.type === 'espinosSnapshot')).toBe(true);
    expect(messagesB.some(message => message.type === 'espinosSnapshot')).toBe(true);
    rooms.moveEspinos(a.participantId, { x: .5, y: .95 });
    expect(messagesA.filter(message => message.type === 'espinosProgress').at(-1).espinos.seeds).toBe(1);
    expect(messagesB.some(message => message.type === 'espinosProgress')).toBe(false);
  });
  it('publishes one room-wide podium after independent completion and elimination, then resets for replay', async () => {
    let now = 0;
    const rooms = new RoomManager({ camino: { flightMs: 1, schedule: () => Array(8).fill(0) }, pedregal: { now: () => now, random: () => 0, previewMs: 1_000 }, triviaRandom: () => 0 });
    managers.push(rooms);
    const { roomId } = rooms.create();
    expect(() => rooms.finalize(roomId)).toThrow(/not available/);
    const ada = rooms.join(roomId, 'Ada'); const bo = rooms.join(roomId, 'Bo');
    const framesA: any[] = []; const framesB: any[] = [];
    rooms.bindSocket(roomId, ada.participantId, { send(data) { framesA.push(JSON.parse(data)); }, close() {} });
    rooms.bindSocket(roomId, bo.participantId, { send(data) { framesB.push(JSON.parse(data)); }, close() {} });
    rooms.start(roomId);
    await new Promise(resolve => setTimeout(resolve, 35));
    now = 1_001;
    for (const [player, frames] of [[ada, framesA], [bo, framesB]] as const) {
      const board = frames.find(message => message.type === 'pedregalSnapshot').pedregal;
      for (const cell of board.cells.filter((item: any) => item.hasSeed)) rooms.pickPedregal(player.participantId, cell.cellId);
    }
    const route = [{ x: .1, y: .84 }, { x: .1, y: .64 }, { x: .34, y: .64 }, { x: .34, y: .4 }, { x: .66, y: .4 }, { x: .66, y: .64 }, { x: .9, y: .64 }, { x: .9, y: .2 }];
    for (const point of route) rooms.moveEspinos(ada.participantId, point);
    rooms.answerTrivia(ada.participantId, 0, 'A'); rooms.answerTrivia(ada.participantId, 1, 'A');
    expect(framesA.some(message => message.type === 'podium')).toBe(false);
    rooms.moveEspinos(bo.participantId, { x: .5, y: .95 });
    rooms.moveEspinos(bo.participantId, route[0]);
    rooms.moveEspinos(bo.participantId, { x: .5, y: .95 });
    const podiumA = framesA.find(message => message.type === 'podium')?.podium;
    const podiumB = framesB.find(message => message.type === 'podium')?.podium;
    expect(podiumA).toEqual(podiumB);
    expect(podiumA).toMatchObject([{ name: 'Ada', score: 400, seeds: 2, answeredQuestions: 2, place: 1 }, { name: 'Bo', score: 0, seeds: 0, answeredQuestions: 0, place: 2, eliminated: true }]);
    expect(() => rooms.finalize(roomId)).not.toThrow();
    expect(rooms.snapshot(roomId)).toMatchObject({ stage: 'waiting', participants: [{ participantId: ada.participantId, connected: true }, { participantId: bo.participantId, connected: true }] });
    expect(rooms.podium(roomId)).toBeUndefined();
    expect(rooms.start(roomId).stage).toBe('camino');
  });

  it('allows repeated successful reconnect cycles and eventually expires the final disconnection', async () => {
    const rooms = manager();
    const { roomId } = rooms.create();
    const player = rooms.join(roomId, 'Ada');
    for (let cycle = 0; cycle < 4; cycle++) {
      rooms.disconnect(player.participantId);
      expect(rooms.reconnect(roomId, player.reconnectCredential).participants[0].connected).toBe(true);
    }
    rooms.disconnect(player.participantId);
    await new Promise(resolve => setTimeout(resolve, 35));
    expect(rooms.snapshot(roomId).participants).toHaveLength(0);
  });
  it('advances a completed Espinos player independently and restores their answered quiz on reconnect', async () => {
    let now = 0;
    const rooms = new RoomManager({
      gracePeriodMs: 1_000,
      camino: { flightMs: 1, schedule: () => Array(8).fill(0) },
      pedregal: { now: () => now, random: () => 0, previewMs: 1 },
      triviaRandom: () => 0,
    });
    managers.push(rooms);
    const { roomId } = rooms.create();
    const a = rooms.join(roomId, 'Ada'); const b = rooms.join(roomId, 'Bo');
    const messagesA: any[] = []; const messagesB: any[] = [];
    const socketA = { send(data: string) { messagesA.push(JSON.parse(data)); }, close() {} };
    rooms.bindSocket(roomId, a.participantId, socketA);
    rooms.bindSocket(roomId, b.participantId, { send(data: string) { messagesB.push(JSON.parse(data)); }, close() {} });
    rooms.start(roomId);
    await new Promise(resolve => setTimeout(resolve, 30));
    now = 2;
    for (const [id, messages] of [[a.participantId, messagesA], [b.participantId, messagesB]] as const) {
      const board = messages.find(message => message.type === 'pedregalSnapshot').pedregal;
      for (const cell of board.cells.filter((item: any) => item.hasSeed)) rooms.pickPedregal(id, cell.cellId);
    }
    const route = [{ x: .1, y: .84 }, { x: .1, y: .64 }, { x: .34, y: .64 }, { x: .34, y: .4 }, { x: .66, y: .4 }, { x: .66, y: .64 }, { x: .9, y: .64 }, { x: .9, y: .2 }];
    for (const point of route) rooms.moveEspinos(a.participantId, point);
    const initial = messagesA.find(message => message.type === 'triviaSnapshot')?.trivia;
    expect(initial.questions.map((question: any) => question.index)).toEqual([0, 1]);
    expect(messagesB.some(message => message.type === 'triviaSnapshot')).toBe(false);
    expect(rooms.answerTrivia(a.participantId, 1, 'A')).toBe(false);
    expect(rooms.answerTrivia(a.participantId, 0, 'B')).toBe(true);
    expect(rooms.answerTrivia(a.participantId, 0, 'A')).toBe(false);
    expect(rooms.triviaSnapshot(a.participantId)).toMatchObject({ answers: ['B', null], correct: 1, complete: false });
    rooms.disconnect(a.participantId);
    rooms.reconnect(roomId, a.reconnectCredential);
    const resumed: any[] = [];
    rooms.bindSocket(roomId, a.participantId, { send(data: string) { resumed.push(JSON.parse(data)); }, close() {} });
    expect(resumed.find(message => message.type === 'triviaSnapshot')?.trivia).toMatchObject({ questions: initial.questions, answers: ['B', null], correct: 1, complete: false });
    expect(rooms.answerTrivia(a.participantId, 1, 'A')).toBe(true);
    expect(rooms.triviaSnapshot(a.participantId)).toMatchObject({ answers: ['B', 'A'], correct: 1, complete: true });
  });
});
