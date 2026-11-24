// WINK DERBY — a pixel cat race you run with your face.
// Wink left, wink right = left paw, right paw. Open your mouth = jump the puddles.
// Race the computer cats on your own, or up to 4 people online in a room.

const W = 256, H = 144;          // the game is drawn at this tiny size, then scaled up
const TRACK = 1100;              // race length in pixels
const LANE_Y = [84, 100, 116, 132];
const LANE_CLOTH = ['#e83a3a', '#3a7bff', '#ffcc33', '#36c26b'];
const STEP_PUSH = 36, DRAG = 1.5, VMAX = 110;   // ~2 winks a second keeps up with the computer cats
const JUMP_TIME = 0.7, JUMP_H = 20, WET_TIME = 1.2;
const JUMP_DASH = 35;            // extra forward speed while you're in the air
const PUDDLE_IN = 5, PUDDLE_OUT = 13;   // only the middle of a puddle gets you wet
const NAME_MAX = 7;

let pg, camG, scaleBy = 3;
let mode = 'name', modeT = 0, raceT = 0;
let online = false;              // is the current race an online one?
let raceStart = 0;               // solo: millis() when the gun goes; online: server ms
let lastStartAt = 0;             // last online race we joined
let afterCalib = 'menu', customBack = 'solo';
let me, cats = [], puddles = [], finishOrder = [], remote = {};
let camX = 0, popups = [], drops = [], clouds = [], crowd = [];
let myCfg = { fur: 0, coat: 0, eyes: 0, face: 0, ears: 0, cloth: '#e83a3a' };
let playerName = '';
let sel = 0, lastCount = -1, fontOK = false;
let puddleImg, sunImg, uiButtons = [];

// ---------- setup ----------
function setup() {
  pixelDensity(1);
  const c = createCanvas(W * scaleBy, H * scaleBy);
  c.parent('stage');
  fitCanvas();
  noSmooth();
  pg = createGraphics(W, H); pg.pixelDensity(1); pg.noSmooth();
  camG = createGraphics(40, 30); camG.pixelDensity(1); camG.noSmooth();
  puddleImg = bakeGrid(PUDDLE, { b: '#3d7be0', L: '#a8dcff' });
  sunImg = bakeGrid(SUN_FISH, { y: '#ffd23f', k: '#3a2418' });
  for (let i = 0; i < 9; i++) clouds.push({ x: random(0, TRACK), y: random(10, 34), w: floor(random(10, 22)) });
  for (let x = -20; x < TRACK + 300; x += 7) crowd.push({ x, hue: floor(random(5)), ph: random(TAU) });
  try { const saved = JSON.parse(localStorage.getItem('winkDerbyCat')); if (saved) myCfg = { ...myCfg, ...saved }; } catch (e) {}
  try { playerName = localStorage.getItem('winkDerbyName') || ''; } catch (e) {}
  document.fonts.load('8px "Press Start 2P"').then(() => { fontOK = true; });
  Face.onWink = side => onWink(side);
  Face.onMouth = () => onMouth();
  Net.onRoom = room => onRoom(room);
  Net.init();
  setupForms();
  soloRace();
  setMode(playerName ? 'menu' : 'name');
}

function fitCanvas() {
  scaleBy = Math.max(2, Math.floor(Math.min((windowWidth - 32) / W, (windowHeight - 90) / H)));
  resizeCanvas(W * scaleBy, H * scaleBy);
  noSmooth();
}
function windowResized() { fitCanvas(); }

function setMode(m) {
  mode = m; modeT = 0;
  document.getElementById('nameForm').hidden = m !== 'name';
  document.getElementById('codeForm').hidden = m !== 'join';
  if (m === 'name') { const i = document.getElementById('nameInput'); i.value = playerName; setTimeout(() => i.focus(), 0); }
  if (m === 'join') { const i = document.getElementById('codeInput'); setTimeout(() => i.focus(), 0); }
}

// ---------- name + room code forms (real text boxes over the canvas) ----------
function setupForms() {
  const nameForm = document.getElementById('nameForm');
  nameForm.addEventListener('submit', e => {
    e.preventDefault();
    const clean = document.getElementById('nameInput').value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, NAME_MAX);
    if (!clean) { document.getElementById('nameErr').textContent = 'letters or numbers, please'; return; }
    playerName = clean;
    try { localStorage.setItem('winkDerbyName', clean); } catch (err) {}
    unlockAudio(); blip(660, 0.06); blip(880, 0.08, 0.07);
    const fromLink = new URLSearchParams(location.search).get('room');
    if (fromLink) { document.getElementById('codeInput').value = fromLink.toUpperCase(); setMode('join'); }
    else setMode('menu');
  });
  const codeForm = document.getElementById('codeForm');
  codeForm.addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('codeErr');
    const code = document.getElementById('codeInput').value.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 4) { err.textContent = 'the code has 4 letters'; return; }
    if (!Net.ok) { err.textContent = 'not connected yet, try again in a second'; return; }
    err.textContent = 'joining...';
    unlockAudio();
    let r;
    try { r = await Net.join(code, playerName, myCfg); } catch (e2) { r = { ok: false, error: 'no access to rooms' }; }
    if (!r.ok) { err.textContent = r.error.toLowerCase(); return; }
    err.textContent = '';
    ensureCamera('lobby');
  });
  document.getElementById('codeBack').addEventListener('click', () => setMode('menu'));
}

