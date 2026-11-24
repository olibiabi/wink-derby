// Pixel cats, built from parts so every cat can be customised.
// A cat sprite is 20 x 12 pixels, facing right. Letters are colour slots:
//   o fur   d stripe   c belly/muzzle   P paws   n racing cloth
//   e / f   left / right eye colour   w white   k dark   p pink   t tongue

const FURS = [
  { name: 'GINGER', o: '#f08a24', d: '#b8520f', c: '#ffe1b0' },
  { name: 'SMOKE',  o: '#8a93a6', d: '#5b6275', c: '#d9dde6' },
  { name: 'NIGHT',  o: '#3a3550', d: '#1e1b2b', c: '#6b6585' },
  { name: 'SNOW',   o: '#f4f1ea', d: '#cfc8bb', c: '#ffffff' },
  { name: 'COCOA',  o: '#8a5a3c', d: '#5e3a24', c: '#d9b08c' },
  { name: 'PEACH',  o: '#ffb3a7', d: '#e57f73', c: '#fff0e8' },
  { name: 'MINT',   o: '#7fe0b5', d: '#3fae84', c: '#e3fff2' },
  { name: 'GRAPE',  o: '#9b6bff', d: '#6a3fd1', c: '#e4d8ff' },
];
const COATS = ['TABBY', 'PLAIN', 'TUXEDO', 'CALICO', 'SPOTS'];
const EYES = [
  { name: 'LEAF',   e: '#5fd35f', f: '#5fd35f' },
  { name: 'HONEY',  e: '#ffc928', f: '#ffc928' },
  { name: 'SKY',    e: '#4fb3ff', f: '#4fb3ff' },
  { name: 'COPPER', e: '#e5762b', f: '#e5762b' },
  { name: 'BERRY',  e: '#ff4fa3', f: '#ff4fa3' },
  { name: 'ODD',    e: '#4fb3ff', f: '#ffc928' },
];
const FACES = ['CLASSIC', 'BIG EYES', 'SLEEPY', 'GRUMPY', 'DERP'];
const EARS = ['POINTY', 'FOLDED', 'BIG'];

// Head: 7 x 6 (2 rows of ears + 4 rows of face), placed at the right end of the body.
const EAR_ROWS = {
  'POINTY': ['.o...o.', '.op.op.'],
  'FOLDED': ['.......', 'oo..oo.'],
  'BIG':    ['o....o.', 'op..opo'],
};
const FACE_ROWS = {
  'CLASSIC':  ['ooooooo', 'oeoofoo', 'ooooopo', '.occco.'],
  'BIG EYES': ['ooooooo', 'ewofwoo', 'eeoffpo', '.occco.'],
  'SLEEPY':   ['ooooooo', 'ooooooo', 'kkokkpo', '.occco.'],
  'GRUMPY':   ['okkokko', 'oeoofoo', 'ooooopo', '.okkko.'],
  'DERP':     ['ooooooo', 'ewoofoo', 'eeooopo', '.octco.'],
};

const BODY = [
  '....................',
  '....................',
  'o...................',
  'o...................',
  '.o..onnnoooo........',
  '..ooonnnoddoo.......',
  '..ooodoodooodooooo..',
  '...ooccccccccccoo...',
];
const LEGS = {
  A:    ['...oo.........oo....', '..oo...........oo...', '.oo.............oo..', 'PP...............PP.'],
  B:    ['.....oo.....oo......', '......oo...oo.......', '......oo...oo.......', '......PP...PP.......'],
  JUMP: ['.oo...............oo', 'PP................PP', '....................', '....................'],
};

const INK = { w: '#ffffff', k: '#241a2a', p: '#ff8fb1', t: '#ff4f7b' };

function catGrid(cfg, legs) {
  const g = BODY.concat(LEGS[legs]).map(r => r.padEnd(20, '.').split(''));
  const head = EAR_ROWS[EARS[cfg.ears]].concat(FACE_ROWS[FACES[cfg.face]]);
  head.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch !== '.') g[y][13 + x] = ch; }));
  return g;
}

