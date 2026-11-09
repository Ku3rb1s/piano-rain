#!/usr/bin/env node
/* Spielt jedes Lied aus dem Liederbuch mit erzeugten Klaviertönen durch die echte Erkennung (js/ear.js):
 *   Warte-Modus (rechte Hand, linke Hand, beide): jeder Schritt muss erkannt werden, ohne „falscher Ton“-Meldung.
 *   Im Takt (100 %, beide Hände): mindestens 95 % Treffer.
 *   node scripts/test-songs.js [id …]     (-v: Details) */
const { Ear, TestMic } = require(process.env.EAR || '../js/ear.js');
const { SONGS, parseSong } = require('../js/songs.js');
const args = process.argv.slice(2), v = args.includes('-v'), only = args.filter(a => !a.startsWith('-'));
const SR = 48000, F = 1000 / 60;
let seedR = 1; const rnd = () => { seedR = (seedR * 16807) % 2147483647; return seedR / 2147483647; };   // gleiche Zufallszahlen bei jedem Lauf
const dbg = process.env.DEBUG;

function steps(song, hands) {
  const out = [];
  for (const n of parseSong(song).notes) {
    if (!(hands === 'b' || n.h === hands)) continue;
    let s = out[out.length - 1];
    if (!s || Math.abs(s.t - n.t) > 1e-6) { s = { t: n.t, notes: [], d: n.d }; out.push(s); }
    if (!s.notes.includes(n.m)) s.notes.push(n.m);
  }
  return out;
}
// Warte-Modus: jeder Schritt wird 150–350 ms nach dem vorigen gespielt (wie ein Mensch, der auf die Note wartet)
function waitRun(song, hands, seed) {
  seedR = seed * 7919;
  const st = steps(song, hands); if (!st.length) return null;
  const mic = new TestMic(SR, { seed }), ear = new Ear(SR), used = {};
  let idx = 0, arm = 0, hit = {}, next = 900, wrong = 0, t = F * 30, stuck = 0, early = 0;
  ear.startNoise();
  for (; idx < st.length && t < 600000; t += F) {
    ear.push(mic.read(t), t);
    if (t >= 600 && ear.collect) ear.stopNoise();
    if (ear.collect) continue;
    const s = st[idx];
    if (next && t >= next) { for (const m of s.notes) mic.play(m, t + rnd() * 20, 260, .6 + rnd() * .3); next = 0; stuck = t; }
    const res = ear.match(s.notes, { from: arm - 250, used, only: s.notes.filter(m => !hit[m]) });
    for (const [m, o] of Object.entries(res)) { ear.take(+m, o, used); hit[m] = 1; if (!next && o.t < stuck - 30 && dbg) { const ps = ear.partsS[+m - 21], bs = 48000 / 2048; console.log('   ALT: Taste', m, 'Anschlag', Math.round(o.t), 'gespielt', Math.round(stuck), 'att', ear.attack(+m, o, s.notes), 'Teiltöne', ps.map(([b, odd]) => Math.round(b * bs) + (odd ? 'u' : 'g')).join(' ')); }
      if (next) { early++; if (dbg) { const now = ear.hist[ear.hist.length - 1], bf = ear.frameAt(o.t - 15), i = +m - 21; console.log('   früh: Taste', m, 'Schritt davor', JSON.stringify(st[idx - 1]?.notes), 'att', ear.attack(+m, o, s.notes), 'eB', bf.E[i].toExponential(1), 'eN', now.E[i].toExponential(1), 'thr', ear.thr(+m).toExponential(1), 'alter', Math.round(t - o.t), 'why', ear.why); } } if (dbg) console.log('  Schritt', idx, 'Taste', m, 'Anschlag', o.id, Math.round(o.t), 'jetzt', Math.round(t), 'gespielt', Math.round(stuck), next ? '(noch nicht gespielt!)' : ''); }
    wrong += ear.wrong.filter(w => !s.notes.includes(w.m)).length; ear.wrong = [];
    if (s.notes.every(m => hit[m])) { idx++; arm = t; hit = {}; next = t + 150 + rnd() * 200; }
    else if (!next && t - stuck > 2500) {
      if (dbg) for (const o of ear.onsets.slice(-3)) { ear.t = o.t + 150; const keep = ear.hist; ear.hist = keep.filter(h => h.t <= o.t + 150); for (const m of s.notes) { ear.heard(m, o, s.notes); console.log('   Anschlag', o.id, Math.round(o.t), 'flux', o.flux?.toFixed(0), 'Taste', m, 'why', ear.why, 'mFlux', ear.mFlux[m]?.toFixed(0)); } ear.hist = keep; }
      if (dbg) console.log('  gespielt bei', Math.round(stuck), 'Anschläge:', ear.onsets.map(o => Math.round(o.t) + (o.used ? '*' : '')).join(' '), 'verbraucht:', JSON.stringify(used), 'Treffer:', JSON.stringify(hit));
      return { ok: false, idx, of: st.length, at: s, wrong };
    }
  }
  return { ok: idx === st.length && !early, idx, of: st.length, wrong, early };
}
// Im Takt: Töne genau nach Noten (±40 ms), Prüfung im Zeitfenster ±300 ms
function tempoRun(song, hands, seed) {
  seedR = seed * 7919;
  const st = steps(song, hands); if (!st.length) return null;
  const mic = new TestMic(SR, { seed }), ear = new Ear(SR), used = {}, ms = 60000 / song.bpm, t0 = 1500;
  for (const s of st) for (const m of s.notes) mic.play(m, t0 + s.t * ms + (rnd() - .5) * 80, Math.max(150, s.d * ms - 40), .6 + rnd() * .3);
  const done = new Array(st.length).fill(false), hits = st.map(() => ({}));
  ear.startNoise();
  const end = t0 + (st[st.length - 1].t + 4) * ms;
  for (let t = F * 30; t < end; t += F) {
    ear.push(mic.read(t), t);
    if (t >= 600 && ear.collect) ear.stopNoise();
    if (ear.collect) continue;
    st.forEach((s, j) => {
      const tr = t0 + s.t * ms; if (done[j] || tr - 300 > t || t > tr + 750) return;
      const res = ear.match(s.notes, { from: tr - 300, to: tr + 300, used, only: s.notes.filter(m => !hits[j][m]) });
      for (const [m, o] of Object.entries(res)) { ear.take(+m, o, used); hits[j][m] = 1; }
      if (s.notes.every(m => hits[j][m])) done[j] = true;
    });
  }
  const n = done.filter(Boolean).length;
  return { ok: n / st.length >= .95, idx: n, of: st.length, missed: st.filter((s, j) => !done[j]).slice(0, 4).map(s => s.t + ':' + s.notes.join('+')) };
}

