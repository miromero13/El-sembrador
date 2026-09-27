import { describe, expect, it } from 'vitest';
import { Camino } from '../src/camino.js';

type Task = { at: number; callback: () => void; cancelled: boolean };
function clock(random = () => 0.5, defaultTiming = false) {
  let time = 0;
  const tasks: Task[] = [];
  const engine = new Camino({ now: () => time, ...(defaultTiming ? {} : { schedule: () => Array.from({ length: 8 }, (_, i) => i * 20) }), random,
    setTimer: (callback, delay) => { const task = { at: time + delay, callback, cancelled: false }; tasks.push(task); return task; },
    clearTimer: handle => { (handle as Task).cancelled = true; } });
  return { engine, tasks, advance(ms: number) { const end = time + ms; while (true) { tasks.sort((a, b) => a.at - b.at); const task = tasks.find(item => !item.cancelled && item.at <= end); if (!task) break; task.cancelled = true; time = task.at; task.callback(); } time = end; }, set time(value: number) { time = value; } };
}

describe('authoritative Camino', () => {
  it('starts with ten seeds and eight birds; scares validate server position and reject duplicates and late touches', () => {
    const c = clock(); c.engine.start(['p']);
    const initial = c.engine.snapshot('p');
    expect(initial).toMatchObject({ serverNow: 0, seeds: 10, seedPositions: Array.from({ length: 10 }, (_, seedId) => ({ seedId })), resolved: 0, complete: false, birds: [] });
    expect(initial.seedPositions.map(seed => seed.position.y)).toEqual(Array(10).fill(0.84));
    expect(initial.seedPositions.map(seed => seed.position.x)).toEqual(Array.from({ length: 10 }, (_, i) => 0.07 + i * (0.86 / 9)));
    c.advance(0);
    const bird = c.engine.snapshot('p').birds[0];
    expect(bird).toBeTruthy();
    expect(c.engine.touch('p', bird.birdId, { x: 0.9, y: 0.9 })).toBe(false);
    expect(c.engine.touch('p', bird.birdId, bird.from)).toBe(true);
    expect(c.engine.touch('p', bird.birdId, bird.from)).toBe(false);
    expect(c.engine.snapshot('p')).toMatchObject({ seeds: 10, resolved: 1 });
    c.advance(3_000);
    expect(c.engine.snapshot('p').serverNow).toBe(3_000);
    expect(c.engine.touch('p', bird.birdId, bird.target)).toBe(false);
  });
  it('runs the exact overlapping schedule independently for both players and completes at 18 seconds', () => {
    const c = clock(() => 0, true);
    c.engine.start(['p', 'q']);
    const offsets = [0, 6_000, 9_000, 12_000, 12_000, 14_000, 14_000, 15_000];
    const durations = [6_000, 5_000, 4_000, 4_000, 4_000, 4_000, 4_000, 3_000];
    expect(c.tasks.slice(0, 16).map(task => task.at)).toEqual([...offsets, ...offsets]);
    for (const player of ['p', 'q']) {
      c.advance(0);
      expect(c.engine.snapshot(player).birds.map(bird => [bird.startedAt, bird.arrivesAt - bird.startedAt])).toEqual([[0, 6_000]]);
    }
    const boundaries = [[6_000, 1], [9_000, 2], [12_000, 3], [14_000, 4], [15_000, 5]] as const;
    for (const [at, active] of boundaries) {
      c.advance(at - c.engine.snapshot('p').serverNow);
      for (const player of ['p', 'q']) {
        const birds = c.engine.snapshot(player).birds;
        expect(birds).toHaveLength(active);
        for (const bird of birds) {
          expect(bird.startedAt).toBe(offsets[bird.index]);
          expect(bird.arrivesAt - bird.startedAt).toBe(durations[bird.index]);
        }
      }
    }
    c.advance(3_000);
    for (const player of ['p', 'q']) expect(c.engine.snapshot(player)).toMatchObject({ serverNow: 18_000, resolved: 8, complete: true, birds: [] });
  });
  it('keeps the next wave on its fixed offset after an early scare', () => {
    const c = clock(() => 0, true);
    c.engine.start(['p']);
    c.advance(0);
    const first = c.engine.snapshot('p').birds[0];
    expect(c.engine.touch('p', first.birdId, first.from)).toBe(true);
    c.advance(5_999);
    expect(c.engine.snapshot('p').birds).toEqual([]);
    c.advance(1);
    expect(c.engine.snapshot('p').birds.map(bird => bird.index)).toEqual([1]);
  });
  it('assigns distinct targets with constant randomness and snapshots exact seed removals after theft and scare', () => {
    const c = clock(() => 0);
    c.engine.start(['p']);
    c.advance(0);
    const first = c.engine.snapshot('p').birds[0];
    expect(c.engine.touch('p', first.birdId, first.from)).toBe(true);
    expect(c.engine.snapshot('p').seedPositions).toHaveLength(10);
    c.advance(140);
    const birds = c.engine.snapshot('p').birds;
    expect(birds).toHaveLength(7);
    expect(new Set([first.targetSeed, ...birds.map(bird => bird.targetSeed)]).size).toBe(8);
    const stolenSeed = birds[1].targetSeed;
    c.advance(5_000);
    expect(c.engine.snapshot('p').seedPositions.map(seed => seed.seedId)).not.toContain(stolenSeed);
    const snapshot = c.engine.snapshot('p');
    snapshot.seedPositions[0].position.x = 99;
    expect(c.engine.snapshot('p').seedPositions[0].position.x).not.toBe(99);
  });
  it('uses fixed default offsets independently of target/entry randomness and timestamps reconnect snapshots', () => {
    let calls = 0;
    const c = clock(() => {
      const call = calls++;
      return call < 9 ? 0.5 : (call - 9) % 2 === 0 ? 0.1 : 0.9;
    }, true);
    c.engine.start(['p']);
    const spawnTimes = c.tasks.slice(0, 8).map(task => task.at);
    expect(spawnTimes).toEqual([0, 6_000, 9_000, 12_000, 12_000, 14_000, 14_000, 15_000]);
    c.time = 12_345;
    expect(c.engine.snapshot('p').serverNow).toBe(12_345);
    expect(c.engine.snapshot('p').serverNow).toBe(12_345);
  });
  it('covers top and both side entrances above soil for every eight-bird run, including random boundaries', () => {
    for (const value of [0, 0.999999, 1]) {
      const c = clock(() => value);
      c.engine.start(['p', 'q']);
      for (let index = 0; index < 8; index++) {
        c.advance(index === 0 ? 0 : 20);
        for (const player of ['p', 'q']) {
        const bird = c.engine.snapshot(player).birds.find(item => item.index === index)!;
        if (index % 3 === 0) {
          expect(bird.from.y).toBe(0);
          expect(bird.from.x).toBeGreaterThanOrEqual(0.1);
          expect(bird.from.x).toBeLessThanOrEqual(0.9);
        } else {
          expect(bird.from.x).toBe(index % 3 === 1 ? 0 : 1);
          expect(bird.from.y).toBeGreaterThanOrEqual(0.15);
          expect(bird.from.y).toBeLessThanOrEqual(0.55);
          expect(bird.from.y).toBeLessThan(0.75);
          expect(bird.from.y).not.toBe(0.84);
        }
        expect(bird.arrivesAt - bird.startedAt).toBe([6_000, 5_000, 4_000, 4_000, 4_000, 4_000, 4_000, 3_000][index]);
        }
      }
      const entrances = c.engine.snapshot('p').birds;
      expect(new Set(entrances.map(bird => bird.index % 3))).toEqual(new Set([0, 1, 2]));
    }
  });
  it('applies an explicit flight duration override to every bird', () => {
    const c = clock();
    const engine = new Camino({ flightMs: 1_234, schedule: () => Array.from({ length: 8 }, (_, i) => i * 20), now: () => 0,
      setTimer: (callback, delay) => { const task = { at: delay, callback, cancelled: false }; c.tasks.push(task); return task; },
      clearTimer: handle => { (handle as Task).cancelled = true; } });
    engine.start(['p']);
    for (let index = 0; index < 8; index++) {
      c.advance(index === 0 ? 0 : 20);
      const bird = engine.snapshot('p').birds.find(item => item.index === index)!;
      expect(bird.arrivesAt - bird.startedAt).toBe(1_234);
    }
    engine.dispose();
  });
  it('validates touches against the current server-computed position', () => {
    const c = clock(); c.engine.start(['p']); c.advance(0);
    const bird = c.engine.snapshot('p').birds[0];
    c.advance(1_000);
    const ratio = (c.engine.snapshot('p').serverNow - bird.startedAt) / (bird.arrivesAt - bird.startedAt);
    const movingPosition = { x: bird.from.x + (bird.target.x - bird.from.x) * ratio, y: bird.from.y + (bird.target.y - bird.from.y) * ratio };
    expect(c.engine.touch('p', bird.birdId, bird.from)).toBe(false);
    expect(c.engine.touch('p', bird.birdId, movingPosition)).toBe(true);
  });
  it('disposes pending scheduled work', () => {
    const c = clock(); c.engine.start(['p']); c.engine.dispose(); c.advance(10_000);
    expect(() => c.engine.snapshot('p')).toThrow('not found');
  });
});
