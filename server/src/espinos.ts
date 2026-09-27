export type EspinosPoint = { x: number; y: number };
export type EspinosSnapshot = { serverNow: number; seeds: number; status: 'playing' | 'complete' | 'eliminated'; position: EspinosPoint; collided: boolean; progress: number };

// A short serpentine centerline; coordinates are normalized to the maze field.
export const ESPINOS_PATH: EspinosPoint[] = [
  { x: 0.10, y: 0.84 }, { x: 0.10, y: 0.64 }, { x: 0.34, y: 0.64 },
  { x: 0.34, y: 0.40 }, { x: 0.66, y: 0.40 }, { x: 0.66, y: 0.64 },
  { x: 0.90, y: 0.64 }, { x: 0.90, y: 0.20 },
];
export const CORRIDOR_RADIUS = 0.075;
const GOAL_RADIUS = 0.09;
const distance = (a: EspinosPoint, b: EspinosPoint) => Math.hypot(a.x - b.x, a.y - b.y);
function project(point: EspinosPoint, a: EspinosPoint, b: EspinosPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return { point: { x: a.x + t * dx, y: a.y + t * dy }, t };
}

function distanceFromPath(point: EspinosPoint): number {
  let closest = Infinity;
  for (let i = 0; i < ESPINOS_PATH.length - 1; i++) {
    const candidate = project(point, ESPINOS_PATH[i], ESPINOS_PATH[i + 1]);
    closest = Math.min(closest, distance(point, candidate.point));
  }
  return closest;
}

function segmentStaysInCorridor(from: EspinosPoint, to: EspinosPoint): boolean {
  const length = distance(from, to);
  const steps = Math.max(1, Math.ceil(length / (CORRIDOR_RADIUS / 2)));
  for (let step = 1; step <= steps; step++) {
    const fraction = step / steps;
    const point = { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
    if (distanceFromPath(point) > CORRIDOR_RADIUS) return false;
  }
  return true;
}

export class Espinos {
  private position = ESPINOS_PATH[0];
  private seeds: number;
  private collided = false;
  private status: EspinosSnapshot['status'] = 'playing';
  private progress = 0;
  constructor(readonly participantId: string, seeds: number, private readonly now: () => number = Date.now) {
    if (!Number.isInteger(seeds) || seeds < 0 || seeds > 10) throw new Error('Espinos requires 0 to 10 recovered Pedregal seeds');
    this.seeds = seeds;
    if (seeds === 0) this.status = 'eliminated';
  }
  snapshot(): EspinosSnapshot { return { serverNow: this.now(), seeds: this.seeds, status: this.status, position: { ...this.position }, collided: this.collided, progress: this.progress }; }
  move(point: EspinosPoint): { accepted: boolean; snapshot: EspinosSnapshot } {
    if (this.status !== 'playing' || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return { accepted: false, snapshot: this.snapshot() };
    let closest = Infinity, along = 0, total = 0;
    for (let i = 0; i < ESPINOS_PATH.length - 1; i++) {
      const a = ESPINOS_PATH[i], b = ESPINOS_PATH[i + 1];
      const length = distance(a, b), candidate = project(point, a, b), gap = distance(point, candidate.point);
      if (gap < closest) { closest = gap; along = total + candidate.t * length; }
      total += length;
    }
    // Validate the entire drag segment, not only its endpoint: repeated submissions at a distant
    // corridor point must not accumulate progress while the authoritative token stays behind.
    if (closest > CORRIDOR_RADIUS || !segmentStaysInCorridor(this.position, point)) {
      if (!this.collided) this.seeds--;
      this.collided = true;
      if (this.seeds === 0) this.status = 'eliminated';
      return { accepted: true, snapshot: this.snapshot() };
    }
    this.collided = false;
    this.progress = Math.max(this.progress, along);
    this.position = { ...point };
    const goal = ESPINOS_PATH[ESPINOS_PATH.length - 1];
    if (distance(point, goal) <= GOAL_RADIUS && this.progress >= total - 0.13) this.status = this.seeds > 0 ? 'complete' : 'eliminated';
    return { accepted: true, snapshot: this.snapshot() };
  }
}
