import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuenaTierra } from './BuenaTierra';

class MockSocket {
  static OPEN = 1; static sockets: MockSocket[] = []; readyState = 1;
  onmessage: ((event: MessageEvent) => void) | null = null; onclose: (() => void) | null = null;
  send = vi.fn(); close = vi.fn(); constructor() { MockSocket.sockets.push(this); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent); }
}
vi.stubGlobal('WebSocket', MockSocket);
afterEach(() => { vi.useRealTimers(); MockSocket.sockets = []; sessionStorage.clear(); window.history.replaceState({}, '', '/buena-tierra?room=room'); });
const trivia = { questions: [
  { id: 1, pregunta: 'Pregunta de Mateo', opciones: ['A) Uno', 'B) Dos', 'C) Tres'], index: 0 },
  { id: 1, pregunta: 'Pregunta de la parábola', opciones: ['A) Uno', 'B) Dos', 'C) Tres'], index: 1 },
] as const, answers: [null, null] as [null, null], correct: 0, complete: false };

describe('La Buena Tierra UI', () => {
  it('answers one question at a time and renders the growth state without a second socket', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem('sembrador.reconnect.room', JSON.stringify({ participantId: 'p', credential: 'secret' }));
    render(<BuenaTierra roomId="room" />);
    await act(async () => { vi.advanceTimersByTime(400); });
    const socket = MockSocket.sockets[0];
    act(() => socket.receive({ type: 'welcome', protocolVersion: 1, message: 'Connected to El Sembrador' }));
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'reconnect', roomId: 'room', reconnectCredential: 'secret' }));
    act(() => socket.receive({ type: 'triviaSnapshot', trivia }));
    expect(screen.getByRole('img', { name: 'Planta marchita' })).toHaveAttribute('src', '/planta-marchita.png');
    expect(screen.getByRole('heading', { name: 'Pregunta 1 de 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'B) Dos' }));
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'answerTrivia', index: 0, answer: 'B' }));
    act(() => socket.receive({ type: 'triviaProgress', trivia: { ...trivia, answers: ['B', null], correct: 1 } }));
    expect(screen.getByRole('img', { name: 'Planta mediana' })).toHaveAttribute('src', '/planta-mediana.png');
    expect(screen.getByRole('heading', { name: 'Pregunta 2 de 2' })).toBeInTheDocument();
    act(() => socket.receive({ type: 'triviaProgress', trivia: { ...trivia, answers: ['B', 'A'], correct: 2, complete: true } }));
    expect(screen.getByRole('img', { name: 'Planta grande' })).toHaveAttribute('src', '/planta-grande.png');
    expect(screen.getByText('Respuestas correctas: 2 de 2.')).toBeInTheDocument();
    expect(MockSocket.sockets).toHaveLength(1);
  });
});
