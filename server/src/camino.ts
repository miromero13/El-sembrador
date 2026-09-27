export type Point = { x: number; y: number };
export type Bird = { birdId: string; index: number; from: Point; targetSeed: number; target: Point; startedAt: number; arrivesAt: number };
export type Seed = { seedId: number; position: Point };
export type CaminoSnapshot = { serverNow: number; seeds: number; seedPositions: Seed[]; resolved: number; complete: boolean; birds: Bird[] };
type PlayerRun = { presentSeeds: boolean[]; targets: number[]; resolved: number; complete: boolean; birds: Map<string, Bird>; handles: unknown[] };
export type CaminoOptions = {
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  schedule?: (playerIndex: number) => number[];
  random?: () => number;
  flightMs?: number;
  onChange?: (participantId: string, snapshot: CaminoSnapshot) => void;
};

const seedsAt: Point[] = Array.from({ length: 10 }, (_, i) => ({ x: 0.07 + i * (0.86 / 9), y: 0.84 }));
const defaultWaves = [
  { offsetMs: 0, flightMs: 6_000 },
  { offsetMs: 6_000, flightMs: 5_000 },
  { offsetMs: 9_000, flightMs: 4_000 },
  { offsetMs: 12_000, flightMs: 4_000 },
  { offsetMs: 12_000, flightMs: 4_000 },
  { offsetMs: 14_000, flightMs: 4_000 },
  { offsetMs: 14_000, flightMs: 4_000 },
  { offsetMs: 15_000, flightMs: 3_000 },
] as const;
const defaultSchedule = () => defaultWaves.map(wave => wave.offsetMs);

export class Camino {
  private readonly runs = new Map<string, PlayerRun>();
  private readonly now: () => number;
  private readonly setTimer: NonNullable<CaminoOptions['setTimer']>;
  private readonly clearTimer: NonNullable<CaminoOptions['clearTimer']>;
  constructor(private readonly options: CaminoOptions = {}) {
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }
  start(participantIds: string[]): void {
    participantIds.forEach((id, playerIndex) => {
      const targets = Array.from({ length: 10 }, (_, seed) => seed);
      const random = this.options.random ?? Math.random;
      for (let i = targets.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [targets[i], targets[j]] = [targets[j], targets[i]];
      }
      const run: PlayerRun = { presentSeeds: Array(10).fill(true), targets: targets.slice(0, 8), resolved: 0, complete: false, birds: new Map(), handles: [] };
      this.runs.set(id, run);
      const schedule = this.options.schedule?.(playerIndex) ?? defaultSchedule();
      if (schedule.length !== 8 || schedule.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Schedule must contain eight non-negative offsets');
      schedule.forEach((offset, index) => this.timer(run, () => this.spawn(id, index), offset));
    });
  }
  snapshot(id: string): CaminoSnapshot {
    const run = this.runs.get(id);
    if (!run) throw new Error('Camino run not found');
    const now = this.now();
    const seedPositions = run.presentSeeds.flatMap((present, seedId) => present ? [{ seedId, position: { ...seedsAt[seedId] } }] : []);
    return { serverNow: now, seeds: seedPositions.length, seedPositions, resolved: run.resolved, complete: run.complete, birds: [...run.birds.values()].filter(bird => now < bird.arrivesAt).map(bird => ({ ...bird, from: { ...bird.from }, target: { ...bird.target } })) };
  }
  touch(id: string, birdId: string, point: Point): boolean {
    const run = this.runs.get(id);
    const bird = run?.birds.get(birdId);
    if (!run || run.complete || !bird || this.now() >= bird.arrivesAt) return false;
    const position = this.position(bird, this.now());
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.hypot(point.x - position.x, point.y - position.y) > 0.08) return false;
    this.resolve(id, bird, false);
    return true;
  }
  remove(id: string): void {
    const run = this.runs.get(id);
    if (!run) return;
    for (const handle of run.handles) this.clearTimer(handle);
    this.runs.delete(id);
  }
  dispose(): void {
    for (const id of this.runs.keys()) this.remove(id);
  }
  private spawn(id: string, index: number): void {
    const run = this.runs.get(id);
    if (!run || run.complete) return;
    const targetSeed = run.targets[index];
    const random = this.options.random ?? Math.random;
    const coordinate = Math.min(1, Math.max(0, random()));
    const entryFamily = index % 3;
    const from: Point = entryFamily === 0
      ? { x: 0.1 + coordinate * 0.8, y: 0 }
      : { x: entryFamily === 1 ? 0 : 1, y: 0.15 + coordinate * 0.4 };
    const flightMs = this.options.flightMs ?? defaultWaves[index].flightMs;
    const bird: Bird = { birdId: `${id}:${index}`, index, from, targetSeed, target: seedsAt[targetSeed], startedAt: this.now(), arrivesAt: this.now() + flightMs };
    run.birds.set(bird.birdId, bird);
    this.timer(run, () => this.resolve(id, bird, true), flightMs);
    this.changed(id);
  }
  private position(bird: Bird, now: number): Point {
    const ratio = Math.max(0, Math.min(1, (now - bird.startedAt) / (bird.arrivesAt - bird.startedAt)));
    return { x: bird.from.x + (bird.target.x - bird.from.x) * ratio, y: bird.from.y + (bird.target.y - bird.from.y) * ratio };
  }
  private resolve(id: string, bird: Bird, stolen: boolean): void {
    const run = this.runs.get(id);
    if (!run || run.complete || !run.birds.delete(bird.birdId)) return;
    if (stolen) run.presentSeeds[bird.targetSeed] = false;
    run.resolved++;
    if (run.resolved === 8) run.complete = true;
    this.changed(id);
  }
  private timer(run: PlayerRun, cb: () => void, delay: number): void {
    run.handles.push(this.setTimer(cb, delay));
  }
  private changed(id: string): void { this.options.onChange?.(id, this.snapshot(id)); }
}
