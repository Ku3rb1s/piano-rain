#!/usr/bin/env node
/* Prüft das Gehör (js/ear.js) ohne Klavier: erzeugte Klaviertöne (Ear.TestMic) → Ear → Erwartung.
 *   node scripts/test-ear.js        alle Fälle
 *   node scripts/test-ear.js -v     mit Details
 * Jeder Fall: 0,6 s Ruhe einmessen, dann wird „gespielt“ und wie im Warte-Modus Schritt für Schritt geprüft. */
const { Ear, TestMic } = require('../js/ear.js');
const verbose = process.argv.includes('-v');
const SR = 48000, FRAME = 1000 / 60;

/* Spielt die Töne `play` ([Taste(n), Start ms, Dauer ms, Stärke]) und folgt den erwarteten Schritten `steps` (je Schritt eine Liste
   von Tasten) wie der Warte-Modus. Ergebnis: Zeitpunkte, zu denen jeder Schritt erkannt wurde, und die gemeldeten falschen Töne. */
function sim({ play, steps, end, mic: micOpt = {}, ref = true }) {
  const mic = new TestMic(SR, micOpt), ear = new Ear(SR);
  for (const [ms, t, dur = 400, vel = .8] of play) for (const m of [].concat(ms)) mic.play(m, t, dur, vel);
  const done = [], used = {};
  let idx = 0, arm = -1e9, hit = {};
  ear.startNoise();
  for (let t = FRAME * 30; t < end; t += FRAME) {
    ear.push(mic.read(t), t);
    if (t >= 500 && ear.collect) { ear.stopNoise(); if (ref) ear.ref = 1e-3; }
    if (ear.collect || idx >= steps.length) continue;
    const S = steps[idx], only = S.filter(m => !hit[m]);
    const res = ear.match(S, { from: arm - 250, used, only });
    for (const [m, o] of Object.entries(res)) { ear.take(+m, o, used); hit[m] = o.t; }
    if (S.every(m => hit[m])) { done.push(Math.round(Math.max(...S.map(m => hit[m])))); idx++; arm = t; hit = {}; }
  }
  return { done, wrong: ear.wrong.map(w => w.m), onsets: ear.onsetId };
}

let fails = 0, n = 0;
function check(name, ok, info) {
  n++; if (!ok) fails++;
  if (!ok || verbose) console.log(`${ok ? '✓' : '✗'} ${name}${info ? '  – ' + info : ''}`);
}
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], nm = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);

