# Konzept: Klavier-Lernspiel („Tastenregen“, Arbeitstitel)

Stand: 09.11.2026 · Idee geprüft, Eingabe: iPad + Mikrofon · noch nicht gebaut

## Spielprinzip
- Noten fallen als Balken auf eine Klaviertastatur (rechte Hand grün, linke blau).
- **Warte-Modus:** Das Lied hält an, bis die richtige Taste (bzw. der ganze Akkord) gedrückt ist – dann geht es weiter.
- **Tempo-Modus:** Lied läuft im eingestellten Tempo (50 / 75 / 100 %), Punkte für Treffgenauigkeit.
- Hände einzeln üben, Abschnitt in Schleife, Notenlinien einblendbar (lernt nebenbei Noten lesen).
- Sterne je Lied, Übungs-Serie, Abgleich und Profil wie in den anderen Jukebox-Spielen.

## Eingabe (geprüft)
| Weg | Was geht | Wo |
|---|---|---|
| E-Piano per USB/Bluetooth (Web MIDI) | sehr genau, Akkorde, keine Verzögerung | Chrome/Edge am PC, Android. **Nicht** Safari / iPhone / iPad (Web MIDI fehlt in WebKit, Stand 2026) |
| Mikrofon (Tonhöhe erkennen) | einzelne Töne gut, Akkorde unzuverlässig | überall, auch iPhone, auch akustisches Klavier |
| Bildschirm- / Computertastatur | zum Ausprobieren | überall |

## Lieder – woher? (geprüft)
| Quelle | Lizenz | Brauchbar? |
|---|---|---|
| **Selbst gesetzt** (Weihnachts- und Volkslieder, einfache Klassik) | gemeinfreie Melodien, eigene Bearbeitung | ✅ beste Lösung für Einsteiger-Fassungen |
| **Mutopia Project** (über 2.000 Stücke, ⅓ Klavier, MIDI aus LilyPond) | je Stück Public Domain, CC BY oder CC BY-SA | ✅ taktgenau, ideal zum Mitspielen; Namensnennung |
| **piano-midi.de** (Bernd Krüger, Klassik) | CC BY-SA 3.0 DE (laut Debian/Wikimedia) | ⚠️ erlaubt, aber frei eingespielt (Tempo schwankt) – eher für „Zuhören“ |
| mfiles.co.uk | nur privat, Spiele brauchen Lizenz | ❌ |
| MIDI-Sammelseiten (midishow u. a.) | ungeklärt | ❌ |

## Automatisch aus Songs umwandeln (geprüft)
- „Basic Pitch“ von Spotify (Apache-2.0, läuft im Browser): laut eigener Beschreibung am besten bei **einem Instrument**. Bei fertigen Songs (Gesang, Schlagzeug, Bass) kommt Notensalat heraus.
- Daher nur als späterer Versuch: „Melodie aus Hörprobe“ – rechnet auf dem Gerät, wird nicht gespeichert oder geteilt.

## Geschützte Songs (Charts) – „nur für mich“
- Eine Passwortseite auf GitHub Pages schützt **nicht**: Das Repo ist öffentlich, jede Datei darin ist abrufbar.
- Saubere Lösung: **„Meine Lieder“** – eigene MIDI-Dateien werden auf dem eigenen Gerät geladen und nur dort gespeichert
  (nie hochgeladen, nicht im Abgleich). Privatgebrauch, kein Veröffentlichen.

## Start-Umfang (Vorschlag)
1. Spiel mit Warte- und Tempo-Modus, MIDI + Mikrofon + Bildschirmtasten.
2. 15–20 Lieder in 3 Stufen: Weihnachtslieder (passt zum Dezember), Volkslieder, Klassik-Einstieg
   (Ode an die Freude, Für Elise Anfang, Menuett G-Dur …), dazu Mutopia-Stücke.
3. „Meine Lieder“ (MIDI-Datei laden, bleibt auf dem Gerät).
4. Später: Melodie aus Hörprobe, Noten-lesen-Training.

## Technik
- Neues Spiel im Jukebox-Stil (eigener Ordner, gemeinsame Dateien über `Spiele-Hub/shared`).
- MIDI-Dateien lesen mit `@tonejs/midi` (MIT), Klang über Web Audio (Klavier-Samples, freie Lizenz).
- Keine Server-Änderung nötig.

## Instrument des Nutzers
**Kawai CX-102** (Digitalpiano, 88 gewichtete Tasten, Responsive Hammer Lite) mit **USB to Host** und **Bluetooth MIDI**.
→ Hauptweg ist Web MIDI. Am sichersten per USB-Kabel am PC (Chrome/Edge); Bluetooth MIDI vorher testen.
Das Klavier spielt selbst den Ton, das Spiel muss beim Drücken keinen Klang erzeugen (keine Verzögerung).
Am iPhone/iPad geht MIDI im Browser nicht, dort nur Mikrofon.

## Gerät und Eingabe: iPad mit Mikrofon (Entscheidung 09.11.2026)
- Gespielt wird im normalen Safari auf dem iPad, das Mikrofon hört das Kawai. Keine Zusatz-App, kein Kabel.
- **Wichtig:** Das Klavier muss über die **Lautsprecher** spielen, nicht über Kopfhörer (sonst hört das Mikrofon nichts).
- **Prüfen statt erkennen:** Das Spiel weiß, welche Note(n) kommen müssen, und prüft nur, ob genau diese Töne
  erklingen (Energie bei den erwarteten Frequenzen und Obertönen). Das ist deutlich zuverlässiger als freies Erkennen
  und macht auch einfache Akkorde (2–3 Töne) machbar. Einzeltöne zusätzlich mit Tonhöhen-Erkennung (YIN/McLeod).
- Mikrofon ohne Echo-Unterdrückung, Rauschfilter und automatische Lautstärke öffnen (sonst werden Klaviertöne weggefiltert).
- Kurze Einrichtung beim ersten Start: „Spiel ein C“ → Lautstärke und Raumgeräusch kalibrieren.
- Das Spiel spielt keine Töne, während es zuhört (nur beim „Vorhören“ des Lieds).
- Verzögerung ca. 50–100 ms: Im Warte-Modus egal, im Tempo-Modus großzügiges Zeitfenster.
- Lieder starten mit der Melodie (rechte Hand); Begleitung linke Hand als höhere Stufe, nur einfache Akkorde.
- Web MIDI (Kabel/Bluetooth, z. B. am PC oder über die iPad-App „MIDIWeb Browser“) bleibt als Zusatz möglich,
  wird aber nicht vorrangig gebaut.

## Offene Fragen
1. Start mit Weihnachtsliedern im Dezember?
2. Eigener Name? (Vorschlag: „Tastenregen“, „Key Drop“)
