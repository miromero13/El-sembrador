import { describe, expect, it } from 'vitest';
import { createPodium } from '../src/podium.js';

describe('final score and shared places', () => {
  it('scores seeds and answered questions at 100 points each, independent of correctness', () => {
    expect(createPodium([
      { participantId: 'a', name: 'Ada', seeds: 3, answeredQuestions: 2, eliminated: false },
      { participantId: 'b', name: 'Bo', seeds: 4, answeredQuestions: 0, eliminated: false },
    ])).toMatchObject([{ name: 'Ada', score: 500, seeds: 3, answeredQuestions: 2, place: 1 }, { name: 'Bo', score: 400, place: 2 }]);
  });
  it('shares tied places and skips the next place while retaining only real entrants', () => {
    for (let size = 2; size <= 6; size++) {
      const podium = createPodium(Array.from({ length: size }, (_, index) => ({ participantId: `${index}`, name: `Player ${index}`, seeds: index < 2 ? 3 : 1, answeredQuestions: index < 2 ? 1 : 0, eliminated: false })));
      expect(podium).toHaveLength(size);
      expect(podium[0].place).toBe(1);
      expect(podium[1].place).toBe(1);
      if (size >= 3) expect(podium[2].place).toBe(3);
    }
  });
  it('includes an eliminated participant at zero points', () => {
    expect(createPodium([{ participantId: 'x', name: 'Eliminated', seeds: 0, answeredQuestions: 0, eliminated: true }])).toMatchObject([{ score: 0, place: 1, eliminated: true }]);
  });
});
