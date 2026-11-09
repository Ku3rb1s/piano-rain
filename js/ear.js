/* Piano Rain – Gehör: hört übers Mikrofon zu und PRÜFT, ob die erwarteten Töne erklingen (statt frei zu erkennen).
 *
 * Ablauf je Bild (ca. 60 × pro Sekunde): die letzten 8192 Abtastwerte des Mikrofons kommen in Ear.push().
 *  1. Kurzes Fenster (2048): „Spektraler Fluss“ – findet Anschläge (Onsets), auch bei wiederholter gleicher Taste.
 *  2. Langes Fenster (8192, Hann): Energie jeder Klaviertaste = Grundton + Obertöne (leicht gestreckt wie beim Klavier).
 *  3. Eine erwartete Taste gilt als gespielt, wenn nach einem Anschlag ihre Energie deutlich ZUGENOMMEN hat
 *     (gehaltene oder ausklingende Töne zählen also nicht noch einmal), sie über der Rauschgrenze liegt,
 *     die Nachbartasten nicht stärker zugenommen haben und kein Oktavfehler vorliegt
 *     (Oktave tiefer: Energie bei 1,5 × und 2,5 × Grundton; Oktave höher: Grundton und 3. Teilton fehlen).
 *  4. Einzeltöne zusätzlich mit YIN (Tonhöhe aus dem Zeitsignal): zeigt, welche falsche Taste gespielt wurde.
 * Das Spiel selbst spielt währenddessen keine Töne. Test ohne Klavier: Ear.TestMic erzeugt Klaviertöne mit Obertönen.
 * Läuft im Browser und in Node (scripts/test-ear.js). */
(function (root) {
'use strict';
const freqOf = m => 440 * Math.pow(2, (m - 69) / 12);
const midiOf = f => 69 + 12 * Math.log2(f / 440);
const LO = 21, HI = 108, NK = HI - LO + 1;         // 88 Tasten
const N = 8192, NS = 2048;                          // langes / kurzes Fenster
const HIST_MS = 1200;

function fftOf(n) {
  const bits = Math.round(Math.log2(n)), rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0, x = i; b < bits; b++, x >>= 1) r = (r << 1) | (x & 1); rev[i] = r; }
  const cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
  return (re, im) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) for (let j = i, k = 0; j < i + half; j++, k += step) {
        const l = j + half, tr = re[l] * cs[k] + im[l] * sn[k], ti = im[l] * cs[k] - re[l] * sn[k];
        re[l] = re[j] - tr; im[l] = im[j] - ti; re[j] += tr; im[j] += ti;
      }
    }
  };
}
const hann = n => { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (n - 1)); return w; };
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

