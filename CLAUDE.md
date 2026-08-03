# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Tetris en JavaScript vanilla con HTML5 Canvas. **Sin `package.json`, sin dependencias, sin bundler, sin transpilador, sin tests, sin linter.** Tres archivos: `index.html`, `style.css`, `game.js`.

Idioma del proyecto: español (README, comentarios, textos de UI).

## Ejecutar

```bash
start index.html                # Windows, abrir directo
python3 -m http.server 8000     # servidor local (recomendado)
npx serve .
```

No hay build ni watch: guardar el archivo y recargar el navegador.

## Arquitectura

`game.js` es un único script global (`'use strict'`, sin módulos), cargado con `<script src="game.js">` al final del `<body>`. El estado vive en variables de módulo declaradas en una sola línea (`board, current, next, score, ...`); `init()` las reinicia todas y también sirve de handler de los botones *Reiniciar* y *JUGAR*.

**El juego no arranca solo.** La última línea deja `gameOver = true` y llama a `mostrarPantallaInicio()`; `init()` se dispara desde el botón JUGAR. El `gameOver = true` inicial no es cosmético: mantiene el handler de `keydown` inerte hasta que hay partida, porque sin él una flecha antes de jugar revienta con `current` undefined.

Hay tres claves de `localStorage`, todas aplicadas por funciones con la misma forma (`applyX` → validar → clase en `<body>` → sincronizar el control → `setItem`): `tetris-theme` (`applyTheme`), `tetris-skin` (`applySkin`) y `tetris-initial-level` (`applyInitialLevel`). Los records viven aparte en `tetris-records`. Todas parsean defensivamente: el usuario puede tener basura guardada.

### Alineación de índices (crítico)

`PIECES[t]` y `COLORS[t]` comparten el mismo índice `t` de 1 a 8, y **ambos arrays tienen `null` en la posición 0** para que `0` signifique "celda vacía". Las matrices de cada pieza están rellenas con su propio número de tipo (la T contiene `3`, la S contiene `4`…), no con `1`. Ese número se copia tal cual al tablero en `merge()` y `drawBlock()` lo usa como índice de color. Al añadir o reordenar piezas hay que mantener las tres cosas sincronizadas: posición en `PIECES`, valor dentro de la matriz, color en `COLORS`, y el rango de `randomPiece()` (`Math.random() * 8`).

El tipo `8` es la **tuerca**: un anillo 3×3 cuyo `0` central es el agujero, no relleno sobrante. Es la única pieza con un hueco interior; deja un agujero de una celda al fijarse y es simétrica bajo `rotateCW()`, así que rotarla nunca cambia nada.

### Tablero y render

`board` es `ROWS × COLS` de enteros. `draw()` repinta todo cada frame en este orden: `clearRect` → rejilla → bloques fijados → *ghost* (con `alpha 0.2`) → pieza actual. `drawBlock()` es el único punto de dibujo y siempre restaura `globalAlpha = 1` al salir.

`drawBlock()` no pinta: delega en `SKINS[currentSkin].draw`, manteniendo la firma `(context, x, y, colorIndex, size, alpha)`. Cada skin (`retro`, `neon`, `pastel`, `pixel`) trae su propia paleta `colors` — con el mismo `null` en la posición 0 que `COLORS` — más `grid: { dark, light }`, que es de donde `drawGrid()` saca el color de la rejilla. `retro` reusa `COLORS`/`GRID_COLORS` y es la referencia de no-regresión.

Toda función de skin debe restaurar el estado del contexto al salir, no solo `globalAlpha`: `neon` usa `shadowBlur`/`shadowColor` y si no los vuelve a 0 el glow sangra a la rejilla y al preview. Las funciones se llaman con `size` variable (`BLOCK` en el tablero, `NB = 30` en `drawNext()`) y con `alpha` parcial para el ghost.

`applySkin()` fuerza el repintado a mano (`draw()`/`drawBoardOnly()` + `drawNext()`) porque el bucle no corre en pausa ni en game over, y el cambio de skin tiene que verse igual.

