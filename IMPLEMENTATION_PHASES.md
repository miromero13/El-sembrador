# Fases de implementación — El Sembrador

Este documento es una hoja de ruta **de implementación, no de investigación**. El objetivo es publicar un juego web multijugador en tiempo real, para **2 a 6 participantes que juegan desde sus teléfonos**. Se entra a una sala por QR, se recorren Lobby → El Camino → El Pedregal → Los Espinos → La Buena Tierra → Podio Final, y todos reciben el resultado sincronizado. El diseño de referencia está en `El-Sembrador.op` (pantallas **Mobile Web** y variantes **Wide Web**); las reglas confirmadas están en `CONTEXT_PROJECT.md`. El diseño no sustituye las reglas del juego.

## Decisiones técnicas

| Área | Elección para implementar |
| --- | --- |
| Cliente | React + TypeScript + Vite; CSS adaptable a móvil, siguiendo el diseño de OpenPencil. |
| Servidor | Node.js + TypeScript + Fastify con `@fastify/websocket` (`ws`); expone WebSocket y health check. No sirve el cliente. |
| Organización | Dos proyectos independientes en la raíz: `web/` y `server/`, cada uno con su propio `package.json`, dependencias, scripts y despliegue. Sin `shared/`, `npm workspaces` ni `package.json` raíz. Los tipos y validaciones de mensajes que usa cada lado viven dentro de su respectiva carpeta; el protocolo se documenta y se prueba en ambos lados para detectar incompatibilidades. |
| Estado | Salas y partidas en memoria del proceso Node; **sin base de datos**, cuentas ni persistencia de resultados. |
| Tiempo real | WebSocket con `wss://` en producción. El servidor valida mensajes y es la autoridad de sala, etapas, semillas, vidas, respuestas y puntuación; el cliente dibuja el estado recibido. |
| Calidad | Vitest para reglas y protocolo; Playwright para recorridos con varios clientes y pruebas manuales en dos teléfonos. |
| Despliegue | `web/` se publica como sitio estático HTTPS y `server/` como servicio Node separado con WSS y conexiones WebSocket persistentes. La web conoce la URL pública del servidor mediante configuración de entorno. Una instancia de servidor para el MVP; no se promete escalado horizontal sin almacenamiento compartido. |

**Consecuencia importante:** reiniciar o redeplegar `server/` borra las salas y partidas activas; redeplegar solo `web/` no debe hacerlo. No agregar Redis ni otra base de datos para ocultar esta limitación: mostrar un aviso claro y permitir volver a entrar a una sala nueva. La URL del QR apunta a la web e incluye el identificador de sala, no datos personales ni secretos de administración. El servidor admite únicamente los orígenes web configurados y valida cada mensaje WebSocket; CORS para HTTP no sustituye esa comprobación de origen. La lógica temporal y las transiciones viven en el servidor para evitar que dos celulares discrepen.

## Cómo usar esta hoja de ruta

- Implementar **una fase completa por vez**, en orden. No marcar una casilla por haber creado archivos: cerrar la fase únicamente cuando funcionen sus entregables y pasen sus comprobaciones.
- Al terminar cada fase, la IA marca **solo su casilla** `- [x]`, anota debajo la fecha, comandos y resultados reales, y entrega un enlace o instrucciones concretas para que vos la pruebes. La casilla **«Probé yo»** queda reservada para vos; la IA no la marca en tu nombre. Un fallo deja la fase abierta.
- Los comandos `npm run dev`, `npm test`, `npm run build` (en cada carpeta) y `npm run test:e2e` (en `web/`) son **contratos a implementar en la fase 1**, no comandos que ya existan. En desarrollo se inicia cada proyecto en una terminal distinta y `web/` se conecta a la URL local de `server/`; en producción se conectan por WSS entre dominios diferentes. No hay proxy ni servidor común obligatorios.
- Si una regla pendiente bloquea una fase, pedir esa decisión antes de codificarla. No convertir placeholders del diseño en preguntas, tiempos, posiciones, multiplicadores ni resultados oficiales. Se pueden probar fases previas sin fingir que el juego entero ya está terminado.

