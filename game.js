'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // Tuerca - acero
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (el 0 central es el agujero)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const GRID_COLORS = { dark: '#22222e', light: '#c8c8d8' };
const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

// Cada skin define su propia paleta (con null en la posición 0, igual que COLORS),
// los colores de la rejilla por tema y la función que pinta un bloque.
// Las funciones drawSkin* se declaran más abajo (hoisting de function declarations).
const SKINS = {
  retro: {
    colors: COLORS,
    grid: GRID_COLORS,
    draw: drawSkinRetro,
  },
  neon: {
    colors: [
      null,
      '#00f5ff', // I
      '#ffe600', // O
      '#ff2bd6', // T
      '#39ff14', // S
      '#ff1f4f', // Z
      '#2979ff', // J
      '#ff8a00', // L
      '#d6e4ff', // Tuerca
    ],
    grid: { dark: '#1c1c33', light: '#2a2a4d' },
    draw: drawSkinNeon,
  },
  pastel: {
    colors: [
      null,
      '#a8e6ef', // I
      '#ffe9a8', // O
      '#d9b8e8', // T
      '#b8e6c1', // S
      '#f5b7b1', // Z
      '#b8cdf0', // J
      '#f7cfa8', // L
      '#dfe3e8', // Tuerca
    ],
    grid: { dark: '#3a3446', light: '#e6dcd2' },
    draw: drawSkinPastel,
  },
  pixel: {
    colors: [
      null,
      '#31c7d4', // I
      '#e8c53a', // O
      '#a05ec4', // T
      '#5cb85c', // S
      '#d9534f', // Z
      '#4a7fd4', // J
      '#e8873a', // L
      '#8d99ae', // Tuerca
    ],
    grid: { dark: '#242433', light: '#b9c0c9' },
    draw: drawSkinPixel,
  },
};
const DEFAULT_SKIN = 'retro';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme = 'dark';
let currentSkin = DEFAULT_SKIN;

function applyTheme(t) {
  theme = t;
  document.body.classList.toggle('light', t === 'light');
  themeToggle.checked = t === 'light';
  localStorage.setItem(THEME_KEY, t);
}

function applySkin(s) {
  // hasOwnProperty: un valor guardado como 'constructor' no debe pasar el filtro.
  currentSkin = Object.prototype.hasOwnProperty.call(SKINS, s) ? s : DEFAULT_SKIN;
  for (const name of Object.keys(SKINS))
    document.body.classList.toggle('skin-' + name, name === currentSkin);
  skinSelect.value = currentSkin;
  localStorage.setItem(SKIN_KEY, currentSkin);
  // El bucle puede estar detenido (pausa o game over): repintamos a mano.
  if (board && current) {
    if (gameOver) drawBoardOnly();
    else draw();
  }
  if (next) drawNext();
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins: cada draw recibe el color ya resuelto y debe restaurar el estado
// del contexto (globalAlpha, shadowBlur) antes de salir. ----

// Retro: bloque cuadrado plano con brillo superior. Es el render histórico.
function drawSkinRetro(context, x, y, color, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, Math.min(4, size - 2));
  context.globalAlpha = 1;
}

// Neon: relleno translúcido, contorno brillante y glow con shadowBlur.
function drawSkinNeon(context, x, y, color, size, alpha) {
  const a = alpha ?? 1;
  const px = x * size + 2;
  const py = y * size + 2;
  const s = size - 4;
  if (s <= 0) return;
  context.shadowColor = color;
  context.shadowBlur = Math.max(4, size * 0.4);
  context.globalAlpha = a * 0.25;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  context.globalAlpha = a;
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, size * 0.07);
  context.strokeRect(px + 1, py + 1, s - 2, s - 2);
  // Restaurar: si el glow queda activo sangra a la rejilla, al HUD y al preview.
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  context.lineWidth = 1;
  context.globalAlpha = 1;
}

// Pastel: colores suaves y esquinas redondeadas (roundRect con fallback).
function drawSkinPastel(context, x, y, color, size, alpha) {
  const px = x * size + 2;
  const py = y * size + 2;
  const s = size - 4;
  if (s <= 0) return;
  const r = Math.max(2, size * 0.28);
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(px, py, s, s, r);
    context.fill();
  } else {
    context.fillRect(px, py, s, s);
  }
  // brillo suave arriba a la izquierda
  const hs = s * 0.4;
  context.fillStyle = 'rgba(255,255,255,0.5)';
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(px + s * 0.16, py + s * 0.16, hs, hs * 0.5, r * 0.5);
    context.fill();
  } else {
    context.fillRect(px + s * 0.16, py + s * 0.16, hs, hs * 0.5);
  }
  context.globalAlpha = 1;
}

// Pixel art: bloque a sangre con biselado 8-bit y bandas de dithering.
function drawSkinPixel(context, x, y, color, size, alpha) {
  const px = x * size;
  const py = y * size;
  const band = Math.max(1, Math.round(size / 10));
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  // bandas horizontales
  context.fillStyle = 'rgba(0,0,0,0.20)';
  for (let i = band * 2; i < size - band; i += band * 3)
    context.fillRect(px, py + i, size, band);
  // bisel claro arriba/izquierda, oscuro abajo/derecha
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fillRect(px, py, size, band);
  context.fillRect(px, py, band, size);
  context.fillStyle = 'rgba(0,0,0,0.45)';
  context.fillRect(px, py + size - band, size, band);
  context.fillRect(px + size - band, py, band, size);
  context.globalAlpha = 1;
}

function activeSkin() {
  return SKINS[currentSkin] || SKINS[DEFAULT_SKIN];
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = activeSkin();
  skin.draw(context, x, y, skin.colors[colorIndex], size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = activeSkin().grid[theme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function drawBoardOnly() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);
}

function draw() {
  drawBoardOnly();

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  drawBoardOnly();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      // lockPiece -> spawn -> endGame puede terminar la partida a mitad del frame
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
});

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
applySkin(localStorage.getItem(SKIN_KEY) || DEFAULT_SKIN);

init();
