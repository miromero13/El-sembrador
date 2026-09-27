# El Sembrador

**El Sembrador** es una carrera de supervivencia y cuidado de semillas en tiempo real diseñada para grupos de **2 a 6 jugadores**. Cada participante compite utilizando exclusivamente la pantalla de su teléfono móvil.

El objetivo principal es salvar la mayor cantidad de semillas a través de una serie de retos dinámicos y responder una trivia final para determinar quién logra cosechar la planta más grande y frondosa.

---

## 🕹️ Flujo del Juego Paso a Paso

```
 [1. Lobby] ➔ [2. El Camino] ➔ [3. El Pedregal] ➔ [4. Los Espinos] ➔ [5. La Buena Tierra] ➔ [6. Podio Final]

```

### 📲 1. La Entrada (El Lobby)

* **Mecánica:** Los jugadores escanean un código **QR** con sus teléfonos celulares.
* **Registro:** Cada participante ingresa su nombre y accede a una sala de espera virtual.
* **Inicio:** Una vez reunidos entre 2 y 6 jugadores, la partida inicia simultáneamente para todos.

---

### 🌱 2. Reto 1: El Camino (Acción)

* **Estado inicial:** Cada jugador empieza con **10 semillas** en pantalla.
* **Amenaza:** Inician oleadas de aves que vuelan desde los bordes del dispositivo directo hacia las semillas.
* **Acción:** Tocar rápidamente a las aves para espantarlas antes de que roben una semilla.
* **Avance:** Al finalizar el tiempo límite, el jugador pasa a la siguiente fase conservando únicamente las semillas salvadas.

---

### 🪨 3. Reto 2: El Pedregal (Memoria)

* **Muestreo:** Se presenta una cuadrícula de $5 \times 5$ donde se posicionan las semillas salvadas durante **3 segundos**.
* **Ocultamiento:** La cuadrícula se cubre por completo con imágenes de rocas.
* **Acción:** Tocar las casillas correctas recordando la ubicación de las semillas.
* **Avance:** Las semillas recuperadas con éxito formarán el **Contador de Vidas** para el próximo reto.

---

### 🌿 4. Reto 3: Los Espinos (Precisión)

* **Entorno:** Se despliega un camino estrecho delimitado por líneas de espinos.
* **Acción:** Mantener el dedo presionado sobre un brote en la parte inferior y arrastrarlo hacia arriba guiándolo por el sendero.
* **Penalización:** Colisionar con las paredes de espinos descuenta una unidad del **Contador de Vidas**.
* **Condición de victoria/eliminación:**
* ❌ Si el contador llega a cero antes de culminar el trayecto, el jugador queda **eliminado**.
* 🟢 Los jugadores que crucen la meta con al menos 1 vida avanzan a la etapa final.



---

### ✨ 5. Reto 4: La Buena Tierra (Trivia Final)

Las semillas supervivientes alcanzan tierra fértil. Se despliegan **2 preguntas de selección múltiple** basadas en la *Parábola del Sembrador*.

El rendimiento en la trivia determina directamente la calidad y escala del crecimiento visual de la planta:

| Respuestas Correctas | Resultado de la Planta | Indicador Visual |
| --- | --- | --- |
| **0 correctas** | Planta pequeña / Marchita | 🔴 |
| **1 correcta** | Planta de tamaño mediano | 🟡 |
| **2 correctas** | Planta grande, fuerte y hermosa | 🟢 |

---

### 🏆 6. Cierre y Determinación del Ganador

1. **Puntaje Final:** Se calcula multiplicando el número de semillas con las que se sobrevivió al laberinto de espinos por el factor de crecimiento de la planta obtenido en la trivia.
2. **Sincronización:** Las pantallas de todos los participantes muestran de forma simultánea el **Podio de Posiciones (1° al 6° lugar)**.
3. **Celebración:** La pantalla del jugador con la puntuación más alta despliega animaciones festivas celebrando la semilla que dio fruto al máximo porcentaje.