## Fase 1 — Proyecto ejecutable y recorrido visual

**Implementar:** iniciar `web/` y `server/` como proyectos independientes con sus propios scripts de desarrollo/pruebas/build y configuración TypeScript. En `web/`, crear rutas de las seis pantallas, componentes base y estilos oliva del diseño; configurar la URL del WebSocket por entorno. En `server/`, agregar health check, validación de origen y conexión WebSocket mínima con mensaje de bienvenida validado. Definir y documentar el formato de ese mensaje en el servidor y comprobar su consumo en la web. Las pantallas posteriores pueden mostrar «En preparación», sin simular resultados.

**Entregable para probar:** ejecutar `npm install && npm run dev` primero en `server/` y luego en `web/`, en dos terminales; abrir la URL local de la web en un teléfono de la misma red y recorrer las seis rutas directamente. Usar una URL de servidor alcanzable desde el teléfono (no `localhost` del propio teléfono). Recargar `/pedregal` debe mostrar la app, no un 404. Ver el estado de conexión en pantalla.

**Comprobación de la IA:** `npm test` y `npm run build` pasan en **ambas** carpetas; una prueba abre y recarga todas las rutas y verifica la conexión entre proyectos. No afirmar que hay juego en tiempo real todavía.

- [x] IA: fase 1 implementada y comprobada.
- [x] Probé yo: navegación y aspecto móvil.

**Evidencia (2026-09-26):** `cd server && npm test && npm run build` pasó (2 pruebas); `cd web && npm test && npm run build` pasó (3 pruebas). `cd web && npm run test:e2e` pasó (2/2: seis rutas con recarga y conexión real al servidor con bienvenida validada), ejecutado por la usuaria y repetido por un verificador independiente. Smoke del servidor: health, bienvenida, origen no permitido y rechazo de mensajes no soportados. La revisión nativa de fiabilidad cerró aprobada con un aviso no bloqueante. No se probó aún el aspecto en un teléfono real; la casilla de la usuaria sigue abierta. No se hizo commit.

## Fase 2 — Salas y Lobby en tiempo real

**Implementar:** desde `/`, mostrar «Crear sala» para que quien la crea organice la partida **sin jugar ni ocupar uno de los seis lugares**; generar una sala temporal y mostrar URL y QR de invitación para que otras personas entren con su nombre. Mantener hasta 6 participantes y sincronizar la lista en todos los dispositivos. Validar nombres/mensajes en el servidor, generar identificadores no predecibles y rechazar salas inexistentes o llenas con un mensaje útil. Ante una desconexión, intentar reconectar hasta 3 veces con la identidad de ese participante; si no se logra, retirarlo de la sala y reflejarlo en las listas. No iniciar ni finalizar partidas en esta fase; reservar esos controles para las fases 3 y 7.

**Entregable para probar:** abrir la sala en dos teléfonos (o dos navegadores aislados), escanear el QR, ingresar dos nombres y ver ambas listas actualizarse sin recargar. Probar una séptima conexión y un código de sala inválido.

**Comprobación de la IA:** pruebas de espera con 1 persona, capacidad máxima de 6, validación y emisión de estado a todos los clientes; build y prueba de dos clientes. Todavía no iniciar una partida por una condición asumida.

- [x] IA: fase 2 implementada y comprobada.
- [x] Probé yo: invitación, nombres y sincronización.

**Evidencia (2026-09-26):** `cd server && npm test && npm run build` pasó (7 pruebas); `cd web && npm test && npm run build` pasó (9 pruebas); `cd web && npm run test:e2e` pasó (6/6, con servidor real: invitación en dos navegadores, sala inexistente/llena, seis plazas, recarga y desconexión/reconexión sin duplicados). Las salas y sus credenciales viven en memoria del servidor; reiniciarlo borra todas las salas. La imagen QR se renderiza y la URL se valida; escanearla en un teléfono real queda para tu prueba. **Pendiente para la fase 3:** recuperar la identidad de quien organiza tras recargar o desconectarse, antes de habilitar «Iniciar partida». No se hizo commit.

