export type PedregalCell = { cellId: number; hasSeed: boolean };
export type PedregalSnapshot = {
  serverNow: number;
  previewEndsAt: number;
  preview: boolean;
  cells: PedregalCell[];
  revealed: Array<{ cellId: number; hasSeed: boolean }>;
  attempts: number;
  remainingAttempts: number;
  recovered: number;
  lives: number;
  complete: boolean;
};
type Options = { now?: () => number; random?: () => number; previewMs?: number };

export class Pedregal {
  readonly previewEndsAt: number;
  private readonly now: () => number;
  private readonly seedCells: Set<number>;
  private readonly revealed = new Map<number, boolean>();
  private remainingAttempts: number;
  private recovered = 0;

  constructor(readonly participantId: string, readonly attempts: number, options: Options = {}) {
    if (!Number.isInteger(attempts) || attempts < 0 || attempts > 10) throw new Error('Pedregal requires 0 to 10 saved Camino seeds');
    this.now = options.now ?? Date.now;
    this.previewEndsAt = this.now() + (options.previewMs ?? 3_000);
    this.remainingAttempts = attempts;
    const cells = Array.from({ length: 25 }, (_, index) => index);
    const random = options.random ?? Math.random;
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    this.seedCells = new Set(cells.slice(0, attempts));
  }

  snapshot(): PedregalSnapshot {
    const now = this.now();
    const preview = now < this.previewEndsAt;
    return {
      serverNow: now,
      previewEndsAt: this.previewEndsAt,
      preview,
      cells: Array.from({ length: 25 }, (_, cellId) => ({ cellId, hasSeed: preview && this.seedCells.has(cellId) })),
      revealed: [...this.revealed].map(([cellId, hasSeed]) => ({ cellId, hasSeed })),
      attempts: this.attempts,
      remainingAttempts: this.remainingAttempts,
      recovered: this.recovered,
      lives: this.recovered,
      complete: this.remainingAttempts === 0 || this.recovered === this.attempts,
    };
  }

  pick(cellId: number): { accepted: boolean; snapshot: PedregalSnapshot } {
    if (!Number.isInteger(cellId) || cellId < 0 || cellId >= 25 || this.now() < this.previewEndsAt || this.snapshot().complete || this.revealed.has(cellId)) return { accepted: false, snapshot: this.snapshot() };
    const hasSeed = this.seedCells.has(cellId);
    this.revealed.set(cellId, hasSeed);
    this.remainingAttempts--;
    if (hasSeed) this.recovered++;
    return { accepted: true, snapshot: this.snapshot() };
  }
}
