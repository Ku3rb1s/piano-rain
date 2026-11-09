/* Piano Rain – Spielablauf und Anzeige
   Noten fallen auf eine Tastatur. Das iPad hört übers Mikrofon zu und prüft die erwarteten Töne (js/ear.js).
   Warten: das Lied hält an, bis der Ton (Akkord) kommt. Im Takt: das Lied läuft im gewählten Tempo, Treffer zählen.
   Liederbuch: js/songs.js. Eigene MIDI-Dateien („Meine Lieder“) bleiben in IndexedDB auf dem Gerät.
   Test ohne Klavier: ?test=1 (Bildschirmtasten erzeugen Klaviertöne, die durch die echte Erkennung gehen), &auto=1 spielt mit. */
const APP_VERSION = '1.0.0', APP_DATE = '09.11.2026'; // bei jedem Update erhöhen + CHANGELOG.md ergänzen
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const { Ear, TestMic, Mic, freqOf } = PR_EAR;

const THEMES = [['graphit', 'Graphit', '#3a4252', '#1f3a32'], ['ozean', 'Ozean', '#0b4f75', '#0d6e66'], ['wald', 'Wald', '#1d5a3a', '#4c5b1a'],
  ['abend', 'Abend', '#7a2e1c', '#7d1f4a'], ['lila', 'Lila', '#4a22a0', '#8a1458'], ['oled', 'OLED', '#000', '#000']];
const LOC = () => ({ de: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES', nb: 'nb-NO' }[curLang] || 'de-DE');
const fmtN = n => Math.round(n).toLocaleString(LOC());
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const prevDay = d => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
const QS = new URLSearchParams(location.search);
const TEST = QS.has('test');
const DEBUG = QS.has('debug');                           // ?debug=1: Werte des Gehörs einblenden (zum Abstimmen mit dem echten Klavier)

// Gespeichert wird mit „pr.“ vorne – alle Spiele teilen sich den Browser-Speicher von ku3rb1s.github.io
const LS = {
  get(k, d) { try { const v = localStorage.getItem('pr.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pr.' + k, JSON.stringify(v)); } catch {} },
};
const sharedTheme = {
  get() { try { return JSON.parse(localStorage.getItem('mq.theme')) || 'graphit'; } catch { return 'graphit'; } },
  set(v) { try { localStorage.setItem('mq.theme', JSON.stringify(v)); } catch {} },
};
const opt = Object.assign({ mode: 'wait', speed: 0.75, hands: 'r', staff: false, names: true, sfx: true, input: 'mic', tab: '' }, LS.get('opt', {}));
opt.theme = sharedTheme.get();
const saveOpt = () => { const { theme, ...o } = opt; LS.set('opt', o); };

/* ---------- Notennamen (je Sprache) ---------- */
const SOLF = { fr: ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'], es: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'] };
function noteName(l, a) {
  const k = ((l % 7) + 7) % 7;
  if (SOLF[curLang]) return SOLF[curLang][k] + (a > 0 ? '♯' : a < 0 ? '♭' : '');
  const letter = 'CDEFGAB'[k];
  if (letter === 'B' && (curLang === 'de' || curLang === 'nb')) return a < 0 ? 'B' : a > 0 ? 'H♯' : 'H';
  return letter + (a > 0 ? '♯' : a < 0 ? '♭' : '');
}
const spellM = spell;                                   // js/songs.js
const nameOfM = m => { const s = spellM(m); return noteName(s.l, s.a); };
const isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);

/* ---------- Lieder ---------- */
const titleOf = s => s.mine ? s.name : (s.title[curLang] || s.title.de) + (s.both ? ' · ' + tx('beide Hände') : '');
const byOf = s => s.mine ? tx('Meine Lieder') : s.by === 'Volkslied' ? tx('Volkslied') : s.by;
const xmasSeason = () => { const d = today().slice(5); return d >= '11-01' || d <= '01-06'; };   // Weihnachtslieder vorn
let MINE = [];                                      // eigene Lieder aus IndexedDB
const allSongs = () => [...SONGS, ...MINE];
const songById = id => allSongs().find(s => s.id === id);
const parsedCache = new Map();
function parsed(s) {
  if (!parsedCache.has(s.id)) parsedCache.set(s.id, s.mine ? s.data : parseSong(s));
  return parsedCache.get(s.id);
}
const hasLeft = s => parsed(s).notes.some(n => n.h === 'l');
const starsOf = s => s.mine ? (s.stars || 0) : (Sync.view('pr.stars', LS.get('stars', {})) || {})[s.id] || 0;
const starHtml = n => `<span class="stars">${[1, 2, 3].map(i => i <= n ? '<b>★</b>' : '★').join('')}</span>`;