## Fase 3 — Inicio sincronizado y El Camino individual

**Implementar:** recuperar de forma segura la identidad de quien organiza tras recargar o reconectar. Darle el botón «Iniciar partida» solo con 2–6 participantes; todos entran a Camino al mismo tiempo y nadie nuevo puede unirse después (sí pueden reconectar participantes existentes, hasta 3 intentos por desconexión). Cada jugador empieza con **10 semillas** y enfrenta **8 aves en su propia pantalla**. Aparecen en **seis tandas con superposición al final**: una ave de 6 s, otra de 5 s, una de 4 s que aparece 3 s después de la segunda, dos juntas de 4 s que aparecen 3 s después, otras dos juntas de 4 s que aparecen 2 s después y una última de 3 s que aparece 1 s después. Los intervalos se cuentan desde la aparición de la tanda anterior; espantar un ave no adelanta las demás. No hay tiempo límite ni cuenta regresiva global de finalización. Las 10 semillas quedan en **una única fila baja, dentro de la tierra**. Cada ave entra **desde arriba, por la izquierda o por la derecha, siempre por encima de la tierra y nunca a la altura de las semillas**, y vuela hacia una semilla: tocarla la espanta; si llega a la semilla, roba **exactamente una** y desaparece. Se usan `/pajaro-derecha.png` cuando se dirige a la derecha, `/pajaro-izquierda.png` cuando se dirige a la izquierda (también para entradas desde arriba), y `/semilla.png` para las semillas, sin modificar las imágenes originales. El círculo del botón táctil de las aves debe ser **transparente e invisible**, sin fondo ni sombra circular; se conserva el área de toque y el foco accesible. El servidor determina aparición, trayectoria, toque válido, llegada y semillas restantes; descarta toques duplicados o tardíos. **Cada jugador pasa a la pantalla de Pedregal cuando se resuelve su última ave**, sin esperar a los demás; la mecánica de Pedregal llega en la fase 4. El inicio es común, el final es individual.

**Entregable para probar:** iniciar una sala de 2–6 participantes desde la vista de organización, jugar Camino en dos teléfonos y observar que tocar aves salva semillas, dejar que lleguen las pierde de a una y cada pantalla avanza a Pedregal tras su octava ave, aunque la otra persona todavía siga jugando. Probar recarga de la organizadora, rechazo de nuevos ingresos tras el inicio y reconexión de alguien que ya participaba.

**Antes de completar:** esta secuencia exacta reemplaza tanto el «tiempo límite» inicial como los intervalos aleatorios y el reparto de velocidades anteriores. Las tandas comienzan a los 0, 6, 9, 12, 14 y 15 segundos; sin toques, las últimas aves terminan a los 18 s. Cada jugador conserva sus ocho objetivos y su finalización individual; no se agregan puntos, vidas ni penalizaciones.

**Comprobación de la IA:** pruebas de autorización de organización, 2–6 al iniciar, rechazo de altas tardías, 10 semillas y 8 aves por jugador, robo de una semilla por ave, toque válido/duplicado/tardío, finalización individual al resolver la octava y reconexión; E2E de dos clientes con servidor real.

- [x] IA: fase 3 implementada y comprobada con ocho aves en tandas superpuestas.
- [x] Probé yo: Camino con dos participantes.

**Evidencia (2026-09-26):** `cd server && npm test && npm run build` pasó (16 pruebas); `cd web && npm test && npm run build` pasó (16 pruebas); `cd web && npm run test:e2e` pasó (8/8, con servidor real; Camino duró aproximadamente 1,2 minutos). Dos jugadores iniciaron juntos: uno espantó 1 ave y perdió 7 semillas (terminó con 3), el otro perdió 8 (terminó con 2); ambos llegaron **automáticamente e individualmente** a la pantalla placeholder de Pedregal tras su octava ave. Se comprobó recarga de la organizadora, bloqueo de ingresos tardíos y reconexión de participantes existentes; un spot-check independiente repitió 16/16 pruebas del servidor. El parámetro `survivors` de la URL solo muestra el resultado en el placeholder y **no es autoridad de juego**; Pedregal jugable corresponde a la fase 4.

