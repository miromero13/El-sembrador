export interface WelcomeMessage { type: 'welcome'; protocolVersion: 1; message: string }
export interface Participant { participantId: string; name: string; connected: boolean }
export interface Room { roomId: string; participants: Participant[]; stage: 'waiting' | 'camino' | 'podium' }
export interface PodiumEntry { participantId: string; name: string; score: number; seeds: number; answeredQuestions: number; place: number; eliminated: boolean }
export interface Point { x: number; y: number }
export interface Seed { seedId: number; position: Point }
export interface Bird { birdId: string; index: number; from: Point; targetSeed: number; target: Point; startedAt: number; arrivesAt: number }
export interface CaminoState { serverNow: number; seeds: number; seedPositions: Seed[]; resolved: number; complete: boolean; birds: Bird[] }
export interface PedregalState { serverNow: number; previewEndsAt: number; preview: boolean; cells: { cellId: number; hasSeed: boolean }[]; revealed: { cellId: number; hasSeed: boolean }[]; attempts: number; remainingAttempts: number; recovered: number; lives: number; complete: boolean }
export interface EspinosState { serverNow: number; seeds: number; status: 'playing' | 'complete' | 'eliminated'; position: Point; collided: boolean; progress: number }
export interface TriviaQuestion { id: number; pregunta: string; opciones: [string, string, string]; index: 0 | 1 }
export interface TriviaState { questions: [TriviaQuestion, TriviaQuestion]; answers: Array<'A' | 'B' | 'C' | null>; correct: number; complete: boolean }
export type ServerMessage = WelcomeMessage
  | { type: 'roomCreated'; roomId: string; ownerCredential: string; invitePath: string; participants: Participant[]; stage: 'waiting' }
  | { type: 'ownerResumed'; roomId: string; room: Room; invitePath: string }
  | { type: 'joined'; roomId: string; participantId: string; reconnectCredential: string }
  | { type: 'reconnected'; roomId: string; participantId: string; room: Room }
  | { type: 'roomState'; room: Room }
  | { type: 'caminoSnapshot' | 'caminoProgress'; camino: CaminoState }
  | { type: 'pedregalSnapshot' | 'pedregalProgress'; pedregal: PedregalState }
  | { type: 'espinosSnapshot' | 'espinosProgress'; espinos: EspinosState }
  | { type: 'triviaSnapshot' | 'triviaProgress'; trivia: TriviaState }
  | { type: 'podium'; podium: PodiumEntry[] }
  | { type: 'roundReset' }
  | { type: 'error'; code: string; message: string }; 

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => key in value);
const isPoint = (value: unknown): value is Point => isRecord(value) && hasKeys(value, ['x', 'y']) && typeof value.x === 'number' && Number.isFinite(value.x) && value.x >= 0 && value.x <= 1 && typeof value.y === 'number' && Number.isFinite(value.y) && value.y >= 0 && value.y <= 1;
const isParticipant = (value: unknown): value is Participant => isRecord(value) && hasKeys(value, ['participantId', 'name', 'connected']) && typeof value.participantId === 'string' && value.participantId.length > 0 && typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 40 && !/[\u0000-\u001f\u007f]/.test(value.name) && typeof value.connected === 'boolean';
const isPodiumEntry = (value: unknown): value is PodiumEntry => isRecord(value) && hasKeys(value, ['participantId', 'name', 'score', 'seeds', 'answeredQuestions', 'place', 'eliminated']) && typeof value.participantId === 'string' && typeof value.name === 'string' && Number.isInteger(value.score) && (value.score as number) >= 0 && Number.isInteger(value.seeds) && (value.seeds as number) >= 0 && (value.seeds as number) <= 10 && Number.isInteger(value.answeredQuestions) && (value.answeredQuestions as number) >= 0 && (value.answeredQuestions as number) <= 2 && Number.isInteger(value.place) && (value.place as number) >= 1 && typeof value.eliminated === 'boolean';
const isPodium = (value: unknown): value is { type: 'podium'; podium: PodiumEntry[] } => {
  if (!isRecord(value) || value.type !== 'podium' || !hasKeys(value, ['type', 'podium']) || !Array.isArray(value.podium) || value.podium.length < 2 || value.podium.length > 6) return false;
  const entries: unknown[] = value.podium;
  return entries.every(isPodiumEntry) && entries.every((entry, index) => index === 0 || entry.score <= (entries[index - 1] as PodiumEntry).score);
};
const isRoom = (value: unknown): value is Room => isRecord(value) && hasKeys(value, ['roomId', 'participants', 'stage']) && typeof value.roomId === 'string' && (value.stage === 'waiting' || value.stage === 'camino' || value.stage === 'podium') && Array.isArray(value.participants) && value.participants.length <= 6 && new Set(value.participants.map(p => isRecord(p) ? p.participantId : null)).size === value.participants.length && value.participants.every(isParticipant);
const isCamino = (value: unknown): value is CaminoState => {
  if (!isRecord(value) || !hasKeys(value, ['serverNow', 'seeds', 'seedPositions', 'resolved', 'complete', 'birds']) || !Number.isFinite(value.serverNow) || !Number.isInteger(value.seeds) || (value.seeds as number) < 0 || (value.seeds as number) > 10 || !Number.isInteger(value.resolved) || (value.resolved as number) < 0 || (value.resolved as number) > 8 || typeof value.complete !== 'boolean' || value.complete !== (value.resolved === 8) || !Array.isArray(value.seedPositions) || value.seedPositions.length !== value.seeds || !Array.isArray(value.birds) || value.birds.length > 8) return false;
  const seedIds = value.seedPositions.map(seed => isRecord(seed) ? seed.seedId : NaN);
  if (!value.seedPositions.every(seed => isRecord(seed) && hasKeys(seed, ['seedId', 'position']) && Number.isInteger(seed.seedId) && (seed.seedId as number) >= 0 && (seed.seedId as number) < 10 && isPoint(seed.position)) || new Set(seedIds).size !== seedIds.length) return false;
  const ids = value.birds.map(bird => isRecord(bird) ? bird.birdId : null);
  return new Set(ids).size === ids.length && value.birds.every(bird => isRecord(bird) && hasKeys(bird, ['birdId', 'index', 'from', 'targetSeed', 'target', 'startedAt', 'arrivesAt']) && typeof bird.birdId === 'string' && bird.birdId.length > 0 && Number.isInteger(bird.index) && (bird.index as number) >= 0 && (bird.index as number) < 8 && Number.isInteger(bird.targetSeed) && (bird.targetSeed as number) >= 0 && (bird.targetSeed as number) < 10 && isPoint(bird.from) && isPoint(bird.target) && Number.isFinite(bird.startedAt) && Number.isFinite(bird.arrivesAt) && (bird.arrivesAt as number) > (bird.startedAt as number));
};
export function isWelcomeMessage(value: unknown): value is WelcomeMessage { return isRecord(value) && value.type === 'welcome' && value.protocolVersion === 1 && value.message === 'Connected to El Sembrador'; }
const isPedregal = (value: unknown): value is PedregalState => isRecord(value) && hasKeys(value, ['serverNow', 'previewEndsAt', 'preview', 'cells', 'revealed', 'attempts', 'remainingAttempts', 'recovered', 'lives', 'complete']) && Number.isFinite(value.serverNow) && Number.isFinite(value.previewEndsAt) && typeof value.preview === 'boolean' && Array.isArray(value.cells) && value.cells.length === 25 && value.cells.every((cell, index) => isRecord(cell) && hasKeys(cell, ['cellId', 'hasSeed']) && cell.cellId === index && typeof cell.hasSeed === 'boolean') && Array.isArray(value.revealed) && value.revealed.every(cell => isRecord(cell) && hasKeys(cell, ['cellId', 'hasSeed']) && Number.isInteger(cell.cellId) && (cell.cellId as number) >= 0 && (cell.cellId as number) < 25 && typeof cell.hasSeed === 'boolean') && Number.isInteger(value.attempts) && (value.attempts as number) >= 0 && (value.attempts as number) <= 10 && Number.isInteger(value.remainingAttempts) && (value.remainingAttempts as number) >= 0 && (value.remainingAttempts as number) <= (value.attempts as number) && Number.isInteger(value.recovered) && (value.recovered as number) >= 0 && value.recovered === value.lives && typeof value.complete === 'boolean';
export function parseServerMessage(value: unknown): ServerMessage | undefined {
  if (!isRecord(value)) return;
  if (isWelcomeMessage(value)) return value;
  if (value.type === 'roomCreated' && hasKeys(value, ['type', 'roomId', 'ownerCredential', 'invitePath', 'participants', 'stage']) && typeof value.roomId === 'string' && typeof value.ownerCredential === 'string' && value.ownerCredential.length > 0 && value.invitePath === `/?room=${encodeURIComponent(value.roomId)}` && value.stage === 'waiting' && Array.isArray(value.participants) && value.participants.length === 0) return value as ServerMessage;
  if (value.type === 'ownerResumed' && hasKeys(value, ['type', 'roomId', 'room', 'invitePath']) && typeof value.roomId === 'string' && isRoom(value.room) && value.invitePath === `/?room=${encodeURIComponent(value.roomId)}`) return value as ServerMessage;
  if (value.type === 'joined' && hasKeys(value, ['type', 'roomId', 'participantId', 'reconnectCredential']) && typeof value.roomId === 'string' && typeof value.participantId === 'string' && typeof value.reconnectCredential === 'string' && value.reconnectCredential.length > 0) return value as ServerMessage;
  if (value.type === 'reconnected' && hasKeys(value, ['type', 'roomId', 'participantId', 'room']) && typeof value.roomId === 'string' && isRoom(value.room)) return value as ServerMessage;
  if (value.type === 'roomState' && hasKeys(value, ['type', 'room']) && isRoom(value.room)) return value as ServerMessage;
  if (value.type === 'roundReset' && hasKeys(value, ['type'])) return value as ServerMessage;
  if (isPodium(value)) return value;
  if ((value.type === 'caminoSnapshot' || value.type === 'caminoProgress') && hasKeys(value, ['type', 'camino']) && isCamino(value.camino)) return value as ServerMessage;
  if ((value.type === 'pedregalSnapshot' || value.type === 'pedregalProgress') && hasKeys(value, ['type', 'pedregal']) && isPedregal(value.pedregal)) return value as ServerMessage;
  if ((value.type === 'espinosSnapshot' || value.type === 'espinosProgress') && hasKeys(value, ['type', 'espinos']) && isRecord(value.espinos) && hasKeys(value.espinos, ['serverNow', 'seeds', 'status', 'position', 'collided', 'progress']) && Number.isFinite(value.espinos.serverNow) && Number.isInteger(value.espinos.seeds) && (value.espinos.seeds as number) >= 0 && (value.espinos.seeds as number) <= 10 && ['playing', 'complete', 'eliminated'].includes(String(value.espinos.status)) && isPoint(value.espinos.position) && typeof value.espinos.collided === 'boolean' && Number.isFinite(value.espinos.progress)) return value as ServerMessage;
  if ((value.type === 'triviaSnapshot' || value.type === 'triviaProgress') && hasKeys(value, ['type', 'trivia']) && isRecord(value.trivia) && hasKeys(value.trivia, ['questions', 'answers', 'correct', 'complete']) && Array.isArray(value.trivia.questions) && value.trivia.questions.length === 2 && value.trivia.questions.every((question, index) => isRecord(question) && hasKeys(question, ['id', 'pregunta', 'opciones', 'index']) && Number.isInteger(question.id) && typeof question.pregunta === 'string' && Array.isArray(question.opciones) && question.opciones.length === 3 && question.opciones.every(option => typeof option === 'string') && question.index === index) && Array.isArray(value.trivia.answers) && value.trivia.answers.length === 2 && value.trivia.answers.every(answer => answer === null || answer === 'A' || answer === 'B' || answer === 'C') && Number.isInteger(value.trivia.correct) && (value.trivia.correct as number) >= 0 && (value.trivia.correct as number) <= 2 && typeof value.trivia.complete === 'boolean' && value.trivia.complete === value.trivia.answers.every(answer => answer !== null)) return value as ServerMessage;
  if (value.type === 'error' && hasKeys(value, ['type', 'code', 'message']) && typeof value.code === 'string' && typeof value.message === 'string') return value as ServerMessage;
}
export function inviteUrl(roomId: string, origin = window.location.origin): string { return new URL(`/?room=${encodeURIComponent(roomId)}`, origin).toString(); }
export function roomIdFromLocation(search: string): string | null { const params = new URLSearchParams(search); return params.getAll('room').length === 1 && params.get('room')?.trim() ? params.get('room')!.trim() : null; }