function pixelColour(ch, x, y, cfg) {
  const fur = FURS[cfg.fur], coat = COATS[cfg.coat], eye = EYES[cfg.eyes];
  const furAt = () => {
    if (coat === 'CALICO') {
      const h = (Math.floor(x / 3) * 5 + Math.floor(y / 3) * 3 + 1) % 3;
      return [fur.o, '#2d2838', '#f4f1ea'][h];
    }
    if (coat === 'SPOTS' && x % 4 === 1 && y % 3 === 1 && x < 13) return fur.d;
    return fur.o;
  };
  switch (ch) {
    case 'o': return furAt();
    case 'd': return coat === 'TABBY' ? fur.d : furAt();
    case 'c': return coat === 'TUXEDO' ? '#ffffff' : fur.c;
    case 'P': return coat === 'TUXEDO' || cfg.fur !== 3 ? '#ffffff' : '#ffc2d4';
    case 'n': return cfg.cloth || '#e83a3a';
    case 'e': return eye.e;
    case 'f': return eye.f;
    default:  return INK[ch];
  }
}

// Bake a cat frame into a tiny p5.Graphics so drawing it is one image() call.
const _catCache = new Map();
function catSprite(cfg, legs) {
  const key = JSON.stringify(cfg) + legs;
  if (_catCache.has(key)) return _catCache.get(key);
  const g = createGraphics(20, 12);
  g.pixelDensity(1);
  g.noStroke();
  catGrid(cfg, legs).forEach((row, y) => row.forEach((ch, x) => {
    if (ch === '.') return;
    g.fill(pixelColour(ch, x, y, cfg));
    g.rect(x, y, 1, 1);
  }));
  _catCache.set(key, g);
  return g;
}

const CHOICES = [
  { label: 'FUR',  key: 'fur',  list: FURS.map(f => f.name) },
  { label: 'COAT', key: 'coat', list: COATS },
  { label: 'EYES', key: 'eyes', list: EYES.map(e => e.name) },
  { label: 'FACE', key: 'face', list: FACES },
  { label: 'EARS', key: 'ears', list: EARS },
];

function randomCat(cloth) {
  return { fur: floor(random(FURS.length)), coat: floor(random(COATS.length)), eyes: floor(random(EYES.length)),
           face: floor(random(FACES.length)), ears: floor(random(EARS.length)), cloth };
}

const RIVALS = [
  { name: 'MOCHI',  cfg: { fur: 3, coat: 3, eyes: 2, face: 1, ears: 0, cloth: '#3a7bff' }, base: 34, skill: 0.85 },
  { name: 'BEAN',   cfg: { fur: 2, coat: 2, eyes: 1, face: 3, ears: 0, cloth: '#ffcc33' }, base: 38, skill: 0.75, napper: true },
  { name: 'NOODLE', cfg: { fur: 1, coat: 0, eyes: 5, face: 4, ears: 1, cloth: '#36c26b' }, base: 41, skill: 0.6 },
];

// Small props
const PUDDLE = [
  '...bbbbbbbbbbbb...',
  '.bbbLLbbbbbbbLLbb.',
  'bbbbbbbbbLLbbbbbbb',
  '.bbbbbbbbbbbbbbbb.',
];
const SUN_FISH = [
  '....yyyy......',
  '..yyyyyyyy..y.',
  '.yykyyyyyyyyy.',
  'yyyyyyyyyyyy..',
  '.yyyyyyyyyyyy.',
  '..yyyyyyyy..y.',
  '....yyyy......',
];
function bakeGrid(rows, pal) {
  const g = createGraphics(rows[0].length, rows.length);
  g.pixelDensity(1);
  g.noStroke();
  rows.forEach((row, y) => row.split('').forEach((ch, x) => {
    if (!pal[ch]) return;
    g.fill(pal[ch]);
    g.rect(x, y, 1, 1);
  }));
  return g;
}