/* ---------- Meine Lieder (IndexedDB, nur auf diesem Gerät) ---------- */
const DB = {
  open() {
    return this.p ??= new Promise((res, rej) => {
      const r = indexedDB.open('piano-rain', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('songs', { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async all() { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('songs').objectStore('songs').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); },
  async put(v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('songs', 'readwrite'); t.objectStore('songs').put(v); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async del(id) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('songs', 'readwrite'); t.objectStore('songs').delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async clear() { const db = await this.open(); return new Promise(res => { const t = db.transaction('songs', 'readwrite'); t.objectStore('songs').clear(); t.oncomplete = res; t.onerror = res; }); },
};
async function loadMine() { try { MINE = (await DB.all()).sort((a, b) => a.added - b.added); } catch { MINE = []; } }

/* MIDI-Datei → Lied: Spuren mit Tönen, höchste = rechte Hand, nächste = linke Hand (eine Spur: geteilt am mittleren C).
   Auf Sechzehntel gerundet, je Hand höchstens 3 gleichzeitige Töne (mehr kann das Mikrofon nicht sicher prüfen). */
function midiToSong(buf, fileName) {
  const midi = new Midi(buf), ppq = midi.header.ppq || 480;
  const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
  const bar = ts[0] * 4 / ts[1], bpm = Math.round(midi.header.tempos[0]?.bpm || 100);
  const tracks = midi.tracks.filter(t => t.notes.length && !(t.channel === 9 || t.instrument?.percussion));
  if (!tracks.length) throw new Error('empty');
  const avg = t => t.notes.reduce((a, n) => a + n.midi, 0) / t.notes.length;
  tracks.sort((a, b) => avg(b) - avg(a));
  const q = x => Math.round(x * 4) / 4;
  let rh, lh;
  const conv = (t, h) => t.notes.map(n => ({ m: n.midi, t: q(n.ticks / ppq), d: Math.max(.25, q(n.durationTicks / ppq)), h }));
  if (tracks.length >= 2) { rh = conv(tracks[0], 'r'); lh = conv(tracks[1], 'l'); }
  else { const all = conv(tracks[0], 'r'); rh = all.filter(n => n.m >= 60); lh = all.filter(n => n.m < 60).map(n => ({ ...n, h: 'l' })); }
  const thin = (notes, top) => {
    const by = new Map();
    for (const n of notes) { const k = n.t; if (!by.has(k)) by.set(k, []); by.get(k).push(n); }
    const out = [];
    for (const g of by.values()) { const u = [...new Map(g.map(n => [n.m, n])).values()].sort((a, b) => top ? b.m - a.m : a.m - b.m); out.push(...u.slice(0, 3)); }
    return out;
  };
  const notes = [...thin(rh, true), ...thin(lh, false)].filter(n => n.m >= 28 && n.m <= 100).map(n => ({ ...n, ...spellM(n.m) })).sort((a, b) => a.t - b.t || a.m - b.m);
  if (!notes.length) throw new Error('empty');
  const t0 = Math.floor(notes[0].t / bar) * bar;               // leere Takte am Anfang weg
  for (const n of notes) n.t -= t0;
  const beats = Math.max(...notes.map(n => n.t + n.d)), bars = [];
  for (let b = 0; b < beats - 1e-6; b += bar) bars.push(b);
  const name = (midi.name || '').trim() || fileName.replace(/\.(mid|midi)$/i, '');
  return { id: 'mine-' + Date.now().toString(36), mine: true, name: name.slice(0, 60), bpm: Math.min(200, Math.max(40, bpm)), bar, lvl: 0, added: Date.now(), stars: 0,
    data: { notes, bars, beats } };
}

/* ---------- Eingabe: Mikrofon (oder Test-Klavier) über das Gehör – oder Bildschirmtasten ---------- */
let clockT = null;                                       // feste Zeit für Tests (PR.sim)
const clock = () => clockT ?? performance.now();
let mic = null, testMic = null;
class EarInput {
  constructor(src, sr) { this.src = src; this.ear = new Ear(sr); this.lat = 35; const c = LS.get('cal', null); if (c?.ref) this.ear.ref = c.ref; }
  step(now) { const b = this.src.read(now); this.ear.push(b, now); }
  get level() { return this.ear.level; }
  match(S, o) { return this.ear.match(S, o); }
  take(m, o, used) { this.ear.take(m, o, used); }
  wrongs() { const w = this.ear.wrong; this.ear.wrong = []; return w; }
  quiet(on) { if (on) this.ear.startNoise(); else this.ear.stopNoise(); }
  press(m, now) { if (this.src === testMic) testMic.play(m, now, 450, .55 + Math.random() * .35); }
}
class TapInput {
  constructor() { this.taps = []; this.id = 0; this.lat = 0; this.level = 0; this.pending = []; }
  step(now) { this.level *= .85; this.taps = this.taps.filter(t => now - t.t < 3000); }
  press(m, now) { const t = { id: ++this.id, m, t: now, used: false }; this.taps.push(t); this.pending.push(t); this.level = 1; }
  match(S, { from = -1e9, to = 1e12, used = {}, only = S } = {}) {
    const out = {};
    for (const m of only) { const t = [...this.taps].reverse().find(x => x.m === m && x.id > (used[m] || 0) && x.t >= from && x.t <= to); if (t) out[m] = t; }
    return out;
  }
  take(m, t, used) { used[m] = Math.max(used[m] || 0, t.id); t.used = true; }
  wrongs() { const now = clock(), w = this.pending.filter(t => now - t.t > 120 && !t.used); this.pending = this.pending.filter(t => now - t.t <= 120 && !t.used); return w; }
  quiet() {}
}
const calOk = () => !!LS.get('cal', null)?.ref;
const useMic = () => opt.input !== 'tap';
async function openInput() {
  if (TEST && useMic()) { testMic ??= new TestMic(48000, { seed: 3 }); return new EarInput(testMic, 48000); }
  if (!useMic()) return new TapInput();
  mic ??= new Mic();
  await mic.open();
  return new EarInput(mic, mic.sr);
}
function closeMic() { if (mic) mic.close(); }

/* ---------- Spielrunde ---------- */
let P = null, raf = 0;
const W_MS = 300, PERFECT_MS = 110;          // Im Takt: Zeitfenster (großzügig, das Mikrofon braucht etwas) und „perfekt“
function buildSession(song, o = {}) {
  const pr = parsed(song), hands = hasLeft(song) ? opt.hands : 'r';
  const act = n => hands === 'b' || n.h === hands;
  const bars = pr.bars, from = o.loop ? bars[o.loop[0]] : 0, to = o.loop ? (bars[o.loop[1] + 1] ?? pr.beats) : pr.beats;
  const notes = pr.notes.filter(n => n.t >= from - 1e-6 && n.t < to - 1e-6).map(n => ({ ...n, on: act(n), st: '' }));
  const steps = [];
  for (const n of notes) {
    if (!n.on) continue;
    let s = steps[steps.length - 1];
    if (!s || Math.abs(s.t - n.t) > 1e-6) { s = { t: n.t, notes: [], ns: [], hit: {}, first: true, done: false, grade: '' }; steps.push(s); }
    if (!s.notes.includes(n.m)) s.notes.push(n.m);
    s.ns.push(n); n.step = s;
  }
  return { song, pr, hands, mode: opt.mode, speed: +opt.speed, loop: o.loop || null, from, to, notes, steps,
    bps: song.bpm / 60 * opt.speed, beat: from - Math.max(2, 2.4 * song.bpm / 60 * opt.speed), idx: 0, jFirst: 0, used: {}, phase: 'quiet', round: 1,
    perfect: 0, good: 0, miss: 0, wrong: 0, flashes: [], startT: clock(), playT: 0, hintT: 0 };
}
async function startSession(song, o = {}) {
  stopPreview();
  let input;
  try { input = await openInput(); }
  catch (e) { return micError(e); }
  P = buildSession(song, o);
  P.input = input;
  document.body.classList.add('playing');
  $('#play').classList.remove('hidden');
  $('#playTitle').textContent = titleOf(song);
  renderPlaySub();
  resize();
  quietPhase();
  loop();
}
function quietPhase() {
  P.phase = 'quiet'; P.quietUntil = clock() + (P.input instanceof EarInput ? 1300 : 300);
  P.input.quiet(true);
  showMsg(P.input instanceof EarInput ? tx('Kurz still …') : '', P.input instanceof EarInput ? tx('Piano Rain misst die Ruhe im Raum') : '', true);
}
function beginRun() {
  P.input.quiet(false);
  hideMsg();
  P.phase = 'run'; P.armT = clock(); P.anchorT = clock(); P.anchorB = P.beat; P.last = clock();
  if (P.mode === 'tempo') flashMsg(tx('Los!'));
}
function renderPlaySub() {
  if (!P) return;
  const hand = { r: tx('rechte Hand'), l: tx('linke Hand'), b: tx('beide Hände') }[P.hands];
  $('#playSub').textContent = [P.mode === 'wait' ? tx('Warten') : tx('Im Takt'), Math.round(P.speed * 100) + ' %', hand,
    P.loop ? tx('Takt {a}–{b}', { a: barLabel(P.loop[0]), b: barLabel(P.loop[1]) }) + (P.round > 1 ? ' · ' + tx('Runde {n}', { n: P.round }) : '') : ''].filter(Boolean).join(' · ');
}
const barLabel = i => (P?.song || curSong)?.up ? i : i + 1;

// Bildtakt: requestAnimationFrame – und ein Zeitgeber als Ersatz, falls der Browser die Bilder drosselt (das Gehör braucht
// regelmäßige Messungen, sonst fehlen ihm die Werte rund um einen Anschlag)
function ticker(fn) {
  let last = 0, on = true, id = 0;
  const run = () => { if (!on) return; last = performance.now(); fn(); };
  const af = () => { if (!on) return; run(); id = requestAnimationFrame(af); };
  id = requestAnimationFrame(af);
  const iv = setInterval(() => { if (performance.now() - last > 45) run(); }, 25);
  return () => { on = false; cancelAnimationFrame(id); clearInterval(iv); };
}
let stopLoop = null;
function loop() {
  stopLoop?.();
  stopLoop = ticker(() => { if (P) frame(clock()); else { stopLoop?.(); stopLoop = null; } });
}
// ein Bild: Eingabe auswerten, Lied weiterlaufen lassen, zeichnen
function frame(now) {
  if (!P) return;
  P.input.step(now);
  const meter = $('#micMeter b'); if (meter) meter.style.width = Math.round(P.input.level * 100) + '%';
  if (P.phase === 'quiet' && now >= P.quietUntil) beginRun();
  if (P.phase === 'run') {
    const dt = Math.min(120, now - P.last); P.last = now; P.playT += dt;
    if (auto) autoPlay(now);
    if (P.mode === 'wait') judgeWait(now, dt); else judgeTempo(now);
    handleWrong(now);
    const end = P.mode === 'wait' ? P.idx >= P.steps.length && P.beat >= P.to : P.jFirst >= P.steps.length && P.beat >= P.to + .5;
    if (end) finishRun();
  }
  draw(now);
}
function judgeWait(now, dt) {
  const s = P.steps[P.idx];
  const target = s ? s.t : P.to;
  P.beat = Math.min(P.beat + dt / 1000 * P.bps, s ? target : P.to);
  if (!s) return;
  const only = s.notes.filter(m => !s.hit[m]);
  const res = P.input.match(s.notes, { from: P.armT - 250, used: P.used, only });
  for (const [m, o] of Object.entries(res)) { P.input.take(+m, o, P.used); s.hit[m] = o.t; flash(+m, s.ns.find(n => n.m === +m)?.h || 'r', now); }
  if (s.notes.every(m => s.hit[m])) {
    s.done = true; s.grade = s.first ? 'perfect' : 'good';
    for (const n of s.ns) n.st = 'hit';
    if (s.first) P.perfect++; else P.good++;
    P.idx++; P.armT = now; P.hintT = 0; hideHint();
    renderScore();
  } else if (P.beat >= s.t - 1e-6) {
    // wartet: nach ein paar Sekunden zeigen, welcher Ton gesucht ist
    P.hintT += dt;
    if (P.hintT > 4500 && !P.hintShown) showHint(tx('Spiel: {n}', { n: s.ns.map(n => noteName(n.l, n.a)).join(' + ') }));
  }
}
const stepReal = s => P.anchorT + (s.t - P.anchorB) / P.bps * 1000;
function judgeTempo(now) {
  P.beat = P.anchorB + (now - P.anchorT) / 1000 * P.bps;
  const lat = P.input.lat;
  for (let j = P.jFirst; j < P.steps.length; j++) {
    const s = P.steps[j], tr = stepReal(s);
    if (tr - W_MS > now) break;
    if (s.done) continue;
    const only = s.notes.filter(m => !s.hit[m]);
    const res = P.input.match(s.notes, { from: tr - W_MS + lat, to: tr + W_MS + lat, used: P.used, only });
    for (const [m, o] of Object.entries(res)) { P.input.take(+m, o, P.used); s.hit[m] = o.t - lat; flash(+m, s.ns.find(n => n.m === +m)?.h || 'r', now); }
    if (s.notes.every(m => s.hit[m])) {
      const err = s.notes.reduce((a, m) => a + s.hit[m], 0) / s.notes.length - tr;
      s.done = true; s.grade = Math.abs(err) <= PERFECT_MS ? 'perfect' : 'good'; s.err = err;
      for (const n of s.ns) n.st = 'hit';
      if (s.grade === 'perfect') P.perfect++; else P.good++;
      renderScore();
    } else if (now > tr + W_MS + 450) {
      s.done = true; s.grade = 'miss'; P.miss++;
      for (const n of s.ns) n.st = 'miss';
      renderScore();
    }
  }
  while (P.jFirst < P.steps.length && P.steps[P.jFirst].done) P.jFirst++;
}
function handleWrong(now) {
  for (const w of P.input.wrongs()) {
    const cur = P.mode === 'wait' ? P.steps[P.idx] : P.steps.slice(P.jFirst, P.jFirst + 3).find(s => !s.done);
    if (cur && cur.notes.includes(w.m)) continue;
    P.wrong++;
    flash(w.m, 'bad', now);
    if (P.mode === 'wait' && cur) {
      cur.first = false;
      showHint(tx('Das war {a} – gesucht: {b}', { a: nameOfM(w.m), b: cur.ns.map(n => noteName(n.l, n.a)).join(' + ') }), true);
    }
  }
}
function flash(m, kind, now) { P.flashes.push({ m, kind, t: now }); if (P.flashes.length > 30) P.flashes.shift(); }
function renderScore() {
  if (!P) return;
  const total = P.steps.length, done = P.mode === 'wait' ? P.idx : P.perfect + P.good + P.miss;
  $('#playProg').style.width = (total ? done / total * 100 : 0) + '%';
  $('#playScore').textContent = P.mode === 'wait' ? `${P.idx}/${total}` : `${Math.round((P.perfect + P.good) / Math.max(1, done) * 100)} %`;
}
function finishRun() {
  P.phase = 'end';
  const total = P.steps.length || 1;
  const acc = P.mode === 'wait' ? P.perfect / total : (P.perfect + P.good) / total;
  const res = { acc, perfect: P.perfect, good: P.good, miss: P.miss, wrong: P.wrong, total, mode: P.mode, speed: P.speed, hands: P.hands, secs: P.playT / 1000 };
  recordPractice(res.secs, true, P.perfect + P.good);
  if (P.loop) {
    // Abschnitt in Schleife: kurz zeigen, wie es lief, dann von vorn
    flashMsg(`${Math.round(acc * 100)} %`, tx('Nochmal von vorn'));
    const song = P.song, loopR = P.loop, round = P.round + 1, input = P.input;
    setTimeout(() => {
      if (!P || P.phase !== 'end') return;
      P = buildSession(song, { loop: loopR }); P.input = input; P.round = round; renderPlaySub(); renderScore(); P.phase = 'run'; P.armT = P.anchorT = P.last = clock(); P.anchorB = P.beat;
    }, 1600);
    return;
  }
  const s = P.song;
  setTimeout(() => endScreen(s, res), 500);
}

/* ---------- Ende ---------- */
let lastResult = null;
function starsFor(song, r) {
  let n = 1;
  const needBoth = hasLeft(song) && r.hands !== 'b';
  if (r.mode === 'wait' ? r.acc >= .9 : r.acc >= .7) n = 2;
  if (r.mode === 'tempo' && r.speed >= 1 && r.acc >= .85 && !needBoth) n = 3;
  return n;
}
async function endScreen(song, r) {
  leavePlay();
  const stars = starsFor(song, r), before = starsOf(song);
  if (song.mine) { if (stars > (song.stars || 0)) { song.stars = stars; try { await DB.put(song); } catch {} } }
  else {
    const st = LS.get('stars', {}); if (stars > (st[song.id] || 0)) { st[song.id] = stars; LS.set('stars', st); }
    if (r.hands === 'b' && hasLeft(song)) { const b = LS.get('both', {}); b[song.id] = 1; LS.set('both', b); }
    const best = LS.get('best', {}), pct = Math.round(r.acc * 100); if (pct > (best[song.id] || 0)) { best[song.id] = pct; LS.set('best', best); }
  }
  lastResult = { song, r };
  $('#endStars').innerHTML = [1, 2, 3].map(i => i <= stars ? '<b>★</b>' : '★').join('');
  $('#endMode').textContent = titleOf(song);
  $('#endBest').textContent = (r.mode === 'wait' ? tx('Warten') : tx('Im Takt')) + ' · ' + Math.round(r.speed * 100) + ' %';
  $('#endKicker').textContent = r.mode === 'wait' ? tx('Auf Anhieb richtig') : tx('Treffer');
  $('#endScore').textContent = Math.round(r.acc * 100) + ' %';
  $('#endSub').textContent = stars > before ? (before ? '⭐ ' + tx('Neuer Bestwert!') : '⭐ ' + tx('Geschafft!')) : tx('Geschafft!');
  const st = [`<span><b>${r.total}</b> ${tx('Töne')}</span>`];
  if (r.mode === 'tempo') st.push(`<span>🎯 <b>${r.perfect}</b> ${tx('perfekt')}</span>`, `<span><b>${r.good}</b> ${tx('gut')}</span>`, `<span><b>${r.miss}</b> ${tx('verpasst')}</span>`);
  else st.push(`<span>✓ <b>${r.perfect}</b> ${tx('auf Anhieb')}</span>`);
  if (r.wrong) st.push(`<span><b>${r.wrong}</b> ${tx('daneben')}</span>`);
  st.push(`<span>⏱ <b>${fmtTime(r.secs)}</b></span>`);
  $('#endStats').innerHTML = st.join('');
  $('#endNote').textContent = nextStarHint(song, r, stars); $('#endNote').classList.toggle('hidden', !$('#endNote').textContent);
  $('#nextBtn').classList.toggle('hidden', !nextSong(song));
  show('end');
  sound('end');
  if (stars === 3 && stars > before) confetti(120);
  checkAch(song, r, stars).forEach((a, k) => setTimeout(() => toast(`${a[1]} ${tx(a[2])}`, 2600), 700 + k * 2800));
}
const fmtTime = s => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function nextStarHint(song, r, stars) {
  if (stars >= 3) return '';
  if (stars === 1) return r.mode === 'wait' ? tx('Für ★★: im Warte-Modus 90 % auf Anhieb richtig – oder im Takt 70 % Treffer.') : tx('Für ★★: im Takt 70 % Treffer.');
  return hasLeft(song) ? tx('Für ★★★: im Takt bei 100 % Tempo mit beiden Händen, 85 % Treffer.') : tx('Für ★★★: im Takt bei 100 % Tempo, 85 % Treffer.');
}
function nextSong(song) {
  const list = listFor(tabOf(song)); const i = list.indexOf(song);
  return i >= 0 ? list[i + 1] : null;
}

/* ---------- Übungs-Serie, Statistik, Erfolge ---------- */
function recordPractice(secs, done, notes) {
  const d = today(), days = LS.get('days', {});
  days[d] = Math.round((days[d] || 0) + secs + (done ? 60 : 0));
  // nur die letzten 400 Tage behalten
  const keys = Object.keys(days).sort(); while (keys.length > 400) delete days[keys.shift()];
  LS.set('days', days);
  const st = LS.get('stats', { runs: 0, done: 0, notes: 0, secs: 0 });
  st.runs++; if (done) st.done++; st.notes += notes || 0; st.secs = Math.round(st.secs + secs);
  LS.set('stats', st);
}
function practiceStreak() {
  const days = Sync.view('pr.days', LS.get('days', {})) || {}; let d = today(), n = 0;
  const ok = k => (days[k] || 0) >= 60;
  if (!ok(d)) d = prevDay(d);
  while (ok(d)) { n++; d = prevDay(d); }
  return n;
}
const ACH = [
  ['first', '🎹', 'Erstes Lied', 'Ein Lied bis zum Ende gespielt'],
  ['three', '⭐', 'Drei Sterne', 'Ein Lied mit drei Sternen'],
  ['xmas', '🎄', 'Weihnachtskonzert', 'Alle Weihnachtslieder geschafft'],
  ['both', '🙌', 'Beide Hände', 'Ein Lied mit beiden Händen geschafft'],
  ['classic', '🎼', 'Klassiker', 'Ein Stück aus der Klassik geschafft'],
  ['tempo', '🎵', 'Im Takt', 'Ein Lied im Takt bei 100 % Tempo geschafft'],
  ['week', '🔥', 'Eine Woche dran', '7 Tage in Folge geübt'],
  ['notes1000', '🎶', 'Tausend Töne', '1.000 Töne richtig gespielt'],
  ['all', '🏆', 'Ganzes Liederbuch', 'Jedes Lied mindestens einmal geschafft'],
];
function checkAch(song, r, stars) {
  const have = LS.get('ach', {}), fresh = [], st = LS.get('stars', {}), stats = Sync.view('pr.stats', LS.get('stats', null)) || {};
  const ok = {
    first: true, three: stars >= 3, both: r.hands === 'b' && hasLeft(song), classic: song.lvl === 3, tempo: r.mode === 'tempo' && r.speed >= 1,
    xmas: SONGS.filter(s => s.xmas).every(s => st[s.id]), week: practiceStreak() >= 7, notes1000: (stats.notes || 0) >= 1000, all: SONGS.every(s => st[s.id]),
  };
  for (const a of ACH) if (ok[a[0]] && !have[a[0]]) { have[a[0]] = today(); fresh.push(a); }
  if (fresh.length) LS.set('ach', have);
  return fresh;
}
function renderStats() {
  const st = Sync.view('pr.stats', LS.get('stats', null)), stars = Sync.view('pr.stars', LS.get('stars', {})) || {};
  if (!st?.runs) { $('#statsBox').innerHTML = `<div class="group-f" style="margin-top:14px">${tx('Noch nicht gespielt')}</div>`; return; }
  const sum = Object.values(stars).reduce((a, n) => a + (+n || 0), 0);
  const rows = [
    [tx('Gespielte Lieder'), fmtN(st.done)],
    [tx('Richtige Töne'), fmtN(st.notes)],
    [tx('Geübt'), tx('{n} Min.', { n: fmtN(st.secs / 60) })],
    [tx('Sterne'), `${sum} / ${SONGS.length * 3}`],
    [tx('Übungs-Serie'), streakTxt(practiceStreak())],
  ];
  const have = LS.get('ach', {});
  $('#statsBox').innerHTML = `<div class="group" style="margin-top:14px">${rows.map(([k, v]) => `<div class="cell"><span class="grow">${k}</span><b>${v}</b></div>`).join('')}</div>`
    + `<div class="group-h">${tx('Erfolge')} · ${Object.keys(have).length}/${ACH.length}</div><div class="group icons">${ACH.map(a => `<div class="cell ach ${have[a[0]] ? '' : 'locked'}"><span class="cell-ic ach-ic">${a[1]}</span><span class="grow">${tx(a[2])}<span class="sub">${tx(a[3])}</span></span>${have[a[0]] ? '<b>✓</b>' : ''}</div>`).join('')}</div>`;
}
const streakTxt = n => n === 1 ? tx('1 Tag') : tx('{n} Tage', { n });

/* ---------- Zeichnen ---------- */
const cv = $('#cv'), ctx = cv.getContext('2d');
let VW = 0, VH = 0, DPR = 1, KB = null;
function resize() {
  const r = $('#playArea').getBoundingClientRect();
  DPR = Math.min(2, devicePixelRatio || 1); VW = Math.max(1, r.width); VH = Math.max(1, r.height);
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  layoutKeys();
}
addEventListener('resize', () => { if (P) resize(); });
function layoutKeys() {
  if (!P) return;
  const ms = P.notes.map(n => n.m);
  let lo = Math.min(...ms), hi = Math.max(...ms);
  // von C bis H, mindestens zwei Oktaven (abwechselnd unten bis F und oben bis E erweitert)
  lo -= lo % 12; hi += 11 - hi % 12;
  for (let k = 0; hi - lo < 23; k++) { if (k % 2) { lo -= 5; hi += 7; } else { lo -= 7; hi += 5; } }
  const whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const staffH = opt.staff ? Math.max(96, Math.min(160, VH * .24)) : 0;
  const kbH = Math.max(64, Math.min(170, VH * .2, VW / whites.length * 5.2));
  const ww = VW / whites.length;
  const x = {};
  whites.forEach((m, i) => { x[m] = [i * ww, ww]; });
  for (let m = lo; m <= hi; m++) if (isBlack(m)) { const left = x[m - 1]; x[m] = [left[0] + ww - ww * .3, ww * .6]; }
  KB = { lo, hi, whites, ww, x, kbH, staffH, top: VH - kbH, fallTop: staffH };
}
const handCol = h => h === 'l' ? ['#3b82f6', '#bfdbfe'] : ['#22c55e', '#bbf7d0'];
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function draw(now) {
  if (!KB || !P) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, VW, VH);
  const { top, fallTop, x } = KB, fallH = top - fallTop;
  const pxB = fallH / 2.6 / P.bps;                      // Pixel je Viertel: etwa 2,6 s sichtbar
  const yOf = b => top - (b - P.beat) * pxB;
  // Hintergrund: Trennlinien bei C und F, Taktstriche
  ctx.fillStyle = '#07070a'; ctx.fillRect(0, fallTop, VW, fallH);
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (const m of KB.whites) if (m % 12 === 0 || m % 12 === 5) ctx.fillRect(x[m][0], fallTop, 1, fallH);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  for (const b of P.pr.bars) { const y = yOf(b); if (y > fallTop && y < top) ctx.fillRect(0, y, VW, 1); }
  // fallende Noten
  const cur = P.mode === 'wait' ? P.steps[P.idx] : null;
  ctx.font = `700 ${Math.max(10, Math.min(16, KB.ww * .42))}px Outfit, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (const n of P.notes) {
    const y1 = yOf(n.t), y0 = yOf(n.t + n.d) + 2;
    if (y1 < fallTop || y0 > top + 40) continue;
    const [kx, kw] = x[n.m] || [0, 0]; if (!kw) continue;
    const [c1, c2] = handCol(n.h);
    const pad = isBlack(n.m) ? 1 : 3, h = Math.max(8, y1 - y0);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, fallTop, VW, fallH); ctx.clip();
    if (!n.on) { ctx.globalAlpha = .22; }
    else if (n.st === 'hit') ctx.globalAlpha = .45;
    let g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    if (n.st === 'miss') { g.addColorStop(0, '#fecdd3'); g.addColorStop(1, '#e11d48'); }
    else { g.addColorStop(0, c2); g.addColorStop(1, c1); }
    ctx.fillStyle = g;
    if (n.on && n.st !== 'hit') { ctx.shadowColor = c1; ctx.shadowBlur = 12; }
    rr(kx + pad, y0, kw - pad * 2, h, Math.min(8, kw / 3)); ctx.fill();
    ctx.shadowBlur = 0;
    if (cur && n.step === cur && !cur.hit[n.m]) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 + Math.sin(now / 160) * 1; rr(kx + pad, y0, kw - pad * 2, h, Math.min(8, kw / 3)); ctx.stroke(); }
    if (opt.names && n.on && h > 16 && kw > 14) { ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillText(noteName(n.l, n.a), kx + kw / 2, y1 - 4); }
    ctx.restore();
  }
  // Linie über der Tastatur
  const lg = ctx.createLinearGradient(0, 0, VW, 0); lg.addColorStop(0, '#3b82f6'); lg.addColorStop(1, '#22c55e');
  ctx.fillStyle = lg; ctx.fillRect(0, top - 3, VW, 3);
  drawKeys(now);
  if (opt.staff) drawStaff(now);
  if (DEBUG && P.input instanceof EarInput) drawDebug();
}
// Abstimm-Anzeige: Pegel, letzter Anschlag, für die gesuchten Tasten Energie / Schwelle und ob ein Einsatz zu sehen ist
function drawDebug() {
  const e = P.input.ear, h = e.hist[e.hist.length - 1]; if (!h) return;
  const s = P.mode === 'wait' ? P.steps[P.idx] : P.steps[P.jFirst];
  const o = e.onsets[e.onsets.length - 1];
  const lines = [`Pegel ${(20 * Math.log10(e.rms + 1e-9)).toFixed(0)} dB · Fluss ${(e.lastFlux || 0).toFixed(0)} · Anschläge ${e.onsetId}${o ? ' (vor ' + Math.round(e.t - o.t) + ' ms, ' + (o.flux || 0).toFixed(0) + ')' : ''}`];
  if (s) for (const m of s.notes) lines.push(`${nameOfM(m)}${Math.floor(m / 12) - 1}: E/Schwelle ${(h.E[m - 21] / e.thr(m)).toFixed(1)} · Einsatz ${o ? (e.attack(m, o, s.notes) ? 'ja' : 'nein') : '–'} · gehört ${o ? (e.heard(m, o, s.notes) ? 'ja' : 'nein') : '–'}`);
  ctx.font = '600 12px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(6, (KB.staffH || 0) + 6, 330, lines.length * 16 + 8);
  ctx.fillStyle = '#facc15'; lines.forEach((l, k) => ctx.fillText(l, 12, (KB.staffH || 0) + 10 + k * 16));
}
function drawKeys(now) {
  const { lo, hi, top, kbH, x, ww } = KB;
  // gerade gesuchte / klingende Tasten einfärben
  const want = {};
  if (P.mode === 'wait') { const s = P.steps[P.idx]; if (s && P.beat >= s.t - .5) for (const n of s.ns) if (!s.hit[n.m]) want[n.m] = n.h; }
  else for (const n of P.notes) if (n.on && n.t <= P.beat + .05 && P.beat < n.t + n.d) want[n.m] = n.h;
  const fl = {};
  for (const f of P.flashes) { const a = 1 - (now - f.t) / (f.kind === 'bad' ? 500 : 350); if (a > 0) fl[f.m] = { kind: f.kind, a }; }
  const fillKey = (m, base) => {
    const f = fl[m];
    if (f) return f.kind === 'bad' ? `rgba(244,63,94,${.5 + f.a * .5})` : handCol(f.kind)[0];
    if (want[m]) return want[m] === 'l' ? '#93c5fd' : '#86efac';
    return base;
  };
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const m of KB.whites) {
    const [kx] = x[m];
    ctx.fillStyle = fillKey(m, '#f4f4f6'); rr(kx + 1, top, ww - 2, kbH - 2, 5); ctx.fill();
    const label = opt.names ? nameOfM(m) + (m % 12 === 0 ? Math.floor(m / 12) - 1 : '') : m % 12 === 0 ? 'C' + (Math.floor(m / 12) - 1) : '';
    if (label && ww > 12) { ctx.fillStyle = m === 60 ? '#0f766e' : 'rgba(0,0,0,.45)'; ctx.font = `${m % 12 === 0 ? 800 : 600} ${Math.max(9, Math.min(14, ww * .34))}px Outfit, system-ui, sans-serif`; ctx.fillText(label, kx + ww / 2, top + kbH - 8); }
  }
  for (let m = lo; m <= hi; m++) if (isBlack(m)) {
    const [kx, kw] = x[m];
    ctx.fillStyle = fillKey(m, '#15151a'); rr(kx, top - 1, kw, kbH * .62, 4); ctx.fill();
  }
}
// Notenlinien: oben ein Notensystem (Violin- und Bassschlüssel), das mitläuft
function drawStaff(now) {
  const H = KB.staffH, g = H / 14, x0 = Math.max(56, VW * .16), pxB = (VW - x0) / (P.song.bar * 2.6);
  const yOfL = l => 6 * g - (l - 30) * g / 2 + g * .5;
  const xOf = b => x0 + (b - P.beat) * pxB;
  ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(0, 0, VW, H);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const l of [30, 32, 34, 36, 38, 18, 20, 22, 24, 26]) { const y = Math.round(yOfL(l)) + .5; ctx.moveTo(6, y); ctx.lineTo(VW - 6, y); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `${g * 6.2}px "Apple Symbols", "Noto Music", "Segoe UI Symbol", serif`; ctx.fillText('𝄞', 8, yOfL(30) + g * 1.1);
  ctx.font = `${g * 3.2}px "Apple Symbols", "Noto Music", "Segoe UI Symbol", serif`; ctx.fillText('𝄢', 10, yOfL(26) + g * 2.2);
  ctx.save(); ctx.beginPath(); ctx.rect(x0 - 26, 0, VW, H); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  for (const b of P.pr.bars) { const xx = Math.round(xOf(b)) + .5; if (xx < x0 - 30 || xx > VW) continue; ctx.beginPath(); ctx.moveTo(xx, yOfL(38)); ctx.lineTo(xx, yOfL(18)); ctx.stroke(); }
  const cur = P.mode === 'wait' ? P.steps[P.idx] : null;
  for (const n of P.notes) {
    const xx = xOf(n.t); if (xx < x0 - 30 || xx > VW + 10) continue;
    const y = yOfL(n.l), [c1] = handCol(n.h);
    const col = n.st === 'hit' ? c1 : n.st === 'miss' ? '#fb7185' : !n.on ? 'rgba(255,255,255,.3)' : cur && n.step === cur ? '#fff' : 'rgba(255,255,255,.88)';
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1;
    // Hilfslinien
    const ledger = [];
    if (n.l >= 40) for (let l = 40; l <= n.l; l += 2) ledger.push(l);
    if (n.l <= 16) for (let l = 16; l >= n.l; l -= 2) ledger.push(l);
    if (n.l === 28) ledger.push(28);
    for (const l of ledger) { const ly = Math.round(yOfL(l)) + .5; ctx.beginPath(); ctx.moveTo(xx - g * 1.1, ly); ctx.lineTo(xx + g * 1.1, ly); ctx.stroke(); }
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(xx, y, g * .66, g * .48, -.35, 0, Math.PI * 2);
    if (n.d >= 2) ctx.stroke(); else ctx.fill();
    if (n.d < 4) {
      const up = n.l < (n.h === 'l' ? 22 : 34);
      ctx.beginPath(); ctx.moveTo(up ? xx + g * .6 : xx - g * .6, y); ctx.lineTo(up ? xx + g * .6 : xx - g * .6, y + (up ? -3.3 : 3.3) * g); ctx.stroke();
      const flags = n.d <= .25 ? 2 : n.d <= .75 ? 1 : 0;
      for (let k = 0; k < flags; k++) { const sx = up ? xx + g * .6 : xx - g * .6, sy = y + (up ? -3.3 + k * .8 : 3.3 - k * .8) * g; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + g * .9, sy + (up ? 1 : -1) * g * 1.1); ctx.stroke(); }
    }
    if ([1.5, 3, .75, .375].includes(n.d)) { ctx.beginPath(); ctx.arc(xx + g * 1.05, y - g * .2, g * .16, 0, 7); ctx.fill(); }
    if (n.a) { ctx.font = `700 ${g * 1.6}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.a > 0 ? '♯' : '♭', xx - g * 1.45, y); }
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(45,212,191,.85)'; ctx.fillRect(x0 - 1, yOfL(40), 2, yOfL(16) - yOfL(40));
}

/* ---------- Tippen auf die Tastatur (Bildschirmtasten, Test-Klavier) ---------- */
function keyAt(px, py) {
  if (!KB || py < KB.top) return null;
  for (let m = KB.lo; m <= KB.hi; m++) if (isBlack(m)) { const [kx, kw] = KB.x[m]; if (px >= kx && px <= kx + kw && py <= KB.top + KB.kbH * .62) return m; }
  for (const m of KB.whites) { const [kx] = KB.x[m]; if (px >= kx && px < kx + KB.ww) return m; }
  return null;
}
cv.addEventListener('pointerdown', e => {
  if (!P) return;
  const r = cv.getBoundingClientRect(), m = keyAt(e.clientX - r.left, e.clientY - r.top);
  if (m == null) return;
  e.preventDefault();
  pressKey(m);
});
function pressKey(m) {
  if (!P) return;
  if (P.input instanceof TapInput || P.input.src === testMic) { P.input.press(m, clock()); if (P.input instanceof TapInput) flash(m, P.notes.find(n => n.m === m)?.h || 'r', clock()); }
}
// Computertastatur im Bildschirmtasten-Modus: A S D F G H J K = C D E F G A H C (ab dem ersten C der Tastatur), W E T Z/Y U = schwarze Tasten
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, z: 8, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15 };
document.addEventListener('keydown', e => {
  if (!P || e.repeat || e.metaKey || e.ctrlKey || document.querySelector('dialog[open]')) return;
  if (e.key === ' ') { e.preventDefault(); togglePause(); return; }
  const k = KEYMAP[e.key.toLowerCase()];
  if (k == null || !KB) return;
  const c = KB.lo + ((12 - KB.lo % 12) % 12) + (KB.hi - KB.lo >= 24 ? 12 : 0);
  pressKey(c + k);
});

/* ---------- Test: spielt automatisch mit (?test=1&auto=1 oder PR.auto = { wrong: 0.1 }) ---------- */
let auto = TEST && QS.has('auto') ? { wrong: 0, late: 0 } : null;
function autoPlay(now) {
  if (!testMic || P.input.src !== testMic) return;
  if (P.mode === 'wait') {
    const s = P.steps[P.idx];
    if (s && P.beat >= s.t - 1e-6 && !s.autoAt) s.autoAt = now + 120 + Math.random() * 200;
    if (s && s.autoAt && now >= s.autoAt && !s.autoDone) {
      s.autoDone = true;
      if (Math.random() < auto.wrong) { testMic.play(s.notes[0] + 1, now, 300, .7); s.autoDone = false; s.autoAt = now + 700; return; }
      for (const m of s.notes) testMic.play(m, now + Math.random() * 25, Math.max(200, s.ns[0].d / P.bps * 1000 - 30), .7);
    }
  } else {
    for (let j = P.jFirst; j < P.steps.length; j++) {
      const s = P.steps[j], tr = stepReal(s); if (tr > now + 50) break;
      if (s.autoDone) continue; s.autoDone = true;
      if (Math.random() < auto.wrong) continue;
      for (const m of s.notes) testMic.play(m, tr + (Math.random() - .5) * 120, Math.max(160, s.ns[0].d / P.bps * 1000 - 30), .7);
    }
  }
}

/* ---------- Meldungen im Spiel ---------- */
function showMsg(big, txt, small = false, btn = null) {
  const m = $('#playMsg'); m.classList.remove('hidden', 'tick'); void m.offsetWidth; m.classList.add('tick');
  $('#playMsgBig').textContent = big; $('#playMsgBig').classList.toggle('small', small);
  $('#playMsgTxt').textContent = txt;
  const b = $('#playMsgBtn'); b.classList.toggle('hidden', !btn); if (btn) { b.textContent = btn[0]; b.onclick = btn[1]; }
}
const hideMsg = () => $('#playMsg').classList.add('hidden');
let flashT = 0;
function flashMsg(big, txt = '') { showMsg(big, txt); clearTimeout(flashT); flashT = setTimeout(() => { if (P?.phase !== 'pause') hideMsg(); }, 900); }
let hintT = 0;
function showHint(text, bad = false) {
  const h = $('#hintBubble'); h.textContent = text; h.classList.toggle('bad', bad); h.classList.remove('hidden');
  if (P) P.hintShown = !bad;
  clearTimeout(hintT); if (bad) hintT = setTimeout(hideHint, 2200);
}
function hideHint() { $('#hintBubble').classList.add('hidden'); if (P) P.hintShown = false; }
function togglePause() {
  if (!P || P.phase === 'end' || P.phase === 'quiet') return;
  if (P.phase === 'pause') {
    P.phase = 'run'; P.last = clock(); P.anchorT = clock(); P.anchorB = P.beat; hideMsg();
    $('#playPause use').setAttribute('href', '#i-pause');
  } else {
    P.phase = 'pause'; showMsg(tx('Pause'), tx('Tippe auf Weiter, wenn du bereit bist.'), true, [tx('Weiter'), togglePause]);
    $('#playPause use').setAttribute('href', '#i-play');
  }
}
function leavePlay() {
  stopLoop?.(); stopLoop = null;
  if (P && P.phase !== 'end' && P.playT > 20000) recordPractice(P.playT / 1000, false, P.perfect + P.good);
  P = null; KB = null;
  document.body.classList.remove('playing');
  $('#play').classList.add('hidden'); hideMsg(); hideHint();
  $('#playPause use').setAttribute('href', '#i-pause');
}
async function quitPlay() {
  if (P && P.phase !== 'end') {
    const was = P.phase; if (was === 'run') togglePause();
    if (!(await ask(tx('Lied beenden? Es wird nicht gewertet.'), tx('Beenden'), true))) return;
  }
  leavePlay(); show('setup'); renderSetup();
}

/* ---------- Anhören (nur vor dem Spielen – während Piano Rain zuhört, spielt es nie selbst) ---------- */
let pv = null;
function playPreview(song) {
  if (pv) return stopPreview();
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ac = pv?.ac || new AC(), out = ac.createGain(); out.gain.value = .22; out.connect(ac.destination);
  const pr = parsed(song), hands = hasLeft(song) ? opt.hands : 'r', bps = song.bpm / 60 * opt.speed;
  const loopR = opt.loopOn && curLoop(), from = loopR ? pr.bars[loopR[0]] : 0, to = loopR ? (pr.bars[loopR[1] + 1] ?? pr.beats) : pr.beats;
  const t0 = ac.currentTime + .15;
  for (const n of pr.notes) {
    if (n.t < from || n.t >= to || !(hands === 'b' || n.h === hands)) continue;
    const at = t0 + (n.t - from) / bps, dur = Math.max(.15, n.d / bps), f = freqOf(n.m);
    const g = ac.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.5, at + .006);
    g.gain.setTargetAtTime(.0001, at + .01, .5 * Math.pow(2, -(n.m - 60) / 24)); g.gain.setTargetAtTime(0, at + dur, .06);
    g.connect(out);
    for (const [k, a] of [[1, 1], [2, .35], [3, .12], [4, .06]]) { const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = f * k; og.gain.value = a; o.connect(og).connect(g); o.start(at); o.stop(at + dur + .4); }
  }
  const len = (to - from) / bps + .6;
  pv = { ac, out, timer: setTimeout(stopPreview, len * 1000) };
  $('#listenTxt').textContent = tx('Stopp');
}
function stopPreview() {
  if (!pv) return;
  clearTimeout(pv.timer); try { pv.out.disconnect(); pv.ac.close(); } catch {}
  pv = null; $('#listenTxt').textContent = tx('Anhören');
}

/* ---------- Mikrofon einrichten ---------- */
const cal = { ear: null, raf: 0, step: '', done: null };
function calShow(step) { cal.step = step; $$('#calDlg .cal-step').forEach(s => s.classList.toggle('on', s.dataset.step === step)); }
function openCal(then = null) {
  cal.done = then;
  calShow('intro');
  const d = $('#calDlg'); if (!d.open) d.showModal();
}
function closeCal(ok) {
  cal.stop?.(); cal.ear = null;
  const d = $('#calDlg'); if (d.open) d.close();
  if (!P) closeMic();
  renderHome();
  const f = cal.done; cal.done = null; if (ok && f) f();
}
async function calStart() {
  let src, sr;
  try {
    if (TEST) { testMic ??= new TestMic(48000, { seed: 3 }); src = testMic; sr = 48000; }
    else { mic ??= new Mic(); await mic.open(); src = mic; sr = mic.sr; }
  } catch (e) { return calError(e); }
  cal.ear = new Ear(sr); cal.src = src;
  calShow('noise');
  cal.ear.startNoise();
  const t0 = clock();
  const tick = () => {
    if (!cal.ear) { cal.stop?.(); return; }
    const now = clock(); cal.ear.push(src.read(now), now);
    if (cal.step === 'noise') {
      $('#calNoiseBar').style.width = Math.min(100, (now - t0) / 20) + '%';
      if (now - t0 > 2000) { cal.ear.stopNoise(); calNote(); }
    } else if (cal.step === 'note') calListen(now);
  };
  cal.stop?.(); cal.stop = ticker(tick);
  if (TEST) setTimeout(() => { if (cal.step === 'note') testMic.play(60, clock(), 900, .7); }, 2600);
}
function calNote() {
  calShow('note'); cal.armT = clock(); cal.used = {}; cal.peak = 0; cal.found = null;
  $('#calFb').textContent = ''; $('#calFb').classList.remove('good');
  drawCalKeys();
}
function calListen(now) {
  const e = cal.ear;
  $('#calLevel').style.width = Math.round(e.level * 100) + '%';
  if (!cal.found) {
    const r = e.match([60], { from: cal.armT, used: cal.used });
    if (r[60]) { e.take(60, r[60], cal.used); cal.found = { t: now }; $('#calFb').textContent = '✓ ' + tx('Gehört!'); $('#calFb').classList.add('good'); }
    for (const w of e.wrong.splice(0)) {
      $('#calFb').textContent = w.m % 12 === 0 ? tx('Das war ein anderes C – nimm das in der Mitte.') : tx('Das war {a} – gesucht ist das C.', { a: nameOfM(w.m) + (Math.floor(w.m / 12) - 1) });
    }
  } else {
    // Lautstärke des C merken (größte Zunahme über dem Rauschen) – danach gelten leise Töne relativ dazu
    const h = e.hist[e.hist.length - 1], dE = h.E[60 - 21] - (e.noiseE?.[60 - 21] || 0);
    cal.peak = Math.max(cal.peak, dE);
    if (now - cal.found.t > 450) {
      const noise = Math.max(1e-12, e.noiseE?.[60 - 21] || 1e-9), snr = 10 * Math.log10(cal.peak / noise);
      LS.set('cal', { ref: cal.peak, snr: Math.round(snr), at: today() });
      $('#calDoneTxt').textContent = (snr >= 30 ? tx('Sehr gut zu hören.') : snr >= 18 ? tx('Gut zu hören.') : tx('Etwas leise – dreh das Klavier lauter oder stell das iPad näher.'))
        + ' ' + tx('Du kannst das jederzeit in den Einstellungen wiederholen.');
      cal.stop?.(); cal.ear = null; if (!P) closeMic();
      calShow('done');
    }
  }
}
function drawCalKeys() {
  const c = $('#calKeys'), x = c.getContext('2d'), W = c.width, H = c.height, lo = 53, hi = 71;   // F3 … B4
  const whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const ww = W / whites.length; x.clearRect(0, 0, W, H);
  whites.forEach((m, i) => { x.fillStyle = m === 60 ? '#86efac' : '#f4f4f6'; x.beginPath(); x.roundRect ? x.roundRect(i * ww + 1, 0, ww - 2, H, 6) : x.rect(i * ww + 1, 0, ww - 2, H); x.fill();
    if (m === 60) { x.fillStyle = '#065f46'; x.font = '800 22px Outfit, system-ui, sans-serif'; x.textAlign = 'center'; x.fillText(nameOfM(60), i * ww + ww / 2, H - 14); } });
  whites.forEach((m, i) => { if (isBlack(m + 1) && m + 1 <= hi) { x.fillStyle = '#15151a'; x.fillRect(i * ww + ww * .68, 0, ww * .64, H * .6); } });
}
function calError(e) {
  calShow('error');
  $('#calErrTxt').textContent = micErrText(e);
}
function micErrText(e) {
  if (!navigator.mediaDevices?.getUserMedia || !isSecureContext) return tx('Dieser Browser erlaubt hier kein Mikrofon. Öffne Piano Rain in Safari oder Chrome über https://ku3rb1s.github.io.');
  if (e?.name === 'NotAllowedError') return tx('Das Mikrofon ist nicht erlaubt. In Safari: „aA“ in der Adressleiste → Website-Einstellungen → Mikrofon → Erlauben.');
  if (e?.name === 'NotFoundError') return tx('Kein Mikrofon gefunden.');
  return tx('Das Mikrofon ließ sich nicht öffnen.');
}
function micError(e) { openCal(); calError(e); }
$('#calDlg').addEventListener('click', e => {
  const b = e.target.closest('[data-cal]'); if (!b) return;
  const a = b.dataset.cal;
  if (a === 'start') calStart();
  else if (a === 'again') { cal.stop?.(); cal.ear = null; calStart(); }
  else if (a === 'skip') closeCal(false);
  else if (a === 'close') closeCal(true);
  else if (a === 'tap') { opt.input = 'tap'; saveOpt(); closeCal(false); toast(tx('Bildschirmtasten an – tippe auf die Tasten.')); }
});
$('#calDlg').addEventListener('cancel', e => { e.preventDefault(); closeCal(false); });

/* ---------- Anzeige der Seiten ---------- */
function show(id) {
  for (const s of ['home', 'setup', 'end']) $('#' + s).classList.toggle('hidden', s !== id);
  if (id === 'home') closeMic();                       // Mikrofon aus, solange nicht gespielt wird
  window.scrollTo(0, 0);
}
const TABS = () => [...(xmasSeason() ? [['xmas', '🎄 ' + tx('Weihnachten')]] : []), ['1', tx('Stufe 1')], ['2', tx('Stufe 2')], ['3', tx('Stufe 3')], ...(xmasSeason() ? [] : [['xmas', '🎄 ' + tx('Weihnachten')]]), ['mine', tx('Meine Lieder')]];
const tabOf = s => s.mine ? 'mine' : opt.tab === 'xmas' && s.xmas ? 'xmas' : String(s.lvl);
function listFor(tab) {
  if (tab === 'mine') return MINE;
  if (tab === 'xmas') return SONGS.filter(s => s.xmas);
  return SONGS.filter(s => String(s.lvl) === tab);
}
const LEVEL_INFO = { 1: 'Nur die rechte Hand, fünf Töne rund ums C – zum Reinkommen.', 2: 'Melodie rechts, dazu eine einfache Begleitung links. Erst jede Hand einzeln, dann beide.',
  3: 'Kleine Stücke der großen Komponisten – mit beiden Händen.', xmas: 'Die Weihnachtslieder aus allen Stufen – passend zum Advent.', mine: '' };
function renderHome() {
  const tabs = TABS();
  if (!tabs.some(t => t[0] === opt.tab)) opt.tab = tabs[0][0];
  $('#bookTabs').innerHTML = tabs.map(([k, n]) => {
    const l = listFor(k), got = l.filter(s => starsOf(s) > 0).length;
    return `<button data-tab="${k}" class="${k === opt.tab ? 'on' : ''}">${esc(n)}${l.length ? `<small>${got}/${l.length}</small>` : ''}</button>`;
  }).join('');
  const list = listFor(opt.tab);
  $('#bookInfo').textContent = tx(LEVEL_INFO[opt.tab] || '');
  $('#songList').innerHTML = list.length ? list.map((s, i) => `<div class="cell tap song" data-song="${esc(s.id)}" role="button" tabindex="0">
      <span class="num ${s.mine ? 'mine' : s.xmas ? 'xmas' : ''}">${s.mine ? '♪' : s.xmas ? '🎄' : i + 1}</span>
      <span class="grow"><span class="t">${esc(titleOf(s))}</span><span class="sub">${esc(byOf(s))}${hasLeft(s) ? ' · ' + tx('2 Hände') : ''}</span></span>
      ${starHtml(starsOf(s))}${s.mine ? `<button class="del" data-del="${esc(s.id)}" aria-label="${esc(tx('Löschen'))}"><svg class="ic"><use href="#i-x"/></svg></button>` : ''}</div>`).join('')
    : `<div class="cell muted">${tx('Noch keine eigenen Lieder.')}</div>`;
  $('#mineTools').classList.toggle('hidden', opt.tab !== 'mine');
  const stars = SONGS.reduce((a, s) => a + starsOf(s), 0), streak = practiceStreak();
  $('#starPill').textContent = `⭐ ${stars} / ${SONGS.length * 3}`;
  $('#streakPill').textContent = streak ? '🔥 ' + tx('Übungs-Serie: {n}', { n: streakTxt(streak) }) : (Sync.view('pr.days', LS.get('days', {}))?.[today()] ? '✓ ' + tx('Heute geübt') : tx('Heute noch nicht geübt'));
  const ok = calOk(), tap = !useMic();
  $('#micCard').classList.toggle('ok', ok || tap);
  $('#micTitle').textContent = tap ? tx('Bildschirmtasten') : ok ? tx('Mikrofon eingerichtet') : tx('Mikrofon einrichten');
  $('#micSub').textContent = tap ? tx('Ohne Klavier zum Ausprobieren – in den Einstellungen umstellbar') : ok ? tx('Klavier über Lautsprecher, iPad davor – los geht’s') : tx('Einmal kurz: Ruhe messen und ein C spielen');
  $('#micCard use').setAttribute('href', tap ? '#i-keys' : '#i-mic');
}
let curSong = null;
const curLoop = () => { const a = +$('#loopFrom').value, b = +$('#loopTo').value; return [Math.min(a, b), Math.max(a, b)]; };
function openSetup(song) { curSong = song; show('setup'); renderSetup(true); }
function renderSetup(fresh = false) {
  const s = curSong; if (!s) return;
  $('#setupTitle').textContent = titleOf(s);
  $('#setupBy').textContent = byOf(s);
  const pr = parsed(s), secs = pr.beats / (s.bpm / 60);
  $('#setupInfo').textContent = [s.mine ? '' : tx(LEVELS[s.lvl]), tx('{n} Takte', { n: pr.bars.length }), tx('ca. {n}', { n: fmtTime(secs) }) + ' ' + tx('bei 100 %')].filter(Boolean).join(' · ');
  $('#setupStars').innerHTML = [1, 2, 3].map(i => i <= starsOf(s) ? '★' : '☆').join('');
  $$('#setMode button').forEach(b => b.classList.toggle('on', b.dataset.v === opt.mode));
  $$('#setSpeed button').forEach(b => b.classList.toggle('on', +b.dataset.v === +opt.speed));
  const lh = hasLeft(s); $('#handsBox').classList.toggle('hidden', !lh);
  if (lh) $$('#setHands button').forEach(b => b.classList.toggle('on', b.dataset.v === opt.hands));
  $('#setStaff').checked = !!opt.staff; $('#setNames').checked = !!opt.names; $('#setLoop').checked = !!opt.loopOn;
  if (fresh) {
    const opts = pr.bars.map((_, i) => `<option value="${i}">${s.up ? i : i + 1}</option>`).join('');
    $('#loopFrom').innerHTML = opts; $('#loopTo').innerHTML = opts;
    $('#loopFrom').value = 0; $('#loopTo').value = Math.min(pr.bars.length - 1, 3);
  }
  $('#loopRow').classList.toggle('hidden', !opt.loopOn);
  $('#starRules').textContent = opt.loopOn ? tx('Im Abschnitt gibt es keine Sterne – spiel das ganze Lied für Sterne.')
    : tx('★ Lied geschafft · ★★ 90 % auf Anhieb (Warten) oder 70 % im Takt · ★★★ im Takt bei 100 % mit 85 %') + (lh ? ' ' + tx('(mit beiden Händen)') : '');
  $('#inputNote').textContent = useMic() ? (TEST ? '🧪 ' + tx('Test-Klavier: tippe auf die Tasten, die Töne gehen durch die echte Erkennung.') : calOk() ? '' : tx('Beim Start richtest du kurz das Mikrofon ein.'))
    : tx('Bildschirmtasten: tippe auf die Tasten (am Computer auch A S D F G H J K).');
}
async function go() {
  const s = curSong; if (!s) return;
  const o = opt.loopOn ? { loop: curLoop() } : {};
  if (useMic() && !calOk() && !TEST) return openCal(() => startSession(s, o));
  await startSession(s, o);
}
let toastT = 0;
function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms); }
function ask(text, okLabel, danger = false) {
  const d = $('#askDlg');
  $('#askText').textContent = text; $('#askOk').textContent = okLabel; $('#askOk').classList.toggle('danger', danger);
  return new Promise(res => {
    const done = v => { d.onclose = null; if (d.open) d.close(); res(v); };
    $('#askOk').onclick = () => done(true); $('#askNo').onclick = () => done(false);
    d.onclick = e => { if (e.target === d) done(false); };
    d.onclose = () => res(false);
    d.showModal(); $('#askOk').focus();
  });
}

