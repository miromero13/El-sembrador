import { describe, expect, it } from 'vitest';
import { Pedregal } from '../src/pedregal.js';

describe('authoritative Pedregal memory', () => {
  it('creates a 5x5 preview for exactly three seconds, then conceals every seed', () => {
    let now = 10_000;
    const game = new Pedregal('player', 4, { now: () => now, random: () => 0 });
    const preview = game.snapshot();
    expect(preview.cells).toHaveLength(25);
    expect(preview.cells.filter(cell => cell.hasSeed)).toHaveLength(4);
    expect(preview.previewEndsAt).toBe(13_000);
    now = 12_999;
    expect(game.snapshot().preview).toBe(true);
    now = 13_000;
    expect(game.snapshot()).toMatchObject({ preview: false, cells: Array.from({ length: 25 }, (_, cellId) => ({ cellId, hasSeed: false })) });
  });

  it('awards one life for a unique seed, consumes an attempt on a miss, and ignores duplicates', () => {
    let now = 0;
    const game = new Pedregal('player', 2, { now: () => now, random: () => 0 });
    const seeds = game.snapshot().cells.filter(cell => cell.hasSeed).map(cell => cell.cellId);
    now = 3_000;
    const hit = game.pick(seeds[0]);
    expect(hit).toMatchObject({ accepted: true, snapshot: { recovered: 1, lives: 1, remainingAttempts: 1 } });
    expect(game.pick(seeds[0])).toMatchObject({ accepted: false, snapshot: { recovered: 1, remainingAttempts: 1 } });
    const miss = game.pick(Array.from({ length: 25 }, (_, cellId) => cellId).find(cellId => !seeds.includes(cellId))!);
    expect(miss).toMatchObject({ accepted: true, snapshot: { recovered: 1, lives: 1, remainingAttempts: 0, complete: true } });
    expect(game.pick(seeds[1]).accepted).toBe(false);
  });

  it('finishes early when all saved seeds are recovered and handles zero saved seeds', () => {
    let now = 0;
    const game = new Pedregal('player', 1, { now: () => now, random: () => 0 });
    const seed = game.snapshot().cells.find(cell => cell.hasSeed)!.cellId;
    now = 3_000;
    expect(game.pick(seed).snapshot).toMatchObject({ complete: true, recovered: 1, remainingAttempts: 0 });
    const empty = new Pedregal('empty', 0, { now: () => now });
    expect(empty.snapshot()).toMatchObject({ attempts: 0, complete: true, lives: 0 });
  });

  it('keeps each participant board isolated', () => {
    const a = new Pedregal('a', 2, { random: () => 0 });
    const b = new Pedregal('b', 5, { random: () => 0 });
    expect(a.snapshot().cells.filter(cell => cell.hasSeed)).toHaveLength(2);
    expect(b.snapshot().cells.filter(cell => cell.hasSeed)).toHaveLength(5);
  });
});
