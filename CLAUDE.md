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

`game.js` es un único script global (`'use strict'`, sin módulos), cargado con `<script src="game.js">` al final del `<body>`. Llama a `init()` en la última línea, así que el juego arranca solo al cargar la página. El estado vive en variables de módulo declaradas en una sola línea (`board, current, next, score, ...`); `init()` las reinicia todas y también sirve de handler del botón *Reiniciar*.

### Alineación de índices (crítico)

`PIECES[t]` y `COLORS[t]` comparten el mismo índice `t` de 1 a 7, y **ambos arrays tienen `null` en la posición 0** para que `0` signifique "celda vacía". Las matrices de cada pieza están rellenas con su propio número de tipo (la T contiene `3`, la S contiene `4`…), no con `1`. Ese número se copia tal cual al tablero en `merge()` y `drawBlock()` lo usa como índice de color. Al añadir o reordenar piezas hay que mantener las tres cosas sincronizadas: posición en `PIECES`, valor dentro de la matriz, y color en `COLORS`.

### Tablero y render

`board` es `ROWS × COLS` de enteros. `draw()` repinta todo cada frame en este orden: `clearRect` → rejilla → bloques fijados → *ghost* (con `alpha 0.2`) → pieza actual. `drawBlock()` es el único punto de dibujo y siempre restaura `globalAlpha = 1` al salir.

Las dimensiones del canvas están **hardcodeadas en `index.html`** (`width="300" height="600"`). Si cambias `COLS`, `ROWS` o `BLOCK` en `game.js`, tienes que actualizar esos atributos a `COLS × BLOCK` y `ROWS × BLOCK`. Lo mismo para `#next-canvas` (120×120 = 4×4 celdas de `NB = 30`, valor local de `drawNext()`, no la constante `BLOCK`).

### Rotación

`rotateCW()` transpone e invierte filas. `tryRotate()` implementa *wall kicks* caseros probando desplazamientos `[0, -1, 1, -2, 2]` en X; **no es SRS**, no hay estado de rotación ni tabla de patadas por pieza. Si la rotación falla en las cinco posiciones, se descarta silenciosamente.

### Bucle y ciclo de vida

`loop(ts)` acumula `dt` en `dropAccum` y baja una fila cuando supera `dropInterval`; si la bajada colisiona llama a `lockPiece()` (`merge` → `clearLines` → `spawn`). **No hay *lock delay*:** la pieza se fija en el instante en que toca.

Solo existe un `animId` vivo. `togglePause()` al reanudar resetea `lastTime = performance.now()` antes de relanzar `loop` — omitir eso produciría un `dt` gigante y una caída inmediata. `init()` hace `cancelAnimationFrame(animId)` antes de pedir uno nuevo para no duplicar bucles al reiniciar.

Quirk conocido: `endGame()` cancela el frame actual, pero se invoca desde `spawn()` *dentro* de `loop`, que después vuelve a llamar a `requestAnimationFrame`. El bucle sigue vivo tras el Game Over; solo queda inerte porque el handler de `keydown` filtra por `gameOver`. Tenerlo en cuenta si se toca el flujo de fin de partida.

### Puntuación y nivel

`LINE_SCORES = [0,100,300,500,800]` indexado por líneas eliminadas, multiplicado por el nivel **anterior** (`clearLines()` puntúa antes de recalcular `level`). Hard drop suma 2 por celda, soft drop 1 por fila. `level = floor(lines/10) + 1`, `dropInterval = max(100, 1000 - (level-1)*90)`.

`clearLines()` recorre de abajo arriba con `splice` + `unshift` y compensa con `r++` tras eliminar una fila, porque el array se desplaza bajo el índice.

### DOM

Todos los nodos se capturan una vez al cargar mediante `getElementById`. `updateHUD()` es el único que escribe en el HUD y se llama al final de cada `keydown` además de en `clearLines()`. El overlay se muestra/oculta con la clase `hidden`; su texto lo fijan `endGame()` y `togglePause()`.
