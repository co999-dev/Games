// NEON GATE – ein kleines Neon-Ausweichspiel.
// Logische Spielfläche: 540 x 960 (Hochkant). Wird per Skalierung auf jede Größe gezeichnet.
(function (global) {
  'use strict';

  const W = 540, H = 960;
  const PLAYER_Y = 780;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class Game {
    constructor(seed = 7) {
      this.rand = mulberry32(seed);
      this.reset();
    }

    reset() {
      this.t = 0;
      this.player = { x: W / 2, vx: 0, r: 16, alive: true };
      this.gates = [];
      this.stars = [];
      this.particles = [];
      this.trail = [];
      this.bgStars = [];
      for (let i = 0; i < 90; i++) {
        this.bgStars.push({ x: this.rand() * W, y: this.rand() * H, z: 0.2 + this.rand() * 0.8 });
      }
      this.score = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.speed = 260;          // Pixel pro Sekunde
      this.speedBoost = 1;       // externer Multiplikator (Trailer)
      this.nextGate = 0;
      this.hue = 190;
      this.shake = 0;
      this.flash = 0;
      this.popups = [];
      this.gridOffset = 0;
      this.deadTime = 0;
    }

    spawnGate() {
      const difficulty = clamp(this.t / 40, 0, 1);
      const gapW = lerp(190, 120, difficulty);
      const last = this.gates.length ? this.gates[this.gates.length - 1].gapX : W / 2;
      const maxShift = lerp(170, 240, difficulty);
      let gapX = last + (this.rand() * 2 - 1) * maxShift;
      gapX = clamp(gapX, gapW / 2 + 20, W - gapW / 2 - 20);
      const gate = { y: -40, gapX, gapW, h: 22, passed: false, hue: this.hue + this.rand() * 40 - 20 };
      this.gates.push(gate);
      // Stern in der Lücke oder kurz davor
      if (this.rand() < 0.75) {
        this.stars.push({ x: gapX + (this.rand() * 2 - 1) * gapW * 0.25, y: -40 - 150 - this.rand() * 60, got: false, spin: this.rand() * 6 });
      }
    }

    burst(x, y, hue, n, power) {
      for (let i = 0; i < n; i++) {
        const a = this.rand() * Math.PI * 2;
        const s = power * (0.3 + this.rand());
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + this.rand() * 0.6, max: 1.1, hue: hue + this.rand() * 40 - 20, size: 2 + this.rand() * 3 });
      }
    }

    // input: -1 (links), 0, 1 (rechts) – oder targetX (Zahl in Spielkoordinaten) für Touch/Bot
    update(dt, input) {
      this.t += dt;
      const p = this.player;
      const spd = this.speed * this.speedBoost;

      if (p.alive) {
        this.speed = 260 + Math.min(this.t, 60) * 6;
        if (input && typeof input.targetX === 'number') {
          const dx = input.targetX - p.x;
          p.vx = lerp(p.vx, clamp(dx * 9, -900, 900), 1 - Math.exp(-dt * 14));
        } else {
          const dir = input ? input.dir || 0 : 0;
          p.vx = lerp(p.vx, dir * 620, 1 - Math.exp(-dt * 12));
        }
        p.x = clamp(p.x + p.vx * dt, p.r, W - p.r);
        this.trail.push({ x: p.x, y: PLAYER_Y });
        if (this.trail.length > 18) this.trail.shift();
      } else {
        this.deadTime += dt;
      }

      const moveSpd = p.alive ? spd : spd * Math.max(0, 1 - this.deadTime * 2);
      this.gridOffset = (this.gridOffset + moveSpd * dt) % 60;
      for (const s of this.bgStars) {
        s.y += moveSpd * dt * s.z * 0.5;
        if (s.y > H) { s.y -= H; s.x = this.rand() * W; }
      }

      // Tore erzeugen
      if (p.alive) {
        this.nextGate -= moveSpd * dt;
        if (this.nextGate <= 0) {
          this.spawnGate();
          this.nextGate = lerp(330, 250, clamp(this.t / 40, 0, 1));
        }
      }

      for (const g of this.gates) g.y += moveSpd * dt;
      for (const s of this.stars) { s.y += moveSpd * dt; s.spin += dt * 3; }

      if (p.alive) {
        // Kollision mit Toren
        for (const g of this.gates) {
          const top = g.y - g.h / 2, bot = g.y + g.h / 2;
          if (PLAYER_Y + p.r > top && PLAYER_Y - p.r < bot) {
            const left = g.gapX - g.gapW / 2, right = g.gapX + g.gapW / 2;
            if (p.x - p.r < left || p.x + p.r > right) {
              this.die();
              break;
            }
          }
          if (!g.passed && g.y - g.h / 2 > PLAYER_Y + p.r) {
            g.passed = true;
            this.score += 10;
            this.hue = (this.hue + 9) % 360;
            this.burst(p.x, PLAYER_Y, g.hue, 6, 120);
          }
        }
        // Sterne einsammeln
        for (const s of this.stars) {
          if (!s.got && Math.hypot(s.x - p.x, s.y - PLAYER_Y) < p.r + 18) {
            s.got = true;
            this.combo += 1;
            this.bestCombo = Math.max(this.bestCombo, this.combo);
            const pts = 25 * this.combo;
            this.score += pts;
            this.burst(s.x, s.y, 50, 22, 260);
            this.popups.push({ x: s.x, y: s.y - 20, text: '+' + pts + (this.combo > 1 ? '  x' + this.combo : ''), life: 0.9 });
            this.flash = Math.max(this.flash, 0.12);
          }
        }
        // verpasste Sterne brechen die Combo
        for (const s of this.stars) {
          if (!s.got && !s.missed && s.y > PLAYER_Y + 40) { s.missed = true; this.combo = 0; }
        }
      }

      this.gates = this.gates.filter(g => g.y < H + 60);
      this.stars = this.stars.filter(s => s.y < H + 60 && !(s.got));

      for (const q of this.particles) {
        q.x += q.vx * dt; q.y += q.vy * dt;
        q.vx *= Math.exp(-dt * 2); q.vy *= Math.exp(-dt * 2);
        q.life -= dt;
      }
      this.particles = this.particles.filter(q => q.life > 0);
      for (const pp of this.popups) { pp.y -= 60 * dt; pp.life -= dt; }
      this.popups = this.popups.filter(pp => pp.life > 0);

      this.shake = Math.max(0, this.shake - dt * 2.5);
      this.flash = Math.max(0, this.flash - dt * 1.5);
    }

    die() {
      const p = this.player;
      p.alive = false;
      this.shake = 1;
      this.flash = 0.8;
      this.burst(p.x, PLAYER_Y, this.hue, 90, 520);
      this.burst(p.x, PLAYER_Y, 50, 40, 300);
    }

    // Einfacher Bot: steuert auf die Lücke des nächsten Tores, nimmt Sterne mit
    botInput() {
      const p = this.player;
      const next = this.gates.filter(g => !g.passed && g.y < PLAYER_Y + 10).sort((a, b) => b.y - a.y)[0];
      let target = next ? next.gapX : W / 2;
      const star = this.stars.filter(s => !s.got && s.y < PLAYER_Y && s.y > PLAYER_Y - 260).sort((a, b) => b.y - a.y)[0];
      if (star && (!next || star.y > next.y)) target = star.x;
      else if (star && next && Math.abs(star.x - next.gapX) < next.gapW * 0.3) target = star.x;
      if (next) target = clamp(target, next.gapX - next.gapW / 2 + p.r + 6, next.gapX + next.gapW / 2 - p.r - 6);
      return { targetX: target };
    }

    render(ctx, scale) {
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const sx = (this.rand() * 2 - 1) * this.shake * 14;
      const sy = (this.rand() * 2 - 1) * this.shake * 14;

      // Hintergrund
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, `hsl(${(this.hue + 60) % 360}, 60%, 6%)`);
      bg.addColorStop(1, `hsl(${this.hue}, 70%, 11%)`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.translate(sx, sy);

      // Sterne
      for (const s of this.bgStars) {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + s.z * 0.5})`;
        ctx.fillRect(s.x, s.y, s.z * 2.2, s.z * 2.2 + s.z * this.speed * this.speedBoost * 0.01);
      }

      // Neon-Gitter
      ctx.strokeStyle = `hsla(${this.hue}, 100%, 60%, 0.10)`;
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = -60 + this.gridOffset; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      ctx.globalCompositeOperation = 'lighter';

      // Tore
      for (const g of this.gates) {
        const left = g.gapX - g.gapW / 2, right = g.gapX + g.gapW / 2;
        const col = `hsl(${g.hue}, 100%, 60%)`;
        ctx.shadowColor = col; ctx.shadowBlur = 24;
        ctx.fillStyle = `hsla(${g.hue}, 100%, 55%, 0.85)`;
        ctx.fillRect(-20, g.y - g.h / 2, left + 20, g.h);
        ctx.fillRect(right, g.y - g.h / 2, W - right + 20, g.h);
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.fillRect(-20, g.y - 2, left + 20, 4);
        ctx.fillRect(right, g.y - 2, W - right + 20, 4);
        // Kantenlichter
        ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.arc(left, g.y, 6, 0, Math.PI * 2); ctx.arc(right, g.y, 6, 0, Math.PI * 2); ctx.fill();
      }

      // Sterne (Sammelobjekte)
      for (const s of this.stars) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.spin);
        ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = 26;
        ctx.fillStyle = '#ffe270';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 6 : 15;
          const a = i * Math.PI / 5 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // Spur + Spieler
      const p = this.player;
      if (p.alive) {
        for (let i = 0; i < this.trail.length; i++) {
          const tr = this.trail[i];
          const k = i / this.trail.length;
          ctx.fillStyle = `hsla(${this.hue + 140}, 100%, 65%, ${k * 0.35})`;
          ctx.beginPath(); ctx.arc(tr.x, tr.y + (this.trail.length - i) * 9, p.r * k, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowColor = `hsl(${this.hue + 140}, 100%, 65%)`; ctx.shadowBlur = 40;
        ctx.fillStyle = `hsl(${this.hue + 140}, 100%, 70%)`;
        ctx.beginPath(); ctx.arc(p.x, PLAYER_Y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x, PLAYER_Y, p.r * 0.5, 0, Math.PI * 2); ctx.fill();
      }

      // Partikel
      ctx.shadowBlur = 0;
      for (const q of this.particles) {
        ctx.fillStyle = `hsla(${q.hue}, 100%, 65%, ${clamp(q.life / q.max, 0, 1)})`;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }

      ctx.globalCompositeOperation = 'source-over';

      // Punkte-Popups
      ctx.font = 'bold 24px "DejaVu Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const pp of this.popups) {
        ctx.fillStyle = `rgba(255, 230, 120, ${clamp(pp.life * 1.5, 0, 1)})`;
        ctx.fillText(pp.text, pp.x, pp.y);
      }
      ctx.restore();

      // Blitz
      if (this.flash > 0) {
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.6})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    renderHUD(ctx, scale) {
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.font = 'bold 34px "DejaVu Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = `hsl(${this.hue}, 100%, 60%)`; ctx.shadowBlur = 16;
      ctx.fillText(String(this.score).padStart(5, '0'), 24, 56);
      if (this.combo > 1) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffe270';
        ctx.shadowColor = '#ffb000';
        ctx.fillText('x' + this.combo, W - 24, 56);
      }
      ctx.restore();
    }
  }

  global.NeonGate = { Game, W, H, PLAYER_Y, clamp, lerp };
})(typeof window !== 'undefined' ? window : globalThis);
