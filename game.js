/**
 * game.js
 * 과일 낙하 + 바구니 캐치 게임 메인 로직
 * 1P / 2P 모드 지원
 */

/* ── 과일 정의 ── */
const FRUITS = [
  { key: 'orange',     points: 1, weight: 20 },
  { key: 'grapes',     points: 2, weight: 15 },
  { key: 'strawberry', points: 2, weight: 15 },
  { key: 'cherry',     points: 3, weight: 10 },
  { key: 'pineapple',  points: 3, weight: 10 },
  { key: 'watermelon', points: 5, weight:  5 },
];

/* ── 이미지 프리로드 ── */
const IMAGE_KEYS = ['orange','grapes','strawberry','cherry','pineapple','watermelon','bomb','explosion'];
const IMAGES = {};

async function preloadImages() {
  await Promise.all(IMAGE_KEYS.map(key => new Promise(resolve => {
    const img = new Image();
    img.onload  = resolve;
    img.onerror = resolve;
    img.src = `images/${key}.png`;
    IMAGES[key] = img;
  })));
}

const totalWeight = FRUITS.reduce((s, f) => s + f.weight, 0);
function randomFruit() {
  let r = Math.random() * totalWeight;
  for (const f of FRUITS) { r -= f.weight; if (r <= 0) return f; }
  return FRUITS[0];
}

/* ── 손 스켈레톤 ── */
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

function calcPalmCenter(lms, W, H) {
  const idxs = [0, 5, 9, 13, 17];
  const sum  = idxs.reduce((acc, i) => ({ x: acc.x + lms[i].x, y: acc.y + lms[i].y }), { x: 0, y: 0 });
  return { x: (sum.x / idxs.length) * W, y: (sum.y / idxs.length) * H };
}

function drawHand(lms, W, H) {
  if (!lms) return;
  const pts = lms.map(p => ({ x: p.x * W, y: p.y * H }));

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  }
  for (let i = 0; i < pts.length; i++) {
    const r = (i === 0 || [4,8,12,16,20].includes(i)) ? 5 : 3;
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)';
    ctx.fill();
  }
  ctx.restore();
}

/* ── DOM refs ── */
const screenStart  = document.getElementById('screen-start');
const screenGame   = document.getElementById('screen-game');
const screenResult = document.getElementById('screen-result');
const canvas       = document.getElementById('game-canvas');
const ctx          = canvas.getContext('2d');
const videoEl      = document.getElementById('webcam');
const scoreEl      = document.getElementById('score-value');
const timerEl      = document.getElementById('timer-value');
const handDot      = document.getElementById('hand-dot');
const handLabel    = document.getElementById('hand-label');
const resultScore  = document.getElementById('result-score');
const resultBreak  = document.getElementById('result-breakdown');
const camStatus    = document.getElementById('cam-status');

/* ── State ── */
let gameMode        = '1p';
let selectedTime    = 10;
let scores          = [0, 0];
let catchBreakdowns = [{}, {}];
let timeLeft        = 0;
let timerInterval   = null;
let animFrameId     = null;
let fruits          = [];
let particles       = [];
let gameRunning     = false;
let tracker         = null;
let spawnTimer      = null;

/* 바구니 2개 (1P 모드에서는 baskets[0]만 사용) */
let baskets = [
  { x: 0.5,  y: 0.8, targetX: 0.5,  targetY: 0.8, width: 0, height: 0, lms: null },
  { x: 0.75, y: 0.8, targetX: 0.75, targetY: 0.8, width: 0, height: 0, lms: null },
];

/* ── Resize ── */
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const bw = Math.min(140, canvas.width * .18);
  baskets.forEach(b => { b.width = bw; b.height = bw * .6; });
}
window.addEventListener('resize', resize);
resize();

/* ── Mode selector ── */
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gameMode = btn.dataset.mode;
  });
});

/* ── Time selector ── */
document.querySelectorAll('.time-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTime = parseInt(btn.dataset.time, 10);
  });
});

