import { describe, expect, it } from 'vitest';
import { CORRIDOR_RADIUS, ESPINOS_PATH, Espinos } from '../src/espinos.js';
describe('Los Espinos authoritative maze', () => {
  it('charges once for sustained thorn contact and again only after leaving and re-entering', () => {
    const game = new Espinos('p', 3, () => 1);
    expect(game.move({ x: .5, y: .9 }).snapshot.seeds).toBe(2);
    expect(game.move({ x: .55, y: .9 }).snapshot.seeds).toBe(2);
    expect(game.move(ESPINOS_PATH[0]).snapshot.seeds).toBe(2);
    expect(game.move({ x: .5, y: .9 }).snapshot.seeds).toBe(1);
  });
  it('charges exactly once when crossing the visible thorn boundary', () => {
    const game = new Espinos('p', 3);
    const start = ESPINOS_PATH[0];
    expect(game.move({ x: start.x + CORRIDOR_RADIUS - .005, y: start.y }).snapshot.seeds).toBe(3);
    expect(game.move({ x: start.x + CORRIDOR_RADIUS + .005, y: start.y }).snapshot.seeds).toBe(2);
    expect(game.move({ x: start.x + CORRIDOR_RADIUS + .01, y: start.y }).snapshot.seeds).toBe(2);
  });
  it('eliminates only the participant at zero and rejects further movement', () => {
    const game = new Espinos('p', 1);
    expect(game.move({ x: .5, y: .9 }).snapshot.status).toBe('eliminated');
    expect(game.move(ESPINOS_PATH[0]).accepted).toBe(false);
  });
  it('accepts completion only by progressing to the sunny goal with a seed', () => {
    const game = new Espinos('p', 2);
    let result = game.snapshot();
    for (const point of ESPINOS_PATH.slice(1)) result = game.move(point).snapshot;
    expect(result).toMatchObject({ status: 'complete', seeds: 2, progress: expect.any(Number) });
  });
  it('does not accumulate progress from repeated submissions of a distant goal endpoint', () => {
    const game = new Espinos('p', 3, () => 1);
    const goal = ESPINOS_PATH.at(-1)!;
    let result = game.snapshot();
    for (let attempt = 0; attempt < 20; attempt++) result = game.move(goal).snapshot;
    expect(result).toMatchObject({ status: 'playing', seeds: 2, progress: 0, position: ESPINOS_PATH[0], collided: true });
  });
  it('starts zero-seed players eliminated', () => expect(new Espinos('p', 0).snapshot().status).toBe('eliminated'));
});