// ---------- races ----------
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makePuddles(seed) {
  const r = seededRandom(seed);
  return LANE_Y.map(() => {
    const list = [];
    for (let x = 150 + r() * 40; x < TRACK - 70; x += 120 + r() * 90) list.push({ x, hit: new Set(), seen: new Set() });
    return list;
  });
}
function resetRaceState() { finishOrder = []; popups = []; drops = []; camX = 0; raceT = 0; lastCount = -1; }

function makeCat(name, cfg, lane, extra = {}) {
  return { name, cfg, lane, x: 10, v: 0, base: 0, skill: 1, napper: false, ph: random(TAU), dist: 0,
           legs: 'A', last: null, jumpT: 0, wet: 0, nap: 0, done: false, time: 0, ...extra };
}

// solo: you in lane 2 against the computer cats
function soloRace() {
  online = false;
  me = makeCat(playerName || 'YOU', { ...myCfg, cloth: LANE_CLOTH[0] }, 2);
  const bots = RIVALS.map((r, i) => makeCat(r.name, r.cfg, [0, 1, 3][i], { base: r.base, skill: r.skill, napper: r.napper, bot: true }));
  cats = [bots[0], bots[1], me, bots[2]];
  puddles = makePuddles(Math.floor(Math.random() * 1e9));
  resetRaceState();
}
function startSoloCountdown() { soloRace(); raceStart = millis() + 3000; setMode('count'); }

// online: everyone in the room, one lane each, same puddles, same start time
function onRoom(room) {
  const ps = Net.players();
  remote = {};
  ps.forEach(p => { remote[p.id] = p; });
  const fresh = room.startAt && room.startAt !== lastStartAt && room.startAt > Net.now() - 1500;
  if (fresh && ['lobby', 'done', 'custom', 'calib', 'count', 'race'].includes(mode) && ps.some(p => p.id === Net.uid)) {
    lastStartAt = room.startAt;
    onlineRace(room, ps);
  }
}
function onlineRace(room, ps) {
  online = true;
  raceStart = room.startAt;
  cats = ps.map((p, lane) => {
    const cfg = { ...(p.id === Net.uid ? myCfg : p.cfg), cloth: LANE_CLOTH[lane] };
    return makeCat(p.id === Net.uid ? playerName : p.name, cfg, lane, { id: p.id, remote: p.id !== Net.uid });
  });
  me = cats.find(c => !c.remote);
  puddles = makePuddles(room.seed);
  resetRaceState();
  setMode('count');
}
// seconds since the gun (negative during the countdown)
function raceClock() { return online ? (Net.now() - raceStart) / 1000 : (millis() - raceStart) / 1000; }

// ---------- input: face, keyboard, mouse ----------
function onWink(side) {
  if (mode === 'custom') { changeChoice(side === 'L' ? -1 : 1); return; }
  if (mode === 'race') step(me, side);
}
function onMouth() {
  if (mode === 'custom') { if (sel < CHOICES.length) { sel++; blip(660, 0.05); } else finishCustom(); return; }
  if (mode === 'race') jump(me);
  else if (mode === 'done' && !online && modeT > 1.2) startSoloCountdown();
}

function keyPressed() {
  if (mode === 'name' || mode === 'join') return true;   // let the text boxes have the keys
  unlockAudio();
  const k = key.toLowerCase();
  if (mode === 'calib' && k === ' ') { setMode(afterCalib); return false; }
  if (mode === 'custom') {
    if (keyCode === UP_ARROW) sel = (sel + CHOICES.length) % (CHOICES.length + 1);
    else if (keyCode === DOWN_ARROW) sel = (sel + 1) % (CHOICES.length + 1);
    else if (keyCode === LEFT_ARROW) changeChoice(-1);
    else if (keyCode === RIGHT_ARROW) changeChoice(1);
    else if (k === 'r') randomise();
    else if (k === ' ' || keyCode === ENTER) finishCustom();
    return false;
  }
  if (mode === 'lobby' && (k === ' ' || keyCode === ENTER) && Net.isHost()) { Net.startRace(); return false; }
  if (mode === 'race') {
    if (k === 'f') step(me, 'L');
    else if (k === 'j') step(me, 'R');
    else if (k === ' ') jump(me);
    return false;
  }
  if (mode === 'done' && modeT > 0.6) {
    if (online) { if (k === ' ' || keyCode === ENTER) setMode('lobby'); }
    else if (k === ' ' || keyCode === ENTER) startSoloCountdown();
    else if (k === 'c') openCustom('solo');
    return false;
  }
}

