/* Piano Rain – Liederbuch
 * Alle Melodien sind gemeinfrei (Volkslieder, Weihnachtslieder, Klassik vor 1900). Gesetzt und vereinfacht für Piano Rain
 * (eigene Fassungen, die linke Hand als einfache Begleitung). Keine urheberrechtlich geschützten Songs hier eintragen!
 *
 * Schreibweise: Töne mit Leerzeichen getrennt, „|“ = Taktstrich (wird mit scripts/check-songs.js geprüft).
 *   C4 = eingestrichenes c (Mitte), F#4 / Bb3 = mit Vorzeichen, r = Pause, C3+E3+G3 = Akkord
 *   Dauer hinter „/“: 1 ganze, 2 halbe, 4 Viertel, 8 Achtel, 16 Sechzehntel, Punkt = punktiert (C4/4.)
 *   Die Dauer gilt weiter, bis eine neue kommt. bar = Viertel je Takt (6/8 = 3), up = Auftakt in Vierteln.
 *   lvl: 1 = erste Töne (rechte Hand), 2 = mit Begleitung, 3 = Klassik. id nie ändern (daran hängen die Sterne). */
const SONGS = [
  // ---------- Stufe 1: erste Töne ----------
  { id: 'twinkle', lvl: 1, xmas: true, bpm: 100, bar: 4, by: 'Volkslied',
    title: { de: 'Morgen kommt der Weihnachtsmann', en: 'Twinkle, Twinkle, Little Star', fr: 'Ah ! vous dirai-je, maman', es: 'Estrellita, ¿dónde estás?', nb: 'Blinke, blinke, lille stjerne' },
    rh: 'C4/4 C4 G4 G4 | A4 A4 G4/2 | F4/4 F4 E4 E4 | D4 D4 C4/2 | G4/4 G4 F4 F4 | E4 E4 D4/2 | G4/4 G4 F4 F4 | E4 E4 D4/2 | C4/4 C4 G4 G4 | A4 A4 G4/2 | F4/4 F4 E4 E4 | D4 D4 C4/2' },
  { id: 'jingle', lvl: 1, xmas: true, bpm: 112, bar: 4, by: 'James Lord Pierpont',
    title: { de: 'Jingle Bells', nb: 'Bjelleklang' },
    rh: 'E4/4 E4 E4/2 | E4/4 E4 E4/2 | E4/4 G4 C4/4. D4/8 | E4/1 | F4/4 F4 F4/4. F4/8 | F4/4 E4 E4 E4/8 E4 | E4/4 D4 D4 E4 | D4/2 G4 | E4/4 E4 E4/2 | E4/4 E4 E4/2 | E4/4 G4 C4/4. D4/8 | E4/1 | F4/4 F4 F4 F4 | F4 E4 E4 E4/8 E4 | G4/4 G4 F4 D4 | C4/1' },
  { id: 'entchen', lvl: 1, bpm: 96, bar: 4, by: 'Volkslied',
    title: { de: 'Alle meine Entchen', en: 'All My Little Ducklings', fr: 'Tous mes petits canards', es: 'Todos mis patitos', nb: 'Alle mine andunger' },
    rh: 'C4/4 D4 E4 F4 | G4/2 G4 | A4/4 A4 A4 A4 | G4/1 | A4/4 A4 A4 A4 | G4/1 | F4/4 F4 F4 F4 | E4/2 E4 | D4/4 D4 D4 D4 | C4/1' },
  { id: 'haenschen', lvl: 1, bpm: 100, bar: 4, by: 'Volkslied',
    title: { de: 'Hänschen klein', en: 'Lightly Row', fr: 'Petit Jean', es: 'Juanito', nb: 'Lille Hans' },
    rh: 'G4/4 E4 E4/2 | F4/4 D4 D4/2 | C4/4 D4 E4 F4 | G4 G4 G4/2 | G4/4 E4 E4/2 | F4/4 D4 D4/2 | C4/4 E4 G4 G4 | C4/1 | D4/4 D4 D4 D4 | D4 E4 F4/2 | E4/4 E4 E4 E4 | E4 F4 G4/2 | G4/4 E4 E4/2 | F4/4 D4 D4/2 | C4/4 E4 G4 G4 | C4/1' },
  { id: 'mary', lvl: 1, bpm: 100, bar: 4, by: 'Volkslied',
    title: { de: 'Mary hat ein kleines Lamm', en: 'Mary Had a Little Lamb', fr: 'Marie avait un petit agneau', es: 'María tenía un corderito', nb: 'Mary hadde et lite lam' },
    rh: 'E4/4 D4 C4 D4 | E4 E4 E4/2 | D4/4 D4 D4/2 | E4/4 G4 G4/2 | E4/4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4/1' },
  { id: 'jakob', lvl: 1, bpm: 100, bar: 4, by: 'Volkslied',
    title: { de: 'Bruder Jakob', en: 'Are You Sleeping (Frère Jacques)', fr: 'Frère Jacques', es: 'Martinillo', nb: 'Fader Jakob' },
    rh: 'C4/4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4/2 | E4/4 F4 G4/2 | G4/8 A4 G4 F4 E4/4 C4 | G4/8 A4 G4 F4 E4/4 C4 | C4 G3 C4/2 | C4/4 G3 C4/2' },
  { id: 'ode', lvl: 1, bpm: 100, bar: 4, by: 'Ludwig van Beethoven',
    title: { de: 'Ode an die Freude', en: 'Ode to Joy', fr: 'Ode à la joie', es: 'Himno de la alegría', nb: 'Ode til gleden' },
    rh: 'E4/4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/4. D4/8 D4/2 | E4/4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/4. C4/8 C4/2 | D4/4 D4 E4 C4 | D4 E4/8 F4 E4/4 C4 | D4 E4/8 F4 E4/4 D4 | C4 D4 G3/2 | E4/4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/4. C4/8 C4/2' },

  // ---------- Stufe 2: mit Begleitung ----------
  { id: 'stille', lvl: 2, xmas: true, bpm: 80, bar: 3, by: 'Franz Xaver Gruber',
    title: { de: 'Stille Nacht', en: 'Silent Night', fr: 'Douce nuit', es: 'Noche de paz', nb: 'Glade jul' },
    rh: 'G4/8. A4/16 G4/8 E4/4. | G4/8. A4/16 G4/8 E4/4. | D5/4 D5/8 B4/4. | C5/4 C5/8 G4/4. | A4/4 A4/8 C5/8. B4/16 A4/8 | G4/8. A4/16 G4/8 E4/4. | A4/4 A4/8 C5/8. B4/16 A4/8 | G4/8. A4/16 G4/8 E4/4. | D5/4 D5/8 F5/8. D5/16 B4/8 | C5/4. E5/4. | C5/8. G4/16 E4/8 G4/8. F4/16 D4/8 | C4/2.',
    lh: 'C3/2. | C3 | G2 | C3 | F3 | C3 | F3 | C3 | G2 | C3 | G2 | C3' },
  { id: 'wewish', lvl: 2, xmas: true, bpm: 120, bar: 3, up: 1, by: 'Volkslied',
    title: { de: 'We Wish You a Merry Christmas' },
    rh: 'G4/4 | C5/4 C5/8 D5 C5 B4 | A4/4 A4 A4 | D5/4 D5/8 E5 D5 C5 | B4/4 G4 G4 | E5/4 E5/8 F5 E5 D5 | C5/4 A4 G4/8 G4 | A4/4 D5 B4 | C5/2',
    lh: 'r/4 | C3/2. | F3 | D3 | G3 | E3 | F3 | G3 | C3/2' },
  { id: 'deck', lvl: 2, xmas: true, bpm: 108, bar: 4, by: 'Volkslied',
    title: { de: 'Deck the Halls' },
    rh: 'G4/4. F4/8 E4/4 D4 | C4 D4 E4 C4 | D4/8 E4 F4 D4 E4/4. D4/8 | C4/4 B3 C4/2 | G4/4. F4/8 E4/4 D4 | C4 D4 E4 C4 | D4/8 E4 F4 D4 E4/4. D4/8 | C4/4 B3 C4/2 | G4/4. F4/8 E4/4 D4 | C4 D4 E4 C4 | A4/8 A4 A4 A4 G4/4. F4/8 | E4/4 D4 C4/2',
    lh: 'C3/1 | F3/2 C3 | G3 C3 | G3 C3 | C3/1 | F3/2 C3 | G3 C3 | G3 C3 | C3/1 | F3/2 C3 | F3 C3 | G3 C3' },
  { id: 'joy', lvl: 2, xmas: true, bpm: 96, bar: 4, by: 'Georg Friedrich Händel',
    title: { de: 'Freue dich, Welt', en: 'Joy to the World', fr: 'Joie dans le monde', es: 'Al mundo paz', nb: 'Joy to the World' },
    rh: 'C5/2 B4/4. A4/8 | G4/2. F4/4 | E4/2 D4 | C4/2. G4/4 | A4/2. A4/4 | B4/2. B4/4 | C5/2. C5/4 | C5/4 B4 A4 G4 | G4/4. F4/8 E4/4 C5 | C5 B4 A4 G4 | G4/4. F4/8 E4/4 E4 | E4 E4 E4 E4/8 F4 | G4/2. F4/8 E4 | D4/4 D4 D4 D4/8 E4 | F4/2. E4/8 D4 | C4/4 C5/2 A4/4 | G4/4. F4/8 E4/4 F4 | E4/2 D4 | C4/1',
    lh: 'C3/1 | C3 | C3/2 G3 | C3/1 | F3 | G3 | C3 | C3 | C3 | C3 | C3 | C3 | C3 | G3 | G3 | C3/2 F3 | C3/1 | G3 | C3' },
  { id: 'london', lvl: 2, bpm: 108, bar: 4, by: 'Volkslied',
    title: { de: 'London Bridge', fr: 'Le pont de Londres', es: 'El puente de Londres' },
    rh: 'G4/4. A4/8 G4/4 F4 | E4 F4 G4/2 | D4/4 E4 F4/2 | E4/4 F4 G4/2 | G4/4. A4/8 G4/4 F4 | E4 F4 G4/2 | D4/2 G4 | E4/4 C4/2.',
    lh: 'C3/1 | C3 | G3 | C3 | C3 | C3 | G3 | C3' },

  // ---------- Stufe 3: Klassik ----------
  { id: 'ode2', lvl: 3, both: true, bpm: 100, bar: 4, by: 'Ludwig van Beethoven',
    title: { de: 'Ode an die Freude', en: 'Ode to Joy', fr: 'Ode à la joie', es: 'Himno de la alegría', nb: 'Ode til gleden' },
    rh: 'E4/4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/4. D4/8 D4/2 | E4/4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/4. C4/8 C4/2 | D4/4 D4 E4 C4 | D4 E4/8 F4 E4/4 C4 | D4 E4/8 F4 E4/4 D4 | C4 D4 G3/2 | E4/4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/4. C4/8 C4/2',
    lh: 'C3/1 | G2 | C3 | C3/2 G2 | C3/1 | G2 | C3 | G2/2 C3 | G2 C3 | G2 C3 | G2 C3 | C3 G2 | C3/1 | G2 | C3 | G2/2 C3' },
  { id: 'menuett', lvl: 3, bpm: 104, bar: 3, by: 'Christian Petzold',
    title: { de: 'Menuett G-Dur', en: 'Minuet in G', fr: 'Menuet en sol majeur', es: 'Minueto en sol mayor', nb: 'Menuett i G-dur' },
    rh: 'D5/4 G4/8 A4 B4 C5 | D5/4 G4 G4 | E5/4 C5/8 D5 E5 F#5 | G5/4 G4 G4 | C5/4 D5/8 C5 B4 A4 | B4/4 C5/8 B4 A4 G4 | F#4/4 G4/8 A4 B4 G4 | A4/2. | D5/4 G4/8 A4 B4 C5 | D5/4 G4 G4 | E5/4 C5/8 D5 E5 F#5 | G5/4 G4 G4 | C5/4 D5/8 C5 B4 A4 | B4/4 C5/8 B4 A4 G4 | A4/4 B4/8 A4 G4 F#4 | G4/2.',
    lh: 'G3/2. | B3 | C4 | B3 | A3 | G3 | D3 | D3 | G3 | B3 | C4 | B3 | A3 | G3 | D3 | G3' },
  { id: 'elise', lvl: 3, bpm: 72, bar: 1.5, up: .5, by: 'Ludwig van Beethoven',
    title: { de: 'Für Elise (Anfang)', en: 'Für Elise (opening)', fr: 'Lettre à Élise (début)', es: 'Para Elisa (inicio)', nb: 'Til Elise (begynnelsen)' },
    rh: 'E5/16 D#5 | E5 D#5 E5 B4 D5 C5 | A4/8 r/16 C4 E4 A4 | B4/8 r/16 E4 G#4 B4 | C5/8 r/16 E4 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4/8 r/16 C4 E4 A4 | B4/8 r/16 E4 C5 B4 | A4/4.',
    lh: 'r/8 | r/8. r/8. | A2/16 E3 A3 r/8. | E2/16 E3 G#3 r/8. | A2/16 E3 A3 r/8. | r/8. r/8. | A2/16 E3 A3 r/8. | E2/16 E3 G#3 r/8. | A2/16 E3 A3 r/8.' },
  { id: 'nachtmusik', lvl: 3, bpm: 112, bar: 4, by: 'Wolfgang Amadeus Mozart',
    title: { de: 'Eine kleine Nachtmusik (Anfang)', en: 'Eine kleine Nachtmusik (opening)', fr: 'Petite musique de nuit (début)', es: 'Pequeña serenata nocturna (inicio)', nb: 'Eine kleine Nachtmusik (begynnelsen)' },
    rh: 'G4/4 r/8 D4 G4/4 r/8 D4 | G4/8 D4 G4 B4 D5/4 r/4 | C5/4 r/8 A4 C5/4 r/8 A4 | C5/8 A4 F#4 A4 D4/4 r/4',
    lh: 'G2/1 | G2 | D3 | D3' },
  { id: 'morgen', lvl: 3, bpm: 84, bar: 3, by: 'Edvard Grieg',
    title: { de: 'Morgenstimmung', en: 'Morning Mood', fr: 'Au matin', es: 'La mañana', nb: 'Morgenstemning' },
    rh: 'G4/8 E4 D4 C4 D4 E4 | G4 E4 D4 C4 D4 E4 | D4 E4 G4 E4 G4 A4 | E4 A4 G4 E4 D4 C4 | G4 E4 D4 C4 D4 E4 | G4 E4 D4 C4 D4 E4 | D4 E4 G4 E4 G4 A4 | E4 A4 G4 E4 D4 C4 | C4/2.',
    lh: 'C3/2. | C3 | F3 | C3 | C3 | C3 | F3 | C3 | C3' },
];