/* ---------- Töne & Konfetti ---------- */
let actx = null;
function sound(type) {
  if (!opt.sfx) return;
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    const notes = type === 'end' ? [[523, 0], [659, .12], [784, .24], [1047, .36]] : [[740, 0]];
    for (const [f, t] of notes) {
      const o = actx.createOscillator(), g = actx.createGain(), at = actx.currentTime + t;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.14, at + .012); g.gain.exponentialRampToValueAtTime(.0001, at + .3);
      o.connect(g).connect(actx.destination); o.start(at); o.stop(at + .35);
    }
  } catch {}
}
function confetti(n = 90) {
  if (!opt.sfx || reduced()) return;
  const box = document.createElement('div'); box.className = 'confetti';
  const colors = ['#22c55e', '#3b82f6', '#2dd4bf', '#ffffff', '#fbbf24'];
  box.innerHTML = Array.from({ length: n }, () => `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-duration:${1.8 + Math.random() * 1.6}s;animation-delay:${Math.random() * .4}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
  document.body.appendChild(box); setTimeout(() => box.remove(), 4200);
}

/* ---------- Einstellungen ---------- */
function applyTheme() {
  const th = THEMES.find(x => x[0] === opt.theme) ? opt.theme : 'graphit';
  document.documentElement.dataset.theme = th;
  $('meta[name=theme-color]').content = { graphit: '#0c0c0f', lila: '#0d0a1a', ozean: '#05111a', abend: '#130a0b', wald: '#08110c', oled: '#000000' }[th];
  $('#themeRow').innerHTML = THEMES.map(([id, name, a, b]) => `<button class="theme-pick ${th === id ? 'on' : ''}" data-theme-pick="${id}"><i style="background:linear-gradient(135deg,${a},${b})"></i>${tx(name)}</button>`).join('');
}
function renderSettings() {
  $('#setSfx').checked = !!opt.sfx; $('#setNames2').checked = !!opt.names; $('#setStaff2').checked = !!opt.staff;
  $('#subView').textContent = [opt.names ? tx('Notennamen an') : tx('Notennamen aus'), opt.staff ? tx('Notenlinien an') : tx('Notenlinien aus')].join(' · ');
  $('#subDesign').textContent = tx((THEMES.find(x => x[0] === opt.theme) || THEMES[0])[1]);
  const c = LS.get('cal', null);
  $('#subInput').textContent = useMic() ? (c ? tx('Klavier + Mikrofon · eingerichtet') : tx('Klavier + Mikrofon · noch nicht eingerichtet')) : tx('Bildschirmtasten');
  $('#calInfo').textContent = c ? tx('Zuletzt am {d}', { d: new Date(c.at + 'T12:00:00').toLocaleDateString(LOC()) }) : tx('Ruhe messen und ein C spielen');
  $$('input[name=inp]').forEach(r => { r.checked = r.value === (useMic() ? 'mic' : 'tap'); });
  $('#langSel').innerHTML = langOptions();
  const st = Sync.view('pr.stats', LS.get('stats', null));
  $('#subStats').textContent = st?.done ? tx('{n} Lieder gespielt', { n: fmtN(st.done) }) + ' · ' + tx('Übungs-Serie: {n}', { n: streakTxt(practiceStreak()) }) : tx('Noch nicht gespielt');
  $('#appVersion').innerHTML = `Piano Rain · ${tx('Version')} ${APP_VERSION} · ${APP_DATE}<span>${tx('Neuerungen ansehen')} ›</span>`;
  applyTheme();
}
function renderProfile() {
  const p = Profile.get(), s = Sync.status();
  let saved = false; try { saved = JSON.parse(localStorage.getItem('hub.codeSaved')) === s.code; } catch {}
  const unsaved = s.connected && !saved;
  $('#syncTitle').textContent = s.connected ? tx('Dein Code') : tx('Auf anderen Geräten weiterspielen');
  $('#syncSub').textContent = unsaved ? '⚠️ ' + tx('Noch nicht gesichert – in der Jukebox sichern')
    : s.connected ? '✓ ' + tx('Abgeglichen · verwalten in der Jukebox') : tx('Rekorde, Serien und Profil mit einem Code mitnehmen – ohne E-Mail und Passwort');
  $('#syncIc').style.background = unsaved ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : s.connected ? 'linear-gradient(135deg,#10b981,#0ea5e9)' : 'linear-gradient(135deg,#ff4f86,#fbbf24)';
  $('#profEmoji').textContent = p.emoji;
  if (document.activeElement !== $('#profName')) $('#profName').value = p.name;
}
function goPage(p, back = false) {
  const page = $(`#sheetSettings .page[data-page="${p}"]`) || $('#sheetSettings .page[data-page="main"]');
  $$('#sheetSettings .page').forEach(x => x.classList.toggle('active', x === page));
  page.classList.toggle('back', back);
  $('#navTitle').textContent = page.dataset.title;
  $('#navBack').classList.toggle('invisible', page.dataset.page === 'main');
  $('#sheetSettings .sheet-body').scrollTop = 0;
  if (page.dataset.page === 'changes') renderChanges();
  if (page.dataset.page === 'stats') renderStats();
}
let changesCache = null;
async function renderChanges() {
  const box = $('#changesList');
  if (!changesCache) {
    box.innerHTML = '<div class="cell muted"><span class="loader"></span></div>';
    try {
      const r = await fetch('CHANGELOG.md?v=' + APP_VERSION);
      if (!r.ok) throw new Error();
      changesCache = []; let cur = null;
      for (const line of (await r.text()).split(/\r?\n/)) {
        const hd = line.match(/^##\s+(\S+)(?:\s+[–-]\s+(.+))?$/);
        if (hd) { cur = { ver: hd[1], date: hd[2] || '', items: [] }; changesCache.push(cur); continue; }
        const li = line.match(/^\s*[-*]\s+(.*)$/);
        if (li && cur) cur.items.push(li[1]);
      }
    } catch { box.innerHTML = `<div class="cell muted">${tx('Die Neuerungen konnten nicht geladen werden.')}</div>`; return; }
  }
  const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  box.innerHTML = changesCache.map(v => `<div class="chg"><div class="chg-h"><b>${esc(v.ver)}</b>${v.ver === APP_VERSION ? `<span class="chg-now">${tx('aktuell')}</span>` : ''}<span class="chg-d">${esc(v.date)}</span></div>
    <ul>${v.items.map(i => `<li>${fmt(i)}</li>`).join('')}</ul></div>`).join('');
}

/* ---------- Ereignisse ---------- */
$('#bookTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { opt.tab = b.dataset.tab; saveOpt(); renderHome(); } };
$('#songList').onclick = async e => {
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    const s = songById(del.dataset.del);
    if (s && await ask(tx('„{t}“ von diesem Gerät löschen?', { t: s.name }), tx('Löschen'), true)) { await DB.del(s.id); await loadMine(); renderHome(); }
    return;
  }
  const r = e.target.closest('[data-song]'); if (r) openSetup(songById(r.dataset.song));
};
$('#songList').onkeydown = e => { if (e.key === 'Enter') { const r = e.target.closest('[data-song]'); if (r) openSetup(songById(r.dataset.song)); } };
$('#midiFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    if (f.size > 2e6) throw new Error('big');
    const song = midiToSong(new Uint8Array(await f.arrayBuffer()), f.name);
    await DB.put(song); await loadMine(); renderHome();
    toast('♪ ' + tx('„{t}“ geladen – bleibt nur auf diesem Gerät.', { t: song.name }));
  } catch { toast(tx('Diese Datei konnte nicht gelesen werden. Nur MIDI-Dateien (.mid) mit Klaviernoten.')); }
};
$('#micCard').onclick = () => { if (!useMic()) { $('#btnSettings').click(); goPage('input'); } else openCal(); };
$('#setupBack').onclick = () => { stopPreview(); show('home'); renderHome(); };
$('#setMode').onclick = e => { const b = e.target.closest('button'); if (b) { opt.mode = b.dataset.v; saveOpt(); renderSetup(); } };
$('#setSpeed').onclick = e => { const b = e.target.closest('button'); if (b) { opt.speed = +b.dataset.v; saveOpt(); stopPreview(); renderSetup(); } };
$('#setHands').onclick = e => { const b = e.target.closest('button'); if (b) { opt.hands = b.dataset.v; saveOpt(); stopPreview(); renderSetup(); } };
$('#setStaff').onchange = e => { opt.staff = e.target.checked; saveOpt(); };
$('#setNames').onchange = e => { opt.names = e.target.checked; saveOpt(); };
$('#setLoop').onchange = e => { opt.loopOn = e.target.checked; saveOpt(); renderSetup(); };
$('#goBtn').onclick = go;
$('#listenBtn').onclick = () => curSong && playPreview(curSong);
$('#playClose').onclick = quitPlay;
$('#playPause').onclick = togglePause;
$('#againBtn').onclick = () => { if (lastResult) { curSong = lastResult.song; go(); } };
$('#nextBtn').onclick = () => { const n = lastResult && nextSong(lastResult.song); if (n) openSetup(n); };
$('#homeBtn').onclick = () => { show('home'); renderHome(); };
$('#logoBtn').onclick = () => { stopPreview(); show('home'); renderHome(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && P?.phase === 'run') togglePause(); });

