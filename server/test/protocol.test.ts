import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, parseClientMessage, welcomeMessage } from '../src/protocol.js';

describe('phase-one protocol', () => {
  it('defines the documented versioned welcome envelope', () => {
    expect(welcomeMessage).toEqual({ type: 'welcome', protocolVersion: 1, message: 'Connected to El Sembrador' });
  });
  it('accepts bounded Pedregal picks and rejects malformed cell identifiers', () => {
    expect(parseClientMessage('{"type":"pickPedregal","cellId":24}')).toEqual({ type: 'pickPedregal', cellId: 24 });
    expect(parseClientMessage('{"type":"pickPedregal","cellId":25}')).toBeUndefined();
    expect(parseClientMessage('{"type":"pickPedregal","cellId":1.5}')).toBeUndefined();
  });
  it('accepts bounded normalized Los Espinos drags and rejects invalid coordinates', () => {
    expect(parseClientMessage('{"type":"moveEspinos","x":0.2,"y":0.8}')).toEqual({ type: 'moveEspinos', x: 0.2, y: 0.8 });
    expect(parseClientMessage('{"type":"moveEspinos","x":1.1,"y":0.8}')).toBeUndefined();
    expect(parseClientMessage('{"type":"moveEspinos","x":0,"y":null}')).toBeUndefined();
  });
  it('accepts only bounded one-choice trivia answers with exact envelopes', () => {
    expect(parseClientMessage('{"type":"answerTrivia","index":0,"answer":"B"}')).toEqual({ type: 'answerTrivia', index: 0, answer: 'B' });
    for (const value of [
      '{"type":"answerTrivia","index":2,"answer":"A"}',
      '{"type":"answerTrivia","index":1,"answer":"D"}',
      '{"type":"answerTrivia","index":0,"answer":"A","correct":true}',
    ]) expect(parseClientMessage(value)).toBeUndefined();
  });
  it('accepts organizer round finalization only as an exact control envelope', () => {
    expect(parseClientMessage('{"type":"finalizeGame"}')).toEqual({ type: 'finalizeGame' });
    expect(parseClientMessage('{"type":"finalizeGame","roomId":"r"}')).toBeUndefined();
  });
  it('allows only exact configured origins and rejects missing origins', () => {
    const allowed = new Set(['https://game.example']);
    expect(isAllowedOrigin('https://game.example', allowed)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', allowed)).toBe(false);
    expect(isAllowedOrigin(undefined, allowed)).toBe(false);
  });
});
