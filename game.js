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
const startScreen = document.getElementById('start-screen');
const startRecords = document.getElementById('start-records');
const startMaximos = document.getElementById('start-maximos');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const gameoverExtra = document.getElementById('gameover-extra');
const overlayRecords = document.getElementById('overlay-records');
const overlayMaximos = document.getElementById('overlay-maximos');
const recordForm = document.getElementById('record-form');
const recordName = document.getElementById('record-name');
const saveRecordBtn = document.getElementById('save-record-btn');
const menuBtn = document.getElementById('menu-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, maxLines;
let theme = 'dark';

function applyTheme(t) {
  theme = t;
  document.body.classList.toggle('light', t === 'light');
  themeToggle.checked = t === 'light';
  localStorage.setItem(THEME_KEY, t);
}

/* ---------------- Records locales ---------------- */

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const MAX_NOMBRE = 12;

let recordPendiente = null;

function fechaHoy() {
  const d = new Date();
  const dosDigitos = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

function formatearFecha(f) {
  if (typeof f !== 'string') return '';
  const partes = f.split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : f;
}

// Normaliza un record leído de localStorage; devuelve null si no es utilizable.
function normalizarRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const puntos = Number(r.score);
  if (!Number.isFinite(puntos)) return null;
  const entero = v => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const nombre = typeof r.nombre === 'string' && r.nombre.trim()
    ? r.nombre.trim().slice(0, MAX_NOMBRE)
    : 'ANÓNIMO';
  return {
    nombre,
    score: Math.max(0, Math.floor(puntos)),
    lines: entero(r.lines),
    combo: entero(r.combo),
    maxLines: entero(r.maxLines),
    fecha: typeof r.fecha === 'string' ? r.fecha : '',
  };
}

// El usuario puede tener basura en la clave: parseo defensivo, nunca lanza.
function cargarRecords() {
  let datos;
  try {
    datos = JSON.parse(localStorage.getItem(RECORDS_KEY));
  } catch (e) {
    return [];
  }
  if (!Array.isArray(datos)) return [];
  return datos
    .map(normalizarRecord)
    .filter(r => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
}

function guardarRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    // almacenamiento lleno o bloqueado: se ignora
  }
}

function entraEnTop(puntos, records) {
  if (puntos <= 0) return false;
  return records.length < MAX_RECORDS || puntos > records[records.length - 1].score;
}

// El sort es estable, así que ante empate el record viejo queda arriba.
function insertarRecord(records, nuevo) {
  return [...records, nuevo].sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS);
}

function renderRecords(cont, records, resaltado) {
  cont.innerHTML = '';
  if (!records.length) {
    const p = document.createElement('p');
    p.className = 'records-vacio';
    p.textContent = 'Todavía no hay records. ¡Jugá una partida!';
    cont.appendChild(p);
    return;
  }
  const tabla = document.createElement('table');
  tabla.className = 'records-tabla';

  const thead = document.createElement('thead');
  const filaCab = document.createElement('tr');
  ['#', 'NOMBRE', 'PUNTOS', 'LÍN', 'COMBO', 'FECHA'].forEach(t => {
    const th = document.createElement('th');
    th.textContent = t;
    filaCab.appendChild(th);
  });
  thead.appendChild(filaCab);
  tabla.appendChild(thead);

  const tbody = document.createElement('tbody');
  records.forEach((r, i) => {
    const fila = document.createElement('tr');
    if (i === resaltado) fila.className = 'record-actual';
    const celdas = [
      String(i + 1),
      r.nombre,
      r.score.toLocaleString(),
      String(r.lines),
      String(r.combo),
      formatearFecha(r.fecha),
    ];
    celdas.forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      fila.appendChild(td);
    });
    tbody.appendChild(fila);
  });
  tabla.appendChild(tbody);
  cont.appendChild(tabla);
}

function renderMaximos(el, records) {
  if (!records.length) {
    el.textContent = '';
    return;
  }
  const mejorCombo = records.reduce((m, r) => Math.max(m, r.combo), 0);
  const mejorLineas = records.reduce((m, r) => Math.max(m, r.maxLines), 0);
  el.textContent = `Mejor combo: ${mejorCombo}  ·  Máx. líneas de una vez: ${mejorLineas}`;
}

function ocultarGameOverRecords() {
  recordPendiente = null;
  gameoverExtra.classList.add('hidden');
  recordForm.classList.add('hidden');
}

function mostrarGameOverRecords() {
  const records = cargarRecords();
  gameoverExtra.classList.remove('hidden');
  if (entraEnTop(score, records)) {
    recordPendiente = {
      nombre: 'ANÓNIMO',
      score,
      lines,
      combo: maxCombo,
      maxLines,
      fecha: fechaHoy(),
    };
    const preview = insertarRecord(records, recordPendiente);
    renderRecords(overlayRecords, preview, preview.indexOf(recordPendiente));
    renderMaximos(overlayMaximos, preview);
    recordForm.classList.remove('hidden');
    recordName.value = '';
    recordName.focus();
  } else {
    recordPendiente = null;
    recordForm.classList.add('hidden');
    renderRecords(overlayRecords, records, -1);
    renderMaximos(overlayMaximos, records);
  }
}

function guardarRecordPendiente() {
  if (!recordPendiente) return;
  const nombre = recordName.value.trim().slice(0, MAX_NOMBRE);
  recordPendiente.nombre = nombre || 'ANÓNIMO';
  const records = insertarRecord(cargarRecords(), recordPendiente);
  guardarRecords(records);
  const idx = records.indexOf(recordPendiente);
  recordPendiente = null;
  recordForm.classList.add('hidden');
  renderRecords(overlayRecords, records, idx);
  renderMaximos(overlayMaximos, records);
}

function resetearRecords() {
  if (!confirm('¿Borrar todos los records guardados?')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch (e) {
    // sin almacenamiento: no hay nada que borrar
  }
  mostrarPantallaInicio();
}

function mostrarPantallaInicio() {
  const records = cargarRecords();
  renderRecords(startRecords, records, -1);
  renderMaximos(startMaximos, records);
  ocultarGameOverRecords();
  overlay.classList.add('hidden');
  startScreen.classList.remove('hidden');
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
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (cleared > maxLines) maxLines = cleared;
    updateHUD();
  } else {
    // la pieza se fijó sin limpiar nada: se corta la racha
    combo = 0;
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLORS[theme];
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
  mostrarGameOverRecords();
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
  combo = 0;
  maxCombo = 0;
  maxLines = 0;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  startScreen.classList.add('hidden');
  ocultarGameOverRecords();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // no robarle las teclas al campo de nombre del record
  const destino = e.target;
  if (destino && destino.tagName === 'INPUT' && destino.type !== 'checkbox') return;
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

playBtn.addEventListener('click', init);
menuBtn.addEventListener('click', mostrarPantallaInicio);
resetRecordsBtn.addEventListener('click', resetearRecords);
saveRecordBtn.addEventListener('click', guardarRecordPendiente);

recordName.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    e.preventDefault();
    guardarRecordPendiente();
  }
});

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');

// El juego ya no arranca solo: se lanza desde la pantalla de inicio (botón JUGAR).
// gameOver arranca en true para que el teclado quede inerte hasta que haya partida.
gameOver = true;
mostrarPantallaInicio();