function mousePressed() {
  if (mode === 'name' || mode === 'join') return;
  unlockAudio();
  const mx = mouseX / scaleBy, my = mouseY / scaleBy;
  if (mx < 0 || my < 0 || mx > W || my > H) return;
  if (mode === 'custom') {
    CHOICES.forEach((ch, i) => {
      const y = rowY(i);
      if (my > y - 6 && my < y + 6 && mx > 114) {
        sel = i;
        if (mx > 150 && mx < 172) changeChoice(-1);
        if (mx > 232) changeChoice(1);
      }
    });
  }
  const b = uiButtons.find(b => b.enabled && hit(mx, my, b));
  if (b) { blip(700, 0.04); b.action(); }
}
const hit = (x, y, r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
const rowY = i => 30 + i * 15;

// Buttons are re-registered every frame while drawing, so clicks always match what's on screen.
function button(x, y, w, h, label, action, style = 'main', enabled = true) {
  const cols = { main: ['#5fff8f', '#1d1630'], alt: ['#3c3157', '#c9b8ff'], hot: ['#ffcc33', '#1d1630'] };
  const [bg, fg] = enabled ? cols[style] : ['#2a2142', '#5a4f7a'];
  px(x, y, w, h, bg);
  txt(label, x + w / 2, y + Math.floor((h - 8) / 2), fg, 8, CENTER);
  uiButtons.push({ x, y, w, h, action, enabled });
}

function ensureCamera(next) {
  if (Face.state === 'off') { Face.start(); Face.resetCalibration(); afterCalib = next; setMode('calib'); }
  else setMode(next);
}
function openCustom(back) { customBack = back; sel = 0; setMode('custom'); }
function finishCustom() {
  saveCat();
  if (customBack === 'lobby') { Net.updateMe({ cfg: myCfg }); setMode('lobby'); }
  else startSoloCountdown();
}
function changeChoice(d) {
  if (sel >= CHOICES.length) return;
  const ch = CHOICES[sel];
  myCfg[ch.key] = (myCfg[ch.key] + d + ch.list.length) % ch.list.length;
  saveCat();
  blip(d > 0 ? 720 : 540, 0.04);
}
function randomise() { myCfg = randomCat(myCfg.cloth); saveCat(); blip(880, 0.05); blip(990, 0.05, 0.06); }
function saveCat() { try { localStorage.setItem('winkDerbyCat', JSON.stringify(myCfg)); } catch (e) {} }

async function createRoom() {
  popup('MAKING A ROOM...', '#c9b8ff');
  let r;
  try { r = await Net.create(playerName, myCfg); } catch (e) { r = { ok: false, error: 'NO ACCESS' }; }
  if (r.ok) ensureCamera('lobby'); else popup(r.error, '#ff6b6b');
}
function leaveRoom() { Net.leave(); online = false; soloRace(); setMode('menu'); }

// ---------- running ----------
function step(c, side) {
  if (c.wet > 0 || c.done) return;
  if (c.last === side) {
    c.v *= 0.8;
    if (c === me) { popup('SAME PAW!', '#ff6b6b'); blip(180, 0.08, 0, 'sawtooth'); }
    return;
  }
  c.v = Math.min(c.v + STEP_PUSH, VMAX);
  c.last = side;
  c.legs = side === 'L' ? 'A' : 'B';
  if (c === me) blip(side === 'L' ? 523 : 659, 0.035);
}
function jump(c) {
  if (c.jumpT > 0 || c.wet > 0 || c.done) return;
  c.jumpT = 0.0001;
  if (c === me) { blip(400, 0.12, 0, 'square', 900); }
}
function splash(c) {
  c.wet = WET_TIME; c.v = 0;
  for (let i = 0; i < 14; i++) drops.push({ x: c.x + 10, y: LANE_Y[c.lane] - 2, vx: random(-40, 40), vy: random(-70, -30), t: 0.8 });
  if (c === me) { popup('SPLASH!', '#6fc3ff'); noiseBurst(0.25); }
}

// other people's cats: follow what they report, smoothly
function updateRemoteCat(c, dt) {
  const p = remote[c.id];
  if (!p) return;
  c.v = p.v || 0;
  c.x += c.v * dt;
  c.x += ((p.x || 0) - c.x) * Math.min(1, dt * 5);
  c.dist += c.v * dt;
  c.legs = p.legs || 'A';
  if (p.air && c.jumpT === 0) c.jumpT = 0.0001;
  if (c.jumpT > 0) { c.jumpT += dt; if (c.jumpT > JUMP_TIME) c.jumpT = 0; }
  if (p.wet && !c.wasWet) splash(c);
  c.wasWet = p.wet;
  if (c.wet > 0) c.wet -= dt;
  if (p.done && !c.done) { c.done = true; c.time = p.time; finishOrder.push(c); }
}

function updateCat(c, dt) {
  if (c.remote) { updateRemoteCat(c, dt); return; }
  if (c.done) { c.v *= Math.exp(-2 * dt); }
  if (c.wet > 0) { c.wet -= dt; c.v = 0; }
  else if (c.nap > 0) { c.nap -= dt; c.v = 0; if (c.nap <= 0) c.v = c.base; }
  else if (c.bot && !c.done) {
    const target = c.base + 7 * Math.sin(raceT * 0.9 + c.ph);
    c.v += (target - c.v) * Math.min(1, dt * 2);
    if (c.napper && raceT > 5 && random() < 0.07 * dt) { c.nap = 1.3; popup(c.name + ' FELL ASLEEP', '#c9b8ff'); }
  } else if (c === me) {
    c.v *= Math.exp(-DRAG * dt);
  }
  const dash = c === me && c.jumpT > 0 ? JUMP_DASH : 0;   // a jump carries you forward
  c.x += (c.v + dash) * dt;
  c.dist += c.v * dt;
  if (c.bot && c.wet <= 0 && c.nap <= 0) c.legs = c.jumpT > 0 ? 'JUMP' : (Math.floor(c.dist / 7) % 2 ? 'A' : 'B');

  if (c.jumpT > 0) { c.jumpT += dt; if (c.jumpT > JUMP_TIME) c.jumpT = 0; }

  for (const p of puddles[c.lane]) {
    const centre = c.x + 10;
    // computer cats decide right before the puddle; most of the time they hop over it
    if (c.bot && !p.seen.has(c) && centre >= p.x - 2 && centre < p.x + 4) {
      p.seen.add(c);
      if (random() < c.skill) jump(c);
    }
    // you only get wet if your middle lands in the water while you're on the ground
    if (c.jumpT === 0 && centre > p.x + PUDDLE_IN && centre < p.x + PUDDLE_OUT && !p.hit.has(c) && c.wet <= 0) {
      p.hit.add(c);
      splash(c);
    }
  }
  if (!c.done && c.x + 18 >= TRACK) {
    c.done = true; c.time = raceT; finishOrder.push(c);
    if (c === me) {
      if (online) Net.sendCat(me, true);
      setMode('done');
      fanfare(finishOrder.length === 1);
    }
  }
  if (c === me && online && mode === 'race') Net.sendCat(me);
}

// ---------- draw ----------
function draw() {
  const dt = Math.min(deltaTime / 1000, 0.05);
  modeT += dt;
  uiButtons = [];
  if (Face.ready()) Face.update();

  if (mode === 'calib') {
    if (Face.state === 'denied') setMode(afterCalib);
    if (Face.ready()) Face.sampleCalibration();
    if (Face.calibrated() && modeT > 1.5) setMode(afterCalib);
  }
  if (mode === 'count') {
    const left = -raceClock();
    const n = Math.min(3, Math.ceil(left));
    if (n !== lastCount && n > 0) { lastCount = n; blip(440, 0.12); }
    if (left <= 0) { blip(880, 0.25); setMode('race'); }
  }
  if (mode === 'race' || mode === 'done') {
    raceT = Math.max(0, raceClock());   // keeps running after you finish so the others get their own times
    cats.forEach(c => updateCat(c, dt));
    if (mode === 'race' && me.v > 75 && random() < dt * 0.6) popup('ZOOMIES!', '#ffcc33');
  }
  if (mode === 'race' || mode === 'done' || mode === 'count') {
    camX += (constrain(me.x - 80, 0, TRACK + 50 - W) - camX) * Math.min(1, dt * 6);
  }

  pg.push();
  drawWorld();
  if (mode === 'name' || mode === 'join') px(0, 0, W, H, 'rgba(29,22,48,0.7)');
  if (mode === 'menu') drawMenu();
  if (mode === 'calib') drawCalib();
  if (mode === 'custom') drawCustom();
  if (mode === 'lobby') drawLobby();
  if (mode === 'count') { drawHud(); drawCount(); }
  if (mode === 'race') { drawHud(); if (raceT < 0.6) txt('MEOW!', W / 2, 30, '#ffcc33', 16, CENTER); }
  if (mode === 'done') { drawHud(); drawDone(); }
  drawPopups(dt);
  pg.pop();

  image(pg, 0, 0, width, height);
}

function px(x, y, w, h, col) { pg.noStroke(); pg.fill(col); pg.rect(Math.round(x), Math.round(y), w, h); }
function txt(s, x, y, col = '#fff6e0', size = 8, align = LEFT) {
  if (!fontOK) return;
  pg.textFont('Press Start 2P'); pg.textSize(size); pg.textAlign(align, TOP);
  pg.noStroke(); pg.fill('#1d1630'); pg.text(s, Math.round(x) + 1, Math.round(y) + 1);
  pg.fill(col); pg.text(s, Math.round(x), Math.round(y));
}

function drawWorld() {
  const t = millis() / 1000;
  // sky in pixel bands
  ['#9ee7ff', '#8fd8fb', '#80c8f4', '#74b9ee', '#6aaee8'].forEach((c, i) => px(0, i * 11, W, 11, c));
  pg.image(sunImg, 120 + Math.sin(t * 0.3) * 30 - camX * 0.02, 6 + Math.round(Math.sin(t * 2)));
  for (const c of clouds) {
    const x = Math.round(((c.x - camX * 0.3) % (W + 60) + W + 60) % (W + 60) - 30);
    px(x, c.y, c.w, 3, '#ffffff'); px(x + 3, c.y - 2, c.w - 7, 2, '#ffffff');
  }
  // hills
  for (let x = 0; x < W; x += 4) {
    const wx = x + camX * 0.5;
    const h = 8 + Math.round(6 * Math.sin(wx * 0.02) + 4 * Math.sin(wx * 0.053));
    px(x, 52 - h, 4, h, '#58b36b');
  }
  px(0, 52, W, LANE_Y[0] - 14 - 52, '#4a9a5c');   // ground between the hills and the first lane
  // crowd of tiny pixel cats behind the fence
  const crowdCols = ['#f08a24', '#3a3550', '#f4f1ea', '#8a93a6', '#ff8fb1'];
  for (const p of crowd) {
    const x = p.x - camX;
    if (x < -6 || x > W) continue;
    const bob = (mode === 'race' && Math.sin(t * 8 + p.ph) > 0.6) ? 1 : 0;
    px(x, 56 - bob, 4, 4, crowdCols[p.hue]); px(x, 55 - bob, 1, 1, crowdCols[p.hue]); px(x + 3, 55 - bob, 1, 1, crowdCols[p.hue]);
  }
  // fence
  px(0, 61, W, 2, '#fff6e0');
  for (let x = -((camX | 0) % 8); x < W; x += 8) px(x, 59, 2, 9, '#fff6e0');
  // lanes
  LANE_Y.forEach((y, i) => {
    px(0, y - 14, W, 16, i % 2 ? '#6fbf52' : '#62b247');
    for (let x = -((camX | 0) % 12); x < W; x += 12) px(x, y + 1, 6, 1, '#9be07e');
  });
  px(0, LANE_Y[3] + 2, W, H - LANE_Y[3] - 2, '#4f9a3c');
  // start + finish lines
  const sx = 28 - camX, fx = TRACK - camX;
  if (sx > -4 && sx < W) px(sx, 70, 2, 64, '#fff6e0');
  if (fx > -8 && fx < W + 8) for (let y = 70; y < 134; y += 3) for (let k = 0; k < 2; k++)
    px(fx + k * 3, y, 3, 3, ((y / 3 + k) | 0) % 2 ? '#1d1630' : '#ffffff');
  // puddles and cats, lane by lane
  LANE_Y.forEach((y, lane) => {
    for (const p of puddles[lane]) { const x = p.x - camX; if (x > -20 && x < W) pg.image(puddleImg, Math.round(x), y - 3); }
    for (const c of cats) if (c.lane === lane) drawCat(c);
  });
  // splash drops
  for (const d of drops) {
    d.t -= 1 / 60; d.vy += 200 / 60; d.x += d.vx / 60; d.y += d.vy / 60;
    if (d.t > 0) px(d.x - camX, d.y, 1, 1, '#6fc3ff');
  }
  drops = drops.filter(d => d.t > 0);
}

function drawCat(c) {
  const x = Math.round(c.x - camX);
  if (x < -80 || x > W + 4) return;
  const ground = LANE_Y[c.lane];
  const lift = c.jumpT > 0 ? Math.round(Math.sin(Math.PI * c.jumpT / JUMP_TIME) * JUMP_H) : 0;
  const bob = (c.v > 5 && lift === 0 && Math.floor(c.dist / 7) % 2) ? 1 : 0;
  px(x + 3, ground - 1, 14, 2, 'rgba(0,0,0,0.18)');  // shadow
  const legs = c.jumpT > 0 ? 'JUMP' : (c.wet > 0 || c.nap > 0 ? 'B' : c.legs);
  const shake = c.wet > 0 ? Math.round(Math.sin(millis() / 30)) : 0;
  pg.image(catSprite(c.cfg, legs), x + shake, ground - 12 - lift - bob);
  if (c.wet > 0 && frameCount % 6 < 3) px(x + 4 + random(12), ground - 12 + random(6), 1, 2, '#6fc3ff');
  if (c.nap > 0) txt('z', x + 16, ground - 22 - Math.round((millis() / 200) % 4), '#ffffff');
  // name tag trailing behind each cat (only once the race is moving, so the start line stays tidy)
  if (mode !== 'count' && mode !== 'menu' && mode !== 'name') txt(c.name, x - 2, ground - 10, c === me ? '#ffcc33' : '#fff6e0', 8, RIGHT);
  if (c === me) {
    px(x + 9, ground - 17 - lift, 2, 2, '#ffcc33');   // little marker over you
    // a blinking "!" when a puddle is coming: open your mouth now
    const ahead = puddles[c.lane].some(p => !p.hit.has(c) && p.x + PUDDLE_IN - (c.x + 10) > 0 && p.x + PUDDLE_IN - (c.x + 10) < 45);
    if (ahead && c.jumpT === 0 && mode === 'race' && Math.floor(millis() / 150) % 2) txt('!', x + 7, ground - 30, '#ffcc33');
  }
}

function drawHud() {
  txt((me.done ? me.time : raceT).toFixed(1) + 's', 4, 4, '#fff6e0');
  // progress bar with a dot for every cat
  const bx = 54, bw = 140;
  px(bx, 8, bw, 2, '#1d1630');
  px(bx + bw, 5, 2, 8, '#ffffff');
  for (const c of cats) {
    const p = constrain((c.x + 18) / TRACK, 0, 1);
    px(bx + p * bw - 2, 6 - (c === me ? 1 : 0), c === me ? 5 : 4, c === me ? 6 : 4, c.cfg.cloth);
  }
  if (online) txt('ROOM ' + Net.code, bx, 14, '#1d1630');
  drawCam(W - 44, 2);
  drawMeters(W - 42, 34, 36, false);
  // which eye is next
  if (mode === 'race') {
    const next = me.last === 'L' ? 'R' : me.last === 'R' ? 'L' : null;
    drawEyeIcon(6, 136, 'L', next === 'L' || !next);
    drawEyeIcon(22, 136, 'R', next === 'R' || !next);
    if (Face.ready() && !Face.present) txt('SHOW ME YOUR FACE', 40, 136, '#ffcc33');
  }
}

function drawEyeIcon(x, y, side, lit) {
  const on = Face.eye === side;
  px(x, y, 12, 7, lit ? '#ffcc33' : '#3c3157');
  px(x + 1, y + 1, 10, 5, on ? '#1d1630' : '#ffffff');
  if (!on) px(x + 4, y + 2, 3, 3, '#1d1630');
  txt(side, x + 2, y - 9, lit ? '#ffcc33' : '#8f84b0');
}

function drawCam(x, y) {
  px(x - 2, y - 2, 44, 34, '#1d1630');
  if (!Face.video || !Face.ready()) {
    px(x, y, 40, 30, '#3c3157');
    txt(Face.state === 'denied' ? 'NO' : '...', x + (Face.state === 'denied' ? 12 : 8), y + 11, '#8f84b0');
    if (Face.state === 'denied') txt('CAM', x + 8, y + 20, '#8f84b0', 8);
    return;
  }
  camG.image(Face.video, 0, 0, 40, 30);
  camG.filter(POSTERIZE, 4);
  pg.image(camG, x, y);
  const k = Face.points;
  if (k) {
    // points are 0..1 of the raw camera image; the picture is mirrored, so flip x
    const mark = (i, col) => px(x + (1 - k[i].x) * 40 - 1, y + k[i].y * 30 - 1, 2, 2, col);
    mark(386, Face.eye === 'L' || Face.eye === 'both' ? '#ff4f7b' : '#5fff8f');
    mark(159, Face.eye === 'R' || Face.eye === 'both' ? '#ff4f7b' : '#5fff8f');
    mark(14, Face.mouthOpen ? '#ffcc33' : '#ffffff');
  }
}

// Live bars: how closed each eye is and how open the mouth is, with a tick at the trigger point.
function drawMeters(x, y, w, labels) {
  if (!Face.ready()) return;
  [['L', '#ff4f7b'], ['R', '#ff4f7b'], ['M', '#ffcc33']].forEach(([k, col], i) => {
    const yy = y + i * (labels ? 12 : 4);
    const bx = labels ? x + 20 : x;
    if (labels) txt(k === 'M' ? 'MOU' : k + ' ', x - 6, yy - 2, '#a99bc7', 8);
    px(bx, yy, w, 3, '#3c3157');
    px(bx, yy, w * constrain(Face[k], 0, 1), 3, col);
    px(bx + w * Face.threshold(k), yy - 1, 1, 5, '#ffffff');
  });
}

function drawMenu() {
  px(0, 0, W, H, 'rgba(29,22,48,0.6)');
  txt('WINK DERBY', W / 2, 10, '#ffcc33', 16, CENTER);
  txt('HI, ' + playerName + '!', W / 2, 32, '#ff8fb1', 8, CENTER);
  const legs = Math.floor(millis() / 160) % 2 ? 'A' : 'B';
  pg.image(catSprite({ ...myCfg, cloth: LANE_CLOTH[0] }, legs), 18, 64, 40, 24);
  button(72, 48, 112, 16, 'SOLO RACE', () => { customBack = 'solo'; sel = 0; ensureCamera('custom'); });
  button(72, 70, 112, 16, 'CREATE ROOM', () => createRoom(), 'hot', Net.ok);
  button(72, 92, 112, 16, 'JOIN ROOM', () => setMode('join'), 'hot', Net.ok);
  if (!Net.ok) txt(Net.error || 'CONNECTING...', W / 2, 112, '#8f84b0', 8, CENTER);
  button(72, 124, 112, 12, 'CHANGE NAME', () => setMode('name'), 'alt');
  button(196, 64, 48, 16, 'MY CAT', () => openCustom('solo'), 'alt');
}

function drawLobby() {
  px(0, 0, W, H, 'rgba(29,22,48,0.85)');
  if (!Net.room) { txt('CONNECTING...', W / 2, 60, '#ffcc33', 8, CENTER); return; }
  txt('ROOM', 6, 9, '#a99bc7');
  txt(Net.code, 42, 5, '#ffcc33', 16);
  txt('SHARE THE CODE', W - 6, 9, '#8f84b0', 8, RIGHT);
  const ps = Net.players();
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const x = 4 + i * 63, y = 26, p = ps[i];
    const mine = p && p.id === Net.uid;
    px(x, y, 59, 72, mine ? '#4a3b6b' : '#2a2142');
    if (!p) { txt('?', x + 29, y + 26, '#4a3b6b', 16, CENTER); txt('OPEN', x + 29, y + 58, '#4a3b6b', 8, CENTER); continue; }
    px(x + 4, y + 14, 51, 30, '#8fd8fb'); px(x + 4, y + 38, 51, 6, '#62b247');
    const cfg = { ...(mine ? myCfg : p.cfg), cloth: LANE_CLOTH[i] };
    const legs = Math.floor(millis() / 170 + i) % 2 ? 'A' : 'B';
    pg.image(catSprite(cfg, legs), x + 9, y + 16, 40, 24);
    if (p.id === Net.room.host) txt('HOST', x + 29, y + 3, '#ffcc33', 8, CENTER);
    else if (mine) txt('YOU', x + 29, y + 3, '#5fff8f', 8, CENTER);
    txt(p.name, x + 29, y + 52, mine ? '#5fff8f' : '#fff6e0', 8, CENTER);
  }
  button(6, 108, 64, 16, 'MY CAT', () => openCustom('lobby'), 'alt');
  button(76, 108, 56, 16, 'LEAVE', () => leaveRoom(), 'alt');
  if (Net.isHost()) button(170, 108, 80, 16, 'START!', () => Net.startRace(), 'hot');
  else txt('HOST STARTS', W - 6, 112, '#8f84b0', 8, RIGHT);
  txt(ps.length < 2 ? 'WAITING FOR FRIENDS...' : ps.length + ' CATS READY', W / 2, 132, '#8f84b0', 8, CENTER);
}