// 1. Einzeltöne von C2 bis C7: richtig erkannt, Nachbartasten und Oktaven NICHT
for (const m of [36, 41, 43, 48, 50, 52, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 79, 81, 84, 88, 91, 96]) {
  const r = sim({ play: [[m, 800, 500]], steps: [[m]], end: 1700 });
  check(`${nm(m)} erkannt`, r.done.length === 1 && r.done[0] - 800 < 150, `nach ${r.done[0] - 800} ms`);
  for (const d of [-12, -1, 1, 12]) {
    const x = sim({ play: [[m, 800, 500]], steps: [[m + d]], end: 1700 });
    check(`${nm(m)} gespielt, ${nm(m + d)} erwartet → nicht erkannt`, x.done.length === 0);
  }
}
// 2. Leise Töne
for (const m of [48, 60, 72, 84]) {
  const r = sim({ play: [[m, 800, 500, .15]], steps: [[m]], end: 1700 });
  check(`${nm(m)} leise erkannt`, r.done.length === 1);
}
// 3. Gleiche Taste mehrmals hintereinander (Alle meine Entchen: G G), auch schnell
for (const gap of [500, 300, 220]) {
  const play = [0, 1, 2, 3].map(i => [67, 800 + i * gap, gap - 30]);
  const r = sim({ play, steps: [[67], [67], [67], [67]], end: 800 + 4 * gap + 600 });
  check(`G4 viermal im Abstand ${gap} ms → 4 Treffer`, r.done.length === 4, r.done.map(t => t - 800).join(', '));
}
// 4. Ein gehaltener Ton zählt nicht noch einmal
{
  const r = sim({ play: [[64, 800, 2500]], steps: [[64], [64]], end: 3500 });
  check('E4 gehalten → nur 1 Treffer', r.done.length === 1);
  const r2 = sim({ play: [[64, 800, 2500], [65, 1600, 500]], steps: [[64], [64]], end: 3500 });
  check('E4 gehalten, dann F4 gespielt, E4 erwartet → kein zweiter Treffer', r2.done.length === 1);
  check('… und F4 wird als falscher Ton gemeldet', r2.wrong.includes(65), 'gemeldet: ' + r2.wrong.map(nm).join(' '));
}
for (const [o, name] of [[67, 'G4'], [76, 'E5'], [52, 'E3'], [63, 'D#4']]) {
  const r = sim({ play: [[64, 800, 2500], [o, 1600, 500]], steps: [[64], [64]], end: 3500 });
  check(`E4 gehalten, dann ${name} gespielt, E4 erwartet → kein zweiter Treffer`, r.done.length === 1);
}
// Gleiche Taste nochmal, leiser als vorher (schnell hintereinander)
for (const [v1, v2, gap] of [[.9, .6, 250], [.9, .5, 300], [.8, .4, 400], [.9, .6, 200]]) for (const m of [48, 60, 67, 76]) {
  const r = sim({ play: [[m, 800, gap - 20, v1], [m, 800 + gap, 300, v2]], steps: [[m], [m]], end: 2000 });
  check(`${nm(m)} zweimal (${v1} → ${v2}, ${gap} ms) → 2 Treffer`, r.done.length === 2);
}
// 5. Melodie gebunden (Töne überlappen): Hänschen klein-Anfang G E E F D D C D E F G G G
{
  const mel = [67, 64, 64, 65, 62, 62, 60, 62, 64, 65, 67, 67, 67];
  const play = mel.map((m, i) => [m, 800 + i * 350, 420]);
  const r = sim({ play, steps: mel.map(m => [m]), end: 800 + mel.length * 350 + 600 });
  check('Hänschen klein gebunden: alle 13 Töne', r.done.length === mel.length, `${r.done.length}/${mel.length}`);
  check('… ohne falsche Meldungen', r.wrong.length === 0, r.wrong.map(nm).join(' '));
}
// 6. Akkorde
const chords = [[[60, 64, 67], 'C-Dur'], [[48, 55], 'Quinte C3+G3'], [[43, 50, 55], 'G-Dur tief'], [[57, 60, 64], 'a-Moll'], [[53, 57, 60], 'F-Dur'], [[60, 72], 'Oktave C4+C5'], [[48, 64], 'C3 + E4 (Bass + Melodie)']];
for (const [S, name] of chords) {
  const r = sim({ play: [[S, 800, 600]], steps: [S], end: 1800 });
  check(`Akkord ${name} erkannt`, r.done.length === 1);
  const r2 = sim({ play: [[S, 800, 600]].concat(S.map((m, i) => [m, 820 + i * 25, 600])).slice(1), steps: [S], end: 1800 });
  check(`Akkord ${name} leicht gebrochen erkannt`, r2.done.length === 1);
}
{
  const r = sim({ play: [[[60, 64, 69], 800, 600]], steps: [[60, 64, 67]], end: 1800 });
  check('C-E-A gespielt, C-E-G erwartet → nicht erkannt', r.done.length === 0);
  const r2 = sim({ play: [[[60, 64], 800, 600]], steps: [[60, 64, 67]], end: 1800 });
  check('nur C-E gespielt, C-E-G erwartet → nicht erkannt', r2.done.length === 0);
  const r3 = sim({ play: [[60, 800, 600]], steps: [[48, 60]], end: 1800 });
  check('nur C4 gespielt, C3+C4 erwartet → nicht erkannt', r3.done.length === 0);
}
// 7. Melodie + Bass gleichzeitig (beide Hände)
{
  const steps = [[48, 64], [64], [55, 67], [67], [53, 65], [65], [48, 64]];
  const play = []; steps.forEach((S, i) => play.push([S, 800 + i * 400, 450]));
  const r = sim({ play, steps, end: 800 + steps.length * 400 + 600 });
  check('Beide Hände: 7 Schritte', r.done.length === steps.length, `${r.done.length}/${steps.length}`);
}
// 8. Nur Rauschen / Sprechen-ähnliches Rauschen: keine Treffer
{
  const r = sim({ play: [], steps: [[60], [64], [67]], end: 4000, mic: { noise: .01 } });
  check('Lautes Rauschen → kein Treffer', r.done.length === 0, 'Anschläge: ' + r.onsets);
}
// 9. Falscher Ton wird benannt
for (const [want, got] of [[60, 62], [64, 65], [67, 69], [72, 71]]) {
  const r = sim({ play: [[got, 800, 500]], steps: [[want]], end: 1700 });
  check(`${nm(got)} statt ${nm(want)} → als ${nm(got)} gemeldet`, r.done.length === 0 && r.wrong[0] === got, 'gemeldet: ' + r.wrong.map(nm).join(' '));
}
// 10. Ohne Einrichtung (keine Referenz-Lautstärke)
{
  const r = sim({ play: [[60, 800, 500]], steps: [[60]], end: 1700, ref: false });
  check('Ohne Einrichtung: C4 erkannt', r.done.length === 1);
}
// 11. Andere Räume/Geräte: leises Mikrofon, mehr Rauschen, kleine Lautsprecher (tiefe Töne schwach), andere Abtastrate
for (const [name, mic] of [['leises Mikrofon', { gain: .04 }], ['mehr Rauschen', { noise: .006, hum: .006 }], ['kleine Lautsprecher', { lowCut: 300 }], ['anderer Zufall', { seed: 99 }]]) {
  const mel = [60, 62, 64, 65, 67, 67, 69, 69, 69, 69, 67];
  const r = sim({ play: mel.map((m, i) => [m, 800 + i * 330, 380]), steps: mel.map(m => [m]), end: 800 + mel.length * 330 + 600, mic });
  check(`${name}: Alle meine Entchen`, r.done.length === mel.length && r.wrong.length === 0, `${r.done.length}/${mel.length}, falsch: ${r.wrong.map(nm).join(' ')}`);
  const c = sim({ play: [[[48, 52, 55], 800, 600]], steps: [[48, 52, 55]], end: 1800, mic });
  check(`${name}: C-Dur tief`, c.done.length === 1);
  for (const [p, w] of [[60, 72], [72, 60], [64, 65], [65, 64]]) {
    const x = sim({ play: [[p, 800, 500]], steps: [[w]], end: 1700, mic });
    check(`${name}: ${nm(p)} gespielt, ${nm(w)} erwartet → nicht erkannt`, x.done.length === 0);
  }
}
console.log(fails ? `\n${fails} von ${n} Prüfungen fehlgeschlagen.` : `\nAlle ${n} Prüfungen bestanden.`);
process.exit(fails ? 1 : 0);
