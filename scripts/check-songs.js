#!/usr/bin/env node
/* Prüft das Liederbuch (js/songs.js): Takte voll, beide Hände gleich lang, Tonumfang, eindeutige ids.
 *   node scripts/check-songs.js      (-v: Übersicht je Lied) */
const { SONGS, parseSong, parseVoice } = require('../js/songs.js');
const v = process.argv.includes('-v');
let bad = 0;
const err = (s, msg) => { bad++; console.log(`✗ ${s.id}: ${msg}`); };
const ids = new Set();
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], nm = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
for (const s of SONGS) {
  if (ids.has(s.id)) err(s, 'id doppelt'); ids.add(s.id);
  if (!s.title?.de) err(s, 'Titel fehlt');
  let p;
  try { p = parseSong(s); } catch (e) { err(s, e.message); continue; }
  for (const [hand, src] of [['rechts', s.rh], ['links', s.lh]]) {
    if (!src) continue;
    const { bars, beats } = parseVoice(src, 'r'), ends = [...bars.slice(1), beats];
    bars.forEach((b0, i) => {
      const len = ends[i] - b0, want = i === 0 && s.up ? s.up : s.bar, last = i === bars.length - 1;
      const ok = last ? (s.up ? Math.abs(len + s.up - s.bar) < 1e-9 || Math.abs(len - s.bar) < 1e-9 : Math.abs(len - s.bar) < 1e-9) : Math.abs(len - want) < 1e-9;
      if (!ok) err(s, `${hand}, Takt ${i + (s.up ? 0 : 1)}: ${len} statt ${want} Viertel`);
    });
  }
  if (s.lh && Math.abs(p.rhBeats - p.lhBeats) > 1e-9) err(s, `rechts ${p.rhBeats}, links ${p.lhBeats} Viertel`);
  const ms = p.notes.map(n => n.m), lo = Math.min(...ms), hi = Math.max(...ms);
  if (lo < 40 || hi > 88) err(s, `Tonumfang ${nm(lo)}–${nm(hi)} (erlaubt E2–E6)`);
  if (v) console.log(`✓ ${s.id.padEnd(11)} Stufe ${s.lvl}  ${String(p.notes.length).padStart(3)} Töne  ${nm(lo)}–${nm(hi)}  ${(p.beats / s.bpm * 60).toFixed(0)} s  ${s.title.de}`);
}
console.log(bad ? `\n${bad} Fehler.` : `\nAlle ${SONGS.length} Lieder in Ordnung.`);
process.exit(bad ? 1 : 0);
