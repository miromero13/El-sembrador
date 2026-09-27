import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pedregal } from './Pedregal';

class MockSocket {
  static OPEN = 1;
  static sockets: MockSocket[] = [];
  readyState = 1;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor() { MockSocket.sockets.push(this); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent); }
}
vi.stubGlobal('WebSocket', MockSocket);
const preview = { serverNow: 1_000, previewEndsAt: 4_000, preview: true, cells: Array.from({ length: 25 }, (_, cellId) => ({ cellId, hasSeed: cellId === 3 || cellId === 10 })), revealed: [], attempts: 2, remainingAttempts: 2, recovered: 0, lives: 0, complete: false };
afterEach(() => { vi.useRealTimers(); MockSocket.sockets = []; sessionStorage.clear(); });

describe('Pedregal stage', () => {
  it('shows authoritative preview seeds, then covers all cells and sends a unique pick', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem('sembrador.reconnect.room', JSON.stringify({ participantId: 'player', credential: 'secret' }));
    render(<Pedregal roomId="room" />);
    await act(async () => { vi.advanceTimersByTime(400); });
    const socket = MockSocket.sockets[0];
    act(() => socket.receive({ type: 'welcome', protocolVersion: 1, message: 'Connected to El Sembrador' }));
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'reconnect', roomId: 'room', reconnectCredential: 'secret' }));
    act(() => socket.receive({ type: 'reconnected', roomId: 'room', participantId: 'player', room: { roomId: 'room', participants: [], stage: 'camino' } }));
    act(() => socket.receive({ type: 'pedregalSnapshot', pedregal: preview }));
    const board = screen.getByRole('grid', { name: 'Tablero de memoria 5 por 5' });
    expect(within(board).getAllByRole('gridcell')).toHaveLength(25);
    expect(within(board).getAllByRole('gridcell', { name: /semilla/ })).toHaveLength(2);
    await act(async () => { vi.advanceTimersByTime(3_050); });
    expect(screen.getByRole('heading', { name: 'Elegí una casilla' })).toBeInTheDocument();
    expect(within(board).getAllByRole('gridcell', { name: /cubierta/ })).toHaveLength(25);
    const first = within(board).getByRole('gridcell', { name: 'Casilla 1, cubierta' });
    fireEvent.click(first);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'pickPedregal', cellId: 0 }));
    fireEvent.click(first);
    expect(socket.send).toHaveBeenCalledTimes(2); // reconnect and one accepted local pick only
  });

  it('renders lives and progress from server state and ignores invalid late clicks', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem('sembrador.reconnect.room', JSON.stringify({ participantId: 'player', credential: 'secret' }));
    render(<Pedregal roomId="room" />);
    await act(async () => { vi.advanceTimersByTime(400); });
    const socket = MockSocket.sockets[0];
    act(() => socket.receive({ type: 'welcome', protocolVersion: 1, message: 'Connected to El Sembrador' }));
    act(() => socket.receive({ type: 'pedregalSnapshot', pedregal: { ...preview, serverNow: Date.now(), previewEndsAt: Date.now() - 1, preview: false, recovered: 1, lives: 1, remainingAttempts: 1, revealed: [{ cellId: 0, hasSeed: true }] } }));
    expect(document.querySelector('.pedregal-counts')).toHaveTextContent('1 vidas');
    expect(screen.getByText('Recuperadas: 1 de 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('gridcell', { name: 'Casilla 1, semilla' }));
    expect(socket.send).not.toHaveBeenCalledWith(JSON.stringify({ type: 'pickPedregal', cellId: 0 }));
  });
});
