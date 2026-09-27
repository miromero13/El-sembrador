import { useEffect, useMemo, useState } from 'react';
import { EspinosSession, type EspinosSessionState } from './espinos-session';

const plants = ['/planta-marchita.png', '/planta-mediana.png', '/planta-grande.png'];
export function BuenaTierra({ roomId, session: sharedSession, sharedState }: { roomId: string; session?: EspinosSession; sharedState?: EspinosSessionState }) {
  const [localState, setLocalState] = useState<EspinosSessionState>({ status: 'connecting' });
  const ownedSession = useMemo(() => new EspinosSession(roomId, setLocalState), [roomId]);
  const session = sharedSession ?? ownedSession;
  const state = sharedState ?? localState;
  useEffect(() => { if (!sharedSession) { ownedSession.connect(); return () => ownedSession.dispose(); } }, [ownedSession, sharedSession]);
  if (state.status === 'error') return <section className="buena-tierra-card" aria-label="La Buena Tierra"><p role="alert">{state.message}</p></section>;
  const trivia = state.trivia;
  if (!trivia) return <section className="buena-tierra-card" aria-label="La Buena Tierra"><p role="status">Recuperando tu crecimiento…</p></section>;
  const questionIndex = trivia.answers.findIndex(answer => answer === null);
  const plant = plants[trivia.correct];
  return <section className="buena-tierra-card" aria-label="La Buena Tierra">
    <div className="buena-tierra-heading"><div><span className="eyebrow">LA BUENA TIERRA</span><h2>{trivia.complete ? 'Tu planta creció' : `Pregunta ${questionIndex + 1} de 2`}</h2></div><strong className="trivia-score" aria-label="Respuestas correctas">{trivia.correct}/2</strong></div>
    <div className="buena-tierra-field"><span className="field-sun" aria-hidden="true">☀</span><div className="field-soil" /><img className="trivia-plant" src={plant} alt={['Planta marchita', 'Planta mediana', 'Planta grande'][trivia.correct]} /></div>
    {trivia.complete ? <p className="trivia-result" role="status">Respuestas correctas: {trivia.correct} de 2.</p> : <div className="trivia-question"><h3>{trivia.questions[questionIndex].pregunta}</h3><div className="trivia-options" role="group" aria-label="Opciones de respuesta">{trivia.questions[questionIndex].opciones.map((option, optionIndex) => {
      const letter = (['A', 'B', 'C'] as const)[optionIndex];
      return <button key={letter} type="button" onClick={() => session.answer(questionIndex, letter)}>{option}</button>;
    })}</div></div>}
  </section>;
}
