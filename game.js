/* game.js */
/* Main game logic: physics, controls, collision detection, bounce-back, menu background gameplay,
   countdown, settings, responsive scaling to 16:9 container, mobile touch support.
   Replace audio src in HTML with real files in assets/ for sound to play.
*/

/* -------------------------
   Utility & DOM references
   ------------------------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

const screenWrapper = document.getElementById('screen-wrapper');
const menu = document.getElementById('menu');
const settings = document.getElementById('settings');
const countdown = document.getElementById('countdown');
const countdownText = document.getElementById('countdownText');
const gameOver = document.getElementById('gameOver');
const finalScore = document.getElementById('finalScore');
const hudScore = document.getElementById('score');

const btnNew = document.getElementById('btnNew');
const btnSettings = document.getElementById('btnSettings');
const btnQuit = document.getElementById('btnQuit');
const btnRestart = document.getElementById('btnRestart');
const btnMenu = document.getElementById('btnMenu');

const birdColorInput = document.getElementById('birdColor');
const eyeSizeInput = document.getElementById('eyeSize');
const sfxVolInput = document.getElementById('sfxVol');
const musicVolInput = document.getElementById('musicVol');
const muteAllInput = document.getElementById('muteAll');
const saveSettings = document.getElementById('saveSettings');
const closeSettings = document.getElementById('closeSettings');

const audioBgm = document.getElementById('bgm');
const sfxFlap = document.getElementById('sfxFlap');
const sfxPoint = document.getElementById('sfxPoint');
const sfxHit = document.getElementById('sfxHit');

/* -------------------------
   Game constants & state
   ------------------------- */
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

/* Physics tuning */
const GRAVITY = 0.45;           // gravity acceleration
const FLAP_STRENGTH = -9.5;    // upward impulse on flap
const MAX_DROP_SPEED = 12;     // terminal velocity
const ROTATION_MAX = 0.9;      // radians
const ROTATION_MIN = -0.6;

const PILLAR_WIDTH = 110;
const PILLAR_GAP = 220;        // wider vertical gap for easier control
const PILLAR_SPACING = 420;    // horizontal spacing between pillars
const PILLAR_SPEED = 3.6;      // background scroll speed

const SCORE_MAX = 999;

/* Game runtime state */
let game = null; // will hold Game instance

/* -------------------------
   Responsive scaling
   ------------------------- */
function resizeCanvasToDisplay() {
  // Keep canvas internal resolution fixed to BASE_WIDTH x BASE_HEIGHT for consistent physics,
  // but scale CSS to fit the container (which preserves 16:9).
  canvas.width = BASE_WIDTH;
  canvas.height = BASE_HEIGHT;
  // CSS already stretches canvas to container via width:100% height:100%
}
resizeCanvasToDisplay();
window.addEventListener('resize', resizeCanvasToDisplay);

/* -------------------------
   Helper: play sound with volume and mute
   ------------------------- */
function playSound(audioEl, vol = 1) {
  if (!audioEl) return;
  if (muteAllInput.checked) return;
  audioEl.volume = vol;
  // clone to allow overlapping
  try {
    const clone = audioEl.cloneNode();
    clone.volume = vol;
    clone.play().catch(()=>{});
  } catch (e) {}
}

/* -------------------------
   Bird class
   ------------------------- */
class Bird {
  constructor(x, y, settings) {
    this.x = x;
    this.y = y;
    this.radius = 22; // visual size
    this.vy = 0;
    this.rotation = 0;
    this.color = settings.color || '#2ecc71';
    this.eyeSize = settings.eyeSize || 12;
    this.alive = true;
    this.score = 0;
    this.width = this.radius * 2;
    this.height = this.radius * 2;
    this.bounceTimer = 0;
  }

  flap() {
    this.vy = FLAP_STRENGTH;
    playSound(sfxFlap, parseFloat(sfxVolInput.value));
  }