const LEVELS = { 1: 'Erste Töne', 2: 'Mit Begleitung', 3: 'Klassik' };

/* Schreibweise lesen → { notes: [{ m, t, d, h, l, a }], bars: [Takt-Anfänge], beats }
   t, d in Vierteln, h = 'r' / 'l' (Hand), l = Notenzeile (C4 = 28, je Stammton +1), a = Vorzeichen −1 / 0 / 1 */
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, LETTERS = 'CDEFGAB';
function parsePitch(p) {
  const x = /^([A-G])(#|b)?(-?\d)$/.exec(p);
  if (!x) throw new Error('Ton? ' + p);
  const a = x[2] === '#' ? 1 : x[2] === 'b' ? -1 : 0;
  return { m: 12 * (+x[3] + 1) + STEP[x[1]] + a, l: 7 * +x[3] + LETTERS.indexOf(x[1]), a };
}
// Notenzeile und Vorzeichen aus der Tastennummer (für eigene MIDI-Dateien: mit ♯ geschrieben)
const SPELL = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const spell = m => { const [k, a] = SPELL[m % 12]; return { l: 7 * (Math.floor(m / 12) - 1) + k, a }; };
function parseVoice(src, hand) {
  const out = [], bars = [0];
  let t = 0, dur = 1;
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '|') { bars.push(t); continue; }
    const [p, d] = tok.split('/');
    if (d) { const dot = d.endsWith('.'); dur = 4 / parseInt(d, 10) * (dot ? 1.5 : 1); }
    if (p !== 'r') for (const q of p.split('+')) out.push({ ...parsePitch(q), t, d: dur, h: hand });
    t += dur;
  }
  return { notes: out, bars, beats: t };
}
function parseSong(s) {
  const r = parseVoice(s.rh, 'r'), l = s.lh ? parseVoice(s.lh, 'l') : { notes: [], bars: [], beats: 0 };
  const notes = [...r.notes, ...l.notes].sort((a, b) => a.t - b.t || a.m - b.m);
  return { notes, bars: r.bars, beats: Math.max(r.beats, l.beats), lhBars: l.bars, rhBeats: r.beats, lhBeats: l.beats };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { SONGS, LEVELS, parseSong, parseVoice, parsePitch, spell };
