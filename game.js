(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');
  const playfield = $('playfield');
  const screenLayer = $('screenLayer');
  const startPanel = $('startPanel');
  const pausePanel = $('pausePanel');
  const gameOverPanel = $('gameOverPanel');
  const scoreEl = $('score');
  const timeEl = $('timeLeft');
  const timerRing = $('timerRing');
  const comboEl = $('combo');
  const bestEl = $('bestScore');
  const startBtn = $('startBtn');
  const pauseBtn = $('pauseBtn');
  const resumeBtn = $('resumeBtn');
  const restartBtn = $('restartBtn');
  const resetBtn = $('resetBtn');
  const soundBtn = $('soundBtn');
  const soundIcon = $('soundIcon');
  const playHint = $('playHint');
  const statusText = $('statusText');
  const statusDot = $('statusDot');

  const FRUITS = [
    { name: 'Citrus', color: '#ffad42', light: '#ffe18a', dark: '#e87525', emoji: '🍊' },
    { name: 'Apple', color: '#ff5577', light: '#ff9a9d', dark: '#d92e59', emoji: '🍎' },
    { name: 'Kiwi', color: '#a6db4f', light: '#e0f58c', dark: '#4c9c4d', emoji: '🥝' },
    { name: 'Berry', color: '#ff6da8', light: '#ffb2cb', dark: '#cf397c', emoji: '🍑' },
    { name: 'Blueberry', color: '#7989ff', light: '#b4bdff', dark: '#4652cb', emoji: '🫐' },
    { name: 'Lemon', color: '#ffe15a', light: '#fff6a3', dark: '#e3aa27', emoji: '🍋' },
    { name: 'Watermelon', color: '#ff6877', light: '#ffb0a1', dark: '#2ebc83', emoji: '🍉' }
  ];
  const state = {
    mode: 'ready', score: 0, best: readBest(), timeLeft: 60, entities: [], particles: [], trails: [],
    lastFrame: 0, elapsed: 0, spawnClock: 0, combo: 1, lastSliceAt: -Infinity,
    pointerDown: false, lastPoint: null, pointerId: null, width: 0, height: 0, dpr: 1,
    sound: true, audio: null, raf: 0, keys: new Set(), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
  };

  function readBest() {
    try { return Number(localStorage.getItem('fruitFrenzyBest') || 0) || 0; } catch (_) { return 0; }
  }
  function saveBest() {
    try { localStorage.setItem('fruitFrenzyBest', String(state.best)); } catch (_) { /* Storage may be disabled. */ }
  }
  function formatScore(n) { return String(Math.max(0, Math.floor(n))).padStart(4, '0'); }
  function setStatus(text, active = false) {
    statusText.textContent = text;
    statusDot.classList.toggle('active', active);
  }
  function showPanel(which) {
    screenLayer.classList.remove('hidden');
    [startPanel, pausePanel, gameOverPanel].forEach((p) => p.classList.add('hidden'));
    if (which) which.classList.remove('hidden');
  }
  function hidePanels() { screenLayer.classList.add('hidden'); }

  function resizeCanvas() {
    const rect = playfield.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const oldW = state.width || rect.width;
    const oldH = state.height || rect.height;
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (state.entities.length && oldW && oldH) {
      const sx = state.width / oldW, sy = state.height / oldH;
      state.entities.forEach((e) => { e.x *= sx; e.y *= sy; e.vx *= sx; e.vy *= sy; });
    }
    drawScene(0);
  }

  function random(min, max) { return min + Math.random() * (max - min); }
  function spawnWave() {
    const count = Math.random() < 0.24 ? 3 : (Math.random() < 0.72 ? 2 : 1);
    const bombChance = Math.min(0.2, 0.08 + state.elapsed / 900);
    const baseX = random(state.width * 0.18, state.width * 0.82);
    for (let i = 0; i < count; i++) {
      const isBomb = Math.random() < bombChance && i === count - 1;
      const fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
      const radius = random(19, 27) * Math.min(1.12, state.width / 360);
      state.entities.push({
        type: isBomb ? 'bomb' : 'fruit', fruit, x: Math.max(radius, Math.min(state.width - radius, baseX + (i - (count - 1) / 2) * random(40, 64))),
        y: state.height + radius + random(4, 22), r: radius, vx: random(-95, 95), vy: random(-570, -455) - state.elapsed * 0.65,
        gravity: random(760, 920), rotation: random(-0.4, 0.4), spin: random(-0.055, 0.055), sliced: false, wobble: random(0, 7), born: state.elapsed
      });
    }
  }

  function ensureAudio() {
    if (!state.sound) return null;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!state.audio) state.audio = new AudioCtx();
      if (state.audio.state === 'suspended') state.audio.resume();
      return state.audio;
    } catch (_) { return null; }
  }
  function tone(freq, duration, type = 'sine', volume = 0.035, endFreq = null) {
    const ac = ensureAudio();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), ac.currentTime + duration);
      gain.gain.setValueAtTime(volume, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.connect(gain); gain.connect(ac.destination); osc.start(); osc.stop(ac.currentTime + duration);
    } catch (_) { /* Audio is optional. */ }
  }
  function playSliceSound(combo) {
    tone(420 + Math.min(combo, 8) * 55, 0.11, 'sine', 0.04, 780 + Math.min(combo, 8) * 30);
    if (combo >= 3) window.setTimeout(() => tone(760, 0.09, 'triangle', 0.025, 980), 45);
  }
  function playBombSound() { tone(150, 0.22, 'sawtooth', 0.045, 65); }

  function burst(x, y, color, amount = 13, bomb = false) {
    const total = state.reducedMotion ? Math.ceil(amount / 2) : amount;
    for (let i = 0; i < total; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = random(1.2, bomb ? 5.5 : 4.5);
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: random(0.35, 0.8), maxLife: 0.8, size: random(2, bomb ? 5 : 6), color: bomb ? (i % 2 ? '#ff6d9d' : '#ffcf6e') : color, gravity: 0.1, shape: Math.random() < 0.5 ? 'circle' : 'dash' });
    }
    if (!state.reducedMotion && !bomb) {
      for (let i = 0; i < 4; i++) state.particles.push({ x: x + random(-7, 7), y: y + random(-7, 7), vx: random(-1, 1), vy: random(-1, 1), life: 0.23, maxLife: 0.23, size: random(7, 12), color: '#ffffff', gravity: 0, shape: 'ring' });
    }
  }
  function addTrail(point) {
    state.trails.push({ x: point.x, y: point.y, life: 0.2, maxLife: 0.2 });
    if (state.trails.length > 18) state.trails.shift();
  }
  function sliceAt(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (Math.hypot(dx, dy) < 4) return;
    let slicedAny = false;
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const e = state.entities[i];
      if (e.sliced || distanceToSegment(e.x, e.y, x1, y1, x2, y2) > e.r + 7) continue;
      e.sliced = true;
      if (e.type === 'bomb') {
        state.score = Math.max(0, state.score - 10);
        burst(e.x, e.y, '#ff6d9d', 22, true);
        playBombSound();
        state.combo = 1;
        state.lastSliceAt = -Infinity;
        setStatus('BOMB HIT · −10 POINTS', false);
        state.entities.splice(i, 1);
        updateHUD();
        continue;
      }
      const now = performance.now();
      state.combo = now - state.lastSliceAt < 900 ? Math.min(9, state.combo + 1) : 1;
      state.lastSliceAt = now;
      const points = 10 * state.combo;
      state.score += points;
      burst(e.x, e.y, e.fruit.color, 15);
      playSliceSound(state.combo);
      addFloatingText(e.x, e.y, `+${points}`, state.combo >= 3 ? '#d9ff67' : '#ffffff');
      state.entities.splice(i, 1);
      slicedAny = true;
    }
    if (slicedAny) {
      setStatus(state.combo >= 3 ? `NICE COMBO · ×${state.combo}` : 'NICE SLICE!', true);
      updateHUD();
    }
  }
  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (!len2) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  function addFloatingText(x, y, text, color) {
    state.particles.push({ x, y, vx: 0, vy: -1.4, life: 0.72, maxLife: 0.72, size: 15, color, gravity: -0.01, shape: 'text', text });
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  }
  function drawFruit(e) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rotation);
    const r = e.r;
    if (e.type === 'bomb') {
      ctx.shadowColor = '#ff5277'; ctx.shadowBlur = 17;
      const grad = ctx.createRadialGradient(-r * .35, -r * .4, 2, 0, 0, r * 1.15);
      grad.addColorStop(0, '#65708e'); grad.addColorStop(.45, '#303a5a'); grad.addColorStop(1, '#11172b');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, r * .91, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#8290b6'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.strokeStyle = '#ffbd67'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(r * .22, -r * .75); ctx.quadraticCurveTo(r * .52, -r * 1.15, r * .73, -r * .92); ctx.stroke();
      ctx.fillStyle = '#ffdf83'; ctx.beginPath(); ctx.arc(r * .76, -r * .94, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6d9d'; ctx.font = `bold ${r * .92}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✹', 0, 1);
      ctx.restore(); return;
    }
    const g = ctx.createRadialGradient(-r * .36, -r * .42, r * .04, 0, 0, r * 1.18);
    g.addColorStop(0, e.fruit.light); g.addColorStop(.38, e.fruit.color); g.addColorStop(1, e.fruit.dark);
    ctx.shadowColor = e.fruit.color; ctx.shadowBlur = 12;
    ctx.fillStyle = g; ctx.beginPath();
    if (e.fruit.name === 'Lemon') {
      ctx.moveTo(-r * .95, 0); ctx.quadraticCurveTo(-r * .55, -r * .75, 0, -r * .7); ctx.quadraticCurveTo(r * .55, -r * .75, r * .95, 0); ctx.quadraticCurveTo(r * .55, r * .75, 0, r * .7); ctx.quadraticCurveTo(-r * .55, r * .75, -r * .95, 0); ctx.closePath();
    } else if (e.fruit.name === 'Apple') {
      ctx.moveTo(0, -r * .65); ctx.bezierCurveTo(-r * .65, -r * 1.1, -r * 1.12, -.1 * r, -r * .8, r * .52); ctx.bezierCurveTo(-r * .5, r * 1.06, -.12 * r, r * .85, 0, r * .8); ctx.bezierCurveTo(r * .22, r * .92, r * .65, r * 1.02, r * .86, r * .42); ctx.bezierCurveTo(r * 1.1, -r * .22, r * .55, -r * 1.02, 0, -r * .65); ctx.closePath();
    } else { ctx.ellipse(0, 0, r * .88, r, 0, 0, Math.PI * 2); }
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff80'; ctx.beginPath(); ctx.ellipse(-r * .35, -r * .3, r * .14, r * .25, -.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#315a3c'; ctx.beginPath(); ctx.ellipse(r * .1, -r * .92, r * .25, r * .11, -.5, 0, Math.PI * 2); ctx.fill();
    if (e.fruit.name === 'Watermelon') {
      ctx.strokeStyle = '#b3f274'; ctx.lineWidth = 2; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * r * .34, -r * .58); ctx.quadraticCurveTo(k * r * .34 - 4, 0, k * r * .34, r * .58); ctx.stroke(); }
    }
    if (e.fruit.name === 'Kiwi' || e.fruit.name === 'Blueberry') {
      ctx.fillStyle = '#fff4ce'; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * r * .47, Math.sin(a) * r * .47, 1.6, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawScene(dt) {
    if (!ctx || !state.width || !state.height) return;
    ctx.clearRect(0, 0, state.width, state.height);
    // Soft ambient glows keep the playfield lively without external assets.
    const glow = ctx.createRadialGradient(state.width * .5, state.height * .95, 4, state.width * .5, state.height * .95, state.height * .6);
    glow.addColorStop(0, '#d9ff670a'); glow.addColorStop(1, '#d9ff6700'); ctx.fillStyle = glow; ctx.fillRect(0, 0, state.width, state.height);
    state.entities.forEach(drawFruit);
    state.particles.forEach((p) => {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife)); ctx.globalAlpha = alpha; ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
      if (p.shape === 'text') { ctx.font = `800 ${p.size}px "Space Grotesk", sans-serif`; ctx.textAlign = 'center'; ctx.fillText(p.text, p.x, p.y); }
      else if (p.shape === 'ring') { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - alpha + .25), 0, Math.PI * 2); ctx.stroke(); }
      else if (p.shape === 'dash') { ctx.lineWidth = Math.max(1, p.size * .55); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.3, p.y - p.vy * 2.3); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    if (state.trails.length > 1) {
      for (let i = 1; i < state.trails.length; i++) {
        const a = state.trails[i - 1], b = state.trails[i];
        ctx.globalAlpha = Math.min(a.life / a.maxLife, b.life / b.maxLife) * .8;
        ctx.strokeStyle = '#d9ff67'; ctx.lineWidth = 2 + (i / state.trails.length) * 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function update(dt) {
    if (state.mode !== 'playing') return;
    state.elapsed += dt;
    state.timeLeft = Math.max(0, 60 - state.elapsed);
    state.spawnClock += dt;
    const spawnEvery = Math.max(.48, 0.92 - state.elapsed / 160);
    if (state.spawnClock >= spawnEvery) { state.spawnClock = 0; spawnWave(); }
    const seconds = dt;
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const e = state.entities[i];
      e.x += e.vx * seconds; e.y += e.vy * seconds; e.vy += e.gravity * seconds; e.rotation += e.spin * seconds * 60;
      if (e.y > state.height + e.r * 2 || e.x < -e.r * 3 || e.x > state.width + e.r * 3) state.entities.splice(i, 1);
    }
    state.particles = state.particles.filter((p) => { p.life -= dt; p.x += p.vx * seconds * 60; p.y += p.vy * seconds * 60; p.vy += p.gravity * seconds; p.vx *= .985; return p.life > 0; });
    state.trails = state.trails.filter((p) => { p.life -= dt; return p.life > 0; });
    if (state.timeLeft <= 0) { endGame(); return; }
    updateHUD();
  }
  function frame(now) {
    const dt = Math.min(.034, Math.max(0, (now - (state.lastFrame || now)) / 1000));
    state.lastFrame = now;
    update(dt); drawScene(dt);
    state.raf = requestAnimationFrame(frame);
  }
  function updateHUD() {
    scoreEl.textContent = formatScore(state.score);
    timeEl.textContent = String(Math.ceil(state.timeLeft));
    comboEl.textContent = `×${state.combo}`;
    bestEl.textContent = formatScore(state.best);
    timerRing.classList.toggle('urgent', state.timeLeft <= 10 && state.mode === 'playing');
  }
  function startGame() {
    ensureAudio();
    state.mode = 'playing'; state.score = 0; state.timeLeft = 60; state.elapsed = 0; state.spawnClock = .45;
    state.combo = 1; state.lastSliceAt = -Infinity; state.entities = []; state.particles = []; state.trails = [];
    state.lastFrame = performance.now(); hidePanels(); playHint.classList.remove('hidden');
    pauseBtn.disabled = false; pauseBtn.innerHTML = '<span aria-hidden="true">Ⅱ</span> PAUSE';
    setStatus('SLICE MODE ACTIVE', true); updateHUD();
    if (!state.raf) state.raf = requestAnimationFrame(frame);
  }
  function pauseGame() {
    if (state.mode === 'playing') {
      state.mode = 'paused'; state.pointerDown = false; state.lastPoint = null;
      pauseBtn.innerHTML = '<span aria-hidden="true">▶</span> RESUME'; setStatus('GAME PAUSED'); showPanel(pausePanel);
    } else if (state.mode === 'paused') resumeGame();
  }
  function resumeGame() {
    if (state.mode !== 'paused') return;
    ensureAudio(); state.mode = 'playing'; state.lastFrame = performance.now(); hidePanels();
    pauseBtn.innerHTML = '<span aria-hidden="true">Ⅱ</span> PAUSE'; setStatus('SLICE MODE ACTIVE', true);
  }
  function endGame() {
    state.mode = 'over'; state.pointerDown = false; state.lastPoint = null;
    const isNewBest = state.score > state.best;
    state.best = Math.max(state.best, state.score); saveBest(); updateHUD();
    $('finalScore').textContent = formatScore(state.score); $('finalBest').textContent = formatScore(state.best);
    $('gameOverTitle').innerHTML = isNewBest ? 'Fresh <em>legend!</em>' : 'Sweet <em>work!</em>'; 
    $('resultMessage').textContent = state.score >= 300 ? 'That was a seriously juicy run.' : 'Every slice is a chance to top it.';
    pauseBtn.disabled = true; pauseBtn.innerHTML = '<span aria-hidden="true">Ⅱ</span> PAUSE';
    setStatus('ROUND COMPLETE'); playHint.classList.add('hidden'); showPanel(gameOverPanel); tone(520, .18, 'triangle', .03, 720);
  }
  function restartGame() { startGame(); }

  function getPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(state.width, event.clientX - rect.left)), y: Math.max(0, Math.min(state.height, event.clientY - rect.top)) };
  }
  function onPointerDown(event) {
    if (state.mode !== 'playing') return;
    state.pointerDown = true; state.pointerId = event.pointerId; state.lastPoint = getPoint(event);
    addTrail(state.lastPoint);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* Capture is not supported by every input source. */ }
  }
  function onPointerMove(event) {
    if (!state.pointerDown || state.mode !== 'playing' || (state.pointerId !== null && event.pointerId !== state.pointerId)) return;
    const point = getPoint(event);
    if (state.lastPoint) sliceAt(state.lastPoint.x, state.lastPoint.y, point.x, point.y);
    addTrail(point); state.lastPoint = point;
  }
  function onPointerUp(event) {
    if (state.pointerId !== null && event.pointerId !== state.pointerId) return;
    state.pointerDown = false; state.lastPoint = null; state.pointerId = null;
    try { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ }
  }

  // Only suppress browser gestures while a real game swipe is in progress, and only inside the arena.
  playfield.addEventListener('touchmove', (event) => { if (state.pointerDown && state.mode === 'playing') event.preventDefault(); }, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('lostpointercapture', onPointerUp);
  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', restartGame);
  resetBtn.addEventListener('click', restartGame);
  pauseBtn.addEventListener('click', pauseGame);
  resumeBtn.addEventListener('click', resumeGame);
  soundBtn.addEventListener('click', () => {
    state.sound = !state.sound;
    if (state.sound) ensureAudio();
    soundIcon.textContent = state.sound ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-pressed', String(state.sound));
    soundBtn.setAttribute('aria-label', state.sound ? 'Turn sound off' : 'Turn sound on');
    if (state.sound) tone(620, .07, 'sine', .02, 780);
  });
  window.addEventListener('resize', resizeCanvas, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(playfield);
  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) && state.mode === 'playing') event.preventDefault();
    if (event.code === 'Escape' || event.code === 'KeyP') { if (state.mode === 'playing' || state.mode === 'paused') pauseGame(); }
    if ((event.code === 'Enter' || event.code === 'Space') && (state.mode === 'ready' || state.mode === 'over')) { event.preventDefault(); startGame(); }
    // Keyboard slicing: arrow keys create a short slash at a reachable position.
    if (state.mode === 'playing' && event.code.startsWith('Arrow') && !state.keys.has(event.code)) {
      state.keys.add(event.code);
      const cx = state.width * .5, cy = state.height * .52;
      const delta = 62;
      const map = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
      const [dx, dy] = map[event.code]; sliceAt(cx - dx, cy - dy, cx + dx, cy + dy); addTrail({ x: cx + dx, y: cy + dy });
    }
    if (event.code === 'KeyR' && (state.mode === 'playing' || state.mode === 'paused' || state.mode === 'over')) restartGame();
  });
  window.addEventListener('keyup', (event) => state.keys.delete(event.code));
  window.addEventListener('blur', () => { state.keys.clear(); if (state.mode === 'playing') pauseGame(); });

  bestEl.textContent = formatScore(state.best);
  resizeCanvas(); showPanel(startPanel); updateHUD();
  state.raf = requestAnimationFrame(frame);
})();
