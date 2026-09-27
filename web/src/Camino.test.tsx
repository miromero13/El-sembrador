import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { birdSpriteFor, positionAt, Camino } from './Camino';

const sessionHarness = vi.hoisted(() => ({ changed: undefined as ((state: any) => void) | undefined }));
vi.mock('./camino-session', () => ({
  CaminoSession: class {
    constructor(_roomId: string, changed: (state: any) => void) { sessionHarness.changed = changed; }
    connect() {}
    dispose() {}
    touch() {}
  },
}));
import type { Bird } from './protocol';

describe('Camino flight rendering', () => {
  it('transitions from connecting to a valid playing snapshot without changing hook count', () => {
    render(<Camino roomId="room-1" />);
    expect(screen.getByRole('status')).toHaveTextContent('Recuperando tu recorrido');

    act(() => sessionHarness.changed?.({
      status: 'playing', roomId: 'room-1', camino: {
        seeds: 10, resolved: 0, complete: false, serverNow: Date.now(),
        seedPositions: [{ seedId: 0, position: { x: .5, y: .8 } }],
        birds: [{ birdId: 'bird-1', index: 0, from: { x: 0, y: .5 }, targetSeed: 0, target: { x: .5, y: .8 }, startedAt: Date.now(), arrivesAt: Date.now() + 5000 }],
      },
    }));

    expect(screen.getByRole('button', { name: 'Espantar ave' })).toBeInTheDocument();
    expect(screen.getByLabelText('Campo de juego')).toBeInTheDocument();
  });
  it('selects sprites facing toward the target from top and lateral entries', () => {
    expect(birdSpriteFor({ from: { x: .3, y: 0 }, target: { x: .7, y: .84 } })).toBe('/pajaro-derecha.png');
    expect(birdSpriteFor({ from: { x: .7, y: 0 }, target: { x: .3, y: .84 } })).toBe('/pajaro-izquierda.png');
    expect(birdSpriteFor({ from: { x: 0, y: .3 }, target: { x: .7, y: .84 } })).toBe('/pajaro-derecha.png');
    expect(birdSpriteFor({ from: { x: 1, y: .3 }, target: { x: .2, y: .84 } })).toBe('/pajaro-izquierda.png');
  });
  it('renders ten seed images on one shared low row and an image inside each touch control', () => {
    render(<Camino roomId="room-1" />);
    act(() => sessionHarness.changed?.({ status: 'playing', roomId: 'room-1', camino: {
      seeds: 10, resolved: 0, complete: false, serverNow: Date.now(),
      seedPositions: Array.from({ length: 10 }, (_, seedId) => ({ seedId, position: { x: .07 + seedId * .86 / 9, y: .84 } })),
      birds: [
        { birdId: 'left', index: 0, from: { x: 0, y: .84 }, targetSeed: 0, target: { x: .07, y: .84 }, startedAt: Date.now(), arrivesAt: Date.now() + 3000 },
        { birdId: 'right', index: 1, from: { x: 1, y: .84 }, targetSeed: 1, target: { x: .16, y: .84 }, startedAt: Date.now(), arrivesAt: Date.now() + 3000 },
      ],
    } }));
    const seeds = screen.getAllByRole('img', { name: 'Semilla' });
    expect(seeds).toHaveLength(10);
    expect(seeds.map(seed => (seed as HTMLImageElement).src)).toEqual(Array(10).fill(expect.stringContaining('/semilla.png')));
    expect(new Set(seeds.map(seed => (seed as HTMLElement).style.top))).toEqual(new Set(['84%']));
    const birds = screen.getAllByRole('button', { name: 'Espantar ave' });
    expect(birds.map(button => button.querySelector('img')?.getAttribute('src'))).toEqual(['/pajaro-derecha.png', '/pajaro-izquierda.png']);
  });
  it('interpolates edge-to-seed position by authoritative server time and clamps endpoints', () => {
    const bird: Bird = { birdId: 'b', index: 0, from: { x: 0, y: .5 }, targetSeed: 3, target: { x: .4, y: .7 }, startedAt: 1000, arrivesAt: 5000 };
    expect(positionAt(bird, 1000)).toEqual({ x: 0, y: .5 });
    expect(positionAt(bird, 3000)).toEqual({ x: .2, y: .6 });
    expect(positionAt(bird, 6000)).toEqual({ x: .4, y: .7 });
  });
});