function drawCalib() {
  px(0, 0, W, H, 'rgba(29,22,48,0.75)');
  const msg = Face.state === 'asking' ? 'ALLOW THE CAMERA'
    : Face.state === 'loading' ? 'WAKING UP...'
    : !Face.present ? 'SHOW ME YOUR FACE' : 'LOOK HERE, EYES OPEN';
  txt(msg, W / 2, 24, '#ffcc33', 8, CENTER);
  if (Face.video && Face.ready()) {
    camG.image(Face.video, 0, 0, 40, 30); camG.filter(POSTERIZE, 4);
    pg.image(camG, 30, 40, 80, 60);
    drawMeters(140, 48, 70, true);
    txt('TRY A WINK', 128, 86, '#8f84b0');
  }
  const p = Math.min(1, Face.base.n / 20);
  px(30, 106, 80, 4, '#3c3157'); px(30, 106, 80 * p, 4, '#5fff8f');
  txt('SPACE = USE KEYBOARD', W / 2, 122, '#8f84b0', 8, CENTER);
}

function drawCustom() {
  px(0, 0, W, H, 'rgba(29,22,48,0.82)');
  txt('MAKE YOUR CAT', 8, 8, '#ffcc33');
  // big preview, running in place
  px(10, 26, 100, 64, '#8fd8fb');
  px(10, 78, 100, 12, '#62b247');
  const legs = Math.floor(millis() / 170) % 2 ? 'A' : 'B';
  pg.image(catSprite({ ...myCfg, cloth: LANE_CLOTH[0] }, legs), 20, 30, 80, 48);
  drawCam(30, 96);
  drawMeters(76, 100, 30, false);
  // option rows
  CHOICES.forEach((ch, i) => {
    const y = rowY(i), on = sel === i;
    if (on) px(116, y - 6, 138, 14, '#3c3157');
    txt(ch.label, 118, y - 3, on ? '#ffcc33' : '#a99bc7');
    txt('<', 160, y - 3, on ? '#ffffff' : '#6b5f8e');
    txt(ch.list[myCfg[ch.key]], 201, y - 3, '#fff6e0', 8, CENTER);
    txt('>', 240, y - 3, on ? '#ffffff' : '#6b5f8e');
  });
  const goOn = sel === CHOICES.length;
  button(120, 108, 48, 16, 'RND', () => randomise(), 'alt');
  button(176, 108, 64, 16, customBack === 'lobby' ? 'DONE' : 'GO!', () => finishCustom(), goOn ? 'hot' : 'main');
  txt(Face.ready() ? 'WINK=CHANGE MOUTH=NEXT' : 'ARROWS + SPACE TO GO', W / 2, 132, '#8f84b0', 8, CENTER);
}

