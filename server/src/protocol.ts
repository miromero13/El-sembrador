export const welcomeMessage = {
  type: 'welcome',
  protocolVersion: 1,
  message: 'Connected to El Sembrador',
} as const;

export type ClientMessage =
  | { type: 'createRoom' }
  | { type: 'joinRoom'; roomId: string; name: string }
  | { type: 'reconnect'; roomId: string; reconnectCredential: string }
  | { type: 'resumeOwner'; roomId: string; ownerCredential: string }
  | { type: 'startGame' }
  | { type: 'finalizeGame' }
  | { type: 'touchBird'; birdId: string; x: number; y: number }
  | { type: 'pickPedregal'; cellId: number }
  | { type: 'moveEspinos'; x: number; y: number }
  | { type: 'answerTrivia'; index: number; answer: 'A' | 'B' | 'C' };

export function parseClientMessage(raw: string): ClientMessage | undefined {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return undefined; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (item.type === 'createRoom' && Object.keys(item).length === 1) return { type: 'createRoom' };
  if (item.type === 'joinRoom' && Object.keys(item).length === 3 && typeof item.roomId === 'string' && typeof item.name === 'string' && item.roomId.length <= 128 && item.name.length <= 200) return { type: 'joinRoom', roomId: item.roomId, name: item.name };
  if (item.type === 'reconnect' && Object.keys(item).length === 3 && typeof item.roomId === 'string' && typeof item.reconnectCredential === 'string' && item.roomId.length <= 128 && item.reconnectCredential.length <= 128) return { type: 'reconnect', roomId: item.roomId, reconnectCredential: item.reconnectCredential };
  if (item.type === 'resumeOwner' && Object.keys(item).length === 3 && typeof item.roomId === 'string' && typeof item.ownerCredential === 'string' && item.roomId.length <= 128 && item.ownerCredential.length <= 128) return { type: 'resumeOwner', roomId: item.roomId, ownerCredential: item.ownerCredential };
  if (item.type === 'startGame' && Object.keys(item).length === 1) return { type: 'startGame' };
  if (item.type === 'finalizeGame' && Object.keys(item).length === 1) return { type: 'finalizeGame' };
  if (item.type === 'touchBird' && Object.keys(item).length === 4 && typeof item.birdId === 'string' && item.birdId.length <= 128 && typeof item.x === 'number' && Number.isFinite(item.x) && item.x >= 0 && item.x <= 1 && typeof item.y === 'number' && Number.isFinite(item.y) && item.y >= 0 && item.y <= 1) return { type: 'touchBird', birdId: item.birdId, x: item.x, y: item.y };
  if (item.type === 'pickPedregal' && Object.keys(item).length === 2 && Number.isInteger(item.cellId) && (item.cellId as number) >= 0 && (item.cellId as number) < 25) return { type: 'pickPedregal', cellId: item.cellId as number };
  if (item.type === 'moveEspinos' && Object.keys(item).length === 3 && typeof item.x === 'number' && Number.isFinite(item.x) && item.x >= 0 && item.x <= 1 && typeof item.y === 'number' && Number.isFinite(item.y) && item.y >= 0 && item.y <= 1) return { type: 'moveEspinos', x: item.x, y: item.y };
  if (item.type === 'answerTrivia' && Object.keys(item).length === 3 && (item.index === 0 || item.index === 1) && (item.answer === 'A' || item.answer === 'B' || item.answer === 'C')) return { type: 'answerTrivia', index: item.index, answer: item.answer };
  return undefined;
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: Set<string>): boolean {
  return origin !== undefined && allowedOrigins.has(origin);
}
