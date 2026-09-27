import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Trivia, questionBankSizes } from '../src/trivia.js';

describe('La Buena Tierra question banks', () => {
  it('keeps server-owned banks byte-for-byte aligned with their approved web sources', () => {
    for (const file of ['preguntas-mateo.json', 'preguntas-parabola.json']) {
      const web = readFileSync(new URL(`../../web/${file}`, import.meta.url), 'utf8');
      const server = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8');
      expect(server).toBe(web);
    }
    expect(questionBankSizes()).toEqual([20, 30]);
  });
  it('selects one question from each bank in Mateo-then-Parabola order and hides answer keys', () => {
    const trivia = new Trivia(() => 0);
    const snapshot = trivia.snapshot();
    expect(snapshot.questions.map(question => question.index)).toEqual([0, 1]);
    expect(snapshot.questions.map(question => question.id)).toEqual([1, 1]);
    expect(snapshot.questions[0].pregunta).toMatch(/Mateo/);
    expect(snapshot.questions[1].pregunta).toMatch(/Jesús/);
    expect(JSON.stringify(snapshot)).not.toContain('respuesta_correcta');
    expect(snapshot.answers).toEqual([null, null]);
  });
  it('selects within bank bounds and accepts a single ordered answer per question', () => {
    const trivia = new Trivia(() => 0.999999);
    expect(trivia.snapshot().questions.map(question => question.id)).toEqual([20, 30]);
    expect(trivia.answer(1, 'A')).toBe(false);
    expect(trivia.answer(0, 'A')).toBe(true);
    expect(trivia.answer(0, 'B')).toBe(false);
    expect(trivia.answer(1, 'A')).toBe(true);
    expect(trivia.snapshot()).toMatchObject({ answers: ['A', 'A'], correct: 2, complete: true });
    expect(trivia.answer(1, 'B')).toBe(false);
    expect(trivia.answer(2, 'A')).toBe(false);
    expect(trivia.answer(1, 'invalid')).toBe(false);
  });
});