**Cierre tras corrección (2026-09-26):** la organizadora también se recupera de un corte de WebSocket con hasta 3 reintentos; «Iniciar partida» queda deshabilitado hasta autenticarla de nuevo. Al recargar se recupera la sala activa, no una credencial antigua. La verificación independiente final pasó: `cd server && npm test && npm run build` (16/16), `cd web && npm test && npm run build` (20/20), `cd web && npm run test:e2e` (10/10; juego real ~1,2 minutos). Spot-check `cd web && npm test`: 20/20. **Revisión solicitada después:** acelerar aparición/vuelo, alinear las 10 semillas sobre la tierra, limitar las aves a izquierda/derecha y sustituir emoji por los tres PNG de `web/public/`. La casilla de la IA se reabrió hasta verificar esos cambios. Queda pendiente tu prueba táctil y visual en teléfonos reales. No se hizo commit.

**Cierre de la revisión de ritmo e imágenes (2026-09-27):** semillas en una única fila al 84% del campo, dentro de la franja de tierra; ocho aves por jugador desde izquierda/derecha, intervalos variables de 3–5 s y vuelos de 3 s. Se sirven los tres PNG originales de `web/public/`, orientados hacia las semillas. Verificación independiente: `cd server && npm test && npm run build` (18/18), `cd web && npm test && npm run build` (22/22), `cd web && npm run test:e2e` (10/10 en dos ejecuciones completas). El E2E real usó dos tamaños táctiles (390×844 y 320×640), comprobó posiciones en tierra y en pantalla sin desplazamiento inicial, carga HTTP 200 de los tres recursos, un espanto confirmado por el estado del servidor, una semilla robada y avances individuales a Pedregal. El primer pase independiente detectó un toque de prueba no confirmado; se corrigió el test para exigir resolución sin pérdida de semillas y se repitió satisfactoriamente. Spot-check adicional `cd web && npm test`: 22/22. La prueba manual en teléfonos sigue sin marcar y no se hizo commit.

**Corrección visual posterior (2026-09-27):** las aves ya no nacen horizontalmente en la fila de semillas: cada recorrido incluye entradas desde arriba y ambos costados por encima de la tierra, dirigidas hacia su objetivo. Las imágenes con alfa se muestran sin disco ni sombra detrás; el botón táctil conserva su área circular transparente de 52×52 y un foco visible para teclado. La verificación independiente pasó dos rondas completas: `cd server && npm test && npm run build` (18/18 y build en ambas), `cd web && npm test && npm run build` (22/22 y build en ambas), `cd web && npm run test:e2e` (10/10 en ambas; móviles simulados 390×844 y 320×640, tres PNG cargados, fondo calculado transparente, espanto confirmado por el servidor, robo y avances individuales). Spot-check adicional `cd web && npm test`: 22/22. Seguimiento en `odd/tasks/camino-aerial-transparent-birds.md`. La casilla de la IA se cerró; tu prueba táctil/visual en teléfonos reales sigue abierta. Sin commit.

**Ajuste final de velocidad (2026-09-27):** las primeras dos aves **de cada jugador** vuelan durante 5 s; las seis siguientes mantienen 3 s. La frecuencia de aparición no cambia. Verificación independiente: `cd server && npm test && npm run build` (19/19 + build), `cd web && npm run test:e2e` (10/10 con partida real de dos jugadores, espanto, robo y avances individuales). La prueba manual en teléfonos sigue abierta; sin commit.

**Secuencia anterior de seis tandas (2026-09-27; reemplazada después):** reemplaza el calendario aleatorio y la división anterior de velocidades. Por jugador: `1×5 s → 1×5 s → 1×4 s → 2×4 s → 2×4 s → 1×3 s`, con entradas en 0, 5, 10, 14, 18 y 22 s; las aves de una pareja aparecen juntas y la última se resuelve a los 25 s sin toques. Un espanto temprano no adelanta la siguiente tanda. Verificación independiente: `cd server && npm test && npm run build` (20/20 + build), `cd web && npm test && npm run build` (22/22 + build) y `cd web && npm run test:e2e` (10/10; dos jugadores móviles simulados, espanto, robo y llegadas individuales a Pedregal). Spot-check `cd server && npm test`: 20/20. Seguimiento en `odd/tasks/camino-six-wave-pacing.md`. Tu prueba en teléfonos reales sigue abierta. Sin commit.

