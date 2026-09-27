import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

const apps: FastifyInstance[] = [];
async function openApp() {
  const app = createApp(new Set(['https://allowed.example']));
  apps.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP listener');
  return `ws://127.0.0.1:${address.port}/ws`;
}
function connect(url: string, origin = 'https://allowed.example') {
  const socket = new WebSocket(url, { origin });
  const messages: unknown[] = [];
  socket.on('message', data => messages.push(JSON.parse(data.toString())));
  return { socket, messages };
}
function waitFor(socket: WebSocket, predicate: (value: any) => boolean, messages: unknown[]) {
  const existing = messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for message; observed ${JSON.stringify(messages)}`)), 1000);
    const listener = (data: WebSocket.RawData) => {
      const value = JSON.parse(data.toString());
      messages.push(value);
      if (predicate(value)) { clearTimeout(timer); socket.off('message', listener); resolve(value); }
    };
    socket.on('message', listener);
  });
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('WebSocket rooms', () => {
  it('creates a room and broadcasts joined players to both clients; rejects a missing room usefully', async () => {
    const url = await openApp();
    const first = connect(url); const second = connect(url);
    try {
      await waitFor(first.socket, value => (value as any).type === 'welcome', first.messages);
      await waitFor(second.socket, value => (value as any).type === 'welcome', second.messages);
      first.socket.send(JSON.stringify({ type: 'createRoom' }));
      const created: any = await waitFor(first.socket, value => (value as any).type === 'roomCreated', first.messages);
      expect(created.ownerCredential).toBeTruthy();
      second.socket.send(JSON.stringify({ type: 'joinRoom', roomId: created.roomId, name: 'Ada' }));
      await waitFor(second.socket, value => (value as any).type === 'joined', second.messages);
      second.socket.send(JSON.stringify({ type: 'joinRoom', roomId: created.roomId, name: 'Other identity' }));
      expect(await waitFor(second.socket, value => (value as any).code === 'already_in_room', second.messages)).toMatchObject({ type: 'error' });
      const state: any = await waitFor(first.socket, value => (value as any).type === 'roomState', first.messages);
      expect(state.room.participants).toMatchObject([{ name: 'Ada', connected: true }]);
      second.socket.send(JSON.stringify({ type: 'joinRoom', roomId: 'unknown-room', name: 'Bo' }));
      expect(await waitFor(second.socket, value => (value as any).type === 'error', second.messages)).toMatchObject({ code: 'already_in_room' });
    } finally { first.socket.close(); second.socket.close(); }
  });

  it('recovers the organizer securely, starts only as owner, rejects late joins, and permits member reconnect', async () => {
    const url = await openApp();
    const owner = connect(url); const ada = connect(url); const bo = connect(url);
    try {
      await Promise.all([owner, ada, bo].map(client => waitFor(client.socket, value => (value as any).type === 'welcome', client.messages)));
      owner.socket.send(JSON.stringify({ type: 'createRoom' }));
      const created: any = await waitFor(owner.socket, value => (value as any).type === 'roomCreated', owner.messages);
      for (const [client, name] of [[ada, 'Ada'], [bo, 'Bo']] as const) client.socket.send(JSON.stringify({ type: 'joinRoom', roomId: created.roomId, name }));
      const joined = await Promise.all([ada, bo].map(client => waitFor(client.socket, value => (value as any).type === 'joined', client.messages)));
      ada.socket.send(JSON.stringify({ type: 'startGame' }));
      expect(await waitFor(ada.socket, value => (value as any).code === 'forbidden', ada.messages)).toMatchObject({ type: 'error' });
      owner.socket.close();
      const recovered = connect(url);
      await waitFor(recovered.socket, value => (value as any).type === 'welcome', recovered.messages);
      recovered.socket.send(JSON.stringify({ type: 'resumeOwner', roomId: created.roomId, ownerCredential: created.ownerCredential }));
      expect(await waitFor(recovered.socket, value => (value as any).type === 'ownerResumed', recovered.messages)).toMatchObject({ room: { stage: 'waiting' } });
      recovered.socket.send(JSON.stringify({ type: 'startGame' }));
      expect(await waitFor(bo.socket, value => (value as any).type === 'roomState' && (value as any).room.stage === 'camino', bo.messages)).toBeTruthy();
      const late = connect(url); await waitFor(late.socket, value => (value as any).type === 'welcome', late.messages);
      late.socket.send(JSON.stringify({ type: 'joinRoom', roomId: created.roomId, name: 'Late' }));
      expect(await waitFor(late.socket, value => (value as any).code === 'game_started', late.messages)).toMatchObject({ type: 'error' });
      ada.socket.close();
      await waitFor(bo.socket, value => (value as any).type === 'roomState' && (value as any).room.participants.some((player: any) => player.name === 'Ada' && !player.connected), bo.messages);
      const returning = connect(url); await waitFor(returning.socket, value => (value as any).type === 'welcome', returning.messages);
      returning.socket.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, reconnectCredential: (joined[0] as any).reconnectCredential }));
      expect(await waitFor(returning.socket, value => (value as any).type === 'reconnected', returning.messages)).toMatchObject({ room: { stage: 'camino' } });
      recovered.socket.close(); late.socket.close(); returning.socket.close();
    } finally { owner.socket.close(); ada.socket.close(); bo.socket.close(); }
  });

  it('runs two independent accelerated Camino rounds over live sockets', async () => {
    const app = createApp(new Set(['https://allowed.example']), { room: { camino: { flightMs: 5, schedule: index => Array.from({ length: 8 }, (_, bird) => index === 0 ? 0 : bird * 15) } } });
    apps.push(app); await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address(); if (!address || typeof address === 'string') throw new Error('No TCP listener');
    const url = `ws://127.0.0.1:${address.port}/ws`;
    const owner = connect(url), ada = connect(url), bo = connect(url);
    try {
      await Promise.all([owner, ada, bo].map(client => waitFor(client.socket, value => value.type === 'welcome', client.messages)));
      owner.socket.send(JSON.stringify({ type: 'createRoom' }));
      const room: any = await waitFor(owner.socket, value => value.type === 'roomCreated', owner.messages);
      ada.socket.send(JSON.stringify({ type: 'joinRoom', roomId: room.roomId, name: 'Ada' }));
      bo.socket.send(JSON.stringify({ type: 'joinRoom', roomId: room.roomId, name: 'Bo' }));
      await Promise.all([ada, bo].map(client => waitFor(client.socket, value => value.type === 'joined', client.messages)));
      owner.socket.send(JSON.stringify({ type: 'startGame' }));
      const aDone = await waitFor(ada.socket, value => value.type === 'caminoProgress' && value.camino.complete, ada.messages);
      expect(aDone.camino).toMatchObject({ seeds: 2, resolved: 8, complete: true });
      expect(bo.messages.some(value => value.type === 'caminoProgress' && value.camino.complete)).toBe(false);
      const bDone = await waitFor(bo.socket, value => value.type === 'caminoProgress' && value.camino.complete, bo.messages);
      expect(bDone.camino).toMatchObject({ seeds: 2, resolved: 8, complete: true });
      expect(ada.messages.some(value => value.type === 'caminoSnapshot' && value.camino.seeds === 10)).toBe(true);
    } finally { owner.socket.close(); ada.socket.close(); bo.socket.close(); }
  });

  it('retains origin enforcement and closes unsupported messages with 1008', async () => {
    const url = await openApp();
    const denied = new WebSocket(url, { origin: 'https://evil.example' });
    await new Promise<void>(resolve => denied.once('unexpected-response', (_request, response) => { expect(response.statusCode).toBe(403); resolve(); }));
    const client = connect(url);
    await waitFor(client.socket, value => (value as any).type === 'welcome', client.messages);
    client.socket.send(JSON.stringify({ type: 'unsupported' }));
    await new Promise<void>(resolve => client.socket.once('close', (code, reason) => { expect(code).toBe(1008); expect(reason.toString()).toMatch(/unsupported/i); resolve(); }));
  });
});
