# Piano Rain

@../Spiele-Hub/JUKEBOX.md

Gemeinsame Dateien (css/base.css, css/fonts.css, fonts/, js/i18n.js, js/profile.js, js/sync.js, js/pwa.js, sw.js)
hier **nicht** direkt ändern, sondern das Original in `../Spiele-Hub/shared/` und dann `node ../Spiele-Hub/scripts/share.js --write`.

Klavier-Lernspiel: Noten fallen auf eine Tastatur, das iPad hört übers Mikrofon zu (Kawai CX-102 über Lautsprecher).
- Gehör: `js/ear.js` – prüft die ERWARTETEN Töne (Energie bei Grundton + Obertönen, Zunahme nach einem Anschlag, Nachbartasten,
  Oktavfehler), YIN nur für die Meldung „falscher Ton“. Nach jeder Änderung: `node scripts/test-ear.js` (erzeugte Klaviertöne).
- Liederbuch: `js/songs.js` – nur gemeinfreie Melodien, selbst gesetzt. Nach Änderungen `node scripts/check-songs.js`.
  `id` nie ändern (Sterne `pr.stars`). Keine urheberrechtlich geschützten Songs ins Repo – dafür gibt es „Meine Lieder“
  (eigene MIDI-Datei, bleibt in IndexedDB auf dem Gerät, gelesen mit `js/lib/midi.js` = @tonejs/midi, MIT).
- Während des Zuhörens spielt das Spiel nie selbst Töne (Anhören nur auf der Lied-Seite).
- Test ohne Klavier: `?test=1` (Test-Klavier: Tasten antippen erzeugt Klaviertöne, die durch die echte Erkennung gehen),
  `&auto=1` spielt automatisch mit; im verborgenen Vorschau-Fenster `PR.start(id)` und `PR.sim(ms)` (feste Uhr).
- Speicher: `pr.stars`, `pr.both`, `pr.best`, `pr.days` (mapmax), `pr.ach` (union), `pr.stats` (device) – abgeglichen;
  `pr.opt`, `pr.cal` (Einmessung des Mikrofons) nur auf dem Gerät.
