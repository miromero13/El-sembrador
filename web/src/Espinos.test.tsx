import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Espinos } from './Espinos';
class MockSocket {
  static OPEN = 1; static sockets: MockSocket[] = []; readyState = 1;
  onmessage: ((event: MessageEvent) => void) | null = null; onclose: (() => void) | null = null;
  send = vi.fn(); close = vi.fn(); constructor() { MockSocket.sockets.push(this); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent); }
}
vi.stubGlobal('WebSocket', MockSocket);
afterEach(() => { vi.useRealTimers(); MockSocket.sockets = []; sessionStorage.clear(); window.history.replaceState({}, '', '/espinos?room=room'); });
describe('Los Espinos UI', () => {
  it('shows the grouped seed token and exact counter label, sending normalized drag movement', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem('sembrador.reconnect.room', JSON.stringify({ participantId: 'p', credential: 'secret' }));
    render(<Espinos roomId="room" />);
    await act(async () => { vi.advanceTimersByTime(400); });
    const socket = MockSocket.sockets[0];
    act(() => socket.receive({ type: 'welcome', protocolVersion: 1, message: 'Connected to El Sembrador' }));
    act(() => socket.receive({ type: 'espinosSnapshot', espinos: { serverNow: 1, seeds: 3, status: 'playing', position: { x: .1, y: .84 }, collided: false, progress: 0 } }));
    expect(screen.getByText('Cantidad de semillas')).toBeInTheDocument();
    const thornBoundary = screen.getByTestId('thorn-boundary');
    expect(thornBoundary).toHaveAttribute('data-boundary-radius', '7.5');
    const spikes = within(thornBoundary).getAllByTestId('thorn-spike');
    expect(spikes.length).toBeGreaterThan(20);
    expect(spikes[0].tagName.toLowerCase()).toBe('path');
    expect(spikes[0]).toHaveAttribute('d', expect.stringMatching(/^M.* L.* L.* Z$/));
    expect(thornBoundary.querySelectorAll('.thorn-spike')).toHaveLength(spikes.length);
    expect(screen.getByRole('img', { name: 'Tu grupo de semillas' })).toHaveAttribute('src', '/semilla.png');
    const maze = screen.getByLabelText('Laberinto de espinas');
    vi.spyOn(maze, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON() {} });
    fireEvent(maze, new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 64, buttons: 1 }));
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'moveEspinos', x: .1, y: .64 }));
  });
  it('renders elimination only for this participant', async () => {
    vi.useFakeTimers(); sessionStorage.setItem('sembrador.reconnect.room', JSON.stringify({ participantId: 'p', credential: 'secret' }));
    render(<Espinos roomId="room" />); await act(async () => { vi.advanceTimersByTime(400); });
    act(() => MockSocket.sockets[0].receive({ type: 'espinosSnapshot', espinos: { serverNow: 1, seeds: 0, status: 'eliminated', position: { x: .1, y: .84 }, collided: false, progress: 0 } }));
    expect(screen.getByRole('heading', { name: 'Te quedaste sin semillas' })).toBeInTheDocument();
  });
});
