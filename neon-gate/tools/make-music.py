"""Synthetisiert den 24-Sekunden-Soundtrack für den NEON-GATE-Trailer (120 BPM)."""
import sys, wave
import numpy as np

SR = 44100
DUR = 24.0
BEAT = 0.5
n = int(SR * DUR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(3)

def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= n: return
    sig = sig[: n - i] * gain
    L[i:i + len(sig)] += sig * (1 - max(pan, 0))
    R[i:i + len(sig)] += sig * (1 + min(pan, 0))

def env(length, a=0.005, d=0.2):
    t = np.arange(int(length * SR)) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)

def kick():
    t = np.arange(int(0.45 * SR)) / SR
    f = 45 + 110 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * 1.0

def hat(open_=False):
    d = 0.12 if open_ else 0.035
    s = rng.standard_normal(int(0.25 * SR))
    s = np.diff(s, prepend=0)  # Hochpass-artig
    return s * env(0.25, 0.001, d) * 0.18

def snare():
    s = rng.standard_normal(int(0.3 * SR)) * env(0.3, 0.001, 0.08) * 0.35
    t = np.arange(len(s)) / SR
    return s + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.3

def saw(freq, length, cutoff_decay=6.0):
    t = np.arange(int(length * SR)) / SR
    x = np.zeros_like(t)
    for k in range(1, 12):
        x += np.sin(2 * np.pi * freq * k * t) / k * np.exp(-t * cutoff_decay * k * 0.25)
    return x * 0.25

def pad(freqs, length):
    t = np.arange(int(length * SR)) / SR
    x = sum(np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * 0.3 * t) * 0.5) + 0.3 * np.sin(2 * np.pi * f * 2.003 * t) for f in freqs)
    a = np.minimum(t / 0.8, 1) * np.minimum((length - t) / 0.8, 1)
    return x * a * 0.06

def midi(m): return 440 * 2 ** ((m - 69) / 12)

# Akkordfolge (A-Moll-Stimmung): Am – F – C – G, je 1 Takt (2 s)
prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
bass_roots = [45, 41, 36, 43]

# Intro-Pad 0–3 s
add(pad([midi(m) for m in prog[0]], 3.2), 0.0)
# Riser ins Intro
t = np.arange(int(1.0 * SR)) / SR
add(rng.standard_normal(len(t)) * (t / 1.0) ** 2 * 0.08, 2.0)

def groove(start, end, intense=False):
    b = start
    while b < end - 1e-6:
        beat_idx = int(round((b - start) / BEAT))
        bar = int((b - 3.0) // 2) % 4
        add(kick(), b, 0.9)
        if beat_idx % 2 == 1: add(snare(), b, 0.8 if intense else 0.6)
        add(hat(), b + BEAT / 2, 1.0, 0.3)
        if intense:
            add(hat(), b + BEAT / 4, 0.6, -0.3); add(hat(), b + 3 * BEAT / 4, 0.6, -0.3)
        # Bass in Achteln
        root = midi(bass_roots[bar] + (12 if intense and beat_idx % 4 == 3 else 0))
        for e in (0, BEAT / 2):
            add(saw(root, 0.24, 9.0), b + e, 0.55)
        # Arpeggio
        chord = prog[bar]
        for j, e in enumerate((0, BEAT / 2)):
            note = chord[(beat_idx * 2 + j) % 3] + 12 + (12 if intense else 0)
            add(saw(midi(note), 0.18, 14.0), b + e, 0.22, 0.4 if j else -0.4)
        b += BEAT
    # Pad darunter
    tt = start
    while tt < end - 1e-6:
        bar = int((tt - 3.0) // 2) % 4
        add(pad([midi(m) for m in prog[bar]], min(2.0, end - tt) + 0.3), tt)
        tt += 2.0

groove(3.0, 13.0)
# Riser vor dem Drop
t = np.arange(int(2.0 * SR)) / SR
add(rng.standard_normal(len(t)) * (t / 2.0) ** 3 * 0.12, 11.0)
add(np.sin(2 * np.pi * np.cumsum(200 + 800 * (t / 2.0) ** 2) / SR) * (t / 2) ** 2 * 0.08, 11.0)
groove(13.0, 19.0, intense=True)

# Crash/Impact bei ~19 s
ct = 19.0
t = np.arange(int(2.5 * SR)) / SR
boom = np.sin(2 * np.pi * np.cumsum(30 + 120 * np.exp(-t * 8)) / SR) * np.exp(-t * 2.2)
noise = rng.standard_normal(len(t)) * np.exp(-t * 3) * 0.35
add(boom * 1.1 + noise, ct)
add(pad([midi(m) for m in [57, 64, 69]], 2.0), 19.2, 0.8)

# Outro 21–24: Akkord + Schlag
add(kick(), 21.0, 1.0); add(snare(), 21.0, 0.7)
add(pad([midi(m) for m in [45, 57, 60, 64, 69]], 3.0), 21.0, 1.3)
for k, m in enumerate([69, 72, 76, 81]):
    add(saw(midi(m), 0.6, 4.0), 21.7 + k * 0.125, 0.25, (-0.4, 0.4)[k % 2])

# Ausblenden
fade = np.ones(n); f = int(0.8 * SR); fade[-f:] = np.linspace(1, 0, f)
mix = np.stack([L, R], 1) * fade[:, None]
mix = np.tanh(mix * 1.2) * 0.9
mix /= np.max(np.abs(mix)) / 0.95
out = sys.argv[1]
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('ok', out)
