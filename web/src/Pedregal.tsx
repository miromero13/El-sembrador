import { useEffect, useMemo, useState } from 'react';
import { PedregalSession, type PedregalSessionState } from './pedregal-session';

export function Pedregal({ roomId }: { roomId: string }) {
  const [state, setState] = useState<PedregalSessionState>({ status: 'connecting' });
  const [now, setNow] = useState(Date.now());
  const session = useMemo(() => new PedregalSession(roomId, setState), [roomId]);
  useEffect(() => { session.connect(); const interval = window.setInterval(() => setNow(Date.now()), 50); return () => { window.clearInterval(interval); session.dispose(); }; }, [session]);
  useEffect(() => { if (state.status === 'advancing') window.location.replace(`/espinos?room=${encodeURIComponent(roomId)}`); }, [roomId, state.status]);
  const game = state.pedregal;
  const serverClockOffset = useMemo(() => game ? game.serverNow - Date.now() : 0, [game?.serverNow]);
  if (state.status === 'error') return <section className="pedregal-card" aria-label="El Pedregal"><p role="alert">{state.message}</p></section>;
  if (!game) return <section className="pedregal-card" aria-label="El Pedregal"><p role="status">Recuperando tu memoria…</p></section>;
  const preview = game.preview && now + serverClockOffset < game.previewEndsAt;
  const revealed = new Map(game.revealed.map(cell => [cell.cellId, cell.hasSeed]));
  return <section className="pedregal-card" aria-label="El Pedregal"><div className="pedregal-heading"><div><span className="eyebrow">RECORDÁ DÓNDE ESTÁN</span><h2>{preview ? 'Memorizá tus semillas' : game.complete ? 'Memoria recuperada' : 'Elegí una casilla'}</h2></div><div className="pedregal-counts"><span><strong>{game.lives}</strong> vidas</span><span><strong>{game.remainingAttempts}</strong> intentos</span></div></div>
    <p className="pedregal-origin">Semillas que llegaron con vos: {game.attempts}.</p>
    <p className="pedregal-help" role="status">{preview ? 'Las semillas se cubrirán en unos segundos.' : `Recuperadas: ${game.recovered} de ${game.attempts}${game.complete ? ' · Recorrido terminado' : ''}`}</p>
    <div className="pedregal-board" role="grid" aria-label="Tablero de memoria 5 por 5">{game.cells.map(cell => {
      const shown = preview ? cell.hasSeed : revealed.get(cell.cellId);
      const covered = !preview && shown === undefined;
      return <button key={cell.cellId} type="button" role="gridcell" aria-label={covered ? `Casilla ${cell.cellId + 1}, cubierta` : `Casilla ${cell.cellId + 1}, ${shown ? 'semilla' : 'vacía'}`} className={`pedregal-cell ${covered ? 'covered' : shown ? 'seed' : 'empty'}`} disabled={!covered || game.complete || state.status !== 'playing'} onClick={() => session.pick(cell.cellId)}>{covered ? <img src="/roca.png" alt="" /> : shown ? <img src="/semilla.png" alt="" /> : <span aria-hidden="true" />}</button>;
    })}</div>
  </section>;
}