const sheet = $('#sheetSettings');
$('#btnSettings').onclick = () => { renderSettings(); renderProfile(); goPage('main'); sheet.showModal(); };
sheet.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) goPage(g.dataset.go); });
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });
sheet.addEventListener('close', () => { if (!$('#home').classList.contains('hidden')) renderHome(); if (!$('#setup').classList.contains('hidden')) renderSetup(); });
$('#navBack').onclick = () => goPage('main', true);
$('#profEmoji').onclick = () => Profile.pick(e => { $('#profEmoji').textContent = e; });
$('#profName').oninput = () => Profile.set({ name: $('#profName').value });
$('#profName').onkeydown = e => { if (e.key === 'Enter') $('#profName').blur(); };
$('#setSfx').onchange = e => { opt.sfx = e.target.checked; saveOpt(); renderSettings(); sound('ok'); };
$('#setNames2').onchange = e => { opt.names = e.target.checked; saveOpt(); renderSettings(); };
$('#setStaff2').onchange = e => { opt.staff = e.target.checked; saveOpt(); renderSettings(); };
$$('input[name=inp]').forEach(r => r.onchange = () => { opt.input = r.value; saveOpt(); renderSettings(); });
$('#btnCal').onclick = () => { sheet.close(); opt.input = 'mic'; saveOpt(); openCal(); };
$('#themeRow').onclick = e => { const b = e.target.closest('[data-theme-pick]'); if (!b) return; opt.theme = b.dataset.themePick; sharedTheme.set(opt.theme); renderSettings(); };
$('#langSel').onchange = e => setLang(e.target.value);
$('#btnResetAll').onclick = async () => {
  if (!(await ask(tx('Alles löschen, was Piano Rain auf diesem Gerät gespeichert hat – auch Meine Lieder?'), tx('Löschen'), true))) return;
  try { Object.keys(localStorage).filter(k => k.startsWith('pr.')).forEach(k => localStorage.removeItem(k)); } catch {}
  try { await DB.clear(); } catch {}
  Sync.leave();
  location.reload();
};
self.liveLang = () => {
  renderHome();
  if (!$('#setup').classList.contains('hidden')) renderSetup();
  if (sheet.open) { renderSettings(); goPage($('#sheetSettings .page.active')?.dataset.page || 'main'); }
  if (P) { $('#playTitle').textContent = titleOf(P.song); renderPlaySub(); }
  if ($('#calDlg').open && cal.step === 'note') drawCalKeys();
};

