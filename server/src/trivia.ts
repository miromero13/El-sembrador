import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Question = { id: number; pregunta: string; opciones: [string, string, string] };
type StoredQuestion = Question & { respuesta_correcta: 'A' | 'B' | 'C' };
export type TriviaQuestion = Question & { index: 0 | 1 };
export type TriviaSnapshot = { questions: [TriviaQuestion, TriviaQuestion]; answers: Array<'A' | 'B' | 'C' | null>; correct: number; complete: boolean };
const banks = [
  readBank('preguntas-mateo.json'),
  readBank('preguntas-parabola.json'),
] as const;
function readBank(file: string): StoredQuestion[] {
  const value: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'data', file), 'utf8'));
  if (!Array.isArray(value) || value.length === 0 || !value.every(validQuestion)) throw new Error(`Invalid trivia bank: ${file}`);
  return value;
}
function validQuestion(value: unknown): value is StoredQuestion {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return Number.isInteger(item.id) && typeof item.pregunta === 'string' && item.pregunta.length > 0 && Array.isArray(item.opciones) && item.opciones.length === 3 && item.opciones.every(option => typeof option === 'string') && ['A', 'B', 'C'].includes(String(item.respuesta_correcta));
}
export function questionBankSizes() { return banks.map(bank => bank.length) as [number, number]; }
export class Trivia {
  private readonly questions: StoredQuestion[];
  private readonly answers: Array<'A' | 'B' | 'C' | null> = [null, null];
  constructor(random: () => number = Math.random) {
    this.questions = banks.map(bank => bank[Math.min(bank.length - 1, Math.floor(random() * bank.length))]);
  }
  snapshot(): TriviaSnapshot {
    return {
      questions: this.questions.map((question, index) => ({ id: question.id, pregunta: question.pregunta, opciones: [...question.opciones] as [string, string, string], index: index as 0 | 1 })) as [TriviaQuestion, TriviaQuestion],
      answers: [...this.answers],
      correct: this.answers.reduce((count, answer, index) => count + (answer !== null && answer === this.questions[index].respuesta_correcta ? 1 : 0), 0),
      complete: this.answers.every(answer => answer !== null),
    };
  }
  answer(index: number, answer: string): boolean {
    if ((index !== 0 && index !== 1) || !['A', 'B', 'C'].includes(answer) || this.answers[index] !== null || (index === 1 && this.answers[0] === null)) return false;
    this.answers[index] = answer as 'A' | 'B' | 'C';
    return true;
  }
}
