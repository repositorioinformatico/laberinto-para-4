const canvas = document.getElementById('mazeCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const placementsList = document.getElementById('placements');
const restartBtn = document.getElementById('restartBtn');
const newMazeBtn = document.getElementById('newMazeBtn');
const editNamesBtn = document.getElementById('editNamesBtn');
const leaderboardSection = document.getElementById('leaderboard');
const leaderboardList = document.getElementById('leaderboardList');
const nameModal = document.getElementById('nameModal');
const nameForm = document.getElementById('nameForm');
const playerLabelElements = document.querySelectorAll('[data-player-label]');
const ghostModeToggle = document.getElementById('ghostModeToggle');

const GRID_SIZE = 25; // debe ser impar para que el generador funcione bien
const CELL_SIZE = canvas.width / GRID_SIZE;
const PLAYER_RADIUS = CELL_SIZE * 0.3;
const PLAYER_SPEED = CELL_SIZE * 4; // celdas por segundo
const GOAL_RADIUS = CELL_SIZE * 0.5;
const SCORE_BY_POSITION = [4, 3, 2, 1];
const NAME_STORAGE_KEY = 'lab4-player-names';
const LEADERBOARD_STORAGE_KEY = 'lab4-leaderboard';
const GHOST_MODE_STORAGE_KEY = 'lab4-ghost-mode';

const playerBlueprints = [
  {
    name: 'Rosa',
    color: '#ff4da6',
    controls: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
  },
  {
    name: 'Azul',
    color: '#4da6ff',
    controls: {
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
    },
  },
  {
    name: 'Verde',
    color: '#4dff88',
    controls: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' },
  },
  {
    name: 'Naranja',
    color: '#ffb347',
    controls: { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH' },
  },
];

const startCells = [
  { col: 1, row: 1 },
  { col: GRID_SIZE - 2, row: 1 },
  { col: 1, row: GRID_SIZE - 2 },
  { col: GRID_SIZE - 2, row: GRID_SIZE - 2 },
];

let mazeGrid = [];
let players = [];
let placements = [];
let animationId = null;
let lastTime = null;
let running = false;
let playerNames = [];
let leaderboardStore = {};
let allowGhostMode = false;
const goalCell = Math.floor(GRID_SIZE / 2);

function generateMaze(size) {
  const grid = Array.from({ length: size }, () => Array(size).fill(1));
  const stack = [];
  const start = { col: 1, row: 1 };
  grid[start.row][start.col] = 0;
  stack.push(start);

  const directions = [
    { dc: 0, dr: -2 },
    { dc: 0, dr: 2 },
    { dc: -2, dr: 0 },
    { dc: 2, dr: 0 },
  ];

  while (stack.length) {
    const current = stack[stack.length - 1];
    const shuffled = directions.sort(() => Math.random() - 0.5);
    let carved = false;

    for (const dir of shuffled) {
      const nextCol = current.col + dir.dc;
      const nextRow = current.row + dir.dr;
      if (
        nextCol <= 0 ||
        nextRow <= 0 ||
        nextCol >= size - 1 ||
        nextRow >= size - 1
      ) {
        continue;
      }
      if (grid[nextRow][nextCol] === 1) {
        grid[nextRow][nextCol] = 0;
        grid[current.row + dir.dr / 2][current.col + dir.dc / 2] = 0;
        stack.push({ col: nextCol, row: nextRow });
        carved = true;
        break;
      }
    }

    if (!carved) {
      stack.pop();
    }
  }

  // abrir camino seguro para cada punto de inicio y el centro
  const safeCells = [
    ...startCells,
    { col: goalCell, row: goalCell },
    { col: goalCell + 1, row: goalCell },
    { col: goalCell - 1, row: goalCell },
    { col: goalCell, row: goalCell + 1 },
    { col: goalCell, row: goalCell - 1 },
  ];
  safeCells.forEach(({ col, row }) => {
    if (col > 0 && col < size && row > 0 && row < size) {
      grid[row][col] = 0;
    }
  });

  return grid;
}

function createPlayers() {
  return playerBlueprints.map((blueprint, index) => {
    const { col, row } = startCells[index];
    return {
      name: playerNames[index] || blueprint.name,
      color: blueprint.color,
      controls: { ...blueprint.controls },
      x: (col + 0.5) * CELL_SIZE,
      y: (row + 0.5) * CELL_SIZE,
      movement: { up: false, down: false, left: false, right: false },
      finished: false,
      finishOrder: null,
    };
  });
}

function resetGame({ regenerateMaze = false } = {}) {
  if (!playerNames.length) return;
  if (regenerateMaze || mazeGrid.length === 0) {
    mazeGrid = generateMaze(GRID_SIZE);
  }
  players = createPlayers();
  placements = [];
  lastTime = null;
  running = true;
  updateHud();
  startLoop();
}

function startLoop() {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  animationId = requestAnimationFrame(loop);
}

function loop(timestamp) {
  if (!running) {
    draw();
    return;
  }

  if (!lastTime) lastTime = timestamp;
  const delta = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  updatePlayers(delta);
  draw();
  animationId = requestAnimationFrame(loop);
}

function updatePlayers(delta) {
  players.forEach((player) => {
    if (player.finished) return;
    const dir = getDirectionVector(player.movement);
    if (!dir) return;
    const distance = PLAYER_SPEED * delta;
    const moveX = dir.x * distance;
    const moveY = dir.y * distance;
    movePlayer(player, moveX, moveY);
    checkGoal(player);
  });
}

function getDirectionVector(movement) {
  let x = 0;
  let y = 0;
  if (movement.left) x -= 1;
  if (movement.right) x += 1;
  if (movement.up) y -= 1;
  if (movement.down) y += 1;
  if (x === 0 && y === 0) return null;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function movePlayer(player, moveX, moveY) {
  if (moveX !== 0) {
    const nextX = player.x + moveX;
    if (!collidesWithEnvironment(nextX, player.y, player)) {
      player.x = nextX;
    }
  }

  if (moveY !== 0) {
    const nextY = player.y + moveY;
    if (!collidesWithEnvironment(player.x, nextY, player)) {
      player.y = nextY;
    }
  }
}

function collidesWithEnvironment(x, y, currentPlayer) {
  if (collidesWithWalls(x, y)) return true;
  return collidesWithPlayers(x, y, currentPlayer);
}

function collidesWithPlayers(x, y, currentPlayer) {
  if (allowGhostMode) return false;
  return players.some((other) => {
    if (other === currentPlayer || other.finished) return false;
    const dx = other.x - x;
    const dy = other.y - y;
    const minDistance = PLAYER_RADIUS * 2;
    return dx * dx + dy * dy < minDistance * minDistance - 0.1;
  });
}

function collidesWithWalls(x, y) {
  const minCol = Math.floor((x - PLAYER_RADIUS) / CELL_SIZE);
  const maxCol = Math.floor((x + PLAYER_RADIUS) / CELL_SIZE);
  const minRow = Math.floor((y - PLAYER_RADIUS) / CELL_SIZE);
  const maxRow = Math.floor((y + PLAYER_RADIUS) / CELL_SIZE);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (isWall(col, row)) {
        const closestX = clamp(x, col * CELL_SIZE, (col + 1) * CELL_SIZE);
        const closestY = clamp(y, row * CELL_SIZE, (row + 1) * CELL_SIZE);
        const dx = x - closestX;
        const dy = y - closestY;
        if (dx * dx + dy * dy < PLAYER_RADIUS * PLAYER_RADIUS) {
          return true;
        }
      }
    }
  }
  return false;
}

function isWall(col, row) {
  if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return true;
  return mazeGrid[row][col] === 1;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function checkGoal(player) {
  const goalX = (goalCell + 0.5) * CELL_SIZE;
  const goalY = (goalCell + 0.5) * CELL_SIZE;
  const dx = player.x - goalX;
  const dy = player.y - goalY;
  if (Math.hypot(dx, dy) <= GOAL_RADIUS - PLAYER_RADIUS * 0.3) {
    registerFinish(player);
  }
}

function registerFinish(player) {
  if (player.finished) return;
  player.finished = true;
  player.movement = { up: false, down: false, left: false, right: false };
  player.finishOrder = placements.length + 1;
  placements.push({ name: player.name, color: player.color });
  if (placements.length === playerBlueprints.length) {
    finalizeRace();
  } else {
    statusEl.textContent = `${player.name} tomó la posición #${player.finishOrder}!`;
  }
  updateHud();
}

function finalizeRace() {
  applyResultsToLeaderboard();
  running = false;
  statusEl.textContent = 'Todos han llegado a la meta. ¡Leaderboard actualizado!';
  updateLeaderboardUI();
}

function updateHud() {
  placementsList.innerHTML = '';
  placements.forEach((placement, index) => {
    const item = document.createElement('li');
    item.textContent = `${index + 1}.º ${placement.name}`;
    item.style.color = placement.color;
    placementsList.appendChild(item);
  });
  if (placements.length === 0) {
    statusEl.textContent = 'Esperando a que alguien alcance la meta…';
  }
}

function applyResultsToLeaderboard() {
  placements.forEach((placement, index) => {
    const points = SCORE_BY_POSITION[index] ?? 0;
    if (!leaderboardStore[placement.name]) {
      leaderboardStore[placement.name] = { points: 0, color: placement.color };
    }
    leaderboardStore[placement.name].points += points;
  });
  saveLeaderboard();
}

function updateLeaderboardUI() {
  leaderboardList.innerHTML = '';
  const entries = Object.entries(leaderboardStore)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  if (entries.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'Sin puntuaciones todavía.';
    leaderboardList.appendChild(item);
    leaderboardSection.hidden = true;
    return;
  }
  entries.forEach((entry, index) => {
    const item = document.createElement('li');
    item.innerHTML = `<strong>${index + 1}. ${entry.name}</strong><span>${entry.points} pts</span>`;
    item.style.color = entry.color;
    leaderboardList.appendChild(item);
  });
  leaderboardSection.hidden = false;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMaze();
  drawGoal();
  drawPlayers();
}

function drawMaze() {
  ctx.fillStyle = '#091324';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#14223d';
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (mazeGrid[row][col] === 1) {
        ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(canvas.width, i * CELL_SIZE);
    ctx.stroke();
  }
}

function drawGoal() {
  const goalX = (goalCell + 0.5) * CELL_SIZE;
  const goalY = (goalCell + 0.5) * CELL_SIZE;
  const gradient = ctx.createRadialGradient(goalX, goalY, GOAL_RADIUS * 0.2, goalX, goalY, GOAL_RADIUS);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.5, '#ffd166');
  gradient.addColorStop(1, 'rgba(255, 209, 102, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(goalX, goalY, GOAL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(goalX, goalY, GOAL_RADIUS * 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPlayers() {
  players.forEach((player) => {
    ctx.save();
    ctx.fillStyle = player.color;
    ctx.globalAlpha = player.finished ? 0.35 : 1;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    ctx.restore();
  });
}

function handleKey(event, isPressed) {
  let used = false;
  players.forEach((player) => {
    const direction = Object.entries(player.controls).find(
      ([, code]) => code === event.code
    );
    if (direction) {
      player.movement[direction[0]] = isPressed;
      used = true;
    }
  });
  if (used) {
    event.preventDefault();
  }
}

document.addEventListener('keydown', (event) => handleKey(event, true));
document.addEventListener('keyup', (event) => handleKey(event, false));
restartBtn.addEventListener('click', () => resetGame({ regenerateMaze: false }));
newMazeBtn.addEventListener('click', () => resetGame({ regenerateMaze: true }));
editNamesBtn.addEventListener('click', openNameModal);
nameForm.addEventListener('submit', handleNameSubmit);
nameModal.addEventListener('click', (event) => {
  if (event.target === nameModal) {
    closeNameModal();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !nameModal.hidden) {
    closeNameModal();
  }
});

loadFromStorage();

function loadFromStorage() {
  leaderboardStore = loadLeaderboard();
  updateLeaderboardUI();
  allowGhostMode = loadGhostMode();
  ghostModeToggle.checked = allowGhostMode;
  const storedNames = getStoredNames();
  if (storedNames) {
    playerNames = storedNames;
    updatePlayerLabels();
    resetGame({ regenerateMaze: true });
  } else {
    playerNames = playerBlueprints.map((player) => player.name);
    populateNameInputs(playerNames);
    openNameModal();
  }
}

function getStoredNames() {
  try {
    const saved = JSON.parse(localStorage.getItem(NAME_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length === playerBlueprints.length) {
      return saved;
    }
  } catch (error) {
    console.error('No se pudieron leer los nombres guardados', error);
  }
  return null;
}

function saveNames(names) {
  localStorage.setItem(NAME_STORAGE_KEY, JSON.stringify(names));
}

function loadLeaderboard() {
  try {
    const saved = JSON.parse(localStorage.getItem(LEADERBOARD_STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      return saved;
    }
  } catch (error) {
    console.error('No se pudo leer el leaderboard', error);
  }
  return {};
}

function saveLeaderboard() {
  localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboardStore));
}

function openNameModal() {
  populateNameInputs(playerNames);
  nameModal.hidden = false;
  document.body.classList.add('modal-open');
  if (ghostModeToggle) {
    ghostModeToggle.checked = allowGhostMode;
  }
  const firstInput = nameForm.querySelector('input');
  if (firstInput) {
    firstInput.focus();
    firstInput.select();
  }
}

function closeNameModal() {
  nameModal.hidden = true;
  document.body.classList.remove('modal-open');
}

function populateNameInputs(names) {
  getPlayerInputs().forEach((input, index) => {
    input.value = names[index] || '';
  });
}

function getPlayerInputs() {
  return Array.from(nameForm.querySelectorAll('input[name^="player-"]'));
}

function handleNameSubmit(event) {
  event.preventDefault();
  const formData = new FormData(nameForm);
  playerNames = playerBlueprints.map((_, index) => {
    const value = formData.get(`player-${index}`)?.toString().trim();
    return value || playerBlueprints[index].name;
  });
  allowGhostMode = Boolean(ghostModeToggle?.checked);
  saveNames(playerNames);
  saveGhostMode();
  updatePlayerLabels();
  closeNameModal();
  resetGame({ regenerateMaze: true });
}

function updatePlayerLabels() {
  playerLabelElements.forEach((labelEl) => {
    const index = Number(labelEl.dataset.playerLabel);
    if (Number.isNaN(index)) return;
    labelEl.textContent = playerNames[index] || playerBlueprints[index].name;
  });
}

function loadGhostMode() {
  try {
    return localStorage.getItem(GHOST_MODE_STORAGE_KEY) === 'true';
  } catch (error) {
    console.error('No se pudo leer el modo fantasma', error);
    return false;
  }
}

function saveGhostMode() {
  localStorage.setItem(GHOST_MODE_STORAGE_KEY, String(allowGhostMode));
  if (ghostModeToggle) {
    ghostModeToggle.checked = allowGhostMode;
  }
}