**Corrección de tandas superpuestas (2026-09-27):** la usuaria añadió la tercera ave individual y ajustó los intervalos: por jugador hay `1×6 s` en t=0, `1×5 s` en t=6, `1×4 s` en t=9, `2×4 s` en t=12, `2×4 s` en t=14 y `1×3 s` en t=15; las últimas tandas se solapan y, sin toques, las ocho aves terminan a los 18 s. Los intervalos se cuentan desde la aparición previa y espantar un ave no adelanta las siguientes. Verificación independiente: `cd server && npm test && npm run build` (20/20 + build), `cd web && npm test && npm run build` (22/22 + build), `cd web && npm run test:e2e` (10/10, dos jugadores móviles simulados con espanto, robo y avance individual). Spot-check `cd server && npm test -- --run test/camino.test.ts`: 9/9. Evidencia de trabajo en `odd/tasks/camino-overlapping-waves.md`. Tu prueba en teléfonos reales sigue abierta; sin commit.

## Fase 4 — El Pedregal

**Implementar:** trasladar las semillas que cada jugador salvó, ubicarlas en una cuadrícula 5×5, mostrarlas exactamente 3 segundos y cubrir todas las casillas con rocas. Procesar selecciones en el servidor sin permitir recuperar la misma semilla dos veces. Convertir las semillas efectivamente recuperadas en vidas para Espinos; la disposición visible en `El-Sembrador.op` es ilustrativa, no una posición fija de producción.

**Entregable para probar:** llegar desde Camino con cantidades distintas de semillas, observar 3 segundos de vista previa, tocar casillas y ver el contador de vidas correcto en dos teléfonos.

**Reglas acordadas para esta fase:** tocar una casilla equivocada consume un intento y no da vida. Cada jugador tiene tantos intentos como semillas salvó en Camino; termina al agotarlos o al recuperar todas sus semillas. Una casilla ya descubierta no se puede volver a seleccionar para obtener otra vida.

**Comprobación de la IA:** pruebas del tiempo de vista previa, grilla 5×5, toques repetidos, conteo de recuperadas y transición con las reglas aprobadas; recorrido desde fase 3.

- [x] IA: fase 4 implementada y comprobada.
- [x] Probé yo: memoria y vidas transferidas.

**Evidencia de fase 4:** `cd server && npm test && npm run build` pasó (26/26 pruebas y build); `cd web && npm test && npm run build` pasó (24/24 pruebas y build); `cd web && npm run test:e2e` pasó (11/11, incluidos dos clientes WebSocket que completan Camino y reciben tableros Pedregal independientes). El servidor deriva intentos y semillas sobrevivientes de Camino; el parámetro `survivors` no controla el juego. La prueba manual en teléfonos queda pendiente. No se hizo commit.

## Fase 5 — Los Espinos: laberinto muy sencillo

**Implementar:** un **laberinto muy sencillo cuyas paredes son de espinas y cuya meta es La Buena Tierra**. En `web/`, mostrar el laberinto y permitir mantener y arrastrar el grupo de semillas por su recorrido con control táctil claro en móvil; adaptar la presentación a web amplia sin cambiar la prioridad del juego. En `server/`, validar el recorrido y el contacto con las paredes de espinas: cada colisión registrada resta una semilla, sin descontar varias por un único contacto sostenido. Llegar a la meta con al menos una semilla permite avanzar a La Buena Tierra; llegar a cero elimina al jugador. Mostrar claramente la llegada o la eliminación.

**Entregable para probar:** dos participantes con vidas diferentes llegan desde Pedregal y recorren el laberinto; tocar una pared de espinas resta una vida, llegar a la meta con vida permite pasar a La Buena Tierra y quedarse sin vidas antes de llegar elimina al jugador.

