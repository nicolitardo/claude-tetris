'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

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

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

/* ---------- Utilidades de color ---------- */

// amt > 0 aclara hacia blanco, amt < 0 oscurece hacia negro.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (ch) => {
    const v = amt >= 0 ? ch + (255 - ch) * amt : ch * (1 + amt);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

function roundRectPath(context, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + rad, y);
  context.arcTo(x + w, y, x + w, y + h, rad);
  context.arcTo(x + w, y + h, x, y + h, rad);
  context.arcTo(x, y + h, x, y, rad);
  context.arcTo(x, y, x + w, y, rad);
  context.closePath();
}

/* ---------- Funciones de dibujo por skin ---------- */
// Todas reciben coordenadas ya en píxeles (px, py) y NO tocan globalAlpha:
// drawBlock lo fija antes y lo restaura después.

function drawRetro(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeon(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = size * 0.6;
  context.fillStyle = color;
  context.fillRect(px + 2, py + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  // Núcleo oscuro: deja el borde brillando como un tubo de neón.
  context.fillStyle = 'rgba(0,0,0,0.6)';
  context.fillRect(px + 5, py + 5, size - 10, size - 10);
  context.fillStyle = shade(color, 0.45);
  context.fillRect(px + 5, py + 5, size - 10, 1);
}

function drawPastel(context, px, py, size, color) {
  const r = size * 0.28;
  context.fillStyle = color;
  roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, r);
  context.fill();
  context.fillStyle = shade(color, 0.35);
  roundRectPath(context, px + 4, py + 3.5, size - 8, (size - 3) * 0.35, r * 0.6);
  context.fill();
  context.strokeStyle = shade(color, -0.18);
  context.lineWidth = 1;
  roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, r);
  context.stroke();
}

function drawPixelArt(context, px, py, size, color) {
  const x = px + 1, y = py + 1, s = size - 2;
  const u = s / 4; // "píxel" gordo de la textura
  context.fillStyle = color;
  context.fillRect(x, y, s, s);
  // Bisel: luz arriba/izquierda, sombra abajo/derecha.
  context.fillStyle = shade(color, 0.3);
  context.fillRect(x, y, s, u);
  context.fillRect(x, y, u, s);
  context.fillStyle = shade(color, -0.35);
  context.fillRect(x, y + s - u, s, u);
  context.fillRect(x + s - u, y, u, s);
  // Dither fijo (no depende del frame, así no parpadea).
  context.fillStyle = shade(color, -0.18);
  context.fillRect(x + u, y + u, u, u);
  context.fillRect(x + 2 * u, y + 2 * u, u, u);
  context.fillStyle = shade(color, 0.15);
  context.fillRect(x + 2 * u, y + u, u, u);
}

/* ---------- Registro de skins ---------- */
// colors[t] y PIECES[t] comparten índice: null en 0, tipos 1..8.

const SKINS = {
  retro: {
    label: 'Retro',
    draw: drawRetro,
    grid: { dark: '#22222e', light: '#c8c8d8' },
    colors: [
      null,
      '#4dd0e1', // I
      '#ffd54f', // O
      '#ba68c8', // T
      '#81c784', // S
      '#e57373', // Z
      '#90caf9', // J
      '#ffb74d', // L
      '#b0bec5', // Tuerca
    ],
  },
  neon: {
    label: 'Neon',
    draw: drawNeon,
    grid: { dark: '#1b1b3a', light: '#1b1b3a' },
    colors: [
      null,
      '#00f0ff',
      '#fff700',
      '#c400ff',
      '#00ff6a',
      '#ff0055',
      '#2979ff',
      '#ff8a00',
      '#b8ffff',
    ],
  },
  pastel: {
    label: 'Pastel',
    draw: drawPastel,
    grid: { dark: '#2c2c3d', light: '#e2e2ee' },
    colors: [
      null,
      '#a8e6e2',
      '#ffe9a8',
      '#d9bbf0',
      '#bde6c0',
      '#f6b8b8',
      '#bfd4f7',
      '#ffd2ab',
      '#dcd8e6',
    ],
  },
  pixel: {
    label: 'Pixel art',
    draw: drawPixelArt,
    grid: { dark: '#26262f', light: '#bdbdcf' },
    colors: [
      null,
      '#28b6c4',
      '#e8b62c',
      '#9b4dca',
      '#4caf50',
      '#d4453c',
      '#3f6fd8',
      '#e07a1f',
      '#8d9aa5',
    ],
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
let skin = DEFAULT_SKIN;

function applyTheme(t) {
  theme = t;
  document.body.classList.toggle('light', t === 'light');
  themeToggle.checked = t === 'light';
  localStorage.setItem(THEME_KEY, t);
  redraw();
}

function applySkin(s) {
  if (!SKINS[s]) s = DEFAULT_SKIN;
  skin = s;
  for (const name of Object.keys(SKINS)) {
    document.body.classList.toggle(`skin-${name}`, name === s);
  }
  skinSelect.value = s;
  localStorage.setItem(SKIN_KEY, s);
  redraw();
}

// Repinta fuera del bucle (cambio de skin/tema en pausa o game over).
function redraw() {
  if (!current) return;
  if (gameOver) drawBoardOnly();
  else draw();
  drawNext();
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const active = SKINS[skin];
  context.globalAlpha = alpha ?? 1;
  active.draw(context, x * size, y * size, size, active.colors[colorIndex]);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = SKINS[skin].grid[theme];
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

// El <select> se llena desde SKINS para no duplicar la lista en el HTML.
for (const [name, s] of Object.entries(SKINS)) {
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = s.label;
  skinSelect.appendChild(opt);
}

skinSelect.addEventListener('change', () => applySkin(skinSelect.value));

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
applySkin(localStorage.getItem(SKIN_KEY) || DEFAULT_SKIN);

init();