/* ── Buttons ── */
document.getElementById('btn-start').addEventListener('click', startFlow);
document.getElementById('btn-retry').addEventListener('click', () => {
  showScreen(screenGame);
  startGame();
});
document.getElementById('btn-home').addEventListener('click', () => showScreen(screenStart));

/* ── Screen switcher ── */
function showScreen(el) {
  [screenStart, screenGame, screenResult].forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

/* ── Main flow ── */
async function startFlow() {
  showScreen(screenGame);
  await preloadImages();

  if (!tracker) {
    tracker = new HandTracker();

    tracker.onHandMove = (hands) => {
      if (gameMode === '1p') {
        const h = hands[0] || hands[1];
        if (h) {
          baskets[0].targetX = h.x;
          baskets[0].targetY = h.y;
          baskets[0].lms     = h.lms;
        } else {
          baskets[0].lms = null;
        }
      } else {
        if (hands[0]) {
          baskets[0].targetX = hands[0].x;
          baskets[0].targetY = hands[0].y;
          baskets[0].lms     = hands[0].lms;
        } else {
          baskets[0].lms = null;
        }
        if (hands[1]) {
          baskets[1].targetX = hands[1].x;
          baskets[1].targetY = hands[1].y;
          baskets[1].lms     = hands[1].lms;
        } else {
          baskets[1].lms = null;
        }
      }
    };

    tracker.onHandDetect = (count) => {
      const detected = count > 0;
      handDot.classList.toggle('detected', detected);
      if (gameMode === '1p') {
        handLabel.textContent = detected ? '손 인식됨' : '손 인식 중...';
      } else {
        handLabel.textContent = count === 2 ? '두 손 인식됨' : count === 1 ? '손 1개 인식 중...' : '손 인식 중...';
      }
    };

    try {
      await tracker.init(videoEl);
      camStatus.textContent = '카메라 연결됨';
    } catch (e) {
      camStatus.textContent = '카메라를 사용할 수 없습니다.';
      console.error('Failed to acquire camera feed:', e);
    }
  }
  countdown(3, startGame);
}

/* ── Countdown ── */
function countdown(n, cb) {
  const old = document.getElementById('countdown-overlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'countdown-overlay';
  screenGame.appendChild(overlay);
  let count = n;
  const tick = () => {
    overlay.innerHTML = `<span id="countdown-number">${count === 0 ? 'Go!' : count}</span>`;
    if (count < 0) { overlay.remove(); cb(); return; }
    count--;
    setTimeout(tick, 900);
  };
  tick();
}

/* ── HUD helpers ── */
function updateHUD() {
  if (gameMode === '1p') {
    document.getElementById('hud').style.display = 'flex';
    document.getElementById('hud-2p').style.display = 'none';
    scoreEl.textContent = scores[0];
    timerEl.textContent = timeLeft;
  } else {
    document.getElementById('hud').style.display = 'none';
    document.getElementById('hud-2p').style.display = 'flex';
    document.getElementById('score-p1').textContent       = scores[0];
    document.getElementById('score-p2').textContent       = scores[1];
    document.getElementById('timer-value-2p').textContent = timeLeft;
  }
}

/* ── Game start ── */
function startGame() {
  scores          = [0, 0];
  catchBreakdowns = [{}, {}];
  timeLeft        = selectedTime;
  fruits          = [];
  particles       = [];
  gameRunning     = true;

  baskets[0].x = 0.25; baskets[0].y = 0.8;
  baskets[0].targetX = 0.25; baskets[0].targetY = 0.8; baskets[0].lms = null;
  baskets[1].x = 0.75; baskets[1].y = 0.8;
  baskets[1].targetX = 0.75; baskets[1].targetY = 0.8; baskets[1].lms = null;

  timerEl.classList.remove('urgent');
  document.getElementById('timer-value-2p')?.classList.remove('urgent');
  updateHUD();

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 5) {
      timerEl.classList.add('urgent');
      document.getElementById('timer-value-2p')?.classList.add('urgent');
    }
    updateHUD();
    if (timeLeft <= 0) endGame();
  }, 1000);

  clearTimeout(spawnTimer);
  scheduleSpawn();

  cancelAnimationFrame(animFrameId);
  loop();
}

