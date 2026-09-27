import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
const ESPINOS_PATH = [{ x: .10, y: .84 }, { x: .10, y: .64 }, { x: .34, y: .64 }, { x: .34, y: .40 }, { x: .66, y: .40 }, { x: .66, y: .64 }, { x: .90, y: .64 }, { x: .90, y: .20 }];
const THORN_BOUNDARY_RADIUS = 7.5; // Matches the server's normalized CORRIDOR_RADIUS (0.075 × 100).
const THORN_SPACING = 7;
function makeThornSpikes(): string[] {
  const spikes: string[] = [];
  for (let segment = 0; segment < ESPINOS_PATH.length - 1; segment++) {
    const from = ESPINOS_PATH[segment];
    const to = ESPINOS_PATH[segment + 1];
    const dx = (to.x - from.x) * 100;
    const dy = (to.y - from.y) * 100;
    const length = Math.hypot(dx, dy);
    const tangent = { x: dx / length, y: dy / length };
    const normal = { x: -tangent.y, y: tangent.x };
    for (let along = 7; along < length - 4; along += THORN_SPACING) {
      const center = { x: from.x * 100 + tangent.x * along, y: from.y * 100 + tangent.y * along };
      for (const side of [-1, 1]) {
        const base1 = { x: center.x - tangent.x * 2 + normal.x * THORN_BOUNDARY_RADIUS * side, y: center.y - tangent.y * 2 + normal.y * THORN_BOUNDARY_RADIUS * side };
        const tip = { x: center.x + normal.x * (THORN_BOUNDARY_RADIUS + 5) * side, y: center.y + normal.y * (THORN_BOUNDARY_RADIUS + 5) * side };
        const base2 = { x: center.x + tangent.x * 2 + normal.x * THORN_BOUNDARY_RADIUS * side, y: center.y + tangent.y * 2 + normal.y * THORN_BOUNDARY_RADIUS * side };
        spikes.push(`M${base1.x},${base1.y} L${tip.x},${tip.y} L${base2.x},${base2.y} Z`);
      }
    }
  }
  return spikes;
}
const THORN_SPIKES = makeThornSpikes();
import { EspinosSession, type EspinosSessionState } from './espinos-session';
import { BuenaTierra } from './BuenaTierra';

export function Espinos({ roomId }: { roomId: string }) {
  const [state, setState] = useState<EspinosSessionState>({ status: 'connecting' });
  const field = useRef<HTMLDivElement>(null);
  const session = useMemo(() => new EspinosSession(roomId, setState), [roomId]);
  useEffect(() => { session.connect(); return () => session.dispose(); }, [session]);
  useEffect(() => {
    if (state.status === 'trivia' && window.location.pathname !== '/buena-tierra') window.history.replaceState({}, '', `/buena-tierra?room=${encodeURIComponent(roomId)}`);
  }, [roomId, state.status]);
  if (state.status === 'trivia') return <BuenaTierra roomId={roomId} session={session} sharedState={state} />;
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = field.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return;
    session.move((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
  };
  if (state.status === 'error') return <section className="espinos-card" aria-label="Los Espinos"><p role="alert">{state.message}</p></section>;
  if (!state.espinos) return <section className="espinos-card" aria-label="Los Espinos"><p role="status">Recuperando tu recorrido…</p></section>;
  if (state.status === 'eliminated') return <section className="espinos-card completion" aria-label="Los Espinos"><span className="eyebrow">RECORRIDO TERMINADO</span><h2>Te quedaste sin semillas</h2><p>Este recorrido termina acá.</p></section>;
  const point = state.espinos.position;
  return <section className="espinos-card" aria-label="Los Espinos"><div className="espinos-heading"><div><span className="eyebrow">UN CAMINO ENTRE ESPINAS</span><h2>Encontrá la Buena Tierra</h2></div><div className="espinos-count"><strong>{state.espinos.seeds}</strong><span>Cantidad de semillas</span></div></div><p className="espinos-help" role="status">Mantené presionada la semilla y arrastrala por el sendero.</p><div className="espinos-maze" ref={field} onPointerDown={event => { event.currentTarget.setPointerCapture?.(event.pointerId); move(event); }} onPointerMove={event => { if (event.buttons || event.pointerType === 'touch') move(event); }} onPointerUp={move} aria-label="Laberinto de espinas"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline className="maze-path" points={ESPINOS_PATH.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} /><g className="maze-thorns" data-testid="thorn-boundary" data-boundary-radius={THORN_BOUNDARY_RADIUS} aria-label="Espinas en los dos bordes del sendero">{THORN_SPIKES.map((path, index) => <path className="thorn-spike" data-testid="thorn-spike" d={path} key={index} />)}</g></svg><div className="maze-goal" style={{ left: '90%', top: '20%' }} aria-label="La Buena Tierra, meta"><span aria-hidden="true">☀️</span><strong>La Buena Tierra</strong></div><img className="maze-seed" src="/semilla.png" alt="Tu grupo de semillas" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} draggable={false} /><span className="maze-instructions">Arrastrá por el sendero</span></div></section>;
}