class Ear {
  constructor(sr) {
    this.sr = sr; this.bw = sr / N;
    this.fftL = fftOf(N); this.fftS = fftOf(NS);
    this.winL = hann(N); this.winS = hann(NS);
    this.normL = 2 / this.winL.reduce((a, b) => a + b, 0); this.normS = 2 / this.winS.reduce((a, b) => a + b, 0);
    this.re = new Float64Array(N); this.im = new Float64Array(N);
    this.reS = new Float64Array(NS); this.imS = new Float64Array(NS);
    this.pow = new Float32Array(N / 2);              // aktuelles Leistungsspektrum (langes Fenster)
    this.logS = new Float32Array(NS / 2); this.prevLogS = null;
    this.hist = [];                                  // [{ t, E: Float32Array(88), pow }] – letzte 1,2 s
    this.onsets = []; this.onsetId = 0; this.lastOnsetT = -1e9;
    this.fluxHist = []; this.peaks = [];
    this.noiseE = null; this.noiseFlux = null; this.noiseRms = 0; this.ref = 0;
    this.collect = null;                             // beim Einmessen: gesammelte Werte
    this.t = 0; this.rms = 0; this.level = 0;
    this.wrong = [];                                 // erkannte falsche Töne [{ t, m }]
    this.taken = [];                                 // zuletzt gezählte Töne
    this.mFlux = {};                                 // Stärke des Anschlags, mit dem eine Taste zuletzt gezählt wurde
    this.lastBuf = null;
    // Teiltöne je Taste vorberechnen: [Bin von, Bin bis, Gewicht]. Unter 250 Hz liegen die Tasten enger als das Raster
    // des langen Fensters (5,9 Hz) – dort zählen die Teiltöne wenig, bei tiefen Tasten darum bis zum 10. Teilton (6 über 250 Hz)
    this.parts = [];
    for (let m = LO; m <= HI; m++) {
      const f0 = freqOf(m), ps = [];
      for (let k = 1, good = 0; k <= 10 && good < 6; k++) {
        const f = k * f0 * (1 + .0002 * k * k);
        if (f > 5000) break;
        if (f >= 250) good++;
        ps.push([...this.range(f, 25 + 2 * k), f < 250 ? .3 : 1, f]);
      }
      this.parts.push(ps);
    }
    // Für das kurze Fenster (23 Hz Raster): Teiltöne ab 900 Hz, dort liegen Nachbartasten weit genug auseinander.
    // [Bin, ungerader Teilton?, Bin genau zwischen zwei Teiltönen (Vergleich: klingt es oder rauscht es nur?)]
    const bs = sr / NS; this.partsS = [];
    for (let m = LO; m <= HI; m++) {
      const f0 = freqOf(m), ps = [];
      for (let k = Math.max(1, Math.ceil((f0 < 140 ? 400 : 900) / f0)); ps.length < 8; k++) {   // tiefe Tasten: schon ab 400 Hz
        const f = k * f0 * (1 + .0002 * k * k); if (f > 5000) break;
        ps.push([Math.round(f / bs), k % 2 === 1, Math.round((k + .5) * f0 / bs)]);
      }
      this.partsS.push(ps);
    }
  }
  range(f, cents) {
    const c = Math.round(f / this.bw);
    let lo = Math.round(f * Math.pow(2, -cents / 1200) / this.bw), hi = Math.round(f * Math.pow(2, cents / 1200) / this.bw);
    lo = Math.max(1, Math.min(lo, c)); hi = Math.min(N / 2 - 1, Math.max(hi, c));
    return [lo, hi];
  }
  // Spitze bei f über dem Untergrund daneben (3 Bins links/rechts) – breitbandiges Rauschen zählt so nicht als Ton
  tpeak(pow, f) {
    const p = this.peak(pow, f), c = Math.round(f / this.bw);
    return Math.max(0, p - Math.min(pow[c - 3] || 0, pow[c + 3] || 0));
  }
  peak(pow, f, cents = 30) {
    if (f <= 0 || f >= this.sr / 2 - this.bw) return 0;
    const [lo, hi] = this.range(f, cents); let p = 0;
    for (let b = lo; b <= hi; b++) if (pow[b] > p) p = pow[b];
    return p;
  }