/* ── Spawn scheduling (점점 빨라짐) ── */
function scheduleSpawn() {
  if (!gameRunning) return;
  spawnFruit();
  const elapsed  = selectedTime - timeLeft;
  const progress = Math.min(elapsed / selectedTime, 1);
  const interval = 900 - progress * 480;   // 900ms → 420ms
  spawnTimer = setTimeout(scheduleSpawn, interval);
}

/* ── Fruit spawn ── */
function spawnFruit() {
  if (!gameRunning) return;
  const W = canvas.width;

  if (gameMode === '1p') {
    _spawnOne(0, 0, W);
  } else {
    _spawnOne(0, 0, W / 2);
    _spawnOne(1, W / 2, W);
  }
}

function _spawnOne(owner, xMin, xMax) {
  const isBomb    = Math.random() < .13;
  const size      = isBomb ? 52 : Math.random() * 20 + 44;
  const elapsed   = selectedTime - timeLeft;
  const speedRamp = 1 + (elapsed / selectedTime) * 1.8;
  const speed     = (canvas.height / 60) * (Math.random() * .21 + .21) * speedRamp;
  const margin    = size * .8;
  const xPos      = (xMin + margin) + Math.random() * ((xMax - xMin) - margin * 2);

  fruits.push({
    x:      xPos,
    y:      -size,
    size,
    speed,
    wobble: (Math.random() - .5) * .8,
    isBomb,
    owner,
    fruit:  isBomb ? null : randomFruit(),
    angle:  Math.random() * Math.PI * 2,
    spin:   (Math.random() - .5) * .06,
  });
}

/* ── Game end ── */
function endGame() {
  gameRunning = false;
  clearInterval(timerInterval);
  clearTimeout(spawnTimer);
  cancelAnimationFrame(animFrameId);

  const result1p = document.getElementById('result-1p');
  const result2p = document.getElementById('result-2p');

  if (gameMode === '1p') {
    result1p.style.display = 'block';
    result2p.style.display = 'none';
    resultScore.textContent = scores[0];
    _renderBreakdown(resultBreak, catchBreakdowns[0]);
  } else {
    result1p.style.display = 'none';
    result2p.style.display = 'block';
    document.getElementById('result-p1').textContent = scores[0];
    document.getElementById('result-p2').textContent = scores[1];
    const winnerEl = document.getElementById('result-winner');
    if (scores[0] > scores[1])      winnerEl.textContent = 'Player 1 승리!';
    else if (scores[1] > scores[0]) winnerEl.textContent = 'Player 2 승리!';
    else                            winnerEl.textContent = '무승부!';
  }

  setTimeout(() => showScreen(screenResult), 600);
}

function _renderBreakdown(el, breakdown) {
  el.innerHTML = '';
  for (const [key, count] of Object.entries(breakdown)) {
    const fruit = FRUITS.find(f => f.key === key);
    if (!fruit || count === 0) continue;
    const chip = document.createElement('div');
    chip.className = 'fruit-chip';
    const img = document.createElement('img');
    img.src = `images/${key}.png`;
    img.style.cssText = 'width:24px;height:24px;object-fit:contain;vertical-align:middle';
    chip.appendChild(img);
    const span = document.createElement('span');
    span.className = 'chip-count';
    span.textContent = `×${count}`;
    chip.appendChild(span);
    el.appendChild(chip);
  }
  if (el.children.length === 0) {
    el.innerHTML = '<span style="color:#6e6e73;font-size:15px">아무것도 못 담았어요.</span>';
  }
}

/* ── Particles ── */
function spawnParticles(x, y, key, caught) {
  if (!caught) {
    // 폭탄: explosion 이미지 확장 후 페이드아웃
    particles.push({
      type:    'explosion',
      x, y,
      size:    52,
      maxSize: 180,
      life:    1,
      decay:   0.04,
    });
  } else {
    // 과일: 이미지 파티클 방사
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * .5;
      const spd   = Math.random() * 4 + 2;
      particles.push({
        type:  'image',
        key,
        x, y,
        vx:    Math.cos(angle) * spd,
        vy:    Math.sin(angle) * spd - 2,
        life:  1,
        decay: .05 + Math.random() * .02,
        size:  Math.random() * 10 + 14,
      });
    }
  }
}