**Reglas confirmadas:** laberinto serpenteante corto; un contacto sostenido con espinas cuenta una vez y otra pérdida requiere salir y volver a entrar; cada participante avanza o es eliminado de forma independiente, sin barrera grupal.

**Comprobación de la IA:** pruebas de contacto sostenido con paredes, decremento, cero vidas y llegada a La Buena Tierra con vida restante; prueba táctil en un dispositivo real y recorrido desde el Lobby.

- [x] IA: fase 5 implementada y comprobada.
- [ ] Probé yo: laberinto, paredes de espinas y llegada a La Buena Tierra.

**Evidencia automatizada (2026-09-27):** `cd server && npm test && npm run build` pasó (34 pruebas y build); `cd web && npm test && npm run build` pasó (26 pruebas y build); `cd web && npm run test:e2e` pasó (12/12, incluidos dos clientes reales del navegador: ambos entraron a Espinos independientemente y uno llegó a La Buena Tierra sin adelantar al otro). La prueba de regresión confirma que repetir el envío de una coordenada lejana no permite teletransportarse ni avanzar; el recorrido válido llega a la meta. A pedido de la usuaria, los bordes ahora muestran espinas triangulares repetidas, cuya base coincide con el límite de colisión del servidor; cada contacto reduce una semilla del contador existente una sola vez. Una verificación independiente repitió los tres comandos y confirmó estas reglas. La evaluación nativa de riesgo no pudo producir un candidato porque el repositorio aparece enteramente como archivos sin seguimiento; RDD quedó sin cierre nativo. La prueba manual en teléfonos sigue pendiente. No se hizo commit.

## Fase 6 — La Buena Tierra

**Implementar:** cada participante que completa Los Espinos recibe exactamente dos preguntas de opción múltiple, seleccionadas individualmente: una aleatoria de Mateo primero y otra aleatoria de la parábola después. Las fuentes aprobadas son `web/preguntas-mateo.json` y `web/preguntas-parabola.json`, replicadas como datos de servidor con prueba de paridad. Aceptar una respuesta por pregunta, corregirla solo en el servidor y no enviar la respuesta correcta antes de responder. Mostrar 0 correctas → `/planta-marchita.png`; 1 → `/planta-mediana.png`; 2 → `/planta-grande.png`, sobre el estilo de tierra de Camino. Cada participante avanza y termina independientemente, sin barrera de grupo ni sesión WebSocket competidora. No agregar multiplicadores ni podio de fase 7.

**Entregable para probar:** recorrer con dos participantes y terminar la trivia de uno mientras el otro permanece en una etapa previa; comprobar selección ordenada, corrección, estado de planta y reconexión sin volver a sortear.

**Comprobación de la IA:** pruebas de selección/paridad, opciones, ocultamiento de respuestas, aceptación única, reconexión, UI y progreso individual con dos clientes.

- [x] IA: fase 6 implementada y comprobada.
- [ ] Probé yo: preguntas y crecimiento de planta.

**Evidencia automatizada:** `cd server && npm test && npm run build` pasó (39 pruebas y build); `cd web && npm test && npm run build` pasó (28 pruebas y build); `cd web && npm run test:e2e` pasó (13/13, incluyendo dos participantes reales en navegador: uno completó Espinos y trivia mientras el otro permaneció en Espinos). Los datos del servidor se comprueban byte por byte contra las dos fuentes web. La trivia almacena selecciones y respuestas en memoria por participante y las recupera al reconectar; las respuestas correctas nunca se incluyen en los mensajes. No se agregó puntaje/podio. La prueba manual en teléfonos sigue pendiente; no se hizo commit.

## Fase 7 — Puntaje y Podio Final