Las dimensiones del canvas están **hardcodeadas en `index.html`** (`width="300" height="600"`). Si cambias `COLS`, `ROWS` o `BLOCK` en `game.js`, tienes que actualizar esos atributos a `COLS × BLOCK` y `ROWS × BLOCK`. Lo mismo para `#next-canvas` (120×120 = 4×4 celdas de `NB = 30`, valor local de `drawNext()`, no la constante `BLOCK`).

### Rotación

`rotateCW()` transpone e invierte filas. `tryRotate()` implementa *wall kicks* caseros probando desplazamientos `[0, -1, 1, -2, 2]` en X; **no es SRS**, no hay estado de rotación ni tabla de patadas por pieza. Si la rotación falla en las cinco posiciones, se descarta silenciosamente.

### Bucle y ciclo de vida

`loop(ts)` acumula `dt` en `dropAccum` y baja una fila cuando supera `dropInterval`; si la bajada colisiona llama a `lockPiece()` (`merge` → `clearLines` → `spawn`). **No hay *lock delay*:** la pieza se fija en el instante en que toca.

Solo existe un `animId` vivo. `togglePause()` al reanudar resetea `lastTime = performance.now()` antes de relanzar `loop` — omitir eso produciría un `dt` gigante y una caída inmediata. `init()` hace `cancelAnimationFrame(animId)` antes de pedir uno nuevo para no duplicar bucles al reiniciar.

Quirk conocido: `endGame()` cancela el frame actual, pero se invoca desde `spawn()` *dentro* de `loop`, que después vuelve a llamar a `requestAnimationFrame`. El bucle sigue vivo tras el Game Over; solo queda inerte porque el handler de `keydown` filtra por `gameOver`. Tenerlo en cuenta si se toca el flujo de fin de partida.

`endGame()` además decide si la puntuación entra al top 5: si entra muestra el formulario de nombre y resalta la fila, si no muestra la tabla sola.

### Puntuación y nivel

`LINE_SCORES = [0,100,300,500,800]` indexado por líneas eliminadas, multiplicado por el nivel **anterior** (`clearLines()` puntúa antes de recalcular `level`). Hard drop suma 2 por celda, soft drop 1 por fila.

El nivel parte de `initialLevel` (selector del menú de pausa, 1–15): `level = initialLevel + floor(lines/10)`, y la velocidad sale siempre de `speedForLevel(lv)` = `max(100, 1000 - (lv-1)*90)`. Ojo con volver a la fórmula vieja `floor(lines/10) + 1`: devuelve la partida a nivel 1 al limpiar la primera línea cuando elegiste un nivel inicial mayor.

`clearLines()` recorre de abajo arriba con `splice` + `unshift` y compensa con `r++` tras eliminar una fila, porque el array se desplaza bajo el índice. También lleva las stats de records: `combo` sube con cada bloqueo que limpia al menos una línea y se resetea a 0 en la rama `else` (pieza fijada sin limpiar nada); `maxCombo` y `maxLines` guardan los máximos de la partida.

### DOM

Todos los nodos se capturan una vez al cargar mediante `getElementById`. `updateHUD()` es el único que escribe en el HUD y se llama al final de cada `keydown` además de en `clearLines()`.

Hay dos overlays: `#start-screen` (pantalla de inicio con el top 5) y `#overlay`, que se reutiliza para pausa y game over. Ambos se muestran/ocultan con la clase `hidden`, cuya regla global lleva `!important`. Dentro de `#overlay` conviven tres vistas mutuamente excluyentes — `#pause-menu`, `#controls-view` y `#gameover-extra` — que se alternan con la misma clase.

### Handler de `keydown` (el orden importa)

El handler global sigue tres guardas en este orden, y cambiarlo rompe cosas:

1. Si `e.target` es un `<input>` que no es checkbox, `return`. Va **primero** para que escribir el nombre del record no dispare atajos: sin esto, teclear una "P" en el campo pausaría la partida.
2. `KeyP` / `Escape` → `togglePause()` y `return`.
3. `menuOpen || paused || gameOver` → `return`. Con el menú abierto ninguna tecla llega al juego; así no se cuela un movimiento al reanudar.

`togglePause()` al reanudar oculta el overlay y resetea `lastTime`; reanudar también se puede por click en el botón, no solo por tecla.