/* ── Main loop ── */
function loop() {
  if (!gameRunning) return;
  animFrameId = requestAnimationFrame(loop);
  update();
  draw();
}

function update() {
  const W = canvas.width;
  const H = canvas.height;

  const activeBaskets = gameMode === '1p' ? [baskets[0]] : baskets;

  activeBaskets.forEach((b, idx) => {
    b.x += (b.targetX - b.x) * .15;
    b.y += (b.targetY - b.y) * .15;

    if (gameMode === '2p') {
      const left  = idx === 0 ? 0.02 : 0.52;
      const right = idx === 0 ? 0.48 : 0.98;
      b.x = Math.min(Math.max(b.x, left), right);
    }
  });

  for (let i = fruits.length - 1; i >= 0; i--) {
    const f = fruits[i];
    f.y     += f.speed;
    f.x     += Math.sin(f.y * .03) * f.wobble;
    f.angle += f.spin;

    let caught = false;
    const checkBaskets = gameMode === '1p' ? [baskets[0]] : [baskets[f.owner]];

    for (const b of checkBaskets) {
      let catchX, catchY;
      if (b.lms) {
        const palm = calcPalmCenter(b.lms, W, H);
        catchX = palm.x;
        catchY = palm.y;
      } else {
        catchX = b.x * W;
        catchY = b.y * H;
      }

      const dist        = Math.hypot(f.x - catchX, f.y - catchY);
      const catchRadius = b.width * 0.6;

      if (dist < catchRadius + f.size * 0.3) {
        const pIdx = gameMode === '1p' ? 0 : f.owner;
        if (f.isBomb) {
          scores[pIdx] = Math.max(0, scores[pIdx] - 3);
          _shakeScore(pIdx);
          spawnParticles(f.x, f.y, 'bomb', false);
        } else {
          scores[pIdx] += f.fruit.points;
          catchBreakdowns[pIdx][f.fruit.key] = (catchBreakdowns[pIdx][f.fruit.key] || 0) + 1;
          spawnParticles(f.x, f.y, f.fruit.key, true);
        }
        updateHUD();
        caught = true;
        break;
      }
    }

    if (caught || f.y > H + f.size) fruits.splice(i, 1);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.type !== 'explosion') {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += .25;
    }
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function _shakeScore(playerIdx) {
  const el = playerIdx === 0
    ? (gameMode === '1p' ? scoreEl : document.getElementById('score-p1'))
    : document.getElementById('score-p2');
  if (!el) return;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 400);
}

function draw() {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // 2P 구분선
  if (gameMode === '2p') {
    ctx.save();
    ctx.setLineDash([12, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.restore();
  }

  // 과일
  for (const f of fruits) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    const imgKey = f.isBomb ? 'bomb' : f.fruit.key;
    ctx.drawImage(IMAGES[imgKey], -f.size / 2, -f.size / 2, f.size, f.size);
    ctx.restore();
  }

  // 파티클
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    if (p.type === 'explosion') {
      const s = p.size + (p.maxSize - p.size) * (1 - p.life);
      ctx.drawImage(IMAGES.explosion, p.x - s / 2, p.y - s / 2, s, s);
    } else {
      ctx.translate(p.x, p.y);
      ctx.drawImage(IMAGES[p.key], -p.size / 2, -p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }

  // 손 스켈레톤
  const activeBaskets = gameMode === '1p' ? [baskets[0]] : baskets;
  activeBaskets.forEach(b => drawHand(b.lms, W, H));
}

/* ── CSS 주입 ── */
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20%      { transform: translateX(-6px); }
    40%      { transform: translateX( 6px); }
    60%      { transform: translateX(-4px); }
    80%      { transform: translateX( 4px); }
  }
  #score-value.shake,
  #score-p1.shake,
  #score-p2.shake { animation: shake .4s ease; }
`;
document.head.appendChild(style);