  update(dt) {
    if (!this.alive) {
      // when dead, apply gravity but slower
      this.vy += GRAVITY * 0.6;
    } else {
      this.vy += GRAVITY;
    }
    // clamp
    if (this.vy > MAX_DROP_SPEED) this.vy = MAX_DROP_SPEED;
    if (this.vy < -18) this.vy = -18;

    this.y += this.vy;

    // rotation based on velocity
    this.rotation = Math.max(ROTATION_MIN, Math.min(ROTATION_MAX, this.vy / 15));

    // bounce-back timer reduces over time
    if (this.bounceTimer > 0) this.bounceTimer -= dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // body
    ctx.fillStyle = this.color;
    roundRect(ctx, -this.radius, -this.radius, this.radius*2, this.radius*2, 8);
    ctx.fill();

    // wing (simple)
    ctx.fillStyle = shadeColor(this.color, -12);
    ctx.beginPath();
    ctx.ellipse(-6, 0, 10, 6, Math.PI/6, 0, Math.PI*2);
    ctx.fill();

    // eyes (two circles)
    ctx.fillStyle = '#fff';
    const eyeOffsetX = 8;
    const eyeOffsetY = -6;
    ctx.beginPath();
    ctx.ellipse(eyeOffsetX, eyeOffsetY, this.eyeSize/2, this.eyeSize/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(eyeOffsetX, eyeOffsetY+8, this.eyeSize/2, this.eyeSize/2, 0, 0, Math.PI*2);
    ctx.fill();

    // pupils
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(eyeOffsetX+2, eyeOffsetY, this.eyeSize/4, this.eyeSize/4, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(eyeOffsetX+2, eyeOffsetY+8, this.eyeSize/4, this.eyeSize/4, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  getBounds() {
    // approximate as circle for collision
    return { x: this.x, y: this.y, r: this.radius };
  }
}

/* -------------------------
   Pillar class
   ------------------------- */
class Pillar {
  constructor(x, gapY) {
    this.x = x;
    this.width = PILLAR_WIDTH;
    this.gapY = gapY; // center of gap
    this.passed = false;
  }

  update(dt) {
    this.x -= PILLAR_SPEED;
  }

  draw(ctx) {
    // Draw top and bottom pillars with ancient stone look using gradients and simple cracks
    const stoneColor = '#bfae8f';
    const dark = '#9b7f5f';
    const light = '#e6d9c6';

    // top pillar rectangle
    const topH = this.gapY - (PILLAR_GAP/2);
    ctx.save();
    // top
    ctx.fillStyle = createStonePattern(ctx, this.x, 0, this.width, topH);
    ctx.fillRect(this.x, 0, this.width, topH);
    // bottom
    const bottomY = this.gapY + (PILLAR_GAP/2);
    const bottomH = BASE_HEIGHT - bottomY;
    ctx.fillStyle = createStonePattern(ctx, this.x, bottomY, this.width, bottomH);
    ctx.fillRect(this.x, bottomY, this.width, bottomH);

    // decorative ancient capital on top of top pillar
    ctx.fillStyle = dark;
    ctx.fillRect(this.x - 6, Math.max(0, topH - 28), this.width + 12, 12);
    ctx.fillStyle = light;
    ctx.fillRect(this.x - 6, Math.max(0, topH - 16), this.width + 12, 8);

    // base decoration on bottom pillar
    ctx.fillStyle = dark;
    ctx.fillRect(this.x - 6, bottomY + bottomH - 12, this.width + 12, 12);
    ctx.restore();
  }

  getRects() {
    // return top and bottom rectangles for collision
    const topH = this.gapY - (PILLAR_GAP/2);
    const bottomY = this.gapY + (PILLAR_GAP/2);
    return [
      { x: this.x, y: 0, w: this.width, h: topH },
      { x: this.x, y: bottomY, w: this.width, h: BASE_HEIGHT - bottomY }
    ];
  }
}

/* -------------------------
   Game class
   ------------------------- */
class Game {
  constructor({ auto = false, menuMode = false, settings = {} } = {}) {
    this.bird = new Bird(220, BASE_HEIGHT/2, settings);
    this.pillars = [];
    this.spawnTimer = 0;
    this.score = 0;
    this.running = false;
    this.auto = auto; // if true, bird auto-flaps to avoid pillars (used for menu background)
    this.menuMode = menuMode;
    this.settings = settings;
    this.lastTime = performance.now();
    this.gameOver = false;
    this.countdownActive = false;
    this.countdownValue = 3;
    this.spawnInitial();
  }

  spawnInitial() {
    // create a few pillars ahead
    this.pillars = [];
    let x = 700;
    for (let i = 0; i < 4; i++) {
      const gapY = randRange(180, BASE_HEIGHT - 180);
      this.pillars.push(new Pillar(x, gapY));
      x += PILLAR_SPACING;
    }
  }

  spawnPillar() {
    const lastX = this.pillars.length ? this.pillars[this.pillars.length - 1].x : BASE_WIDTH;
    const x = lastX + PILLAR_SPACING;
    const margin = 140;
    const gapY = randRange(margin + PILLAR_GAP/2, BASE_HEIGHT - margin - PILLAR_GAP/2);
    this.pillars.push(new Pillar(x, gapY));
  }

  startCountdown(cb) {
    this.countdownActive = true;
    this.countdownValue = 3;
    countdownText.textContent = this.countdownValue;
    countdown.classList.remove('hidden');
    const tick = () => {
      if (this.countdownValue <= 0) {
        this.countdownActive = false;
        countdown.classList.add('hidden');
        cb && cb();
        return;
      }
      countdownText.textContent = this.countdownValue;
      this.countdownValue--;
      setTimeout(tick, 800);
    };
    setTimeout(tick, 200);
  }

  start() {
    this.running = true;
    this.gameOver = false;
    this.bird.alive = true;
    this.bird.vy = 0;
    this.score = 0;
    hudScore.textContent = this.score;
    audioBgm.volume = parseFloat(musicVolInput.value);
    if (!muteAllInput.checked) audioBgm.play().catch(()=>{});
  }

  stop() {
    this.running = false;
    audioBgm.pause();
  }

  update(dt) {
    if (!this.running && !this.menuMode) return;
    // spawn pillars periodically
    this.spawnTimer += dt;
    if (this.spawnTimer > 1600) {
      this.spawnTimer = 0;
      this.spawnPillar();
    }

    // update bird
    this.bird.update(dt/16);

    // auto-flap logic for menu background: simple heuristic
    if (this.auto && !this.gameOver) {
      const next = this.pillars.find(p => p.x + p.width > this.bird.x);
      if (next) {
        // if bird is below gap center, flap
        if (this.bird.y > next.gapY + 10) {
          if (this.bird.vy > 2) this.bird.flap();
        }
        // if approaching top of gap, avoid hitting top
        if (this.bird.y < next.gapY - 40 && this.bird.vy < -2) {
          // do nothing
        }
      }
    }

    // update pillars
    for (let p of this.pillars) p.update(dt/16);

    // remove off-screen pillars
    this.pillars = this.pillars.filter(p => p.x + p.width > -50);

    // scoring: when pillar passes bird
    for (let p of this.pillars) {
      if (!p.passed && p.x + p.width < this.bird.x) {
        p.passed = true;
        this.score = Math.min(SCORE_MAX, this.score + 1);
        hudScore.textContent = this.score;
        playSound(sfxPoint, parseFloat(sfxVolInput.value));
      }
    }

    // collision detection
    if (!this.gameOver) {
      for (let p of this.pillars) {
        const rects = p.getRects();
        for (let r of rects) {
          if (circleRectCollision(this.bird.getBounds(), r)) {
            // collision occurred
            this.onHit(p);
            break;
          }
        }
        if (this.gameOver) break;
      }
      // floor/ceiling collision
      if (this.bird.y - this.bird.radius < 0 || this.bird.y + this.bird.radius > BASE_HEIGHT) {
        this.onHit(null, true);
      }
    }
  }

  onHit(pillar = null, fell = false) {
    // bounce-back effect: push bird slightly away and upward, play hit sound
    this.bird.alive = false;
    this.gameOver = true;
    this.running = false;
    // bounce back: negative vx simulated by moving bird left a bit and upward
    this.bird.vy = -8;
    this.bird.bounceTimer = 300;
    playSound(sfxHit, parseFloat(sfxVolInput.value));
    // show game over overlay after short delay
    setTimeout(() => {
      finalScore.textContent = `Score: ${this.score}`;
      gameOver.classList.remove('hidden');
    }, 600);
  }

  flap() {
    if (!this.running) return;
    if (this.bird.alive) this.bird.flap();
  }

  draw(ctx) {
    // clear background (sky + clouds)
    drawBackground(ctx);

    // draw pillars
    for (let p of this.pillars) p.draw(ctx);

    // draw bird
    this.bird.draw(ctx);

    // if menu mode, draw subtle HUD
    if (this.menuMode) {
      // small score display
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Menu Demo', 20, 40);
      ctx.restore();
    }
  }
}

/* -------------------------
   Drawing helpers
   ------------------------- */
function drawBackground(ctx) {
  // sky gradient
  const g = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
  g.addColorStop(0, '#87CEEB');
  g.addColorStop(1, '#bfe9ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  // clouds (simple procedural)
  drawCloud(ctx, 180, 120, 1.0);
  drawCloud(ctx, 420, 80, 0.9);
  drawCloud(ctx, 820, 140, 1.1);
  drawCloud(ctx, 1100, 90, 0.8);
}

function drawCloud(ctx, x, y, scale=1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 48, 28, 0, 0, Math.PI*2);
  ctx.ellipse(36, -6, 36, 22, 0, 0, Math.PI*2);
  ctx.ellipse(-36, -6, 36, 22, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

/* create stone-like pattern using gradient and noise lines */
function createStonePattern(ctx, x, y, w, h) {
  // create temporary canvas pattern
  const temp = document.createElement('canvas');
  temp.width = Math.max(64, Math.floor(w));
  temp.height = Math.max(64, Math.floor(h));
  const tctx = temp.getContext('2d');

  // base
  const g = tctx.createLinearGradient(0, 0, 0, temp.height);
  g.addColorStop(0, '#e6d9c6');
  g.addColorStop(1, '#bfae8f');
  tctx.fillStyle = g;
  tctx.fillRect(0, 0, temp.width, temp.height);

  // add simple cracks/noise
  tctx.strokeStyle = 'rgba(0,0,0,0.06)';
  tctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    tctx.beginPath();
    const sx = Math.random() * temp.width;
    tctx.moveTo(sx, 0);
    for (let j = 0; j < 6; j++) {
      tctx.lineTo(Math.random() * temp.width, (j+1) * (temp.height / 6));
    }
    tctx.stroke();
  }

  return ctx.createPattern(temp, 'repeat');
}

/* Rounded rectangle helper */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* -------------------------
   Collision helpers
   ------------------------- */
function circleRectCollision(circle, rect) {
  // circle: {x,y,r}, rect: {x,y,w,h}
  const distX = Math.abs(circle.x - (rect.x + rect.w/2));
  const distY = Math.abs(circle.y - (rect.y + rect.h/2));

  if (distX > (rect.w/2 + circle.r)) return false;
  if (distY > (rect.h/2 + circle.r)) return false;

  if (distX <= (rect.w/2)) return true;
  if (distY <= (rect.h/2)) return true;

  const dx = distX - rect.w/2;
  const dy = distY - rect.h/2;
  return (dx*dx + dy*dy <= (circle.r * circle.r));
}

/* -------------------------
   Utility functions
   ------------------------- */
function randRange(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function shadeColor(col, percent) {
  // simple shade function for wing color
  const f = parseInt(col.slice(1),16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const R = Math.round((t - (f>>16)) * p) + (f>>16);
  const G = Math.round((t - ((f>>8)&0x00FF)) * p) + ((f>>8)&0x00FF);
  const B = Math.round((t - (f&0x0000FF)) * p) + (f&0x0000FF);
  return `rgb(${R},${G},${B})`;
}

/* -------------------------
   Main loop & rendering
   ------------------------- */
let lastFrame = performance.now();
function mainLoop(timestamp) {
  const dt = timestamp - lastFrame;
  lastFrame = timestamp;

  // update and draw
  if (game) {
    game.update(dt);
    game.draw(ctx);
  }

  // if bird bounceTimer active, apply small visual nudge
  if (game && game.bird && game.bird.bounceTimer > 0) {
    // nudge effect handled in bird physics
  }

  requestAnimationFrame(mainLoop);
}

/* -------------------------
   Input handling (mouse, touch, keyboard)
   ------------------------- */
function onUserFlap() {
  if (!game) return;
  // If menu visible, start new game flow
  if (!menu.classList.contains('hidden')) {
    // clicking New Game should be used, but allow quick start by clicking canvas
    startNewGameSequence();
    return;
  }
  // If countdown active, start control after countdown
  if (game.countdownActive) return;
  // If game not running and not menu, start game (first click)
  if (!game.running && !game.gameOver) {
    // start running and give control
    game.start();
    game.flap();
    return;
  }
  if (game.running && game.bird.alive) {
    game.flap();
  }
}

canvas.addEventListener('mousedown', (e) => {
  onUserFlap();
});
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  onUserFlap();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    onUserFlap();
  }
});

/* -------------------------
   Menu & UI wiring
   ------------------------- */
btnNew.addEventListener('click', () => startNewGameSequence());
btnSettings.addEventListener('click', () => {
  menu.classList.add('hidden');
  settings.classList.remove('hidden');
});
btnQuit.addEventListener('click', () => {
  // Quit: simply hide overlays and stop audio
  menu.classList.add('hidden');
  audioBgm.pause();
});

btnRestart.addEventListener('click', () => {
  gameOver.classList.add('hidden');
  startNewGameSequence();
});
btnMenu.addEventListener('click', () => {
  gameOver.classList.add('hidden');
  showMenu();
});

saveSettings.addEventListener('click', () => {
  applySettings();
  settings.classList.add('hidden');
  showMenu();
});
closeSettings.addEventListener('click', () => {
  settings.classList.add('hidden');
  showMenu();
});

/* -------------------------
   Settings application
   ------------------------- */
function applySettings() {
  // apply bird color and eye size to current game and menu demo
  const color = birdColorInput.value;
  const eyeSize = parseInt(eyeSizeInput.value, 10);
  if (game) {
    game.bird.color = color;
    game.bird.eyeSize = eyeSize;
  }
  // audio volumes
  audioBgm.volume = parseFloat(musicVolInput.value);
}

/* -------------------------
   Start new game sequence (countdown -> start)
   ------------------------- */
function startNewGameSequence() {
  // hide menu
  menu.classList.add('hidden');
  // reset game instance
  game = new Game({ auto: false, menuMode: false, settings: { color: birdColorInput.value, eyeSize: parseInt(eyeSizeInput.value) } });
  // show countdown then start
  game.startCountdown(() => {
    game.start();
  });
}

/* -------------------------
   Show menu with background demo
   ------------------------- */
function showMenu() {
  // create a menu-mode game that runs in background with auto control
  game = new Game({ auto: true, menuMode: true, settings: { color: birdColorInput.value, eyeSize: parseInt(eyeSizeInput.value) } });
  game.running = true; // run in background
  menu.classList.remove('hidden');
  settings.classList.add('hidden');
  gameOver.classList.add('hidden');
  hudScore.textContent = '0';
}

/* -------------------------
   Initialize & start
   ------------------------- */
function init() {
  // set initial settings
  applySettings();

  // set audio volumes
  sfxFlap.volume = parseFloat(sfxVolInput.value);
  sfxPoint.volume = parseFloat(sfxVolInput.value);
  sfxHit.volume = parseFloat(sfxVolInput.value);
  audioBgm.volume = parseFloat(musicVolInput.value);

  // show menu demo
  showMenu();

  // start render loop
  requestAnimationFrame(mainLoop);
}

init();

/* -------------------------
   Utility: small polyfills & notes
   ------------------------- */
/* Notes:
   - Replace audio src in HTML with actual files in assets/ folder.
   - The canvas internal resolution is fixed to 1280x720 for consistent physics; CSS scales it to the container.
   - The menu runs a separate auto-controlled game instance so the background gameplay is smooth and never ends.
   - The bird bounces back visually by setting a negative vy and stopping the game; you can expand bounce behavior to include horizontal nudges.
   - Pillar design is drawn procedurally to look like ancient stone columns; you can replace with images if desired.
*/

/* End of file */
