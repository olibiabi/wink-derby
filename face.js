// Webcam + MediaPipe Face Landmarker -> three body events: wink left, wink right, open mouth.
// The model gives "blendshape" scores from 0 to 1 for each eye closing and for the jaw opening,
// which catches winks far better than measuring eyelid points. We learn your resting values in a
// short calibration and count an eye as closed when its score rises well above that.

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const Face = {
  state: 'off',          // off | asking | loading | on | denied
  video: null,
  landmarker: null,
  points: null,          // 478 face points, 0..1, for the little camera view
  present: false,
  L: 0, R: 0, M: 0,      // closed-ness of your left eye, your right eye, and jaw open (0..1)
  gapL: 0.5, gapR: 0.5,  // eyelid gap / eye width for each eye
  base: { gL: 0.5, gR: 0.5, M: 0, n: 0 },
  eye: 'open',           // committed eye state: open | L | R | both
  mouthOpen: false,
  _cand: 'open', _candN: 0, _lastTime: -1,
  onWink: null,
  onMouth: null,

  async start() {
    if (this.state !== 'off') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.state = 'denied'; return; }
    this.state = 'asking';
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach(t => t.stop());
    } catch (e) { this.state = 'denied'; return; }
    this.state = 'loading';
    this.video = createCapture({ video: { width: 320, height: 240 }, audio: false }, { flipped: true });
    this.video.size(320, 240);
    this.video.hide();
    try {
      const vision = await import(MP + '/vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks(MP + '/wasm');
      const opts = delegate => ({
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
      });
      try { this.landmarker = await vision.FaceLandmarker.createFromOptions(files, opts('GPU')); }
      catch (e) { this.landmarker = await vision.FaceLandmarker.createFromOptions(files, opts('CPU')); }
      this.state = 'on';
    } catch (e) {
      console.error('Face Landmarker failed to load', e);
      this.state = 'denied';
    }
  },

  update() {
    const v = this.video && this.video.elt;
    if (!this.landmarker || !v || v.readyState < 2 || v.currentTime === this._lastTime) return;
    this._lastTime = v.currentTime;
    const r = this.landmarker.detectForVideo(v, performance.now());
    if (!r.faceLandmarks || !r.faceLandmarks.length) {
      this.present = false; this.points = null; this._settle('open'); return;
    }
    this.present = true;
    this.points = r.faceLandmarks[0];
    const s = {};
    r.faceBlendshapes[0].categories.forEach(c => { s[c.categoryName] = c.score; });
    // Eyelid gap / eye width, for your left eye (points 386/374) and right eye (159/145).
    const p = this.points, gap = (u, l, c1, c2) =>
      Math.hypot(p[u].x - p[l].x, p[u].y - p[l].y) / Math.max(1e-6, Math.hypot(p[c1].x - p[c2].x, p[c1].y - p[c2].y));
    this.gapL = gap(386, 374, 362, 263);
    this.gapR = gap(159, 145, 33, 133);
    // How closed is each eye? Take whichever signal is stronger: the model's blink score, or how much
    // the eyelid gap shrank compared with your calibrated open eye (open ~0.5 -> closed ~0.1).
    const shrink = (g, open) => constrain(1 - g / Math.max(0.2, open), 0, 1);
    this.L = Math.max(s.eyeBlinkLeft, shrink(this.gapL, this.base.gL));
    this.R = Math.max(s.eyeBlinkRight, shrink(this.gapR, this.base.gR));
    this.M = s.jawOpen;

    const Lc = this.L > this.threshold('L'), Rc = this.R > this.threshold('R');
    let st = 'open';
    if (Lc && Rc && Math.abs(this.L - this.R) < 0.25) st = 'both';
    else if (Lc && this.L - this.R > 0.25) st = 'L';
    else if (Rc && this.R - this.L > 0.25) st = 'R';
    this._settle(st);

    const open = this.M > this.threshold('M');
    const shut = this.M < this.threshold('M') - 0.12;
    if (open && !this.mouthOpen) { this.mouthOpen = true; if (this.onMouth) this.onMouth(); }
    else if (shut) this.mouthOpen = false;
  },

  // A state has to hold for 2 camera frames before it counts, which filters out jitter.
  _settle(st) {
    if (st === this._cand) this._candN++; else { this._cand = st; this._candN = 1; }
    if (this._candN === 2 && st !== this.eye) {
      this.eye = st;
      if ((st === 'L' || st === 'R') && this.onWink) this.onWink(st);
    }
  },

  // Calibration: learn your open-eye gaps and resting mouth while you look at the camera.
  // (Checked on test photos: open eye gap ~0.53, winking eye ~0.09, the other eye ~0.33.)
  resetCalibration() { this.base = { gL: 0.5, gR: 0.5, M: 0, n: 0 }; },
  sampleCalibration() {
    if (!this.present || this.points === this._lastSample) return;
    this._lastSample = this.points;
    const b = this.base;
    b.n++;
    if (b.n === 1) { b.gL = this.gapL; b.gR = this.gapR; b.M = this.M; return; }
    b.gL += (this.gapL - b.gL) / b.n;
    b.gR += (this.gapR - b.gR) / b.n;
    b.M += (this.M - b.M) / b.n;
  },
  calibrated() { return this.base.n >= 20; },
  ready() { return this.state === 'on'; },
  threshold(side) { return side === 'M' ? Math.max(0.3, this.base.M + 0.22) : 0.5; },
};
