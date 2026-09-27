import { useEffect, useState } from 'react';
import { isWelcomeMessage, roomIdFromLocation } from './protocol';
import { Lobby } from './Lobby';
import { Camino } from './Camino';
import { Pedregal } from './Pedregal';
import { Espinos } from './Espinos';
import { BuenaTierra } from './BuenaTierra';
import { Podio } from './Podio';

type Page = { path: string; title: string; description: string; stage: number };
const pages: Page[] = [
  { path: '/', title: 'El Sembrador', description: 'Una aventura de semillas, cuidado y esperanza.', stage: 0 },
  { path: '/camino', title: 'El Camino', description: 'La primera etapa del recorrido.', stage: 1 },
  { path: '/pedregal', title: 'El Pedregal', description: 'Memorizá tus semillas y recuperá vidas para el siguiente sendero.', stage: 2 },
  { path: '/espinos', title: 'Los Espinos', description: 'Un sendero por descubrir.', stage: 3 },
  { path: '/buena-tierra', title: 'La Buena Tierra', description: 'Respondé y descubrí cuánto creció tu planta.', stage: 4 },
  { path: '/podio', title: 'Podio Final', description: 'La cosecha de cada participante.', stage: 5 },
];
const socketUrl = import.meta.env.VITE_WS_URL ?? 'https://el-sembrador.onrender.com/';
export function App() {
  const page = pages.find(item => item.path === window.location.pathname) ?? pages[0];
  const roomId = roomIdFromLocation(window.location.search);
  const [connection, setConnection] = useState('Conectando…');
  useEffect(() => {
    let socket: WebSocket;
    try { socket = new WebSocket(socketUrl); } catch { setConnection('Desconectado'); return; }
    socket.onmessage = event => { try {
      const parsed: unknown = JSON.parse(String(event.data));
      if (isWelcomeMessage(parsed)) setConnection('Conectado');
    } catch { setConnection('Protocolo inválido'); socket.close(1008, 'Invalid welcome'); } };
    socket.onerror = () => setConnection('Desconectado');
    socket.onclose = () => setConnection(current => current === 'Conectado' ? 'Desconectado' : current);
    return () => socket.close();
  }, []);
  const camino = page.path === '/camino' && roomId;
  const pedregal = page.path === '/pedregal' && roomId;
  const espinos = page.path === '/espinos' && roomId;
  const buenaTierra = page.path === '/buena-tierra' && roomId;
  const podio = page.path === '/podio' && roomId;
  return <div className="app-shell"><header className="topbar"><a className="brand" href="/" aria-label="El Sembrador, inicio"><span className="brand-mark">✳</span><span>El Sembrador</span></a><span className="connection" role="status"><i className={connection === 'Conectado' ? 'online' : ''}/>{connection}</span></header><main><section className="hero"><div className="eyebrow">UNA AVENTURA PARA CULTIVAR</div><h1>{page.title}</h1><p>{page.description}</p>{camino ? <Camino key={roomId} roomId={roomId} /> : pedregal ? <Pedregal key={roomId} roomId={roomId} /> : espinos ? <Espinos key={roomId} roomId={roomId} /> : buenaTierra ? <BuenaTierra key={roomId} roomId={roomId} /> : podio ? <Podio key={roomId} roomId={roomId} /> : page.stage === 0 ? <Lobby /> : <div className="preparation"><span>🌱</span><div><strong>En preparación</strong><small>Esta etapa todavía no está disponible para jugar.</small></div></div>}{page.stage === 0 && <div className="welcome-card"><div className="seed-art" aria-hidden="true">🌱</div><div><strong>Todo comienza con una semilla</strong><p>Recorré cada etapa y descubrí el camino hacia la buena tierra.</p></div></div>}</section><section className="journey" aria-label="Etapas del recorrido"><div className="section-heading"><div><span className="eyebrow">EL RECORRIDO</span><h2>Seis momentos para crecer</h2></div><span className="stage-count">0 / 5 etapas disponibles</span></div><nav className="stage-grid" aria-label="Navegación principal">{pages.map((item, index) => <a key={item.path} href={item.path} aria-current={page.path === item.path ? 'page' : undefined} className={`stage-card ${page.path === item.path ? 'active' : ''}`}><span className="stage-number">{String(index).padStart(2, '0')}</span><span className="stage-title">{index === 0 ? 'Inicio' : item.title}</span><span className="stage-arrow">↗</span></a>)}</nav></section></main><footer><span>Una experiencia en crecimiento</span><span>El Sembrador · Fase 6</span></footer></div>;
}
