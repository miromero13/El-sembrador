import { useEffect, useMemo, useRef, useState } from 'react';
import { CaminoSession, type CaminoSessionState } from './camino-session';
import type { Bird, Point } from './protocol';

export const birdSpriteFor = (bird: Pick<Bird, 'from' | 'target'>) => {
  const facesRight = bird.from.y === 0 ? bird.target.x >= bird.from.x : bird.from.x === 0;
  return facesRight ? '/pajaro-derecha.png' : '/pajaro-izquierda.png';
};

const positionAt = (bird: Bird, now: number): Point => {
  const t = Math.max(0, Math.min(1, (now - bird.startedAt) / (bird.arrivesAt - bird.startedAt)));
  return { x: bird.from.x + (bird.target.x - bird.from.x) * t, y: bird.from.y + (bird.target.y - bird.from.y) * t };
};
export { positionAt };
export function Camino({ roomId }: { roomId: string }) {
  const [state, setState] = useState<CaminoSessionState>({ status: 'connecting', roomId });
  const [now, setNow] = useState(Date.now());
  const [navigationFailed, setNavigationFailed] = useState(false);
  const navigated = useRef(false);
  const session = useMemo(() => new CaminoSession(roomId, setState), [roomId]);
  const clockOffset = useMemo(() => state.camino ? state.camino.serverNow - Date.now() : 0, [state.camino]);
  useEffect(() => { session.connect(); const timer = window.setInterval(() => setNow(Date.now()), 40); return () => { window.clearInterval(timer); session.dispose(); }; }, [session]);
  useEffect(() => {
    if (state.status !== 'complete' || !state.camino?.complete || navigated.current) return;
    navigated.current = true;
    const destination = `/pedregal?room=${encodeURIComponent(roomId)}&survivors=${state.camino.seeds}`;
    try { window.location.replace(destination); } catch { setNavigationFailed(true); }
  }, [roomId, state]);
  if (state.status === 'error') return <section className="camino-card" aria-label="El Camino"><h2>No pudimos volver a entrar</h2><p role="alert">{state.message}</p><a className="camino-link" href={`/?room=${encodeURIComponent(roomId)}`}>Volver a la sala</a></section>;
  if (state.status === 'connecting' || !state.camino) return <section className="camino-card" aria-label="El Camino"><p role="status">{state.message ?? 'Recuperando tu recorrido…'}</p></section>;
  if (state.status === 'complete') return <section className="camino-card completion" aria-label="El Camino"><span className="eyebrow">RECORRIDO COMPLETADO</span><h2>Llegaste al final del Camino</h2><p>Semillas que conservaste: <strong>{state.camino.seeds}</strong></p>{navigationFailed && <p role="alert">No pudimos avanzar automáticamente. <a className="camino-link" href={`/pedregal?room=${encodeURIComponent(roomId)}&survivors=${state.camino.seeds}`}>Ir al Pedregal</a></p>}</section>;
  const camino = state.camino;
  const serverNow = now + clockOffset;
  return <section className="camino-card" aria-label="El Camino"><div className="camino-heading"><div><span className="eyebrow">CUIDÁ TUS SEMILLAS</span><h2>Las aves se acercan</h2></div><div className="camino-counts"><span><strong>{camino.seeds}</strong> semillas</span><span><strong>{8 - camino.resolved}</strong> aves restantes</span></div></div>
    {state.message && <p role="status">{state.message}</p>}
    <div className="playfield" aria-label="Campo de juego"><div className="field-soil" aria-hidden="true" /><div className="field-sun" aria-hidden="true">☀</div>{camino.seedPositions.map(seed => <img key={seed.seedId} className="field-seed" src="/semilla.png" alt="Semilla" style={{ left: `${seed.position.x * 100}%`, top: `${seed.position.y * 100}%` }} />)}{camino.birds.map(bird => { const pos = positionAt(bird, serverNow); return <button key={bird.birdId} type="button" className="field-bird" aria-label="Espantar ave" title="Tocá el ave para espantarla" style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }} onPointerDown={event => { event.preventDefault(); const rect = event.currentTarget.parentElement!.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width; const y = (event.clientY - rect.top) / rect.height; session.touch(bird.birdId, x, y); }}><img src={birdSpriteFor(bird)} alt="" /></button>; })}</div>
    <div className="camino-progress" role="status">Aves resueltas: {camino.resolved} de 8</div>
  </section>;
}
