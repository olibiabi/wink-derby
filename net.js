// Online rooms for up to 4 cats, through Firebase Realtime Database.
//
// /winkDerby/rooms/{CODE} = {
//   host: uid, createdAt, startAt (server ms, when the current race's gun goes off), seed (puddle layout),
//   players: { uid: { name, cfg, joinedAt, x, v, legs, air, wet, done, time } }
// }
// Every client runs its own cat and writes where it is ~10 times a second; the other cats are drawn
// from those reports. Everyone counts down to the same server time, so race times are comparable.

const MAX_PLAYERS = 4;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O, they look like 1 and 0

const Net = {
  ok: false, error: '', uid: null,
  api: null, db: null, offset: 0,
  code: null, room: null, roomRef: null, meRef: null, _unsub: null,
  onRoom: null,                       // (room) => {} whenever anything in the room changes
  _lastSend: 0,

  async init() {
    const cfg = window.winkDerbyFirebaseConfig || {};
    if (!cfg.apiKey || !cfg.databaseURL) { this.error = 'NO CONFIG'; return; }
    try {
      const V = 'https://www.gstatic.com/firebasejs/10.14.1/';
      const [appM, dbM, authM] = await Promise.all([
        import(V + 'firebase-app.js'), import(V + 'firebase-database.js'), import(V + 'firebase-auth.js')]);
      const app = appM.initializeApp(cfg, 'winkDerby');
      const auth = authM.getAuth(app);
      // one identity per browser tab, so two tabs on one computer can race each other
      await authM.setPersistence(auth, authM.browserSessionPersistence);
      const cred = await authM.signInAnonymously(auth);
      this.uid = cred.user.uid;
      this.api = dbM;
      this.db = dbM.getDatabase(app);
      dbM.onValue(dbM.ref(this.db, '.info/serverTimeOffset'), s => { this.offset = s.val() || 0; });
      this.ok = true;
    } catch (e) {
      console.warn('Wink Derby is offline:', e);
      this.error = 'OFFLINE';
    }
  },

  now() { return Date.now() + this.offset; },
  _roomPath(code) { return 'winkDerby/rooms/' + code; },

  _meEntry(name, cfg) {
    return { name, cfg, joinedAt: this.now(), x: 0, v: 0, legs: 'A', air: 0, wet: 0, done: false, time: 0 };
  },

  async create(name, cfg) {
    const { ref, get, set } = this.api;
    for (let tries = 0; tries < 6; tries++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
      const r = ref(this.db, this._roomPath(code));
      if ((await get(r)).exists()) continue;
      await set(r, { host: this.uid, createdAt: this.now(), startAt: 0, seed: 1,
                     players: { [this.uid]: this._meEntry(name, cfg) } });
      this._enter(code);
      return { ok: true, code };
    }
    return { ok: false, error: 'TRY AGAIN' };
  },

  async join(code, name, cfg) {
    const { ref, get, set } = this.api;
    code = code.toUpperCase();
    const snap = await get(ref(this.db, this._roomPath(code)));
    if (!snap.exists()) return { ok: false, error: 'NO SUCH ROOM' };
    const room = snap.val();
    const players = room.players || {};
    if (!players[this.uid] && Object.keys(players).length >= MAX_PLAYERS) return { ok: false, error: 'ROOM IS FULL' };
    await set(ref(this.db, this._roomPath(code) + '/players/' + this.uid), this._meEntry(name, cfg));
    this._enter(code);
    return { ok: true, code };
  },

  _enter(code) {
    const { ref, onValue, onDisconnect } = this.api;
    this.code = code;
    this.roomRef = ref(this.db, this._roomPath(code));
    this.meRef = ref(this.db, this._roomPath(code) + '/players/' + this.uid);
    onDisconnect(this.meRef).remove();
    this._unsub = onValue(this.roomRef, s => {
      this.room = s.val();
      if (!this.room) return;
      this._fixHost();
      if (this.onRoom) this.onRoom(this.room);
    });
  },

  // if the host left, the player who joined first takes over
  _fixHost() {
    const ps = this.players();
    if (!ps.length || ps.some(p => p.id === this.room.host)) return;
    if (ps[0].id === this.uid) this.api.update(this.roomRef, { host: this.uid });
  },

  leave() {
    if (!this.code) return;
    if (this._unsub) this._unsub();
    // last one out takes the room with them
    const alone = this.players().every(p => p.id === this.uid);
    this.api.remove(alone ? this.roomRef : this.meRef);
    this.code = this.room = this.roomRef = this.meRef = this._unsub = null;
  },

  // players sorted by join time; their index is their lane
  players() {
    const ps = (this.room && this.room.players) || {};
    return Object.entries(ps).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.joinedAt - b.joinedAt).slice(0, MAX_PLAYERS);
  },
  isHost() { return !!this.room && this.room.host === this.uid; },

  updateMe(fields) { if (this.meRef) this.api.update(this.meRef, fields); },

  // host: start a race for everyone in 3.5 seconds, with a fresh puddle layout
  startRace() {
    if (!this.isHost()) return;
    const fields = { startAt: this.now() + 3500, seed: Math.floor(Math.random() * 1e9) };
    for (const p of this.players())
      Object.assign(fields, { [`players/${p.id}/x`]: 0, [`players/${p.id}/v`]: 0, [`players/${p.id}/done`]: false,
                              [`players/${p.id}/time`]: 0, [`players/${p.id}/wet`]: 0, [`players/${p.id}/air`]: 0 });
    this.api.update(this.roomRef, fields);
  },

  // while racing: send my cat ~10 times a second (and right away for finishing)
  sendCat(c, force) {
    const t = performance.now();
    if (!force && t - this._lastSend < 100) return;
    this._lastSend = t;
    this.updateMe({ x: Math.round(c.x * 10) / 10, v: Math.round(c.v), legs: c.legs, air: c.jumpT > 0 ? 1 : 0,
                    wet: c.wet > 0 ? 1 : 0, done: c.done, time: Math.round(c.time * 100) / 100 });
  },
};
