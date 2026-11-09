# Piano Rain

Klavier lernen mit fallenden Noten. Das iPad steht vor dem Klavier und hört übers Mikrofon zu – es **prüft**, ob die
erwarteten Töne erklingen (statt frei zu erkennen). Teil der [Jukebox](https://ku3rb1s.github.io/jukebox/) – Regeln für alle
Spiele: `../Spiele-Hub/JUKEBOX.md`. Konzept: `../Konzepte/Klavier.md`.

- **Modi:** Warten (Lied hält an, bis der Ton/Akkord kommt) · Im Takt (50 / 75 / 100 %, Zeitfenster ±300 ms) ·
  Hände einzeln oder beide · Abschnitt in Schleife · Notenlinien und Notennamen zum Einblenden
- **Sterne:** ★ geschafft · ★★ 90 % auf Anhieb (Warten) oder 70 % im Takt · ★★★ im Takt bei 100 % mit 85 % (Lieder mit
  linker Hand: mit beiden Händen)
- **Lokal starten:** `node server.js` → http://127.0.0.1:8896/ · Test ohne Klavier: `?test=1` (Test-Klavier), `&auto=1` spielt mit,
  `?debug=1` blendet die Werte des Gehörs ein (zum Abstimmen mit dem echten Klavier)
- **Mikrofon** geht nur über https (GitHub Pages) oder localhost – im WLAN über die IP-Adresse erlaubt Safari es nicht.

## Gehör (`js/ear.js`)
- Mikrofon ohne Echo-Unterdrückung, Rauschfilter und automatische Lautstärke.
- Je Bild: kurzes Fenster (2048) für Anschläge (spektraler Fluss) und den Einsatz einzelner Teiltöne, langes Fenster (8192)
  für die Energie jeder Taste (Grundton + Obertöne).
- Eine erwartete Taste zählt, wenn sie bei einem Anschlag einsetzt (kurzes Fenster), ihre Energie zunimmt und kein anderer
  Ton es besser erklärt: Nachbartasten, Oktave höher (ungerade Teiltöne fehlen), tiefere Tasten mit passenden Obertönen.
  Gleiche Taste nochmal: kräftiger Anschlag, die Taste ist der stärkste Ton, keine andere Taste setzt ein.
- YIN meldet bei einem Einzelton, welche falsche Taste gespielt wurde.
- Tests mit erzeugten Klaviertönen: `node scripts/test-ear.js` (Einzelfälle) und `node scripts/test-songs.js` (jedes Lied
  im Warte-Modus mit jeder Hand und im Takt). Tiefe, schnell und leiser wiederholte Basstöne sind noch der schwierigste Fall.

## Lieder
- `js/songs.js` – nur gemeinfreie Melodien, selbst gesetzt (Schreibweise oben in der Datei). Prüfen: `node scripts/check-songs.js -v`.
- Meine Lieder: MIDI-Datei → `midiToSong` in `js/game.js` (Spuren: höchste = rechts, zweite = links; eine Spur wird am mittleren C geteilt),
  gespeichert in IndexedDB `piano-rain` nur auf dem Gerät. MIDI lesen: `js/lib/midi.js` = @tonejs/midi 2.0.28 (MIT, Lizenz daneben).

## Sonstiges
- **Icons:** `node scripts/render-icons.js` (aus `logo.svg`, braucht Microsoft Edge)
- **Übersetzungen prüfen:** `node scripts/check-lang.js`
- **Speicher:** `pr.stars`, `pr.both`, `pr.best`, `pr.days` (mapmax), `pr.ach` (union), `pr.stats` (device) – abgeglichen;
  `pr.opt`, `pr.cal` nur auf dem Gerät.
