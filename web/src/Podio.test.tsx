import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PodiumResults } from './Podio';

describe('final podium', () => {
  it('renders only actual players, shared places, score components and elimination', () => {
    render(<PodiumResults podium={[
      { participantId: 'ada', name: 'Ada', score: 400, seeds: 2, answeredQuestions: 2, place: 1, eliminated: false },
      { participantId: 'bo', name: 'Bo', score: 0, seeds: 0, answeredQuestions: 0, place: 2, eliminated: true },
    ]} organizer={false} onFinalize={vi.fn()} />);
    expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('400 puntos')).toBeInTheDocument();
    expect(screen.getByText(/Eliminado/)).toBeInTheDocument();
    expect(screen.getByText('0 puntos')).toBeInTheDocument();
    expect(screen.queryByText(/vacante/i)).not.toBeInTheDocument();
  });
  it('offers finalization only to the organizer', () => {
    render(<PodiumResults podium={[{ participantId: 'a', name: 'Ada', score: 0, seeds: 0, answeredQuestions: 0, place: 1, eliminated: true }, { participantId: 'b', name: 'Bo', score: 0, seeds: 0, answeredQuestions: 0, place: 1, eliminated: true }]} organizer onFinalize={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Finalizar partida' })).toBeInTheDocument();
  });
});