  /* Neues Bild: buf = letzte ≥ 8192 Abtastwerte (Float32, −1 … 1), t = Zeit in ms */
  push(buf, t) {
    const off = buf.length - N; this.t = t; this.lastBuf = buf;
    // kurzes Fenster: Lautstärke + spektraler Fluss
    let ss = 0;
    for (let i = 0; i < NS; i++) { const x = buf[buf.length - NS + i]; ss += x * x; this.reS[i] = x * this.winS[i]; this.imS[i] = 0; }
    this.rms = Math.sqrt(ss / NS);
    this.level = Math.max(0, Math.min(1, (20 * Math.log10(this.rms + 1e-9) + 60) / 50));
    this.fftS(this.reS, this.imS);
    const b0 = Math.floor(50 / (this.sr / NS)), b1 = Math.min(NS / 2 - 1, Math.ceil(6000 / (this.sr / NS)));
    let flux = 0;
    const ps = new Float32Array(NS / 2);
    for (let b = 1; b < NS / 2; b++) { const mag = Math.hypot(this.reS[b], this.imS[b]) * this.normS; ps[b] = mag * mag; }
    for (let b = b0; b <= b1; b++) {
      const mag = Math.sqrt(ps[b]), l = Math.log(1 + 1000 * mag);
      if (this.prevLogS) { const d = l - this.prevLogS[b]; if (d > 0) flux += d; }
      this.logS[b] = l;
    }
    const first = !this.prevLogS;
    this.prevLogS = Float32Array.from(this.logS);
    // langes Fenster: Leistung je Bin, Energie je Taste
    for (let i = 0; i < N; i++) { this.re[i] = buf[off + i] * this.winL[i]; this.im[i] = 0; }
    this.fftL(this.re, this.im);
    const nn = this.normL * this.normL;
    for (let b = 0; b < N / 2; b++) this.pow[b] = (this.re[b] * this.re[b] + this.im[b] * this.im[b]) * nn;
    const E = new Float32Array(NK);
    for (let i = 0; i < NK; i++) {
      let e = 0;
      for (const [lo, hi, w] of this.parts[i]) { let p = 0; for (let b = lo; b <= hi; b++) if (this.pow[b] > p) p = this.pow[b]; e += w * p; }
      E[i] = e;
    }
    this.hist.push({ t, E, pow: Float32Array.from(this.pow), ps });
    while (this.hist.length > 2 && this.hist[0].t < t - HIST_MS) this.hist.shift();
    // Anschlag? Schwelle passt sich an (Ruhe-Messung + jüngste Werte), mindestens 70 ms Abstand
    if (!first) {
      const recent = median(this.fluxHist.map(x => x.f));
      const nf = this.noiseFlux || { mean: 4, sd: 2 };
      // (auch relativ zum stärksten Anschlag der letzten 2 s – das Loslassen einer Taste macht ein kleines Klicken)
      let top = 0; for (const x of this.peaks) if (x.t > t - 2000 && x.f > top) top = x.f;
      const thr = Math.max(nf.mean + 8 * nf.sd, recent * 3, .08 * top, 4);
      const gate = this.rms > Math.max(this.noiseRms * 2.5, 2e-4);
      const prev = this.fluxHist.length ? this.fluxHist[this.fluxHist.length - 1].f : 0;
      if (flux > thr && gate && !(prev > thr) && t - this.lastOnsetT > 70) {
        const dt = this.fluxHist.length ? t - this.fluxHist[this.fluxHist.length - 1].t : 16;
        const o = { id: ++this.onsetId, t: t - Math.min(dt, 30) / 2, used: false, checked: false, flux };
        this.onsets.push(o); this.lastOnsetT = t;
      }
      this.fluxHist.push({ t, f: flux });
      if (flux > 20) { this.peaks.push({ t, f: flux }); while (this.peaks.length && this.peaks[0].t < t - 2000) this.peaks.shift(); }
      while (this.fluxHist.length && this.fluxHist[0].t < t - 500) this.fluxHist.shift();
    }
    while (this.onsets.length && this.onsets[0].t < t - 3000) this.onsets.shift();
    this.lastFlux = flux;
    if (this.collect) { this.collect.E.push(E); this.collect.flux.push(flux); this.collect.rms.push(this.rms); }
    // nach einem Anschlag ohne Treffer: welche Taste war es? (für die rote Markierung)
    for (const o of this.onsets) if (!o.checked && t - o.t >= 260) {
      o.checked = true;
      // (ein zweiter Anschlag desselben Tons, der schon gezählt wurde, ist kein Fehler)
      if (!o.used) { const m = this.guess(o); if (m && !this.taken.some(x => x.m === m && Math.abs(x.t - o.t) < 700)) this.wrong.push({ t: o.t, m, id: o.id }); }
    }
  }

