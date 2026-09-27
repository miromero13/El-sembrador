import { useEffect, useMemo, useState } from 'react';
import { PodioSession, type PodioState } from './podio-session';

export function Podio({ roomId }: { roomId: string }) {
  const [state, setState] = useState<PodioState>({ organizer: false, connected: false });
  const session = useMemo(() => new PodioSession(roomId, setState), [roomId]);
  useEffect(() => { session.connect(); return () => session.dispose(); }, [session]);
  if (state.error) return <section className="podio-card" aria-label="Podio Final"><p role="alert">{state.error}</p></section>;
  if (!state.podium) return <section className="podio-card" aria-label="Podio Final"><p role="status">Esperando el podio final…</p></section>;
  return <PodiumResults podium={state.podium} organizer={state.organizer} onFinalize={() => session.finalize()} />;
}

export function PodiumResults({ podium, organizer, onFinalize }: { podium: PodioState['podium']; organizer: boolean; onFinalize: () => void }) {
  if (!podium) return null;
  const placeLabel = (place: number) => `${place}° lugar`;
  return <section className="podio-card" aria-label="Podio Final">
    <span className="eyebrow">LA COSECHA DEL RECORRIDO</span><h2>Podio Final</h2>
    <ol className="podio-list">{podium.map(player => <li key={player.participantId} className={player.place === 1 ? 'podio-winner' : ''}>
      <span className="podio-place">{placeLabel(player.place)}</span><strong>{player.name}{player.eliminated && <small> · Eliminado</small>}</strong>
      <span className="podio-points">{player.score} puntos</span><small>{player.seeds} semillas · {player.answeredQuestions} respuestas</small>
    </li>)}</ol>
    {organizer && <button className="podio-finalize" onClick={onFinalize}>Finalizar partida</button>}
  </section>;
}