function drawCount() {
  const n = Math.min(3, Math.ceil(-raceClock()));
  if (n > 0) txt(String(n), W / 2, 30, '#ffffff', 16, CENTER);
}

function drawDone() {
  px(24, 24, W - 48, 112, 'rgba(29,22,48,0.9)');
  const words = ['', '1ST!', '2ND', '3RD', '4TH'];
  if (online) {
    // live standings: finished cats by time, then the ones still running
    const rows = cats.slice().sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1) : a.done ? a.time - b.time : b.x - a.x));
    const place = rows.indexOf(me) + 1;
    txt(words[place], W / 2, 30, place === 1 ? '#ffcc33' : '#fff6e0', 16, CENTER);
    rows.forEach((c, i) => {
      const y = 54 + i * 12, col = c === me ? '#ffcc33' : '#fff6e0';
      px(36, y, 6, 6, c.cfg.cloth);
      txt((i + 1) + ' ' + c.name, 48, y, col);
      txt(c.done ? c.time.toFixed(2) : '...', W - 36, y, col, 8, RIGHT);
    });
    if (modeT > 0.6) button(88, 116, 80, 14, 'LOBBY', () => setMode('lobby'));
    return;
  }
  const place = finishOrder.indexOf(me) + 1;
  txt(words[place], W / 2, 32, place === 1 ? '#ffcc33' : '#fff6e0', 16, CENTER);
  txt(me.time.toFixed(2) + ' SECONDS', W / 2, 54, '#fff6e0', 8, CENTER);
  if (place === 1) {
    pg.image(sunImg, W / 2 - 14, 68, 28, 14);
    txt('THE GOLDEN FISH IS YOURS', W / 2, 90, '#ffcc33', 8, CENTER);
  } else {
    txt(finishOrder[0].name + ' WON', W / 2, 72, '#a99bc7', 8, CENTER);
    txt('TRY BLINKING FASTER', W / 2, 88, '#a99bc7', 8, CENTER);
  }
  if (modeT > 0.6) {
    button(30, 114, 62, 14, 'AGAIN', () => startSoloCountdown());
    button(97, 114, 62, 14, 'MY CAT', () => openCustom('solo'), 'alt');
    button(164, 114, 62, 14, 'MENU', () => { soloRace(); setMode('menu'); }, 'alt');
  }
}

function popup(s, col) {
  if (popups.some(p => p.s === s && p.t > 0.4)) return;
  popups.push({ s, col, t: 0.9 });
}
function drawPopups(dt) {
  popups.forEach((p, i) => { p.t -= dt; txt(p.s, W / 2, 40 + i * 10 - (0.9 - p.t) * 10, p.col, 8, CENTER); });
  popups = popups.filter(p => p.t > 0);
}

// ---------- tiny sounds ----------
let actx = null;
function unlockAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === 'suspended') actx.resume();
}
function blip(freq, dur, delay = 0, type = 'square', slideTo = 0) {
  if (!actx) return;
  const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noiseBurst(dur) {
  if (!actx) return;
  const n = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate), d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = actx.createBufferSource(), g = actx.createGain();
  s.buffer = n; g.gain.value = 0.12; s.connect(g).connect(actx.destination); s.start();
}
function fanfare(won) {
  const notes = won ? [523, 659, 784, 1047] : [392, 349, 330];
  notes.forEach((f, i) => blip(f, 0.16, i * 0.14));
}
