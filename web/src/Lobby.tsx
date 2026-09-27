import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { LobbySession, type SessionState } from './lobby-session';
import { roomIdFromLocation } from './protocol';

export function Lobby() {
  const initialRoom = roomIdFromLocation(window.location.search);
  const [state, setState] = useState<SessionState>({ mode: 'idle' });
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const session = useMemo(() => new LobbySession((next, message) => { setState(next); if (message) setError(message); }), []);
  useEffect(() => { session.connect(); return () => session.dispose(); }, [session]);
  useEffect(() => { if (state.mode === 'player' && state.room.stage === 'camino' && state.connected) session.handoffToCamino(() => window.location.assign(`/camino?room=${encodeURIComponent(state.roomId)}`)); }, [session, state]);
  useEffect(() => { if (state.mode === 'organizer') QRCode.toDataURL(state.inviteUrl, { width: 220, margin: 1 }).then(setQr); }, [state]);
  const copy = async (url: string) => { await navigator.clipboard.writeText(url); setCopied(true); };
  const submitJoin = (event: React.FormEvent) => { event.preventDefault(); if (!initialRoom) return; if (!name.trim() || name.trim().length > 40) { setError('Ingresá un nombre de 1 a 40 caracteres.'); return; } setError(''); session.join(initialRoom, name.trim()); };
  const room = state.mode === 'organizer' || state.mode === 'player' ? state.room : undefined;
  return <section className="lobby" aria-label="Sala de espera">
    {state.mode === 'idle' && (initialRoom ? <form className="lobby-card join-card" onSubmit={submitJoin}><span className="eyebrow">TE INVITARON A JUGAR</span><h2>Sumate a la sala</h2><label htmlFor="player-name">Tu nombre</label><input id="player-name" autoComplete="given-name" maxLength={40} value={name} onChange={event => setName(event.target.value)} /><button type="submit" disabled={name.trim().length === 0}>Entrar a la sala</button>{(error || session.error) && <p className="lobby-error" role="alert">{error || session.error}</p>}</form> : <div className="lobby-card create-card"><div><span className="eyebrow">JUGUEMOS EN GRUPO</span><h2>Creá una sala</h2><p>Vas a organizar la sala y compartir la invitación. No ocupás un lugar entre quienes juegan.</p></div><button onClick={() => session.create()}>Crear sala</button></div>)}
    {state.mode === 'organizer' && <div className="lobby-card room-card"><div className="room-details"><span className="eyebrow">SALA CREADA · {state.roomId}</span><h2>Invitá a quienes van a jugar</h2><p>Vos organizás; no ocupás uno de los seis lugares. {state.room.participants.filter(participant => participant.connected).length}/6 participantes conectados</p><div className="invite-row"><input aria-label="Enlace para compartir" readOnly value={state.inviteUrl} /><button onClick={() => copy(state.inviteUrl)}>{copied ? 'Copiado' : 'Copiar enlace'}</button></div><ParticipantList room={state.room} />{!state.connected && <p className="lobby-error" role="status">{state.retriesExhausted ? 'No se pudo recuperar la conexión. Recargá la página para volver a organizar la sala.' : 'Conexión interrumpida. Intentando recuperar la sala…'}</p>}{state.room.stage === 'waiting' ? <button aria-label="Iniciar partida" onClick={() => session.start()} disabled={!state.connected || state.retriesExhausted || state.room.participants.filter(participant => participant.connected).length < 2 || state.room.participants.filter(participant => participant.connected).length > 6}>Iniciar partida</button> : <p role="status">La partida comenzó: El Camino.</p>}</div>{qr && <img className="invite-qr" src={qr} alt="Código QR de invitación a la sala" />}</div>}
    {state.mode === 'player' && <div className="lobby-card player-card"><span className="eyebrow">SALA DE ESPERA · {state.roomId}</span><h2>Participantes</h2>{state.room.stage === 'camino' && <p role="status">La partida comenzó: El Camino.</p>}{!state.connected && <p className="lobby-error" role="status">{state.retriesExhausted ? 'Se agotaron los intentos de reconexión y se perdió tu lugar.' : 'Conexión interrumpida. Intentando volver a entrar…'}</p>}<ParticipantList room={room} />{state.retriesExhausted && <p>Volvé a abrir el enlace para sumarte nuevamente si todavía hay lugar.</p>}</div>}
  </section>;
}
function ParticipantList({ room }: { room?: { participants: { participantId: string; name: string; connected: boolean }[] } }) {
  return <ul className="participant-list">{room?.participants.map(participant => <li key={participant.participantId}><span>{participant.name}</span><span className={participant.connected ? 'presence connected' : 'presence'}>{participant.connected ? 'Conectado' : 'Desconectado'}</span></li>)}</ul>;
}
