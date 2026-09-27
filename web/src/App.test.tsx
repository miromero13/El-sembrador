import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
class MockSocket {
  static instance: MockSocket;
  static instances: MockSocket[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();
  constructor() { MockSocket.instance = this; MockSocket.instances.push(this); }
}
vi.stubGlobal('WebSocket', MockSocket);
afterEach(() => { window.history.replaceState({}, '', '/'); MockSocket.instances = []; });
describe('route shell', () => {
  it('shows navigation and validates welcome before displaying connected', () => {
    render(<App />);
    expect(screen.getByRole('navigation', { name: 'Navegación principal' }).querySelectorAll('a')).toHaveLength(6);
    expect(screen.getByRole('status')).toHaveTextContent('Conectando');
    act(() => MockSocket.instances.forEach(socket => socket.onmessage?.({ data: JSON.stringify({ type: 'welcome', protocolVersion: 1, message: 'Connected to El Sembrador' }) } as MessageEvent)));
    expect(screen.getByRole('status')).toHaveTextContent('Conectado');
  });
  it('routes La Buena Tierra to its participant trivia session', () => {
    window.history.replaceState({}, '', '/buena-tierra?room=room');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'La Buena Tierra' })).toBeInTheDocument();
    expect(screen.getByText('Recuperando tu crecimiento…')).toBeInTheDocument();
  });
  it('routes Pedregal into the authenticated memory stage without trusting URL survivor counts', () => {
    window.history.replaceState({}, '', '/pedregal?room=room&survivors=10');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'El Pedregal' })).toBeInTheDocument();
    expect(screen.getByText('Recuperando tu memoria…')).toBeInTheDocument();
  });
});
