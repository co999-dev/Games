# NEON GATE

Kleines Neon-Arcade-Spiel (Hochkant): Gleite mit der Kugel durch die Lücken der Neon-Tore, sammle Sterne für Combos – es wird immer schneller.

- **Spielen:** `index.html` im Browser öffnen. Steuerung: ← → (oder A/D), auf dem Handy tippen und ziehen.
- **Trailer:** `video/neon-gate-trailer.mp4` (1080×1920, 24 s, 30 fps, mit Musik).

## Trailer neu erzeugen

```bash
python3 tools/make-music.py music.wav                         # Soundtrack synthetisieren (numpy)
node tools/render-trailer.js video/neon-gate-trailer.mp4 music.wav   # Playwright + ffmpeg
```

`trailer.html` rendert jedes Bild deterministisch (fester Seed, Bot-Steuerung, Einblendungen).