**Implementar:** calcular en el servidor `semillas restantes al completar Espinos × 100 + preguntas respondidas × 100`, ordenar resultados y enviar el mismo podio sincronizado a todos cuando cada participante esté terminal (completó ambas preguntas o fue eliminado). Las respuestas cuentan aunque sean incorrectas; la corrección solo controla el crecimiento de la planta. Los empates comparten puesto y se salta el siguiente; quien fue eliminado antes de completar Espinos figura con 0 puntos y marcado como eliminado. Mostrar solo participantes reales. Cada persona conserva su progreso individual y puede esperar en el podio mientras las demás avanzan. Dar a quien creó la sala un botón «Finalizar partida» después del podio: limpia los datos de esa ronda, conserva a quienes siguen conectados y vuelve al Lobby para poder iniciar otra partida. Todo permanece en memoria durante la vida de la sala; no agregar persistencia.

**Entregable para probar:** terminar una partida con 2–6 jugadores y comparar en cada pantalla el mismo orden y puntaje; verificar la celebración del ganador y repetir con una persona eliminada.

**Reglas confirmadas:** 100 puntos por cada semilla al completar Espinos y 100 puntos por cada pregunta respondida, independientemente de si fue correcta; empates comparten puesto y el siguiente puesto se salta; eliminados antes de completar Espinos aparecen con 0 puntos; se listan únicamente participantes reales. El podio se publica cuando todos los participantes tienen resultado terminal; la organización puede finalizar luego y conservar participantes conectados para repetir la partida.

**Comprobación de la IA:** pruebas de fórmula, puestos compartidos, eliminaciones, participantes reales, progreso individual y autorización/reset de organización; E2E con dos clientes y repetición de ronda.

- [x] IA: fase 7 implementada y comprobada.
- [ ] Probé yo: resultados y ganador.

**Evidencia automatizada de fase 7:** `cd server && npm test && npm run build` pasó (44 pruebas y build); `cd web && npm test && npm run build` pasó (31 pruebas y build); `cd web && npm run test:e2e` pasó (14/14, incluyendo partida completa de dos participantes con resultado terminal por trivia/eliminación, podio sincronizado, autorización de cierre y repetición de ronda). Pruebas de puntaje y empate cubren salas de 2–6 participantes; el protocolo confirma rechazo de finalización no autorizada. Todo el estado y los resultados permanecen en memoria. La prueba manual de la fase 7 sigue pendiente; la casilla manual de la fase 6 no se modificó. No se hicieron commits.

## Fase 8 — Resiliencia mínima y despliegue web

**Implementar:** manejar cierre/reconexión de WebSocket con un resumen autoritativo de la sala, evitar que un reintento duplique acciones, detectar reinicio de servidor y ofrecer retorno claro al Lobby. Añadir logs sin respuestas ni datos sensibles y builds de producción independientes. Publicar `web/` en un origen HTTPS con fallback de rutas y `server/` en otro origen con WSS; configurar en la web la URL pública del servidor y en el servidor la lista explícita de orígenes web admitidos. Documentar variables de entorno, inicio de cada servicio y la limitación de memoria volátil. No prometer que una partida persiste tras redeploy.

**Entregable para probar:** URL pública y QR: jugar la partida completa en dos teléfonos por red móvil/Wi-Fi distintos; recargar un cliente, cortar y recuperar conexión, y verificar el resultado. Tras reiniciar el servidor, comprobar que se avisa de que la sala anterior ya no existe.

**Comprobación de la IA:** `npm test` y `npm run build` pasan por separado en `web/` y `server/`; `npm run test:e2e` pasa en `web/`. Hacer smoke test en las dos URL públicas y prueba manual de conexión entre orígenes, desconexión/reinicio y QR con resultados anotados. Si el proveedor del servidor no mantiene WebSockets estables, la fase no se marca completa.

- [ ] IA: fase 8 implementada y comprobada.
- [ ] Probé yo: partida pública completa y recuperación.

## Reglas pendientes que no debe decidir la IA

Las decisiones de producto de las fases 4–7 ya quedaron registradas: reglas de Pedregal, colisiones y avance individual de Espinos, fuentes/orden de trivia y reglas de puntaje/podio. La fase 8 aún requerirá confirmar los destinos públicos, orígenes permitidos y valores de entorno concretos del despliegue antes de publicar. No inferir URLs ni credenciales de producción. Las casillas de prueba manual siguen siendo responsabilidad de la usuaria; no marcarlas sin su confirmación explícita.