  /* Ruhe messen (vor jedem Lied beim Einzählen und bei der Einrichtung) */
  startNoise() { this.collect = { E: [], flux: [], rms: [] }; }
  stopNoise() {
    const c = this.collect; this.collect = null;
    if (!c || c.E.length < 5) return false;
    const E = new Float32Array(NK);
    for (let i = 0; i < NK; i++) E[i] = median(c.E.map(e => e[i]));
    this.noiseE = E;
    const fl = c.flux.slice(1), mean = fl.reduce((a, b) => a + b, 0) / Math.max(1, fl.length);
    const sd = Math.sqrt(fl.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, fl.length));
    this.noiseFlux = { mean, sd: Math.max(sd, .5) };
    this.noiseRms = median(c.rms);
    return true;
  }

  Eof(m, h) { return h.E[m - LO]; }
  frameAt(t) { let f = this.hist[0]; for (const h of this.hist) { if (h.t <= t) f = h; else break; } return f; }
  thr(m) {
    const n = this.noiseE ? this.noiseE[m - LO] : 0;
    return Math.max(8 * n, this.ref * .0006, 4e-8);
  }

  /* Ist Taste m bei Anschlag o (neu) erklungen? S = alle gerade erwarteten Tasten (für Akkorde)
     1. Kurzes Fenster: hatte m genau bei diesem Anschlag einen Einsatz? (zeitgenau – ein Ton zählt nie für einen fremden Anschlag)
     2. Langes Fenster: ist es wirklich m (Nachbartasten, Oktaven, tiefere Tasten mit passenden Obertönen)? */
  heard(m, o, S = [m]) {
    const now = this.hist[this.hist.length - 1];
    if (!now || this.t - o.t < 35 || m < LO + 12 || m > HI) return false;
    const before = this.frameAt(o.t - 15);
    if (!before || before === now) return false;
    const i = m - LO, eN = now.E[i], eB = before.E[i], th = this.thr(m);
    if (eN < th) return false;
    const att = this.attack(m, o, S);
    // Taste klang schon vorher deutlich (gleiche Taste nochmal angeschlagen)? Das lange Fenster ist dafür zu träge, und ein leiserer
    // zweiter Anschlag hebt die Energie kaum. Dann zählt: m ist jetzt in seiner Umgebung der stärkste Ton, und bei diesem Anschlag
    // hat keine andere Taste eingesetzt (sonst war es die andere – z. B. E gehalten und F gespielt).
    let loud = 0; for (let n = 0; n < NK; n++) if (before.E[n] > loud) loud = before.E[n];
    const sounding = eB >= .1 * loud && eB >= 50 * th;
    if (sounding && !(eN - eB >= th && eN >= 1.25 * eB)) {
      if (this.t - o.t < 60) return false;
      // ein kräftiger Anschlag (nicht bloß das Klicken beim Loslassen einer Taste)
      if ((o.flux || 0) < .07 * (this.mFlux[m] || 0)) return false;
      // m selbst setzt neu ein – auch bei ungeraden Teiltönen (sonst war es eine Taste, die nur aus Obertönen von m besteht,
      // z. B. C5 zu einem klingenden C3)
      if (!att && !this.attack(m, o, S, 1.3)) return false;
      // m ist jetzt der stärkste Ton (außer Tasten, die nur aus Obertönen von m bestehen) und kein Nachbar ist fast so stark
      const harm = [12, 19, 24, 28, 31, 34, 36];
      let top = 0; for (let n = 0; n < NK; n++) if (!harm.includes(n + LO - m) && n + LO !== m && !S.includes(n + LO) && now.E[n] > top) top = now.E[n];
      if (eN < .5 * top) return false;
      for (const d of [-2, -1, 1, 2]) { const n2 = m + d; if (!S.includes(n2) && n2 >= LO && n2 <= HI && now.E[n2 - LO] > .8 * eN) return false; }
      // und bei diesem Anschlag hat keine andere Taste eingesetzt (sonst war es die – z. B. E gehalten und F gespielt)
      for (let n = Math.max(LO + 12, m - 24); n <= Math.min(HI, m + 24); n++) {
        if (n === m || S.includes(n) || harm.includes(n - m)) continue;
        if (now.E[n - LO] > .05 * eN && this.attack(n, o, [n], 2.5, [m])) return false;
      }
      return true;
    }
    if (!att || this.t - o.t < 60) return false;
    // Die Zunahme im langen Fenster muss schon bald nach diesem Anschlag da gewesen sein – nicht erst später (dann gehört sie zu
    // einem späteren Anschlag, der vielleicht noch zu frisch ist)
    if (this.t - o.t > 260) { const soon = this.frameAt(o.t + 200); if (soon && soon.E[i] - eB < .3 * (eN - eB)) return false; }
    const dE = eN - eB;
    const f0 = freqOf(m), P = (h, f) => this.tpeak(h.pow, f), D = f => Math.max(0, P(now, f) - P(before, f));
    const partOf = (s, f) => [1, 2, 3, 4, 5, 6, 7, 8].some(k => Math.abs(1200 * Math.log2(f / (k * freqOf(s)))) < 45);
    const explained = f => S.some(s => s !== m && partOf(s, f));
    // Im Verhältnis zum lautesten neuen Ton nicht nur ein Hauch (Übersprechen, zufällig passender hoher Teilton)
    let maxRise = 0, maxE = 0; for (let n = 0; n < NK; n++) { const r = now.E[n] - before.E[n]; if (r > maxRise) maxRise = r; if (now.E[n] > maxE) maxE = now.E[n]; }
    if (dE < .02 * maxRise || eN < .02 * maxE) return false;
    // Die eigenen tiefen Teiltöne müssen mitsteigen – nicht nur einzelne, die auch Obertöne einer höheren gespielten Taste sind
    // (G4 = 3. Teilton von C3: wird G4 gespielt, steigt bei C3 nur der 3., 6., 9. Teilton)
    {
      const ds = [];
      for (const [lo, hi, w, f] of this.parts[i]) { if (f < 150 || explained(f)) continue; ds.push(D(f)); if (ds.length >= 4) break; }
      const big = Math.max(0, ...ds);
      if (ds.length >= 2 && ds.filter(d => d >= .02 * big).length < 2) return false;
    }
    // Nachbartasten: hat eine davon (die nicht erwartet ist) stärker zugenommen? Dann war es wohl die.
    // Bei Akkorden zählen nur Teiltöne, die nicht zu den erwarteten Tasten gehören (z. B. 5. Teilton von G#2 ≈ Grundton von C5)
    const rise = (n, skip) => { let r = 0; for (const [lo, hi, w, f] of this.parts[n - LO]) { if (skip(f)) continue; let x = 0, y = 0; for (let k = lo; k <= hi; k++) { if (now.pow[k] > x) x = now.pow[k]; if (before.pow[k] > y) y = before.pow[k]; } r += w * Math.max(0, x - y); } return r; };
    const own = S.length > 1 ? rise(m, explained) || dE : dE;
    for (const d of [-2, -1, 1, 2]) {
      const n2 = m + d; if (S.includes(n2) || n2 < LO || n2 > HI) continue;
      const dn = S.length > 1 ? rise(n2, f => S.some(s => partOf(s, f))) : now.E[n2 - LO] - before.E[n2 - LO];
      if (dn > (Math.abs(d) === 1 ? (S.length > 1 ? 1.2 : .7) : 1.6) * own) return false;
    }
    const main = D(f0) + D(2 * f0), mainX = main + D(3 * f0);
    // Tiefere Taste gespielt, deren Obertöne auf unsere fallen (Oktave, Duodezime, zwei Oktaven tiefer: Grundton f0/2, f0/3, f0/4)?
    // Dann klingen auch deren übrige Teiltöne – z. B. 1,5 × und 2,5 × f0 bei der Oktave darunter.
    // (Bei Akkorden zählen Stellen nicht, die bis zu einem Halbton neben Teiltönen der anderen erwarteten Tasten liegen – Übersprechen.)
    const near = f => S.some(s => s !== m && [1, 2, 3, 4, 5, 6, 7, 8].some(k => Math.abs(1200 * Math.log2(f / (k * freqOf(s)))) < 110));
    for (const q of [2, 3, 4]) {
      const g = f0 / q; if (g < 27) break;
      let sub = 0;
      for (let j = 1; j <= 2 * q + 2; j++) { const f = j * g; if (j % q === 0 || f < (q === 2 ? 150 : 200) || near(f)) continue; sub += D(f); }
      if (sub > .12 * (q === 2 ? main : mainX)) return false;
    }
    // Oktave höher gespielt? Dann fehlen Grundton und 3. Teilton
    const odd = (explained(f0) ? 0 : D(f0)) + (explained(3 * f0) ? 0 : D(3 * f0)), even = D(2 * f0) + D(4 * f0);
    if (!(explained(f0) && explained(3 * f0)) && odd < .06 * even) return false;
    return true;
  }

  /* Einsatz von Taste m bei Anschlag o im kurzen Fenster (43 ms, Teiltöne ab 900 Hz – dort liegen Nachbartasten weit genug auseinander):
     Die meisten deutlichen Teiltöne (echte Spitzen, nicht bloß die Flanke eines Nachbartons) steigen kurz nach dem Anschlag stark an,
     auch ungerade (sonst wäre es die Oktave darüber), und stärker als die Stellen zwischen den Teiltönen
     (Hammergeräusch – oder die Oktave darunter, deren ungerade Teiltöne genau dort liegen). Klappt auch, wenn die Taste noch klang. */
  attack(m, o, S = [m], k = 2.5, skip = null) {
    const ps = this.partsS[m - LO]; if (!ps.length) return false;
    const pre = this.hist.filter(h => h.t >= o.t - 80 && h.t <= o.t), post = this.hist.filter(h => h.t >= o.t + 10 && h.t <= o.t + 170);
    if (!pre.length || !post.length) return false;
    const bs = this.sr / NS;
    const shared = f => S.some(s => s !== m && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].some(k => Math.abs(1200 * Math.log2(f / (k * freqOf(s)))) < 70));
    const win = (h, b) => Math.max(h.ps[b - 1] || 0, h.ps[b], h.ps[b + 1] || 0);
    // Spitze im Fenster b ± 1, die auch wirklich eine Spitze ist (nicht die Flanke eines Tons daneben)
    const peakAt = (h, b) => { let j = b - 1; for (const k of [b, b + 1]) if ((h.ps[k] || 0) > (h.ps[j] || 0)) j = k; const v = h.ps[j] || 0; return v >= (h.ps[j - 1] || 0) && v >= (h.ps[j + 1] || 0) ? v : 0; };
    let up = 0, valid = 0, oddUp = 0, oddValid = 0, tonal = 0, noise = 0;
    const skipF = f => skip && skip.some(s => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].some(k2 => Math.abs(1200 * Math.log2(f / (k2 * freqOf(s)))) < 70));
    for (const [b, odd, bm] of ps) {
      if (skipF(b * bs)) continue;                                // (Teiltöne, die auch zu einer anderen Taste gehören, zählen nicht)
      const a = Math.max(...post.map(h => peakAt(h, b))), z = Math.min(...pre.map(h => win(h, b)));
      const na = Math.max(...post.map(h => h.ps[bm] || 0)), nz = Math.min(...pre.map(h => h.ps[bm] || 0));
      if (a < 4 * na && !shared(bm * bs)) continue;              // kein deutlicher Teilton
      if (!a) continue;
      valid++; if (odd) oddValid++;
      tonal += Math.max(0, a - z); if (!shared(bm * bs)) noise += Math.max(0, na - nz);
      if (a >= k * z) { up++; if (odd) oddUp++; }
    }
    return valid >= 2 && up >= Math.max(2, .5 * valid) && oddUp >= 1 && tonal > (k < 2 ? 2 : 3) * noise;
  }

  /* Prüfen: welche der Tasten S wurden nach Zeitpunkt from (ms) neu angeschlagen?
     used[m] = Nummer des Anschlags, der für Taste m schon verbraucht ist. only = nur diese Tasten prüfen (Akkord: Rest). Ergebnis: { m: Anschlag } */
  match(S, { from = -1e9, to = 1e12, used = {}, only = S } = {}) {
    const out = {};
    // Gerade erst ein Anschlag (< 60 ms)? Dann noch nichts entscheiden – sonst würde ein Ton, dessen eigener Anschlag noch zu frisch
    // ist, womöglich einem älteren Anschlag zugeschrieben.
    if (this.onsets.some(o => this.t - o.t < 60 && o.t <= to)) return out;
    for (const m of only) {
      for (let j = this.onsets.length - 1; j >= 0; j--) {           // neuester Anschlag zuerst
        const o = this.onsets[j];
        if (o.t < from || o.t > to || o.id <= (used[m] || 0) || this.t - o.t > 450) continue;
        if (this.heard(m, o, S)) { out[m] = o; break; }
      }
    }
    return out;
  }
  take(m, o, used) {
    used[m] = Math.max(used[m] || 0, o.id); o.used = true; this.mFlux[m] = o.flux || 0;
    this.taken.push({ m, t: o.t }); if (this.taken.length > 20) this.taken.shift();
  }

  /* Welche Taste wurde bei Anschlag o gespielt? Erst YIN, sonst stärkste Zunahme */
  guess(o) {
    if (this.lastBuf) {
      const y = yin(this.lastBuf.subarray(this.lastBuf.length - 2048), this.sr);
      if (y && y.conf > .8) { const m = Math.round(midiOf(y.f)); if (m >= LO && m <= HI) return m; }
    }
    return 0;
  }
}