let bad = 0, total = 0;
for (const song of SONGS) {
  if (only.length && !only.includes(song.id)) continue;
  const runs = [['rechts, warten', waitRun(song, 'r', 11)], ['links, warten', song.lh && waitRun(song, 'l', 12)], ['beide, warten', song.lh && waitRun(song, 'b', 13)],
    ['beide, im Takt', tempoRun(song, song.lh ? 'b' : 'r', 14)]];
  for (const [name, r] of runs) {
    if (!r) continue;
    total++;
    const ok = r.ok && !r.wrong;
    if (!ok) bad++;
    if (!ok || v) console.log(`${ok ? '✓' : '✗'} ${song.id.padEnd(11)} ${name.padEnd(15)} ${r.idx}/${r.of}${r.wrong ? `, ${r.wrong} × „falsch“` : ''}${r.early ? `, ${r.early} × zu früh erkannt` : ''}${r.at ? `  hängt bei Viertel ${r.at.t}: ${r.at.notes.join('+')}` : ''}${r.missed?.length ? '  verpasst: ' + r.missed.join(' ') : ''}`);
  }
}
console.log(bad ? `\n${bad} von ${total} Durchläufen fehlgeschlagen.` : `\nAlle ${total} Durchläufe bestanden.`);
process.exit(bad ? 1 : 0);
