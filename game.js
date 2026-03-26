/**
 * game.js
 * 과일 낙하 + 바구니 캐치 게임 메인 로직
 */

/* ── 과일 정의 ── */
const FRUITS = [
  { emoji: '🍎', label: 'apple',  points: 1, weight: 30 },
  { emoji: '🍊', label: 'orange', points: 1, weight: 25 },
  { emoji: '🍋', label: 'lemon',  points: 1, weight: 20 },
  { emoji: '🍇', label: 'grape',  points: 2, weight: 15 },
  { emoji: '🍓', label: 'berry',  points: 2, weight: 10 },
  { emoji: '🍑', label: 'peach',  points: 1, weight: 18 },
  { emoji: '🥝', label: 'kiwi',   points: 2, weight: 12 },
  { emoji: '🍍', label: 'pine',   points: 3, weight:  5 },
  { emoji: '🍒', label: 'cherry', points: 2, weight:  8 },
  { emoji: '🫐', label: 'blue',   points: 2, weight:  9 },
];

const BASKET_EMOJI  = '🧺';
const BOMB_EMOJI    = '💣';

/* 가중치 기반 랜덤 과일 선택 */
const totalWeight = FRUITS.reduce((s, f) => s + f.weight, 0);
function randomFruit() {
  let r = Math.random() * totalWeight;
  for (const f of FRUITS) { r -= f.weight; if (r <= 0) return f; }
  return FRUITS[0];
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
let selectedTime   = 10;
let score          = 0;
let timeLeft       = 0;
let timerInterval  = null;
let animFrameId    = null;
let fruits         = [];
let particles      = [];
let basket         = { x: 0.5, y: 0.8, targetX: 0.5, targetY: 0.8, width: 0, height: 0 };
let gameRunning    = false;
let catchBreakdown = {};   // { label: count }
let tracker        = null;
let spawnTimer     = null;
let bombSpawnTimer = 0;

/* ── Resize ── */
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  basket.width  = Math.min(160, canvas.width * .22);
  basket.height = basket.width * .6;
}
window.addEventListener('resize', resize);
resize();

/* ── Time selector ── */
document.querySelectorAll('.time-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTime = parseInt(btn.dataset.time, 10);
  });
});

/* ── Start button ── */
document.getElementById('btn-start').addEventListener('click', startFlow);
document.getElementById('btn-retry').addEventListener('click', () => {
  showScreen(screenGame);
  startGame();
});
document.getElementById('btn-home').addEventListener('click', () => {
  showScreen(screenStart);
});

/* ── Screen switcher ── */
function showScreen(el) {
  [screenStart, screenGame, screenResult].forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

/* ── Main flow ── */
async function startFlow() {
  showScreen(screenGame);
  if (!tracker) {
    tracker = new HandTracker();
    tracker.onHandMove = ({ x, y }) => {
      basket.targetX = x;
      basket.targetY = y;
    };
    tracker.onHandDetect = (detected) => {
      handDot.classList.toggle('detected', detected);
      handLabel.textContent = detected ? '손 인식됨' : '손 인식 중...';
    };
    try {
      await tracker.init(videoEl);
      camStatus.textContent = '카메라 연결됨';
    } catch (e) {
      camStatus.textContent = '카메라를 사용할 수 없습니다.';
      console.error(e);
    }
  }
  countdown(3, startGame);
}

/* ── Countdown ── */
function countdown(n, cb) {
  // 기존 오버레이 제거
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

/* ── Game start ── */
function startGame() {
  score          = 0;
  timeLeft       = selectedTime;
  fruits         = [];
  particles      = [];
  catchBreakdown = {};
  gameRunning    = true;
  basket.x       = 0.5;
  basket.y       = 0.8;
  basket.targetX = 0.5;
  basket.targetY = 0.8;

  scoreEl.textContent = '0';
  timerEl.textContent = timeLeft;
  timerEl.classList.remove('urgent');

  // 타이머
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 5) timerEl.classList.add('urgent');
    if (timeLeft <= 0) endGame();
  }, 1000);

  // 과일 스폰 — 경과 시간마다 간격 재조정 (점점 빠르게)
  function scheduleSpawn() {
    if (!gameRunning) return;
    spawnFruit();
    const elapsed   = selectedTime - timeLeft;
    const progress  = Math.min(elapsed / selectedTime, 1);            // 0 → 1
    const interval  = 900 - progress * 480;                           // 900ms → 420ms
    spawnTimer = setTimeout(scheduleSpawn, interval);
  }
  clearTimeout(spawnTimer);
  scheduleSpawn();

  // 렌더 루프
  cancelAnimationFrame(animFrameId);
  loop();
}

/* ── Game end ── */
function endGame() {
  gameRunning = false;
  clearInterval(timerInterval);
  clearTimeout(spawnTimer);
  cancelAnimationFrame(animFrameId);

  // 결과 화면
  resultScore.textContent = score;

  // 과일 종류별 breakdown 칩
  resultBreak.innerHTML = '';
  for (const [label, count] of Object.entries(catchBreakdown)) {
    const fruit = FRUITS.find(f => f.label === label);
    if (!fruit || count === 0) continue;
    const chip = document.createElement('div');
    chip.className = 'fruit-chip';
    chip.innerHTML = `<span class="chip-emoji">${fruit.emoji}</span><span class="chip-count">×${count}</span>`;
    resultBreak.appendChild(chip);
  }
  if (resultBreak.children.length === 0) {
    resultBreak.innerHTML = '<span style="color:#6e6e73;font-size:15px">아무것도 못 담았어요.</span>';
  }

  setTimeout(() => showScreen(screenResult), 600);
}