/* YIN (de Cheveigné & Kawahara 2002): Grundfrequenz eines Einzeltons aus dem Zeitsignal */
function yin(x, sr, fMin = 50, fMax = 2100) {
  const W = Math.floor(x.length / 2), tMax = Math.min(W, Math.floor(sr / fMin)), tMin = Math.max(2, Math.floor(sr / fMax));
  const d = new Float64Array(tMax + 1);
  let e = 0; for (let j = 0; j < W; j++) e += x[j] * x[j];
  if (e / W < 1e-8) return null;
  for (let tau = 1; tau <= tMax; tau++) { let s = 0; for (let j = 0; j < W; j++) { const v = x[j] - x[j + tau]; s += v * v; } d[tau] = s; }
  const c = new Float64Array(tMax + 1); c[0] = 1; let run = 0;
  for (let tau = 1; tau <= tMax; tau++) { run += d[tau]; c[tau] = run ? d[tau] * tau / run : 1; }
  let best = -1;
  for (let tau = tMin; tau < tMax; tau++) if (c[tau] < .15) { while (tau + 1 < tMax && c[tau + 1] < c[tau]) tau++; best = tau; break; }
  if (best < 0) { let mv = 1; for (let tau = tMin; tau < tMax; tau++) if (c[tau] < mv) { mv = c[tau]; best = tau; } if (best < 0) return null; }
  const a = c[best - 1], b = c[best], cc = c[best + 1] ?? b, den = a - 2 * b + cc;
  const tau = den ? best + .5 * (a - cc) / den : best;
  return { f: sr / tau, conf: 1 - b };
}

