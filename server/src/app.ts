import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { isAllowedOrigin, parseClientMessage, welcomeMessage } from './protocol.js';
import { RoomError, RoomManager } from './rooms.js';

export function createApp(allowedOrigins = new Set(['http://localhost:5173']), options: { room?: ConstructorParameters<typeof RoomManager>[0] } = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const rooms = new RoomManager(options.room);
  app.addHook('onClose', async () => rooms.dispose());
  app.get('/health', async () => ({ status: 'ok' }));
  app.register(async instance => {
    await instance.register(websocket);
    instance.get('/ws', {
      websocket: true,
      preValidation: async (request, reply) => {
        if (!isAllowedOrigin(request.headers.origin, allowedOrigins)) return reply.code(403).send({ error: 'Origin not allowed' });
      },
    }, socket => {
      let participantId: string | undefined;
      let roomId: string | undefined;
      let isOwner = false;
      socket.send(JSON.stringify(welcomeMessage));
      socket.on('message', raw => {
        const message = parseClientMessage(raw.toString());
        if (!message) { socket.close(1008, 'Invalid or unsupported message'); return; }
        try {
          if (message.type === 'touchBird') {
            if (!participantId) throw new RoomError('forbidden', 'Only a player can touch a bird.');
            if (!rooms.touch(participantId, message.birdId, { x: message.x, y: message.y })) throw new RoomError('invalid_touch', 'Bird is not at the reported position or is no longer active.');
            return;
          }
          if (message.type === 'pickPedregal') {
            if (!participantId) throw new RoomError('forbidden', 'Only a player can pick a Pedregal cell.');
            if (!rooms.pickPedregal(participantId, message.cellId)) return;
            return;
          }
          if (message.type === 'moveEspinos') {
            if (!participantId) throw new RoomError('forbidden', 'Only a player can move through Los Espinos.');
            if (!rooms.moveEspinos(participantId, { x: message.x, y: message.y })) throw new RoomError('invalid_move', 'No active Los Espinos run.');
            return;
          }
          if (message.type === 'answerTrivia') {
            if (!participantId) throw new RoomError('forbidden', 'Only a player can answer La Buena Tierra.');
            if (!rooms.answerTrivia(participantId, message.index, message.answer)) throw new RoomError('invalid_answer', 'This question has already been answered or is not active.');
            return;
          }
          if (message.type === 'startGame') {
            if (!isOwner) throw new RoomError('forbidden', 'Only the organizer can start the game.');
            rooms.start(roomId!);
            return;
          }
          if (message.type === 'finalizeGame') {
            if (!isOwner) throw new RoomError('forbidden', 'Only the organizer can finalize the game.');
            rooms.finalize(roomId!);
            return;
          }
          if (roomId) throw new RoomError('already_in_room', 'This connection already belongs to a room.');
          if (message.type === 'createRoom') {
            const created = rooms.create();
            roomId = created.roomId;
            isOwner = true;
            rooms.observe(roomId, socket);
            socket.send(JSON.stringify({ type: 'roomCreated', ...created, invitePath: `/?room=${encodeURIComponent(created.roomId)}`, participants: [], stage: 'waiting' }));
          } else if (message.type === 'joinRoom') {
            const joined = rooms.join(message.roomId, message.name);
            participantId = joined.participantId; roomId = message.roomId;
            rooms.bindSocket(roomId, participantId, socket as unknown as WebSocket);
            socket.send(JSON.stringify({ type: 'joined', roomId, participantId, reconnectCredential: joined.reconnectCredential }));
          } else if (message.type === 'resumeOwner') {
            const state = rooms.resumeOwner(message.roomId, message.ownerCredential, socket);
            roomId = message.roomId; isOwner = true;
            socket.send(JSON.stringify({ type: 'ownerResumed', roomId, room: state, invitePath: `/?room=${encodeURIComponent(roomId)}` }));
            const podium = rooms.podium(roomId);
            if (podium) socket.send(JSON.stringify({ type: 'podium', podium }));
          } else if (message.type === 'reconnect') {
            const id = rooms.participantIdForCredential(message.roomId, message.reconnectCredential);
            const state = rooms.reconnect(message.roomId, message.reconnectCredential);
            participantId = id; roomId = message.roomId;
            rooms.bindSocket(roomId, participantId, socket as unknown as WebSocket);
            socket.send(JSON.stringify({ type: 'reconnected', roomId, participantId, room: state }));
          }
        } catch (error) {
          const roomError = error instanceof RoomError ? error : new RoomError('internal_error', 'Unable to process request.');
          socket.send(JSON.stringify({ type: 'error', code: roomError.code, message: roomError.message }));
        }
      });
      socket.on('close', () => {
        rooms.unobserve(socket);
        if (participantId) rooms.disconnect(participantId);
      });
    });
  });
  return app;
}