/* ── Fruit spawn ── */
function spawnFruit() {
  if (!gameRunning) return;
  const W  = canvas.width;

  // 가끔 폭탄 등장 (15% 확률, 난이도에 따라 조정)
  const isBomb = Math.random() < .13;

  const size     = isBomb ? 52 : Math.random() * 20 + 44;
  // 시간 선택에 관계없이 동일한 기본 속도 + 경과 시간에 따라 점점 빨라짐
  const elapsed      = selectedTime - timeLeft;                        // 경과 초
  const speedRamp    = 1 + (elapsed / selectedTime) * 1.8;            // 1.0 → 최대 2.8배
  const speed        = (canvas.height / 60) * (Math.random() * .105 + .105) * speedRamp;
  const margin   = size * .8;
  const xPos     = margin + Math.random() * (W - margin * 2);
  const wobble   = (Math.random() - .5) * .8;   // 좌우 흔들림

  fruits.push({
    x:      xPos,
    y:      -size,
    size,
    speed,
    wobble,
    isBomb,
    fruit: isBomb ? null : randomFruit(),
    angle: Math.random() * Math.PI * 2,
    spin:  (Math.random() - .5) * .06,
  });
}

/* ── Particle system ── */
function spawnParticles(x, y, emoji, caught) {
  const count = caught ? 10 : 6;
  for (let i = 0; i < count; i++) {
    const angle  = (Math.PI * 2 / count) * i + Math.random() * .5;
    const speed  = Math.random() * 5 + 2;
    particles.push({
      x, y,
      vx:   Math.cos(angle) * speed,
      vy:   Math.sin(angle) * speed - 2,
      life: 1,
      decay: .04 + Math.random() * .02,
      size: Math.random() * 14 + 10,
      emoji: caught ? emoji : '💥',
    });
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

  // 바구니 부드럽게 이동 (lerp X, Y 모두)
  basket.x += (basket.targetX - basket.x) * .15;
  basket.y += (basket.targetY - basket.y) * .15;

  const bx     = basket.x * W;
  // Y는 손 위치를 그대로 매핑, 화면 안쪽으로 클램프
  const margin = basket.height * .6;
  const by     = Math.min(Math.max(basket.y * H, margin), H - margin);
  const bHalfW = basket.width * .48;
  const bTop   = by - basket.height * .3;

  for (let i = fruits.length - 1; i >= 0; i--) {
    const f = fruits[i];
    f.y    += f.speed;
    f.x    += Math.sin(f.y * .03) * f.wobble;
    f.angle += f.spin;

    // 캐치 판정
    const dx = Math.abs(f.x - bx);
    const dy = Math.abs(f.y - bTop);
    if (dx < bHalfW + f.size * .3 && dy < basket.height * .55) {
      if (f.isBomb) {
        // 폭탄 → 점수 -3
        score = Math.max(0, score - 3);
        scoreEl.textContent = score;
        scoreEl.classList.add('shake');
        setTimeout(() => scoreEl.classList.remove('shake'), 400);
        spawnParticles(f.x, f.y, '💣', false);
      } else {
        score += f.fruit.points;
        scoreEl.textContent = score;
        catchBreakdown[f.fruit.label] = (catchBreakdown[f.fruit.label] || 0) + 1;
        spawnParticles(f.x, f.y, f.fruit.emoji, true);
      }
      fruits.splice(i, 1);
      continue;
    }

    // 화면 밖
    if (f.y > H + f.size) {
      fruits.splice(i, 1);
    }
  }

  // 파티클 업데이트
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x   += p.vx;
    p.y   += p.vy;
    p.vy  += .25;   // 중력
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function draw() {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // 과일 그리기
  for (const f of fruits) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    ctx.font = `${f.size}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha  = 1;
    ctx.fillText(f.isBomb ? BOMB_EMOJI : f.fruit.emoji, 0, 0);
    ctx.restore();
  }

  // 파티클 그리기
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.font = `${p.size}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji, p.x, p.y);
    ctx.restore();
  }

  // 바구니 그리기 (update()와 동일한 클램프 적용)
  const drawBx = basket.x * W;
  const drawMargin = basket.height * .6;
  const drawBy = Math.min(Math.max(basket.y * H, drawMargin), H - drawMargin);
  ctx.save();
  ctx.font = `${basket.width * .8}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha  = 1;
  ctx.fillText(BASKET_EMOJI, drawBx, drawBy);
  ctx.restore();

  // 손 위치 가이드 (작은 원)
  if (tracker && tracker._detected) {
    const hx = tracker.lastX * W;
    const hy = Math.min(Math.max(tracker.lastY * H, drawMargin), H - drawMargin);
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, 12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/* ── CSS shake 애니메이션 (동적 주입) ── */
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20%      { transform: translateX(-6px); }
    40%      { transform: translateX( 6px); }
    60%      { transform: translateX(-4px); }
    80%      { transform: translateX( 4px); }
  }
  #score-value.shake { animation: shake .4s ease; }
`;
document.head.appendChild(style);