/* ---------- Test-Zugang (nur mit ?test=1): Ablauf ohne echtes Klavier und ohne sichtbares Fenster prüfen ----------
   PR.sim(ms): spielt die laufende Runde mit fester Uhr im Zeitraffer (16,7 ms je Bild) – auch wenn das Fenster verborgen ist. */
if (TEST) self.PR = {
  get P() { return P; }, get auto() { return auto; }, set auto(v) { auto = v; },
  start: (id, o = {}) => { Object.assign(opt, o.opt || {}); curSong = songById(id); return startSession(curSong, o); },
  sim(ms) {
    stopLoop?.(); stopLoop = null;
    clockT ??= performance.now();
    const end = clockT + ms;
    while (P && clockT < end) { clockT += 1000 / 60; frame(clockT); }
    const r = P ? { phase: P.phase, idx: P.idx, steps: P.steps.length, perfect: P.perfect, good: P.good, miss: P.miss, wrong: P.wrong, beat: +P.beat.toFixed(2) } : { phase: 'done', end: !$('#end').classList.contains('hidden'), score: $('#endScore').textContent, stars: $('#endStars').textContent };
    return r;
  },
  real() { clockT = null; if (P) loop(); },
  play: (m, at, dur = 400) => testMic?.play(m, at ?? clock(), dur),
};

/* ---------- Start ---------- */
applyTheme();
renderHome();
loadMine().then(() => { renderHome(); });
addEventListener('jukebox-sync', () => { if (!P) renderHome(); if (sheet.open) renderSettings(); });
let shownDay = today();
document.addEventListener('visibilitychange', () => { if (document.hidden || today() === shownDay) return; shownDay = today(); if (!P) renderHome(); });