/* ---------- Test-Klavier: erzeugt Klaviertöne (Teiltöne mit Streckung, Abklingen, Hammergeräusch, Raumrauschen) ---------- */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
class TestMic {
  constructor(sr = 48000, opt = {}) {
    this.sr = sr; this.voices = []; this.pos = 0; this.size = 1 << 15;
    this.ring = new Float32Array(this.size); this.out = new Float32Array(N);
    this.rand = rng(opt.seed || 7);
    this.noise = opt.noise ?? .002; this.hum = opt.hum ?? .002; this.gain = opt.gain ?? .25;
    this.lowCut = opt.lowCut ?? 140;               // Lautsprecher des Digitalpianos: tiefe Grundtöne schwach
    this.t0 = null;
  }
  // Taste m anschlagen bei t (ms), loslassen bei t + dur (ms); vel 0 … 1
  play(m, t, dur = 400, vel = .8) {
    for (const v of this.voices) if (v.m === m && v.off > t) v.off = t;   // gleiche Taste: alte Stimme wird gedämpft
    const f0 = freqOf(m) * Math.pow(2, (this.rand() - .5) * 8 / 1200), parts = [];
    for (let k = 1; k <= 14; k++) {
      const f = k * f0 * Math.sqrt(1 + .0004 * k * k); if (f > this.sr * .45) break;
      const hp = 1 / Math.sqrt(1 + Math.pow(this.lowCut / f, 4));
      parts.push({ w: 2 * Math.PI * f / this.sr, a: vel * hp / Math.pow(k, 1.1), ph: this.rand() * 6.283, tau: 1.6 * Math.pow(2, -(m - 60) / 24) / (1 + .35 * (k - 1)) });
    }
    this.voices.push({ m, on: t, off: t + dur, vel, parts });
  }
  sampleAt(n) {
    const t = n / this.sr * 1000;
    let s = (this.rand() * 2 - 1) * this.noise + Math.sin(2 * Math.PI * 50 * n / this.sr) * this.hum;
    for (const v of this.voices) {
      if (t < v.on) continue;
      const ta = (t - v.on) / 1000, rel = t > v.off ? Math.exp(-(t - v.off) / 60) : 1;
      if (rel < 1e-3) continue;
      const att = Math.min(1, ta / .004);
      let x = 0;
      for (const p of v.parts) x += p.a * Math.exp(-ta / p.tau) * Math.sin(p.w * (n - v.on * this.sr / 1000) + p.ph);
      if (ta < .025) x += (this.rand() * 2 - 1) * .25 * v.vel * Math.exp(-ta / .006);   // Hammer
      s += x * att * rel * this.gain;
    }
    return s;
  }
  // Puffer der letzten 8192 Abtastwerte bis Zeitpunkt t (ms)
  read(t) {
    const end = Math.floor(t * this.sr / 1000);
    if (end - this.pos > this.size) this.pos = end - this.size;
    for (; this.pos < end; this.pos++) this.ring[this.pos & (this.size - 1)] = this.sampleAt(this.pos);
    for (let i = 0; i < N; i++) this.out[i] = this.ring[(end - N + i) & (this.size - 1)];
    this.voices = this.voices.filter(v => t < v.off + 600);
    return this.out;
  }
}

/* ---------- Mikrofon ---------- */
class Mic {
  constructor() { this.ctx = null; this.an = null; this.buf = new Float32Array(N); this.stream = null; }
  async open() {
    const AC = root.AudioContext || root.webkitAudioContext;
    this.ctx ??= new AC();
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    if (this.stream && this.stream.active) return this;
    // Wichtig: ohne Echo-Unterdrückung, Rauschfilter und automatische Lautstärke – die filtern sonst Klaviertöne weg
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.an = this.ctx.createAnalyser(); this.an.fftSize = N; this.an.smoothingTimeConstant = 0;
    const mute = this.ctx.createGain(); mute.gain.value = 0;             // Safari verarbeitet nur, was am Ausgang hängt (stumm)
    src.connect(this.an); this.an.connect(mute); mute.connect(this.ctx.destination);
    return this;
  }
  get sr() { return this.ctx?.sampleRate || 48000; }
  read() { this.an.getFloatTimeDomainData(this.buf); return this.buf; }
  get on() { return !!(this.stream && this.stream.active); }
  close() { this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; }
}

const api = { Ear, TestMic, Mic, yin, freqOf, midiOf, N, LO, HI };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PR_EAR = api;
})(typeof self !== 'undefined' ? self : globalThis);
