/* ═══ Confetti + Chime ═══ */

import { $ } from './utils.js';

export function confetti() {
  /* Reduced motion: essential feedback (state change, character reaction) stays;
     the decorative burst is skipped entirely */
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#confetti'), ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#f4703a', '#ffb45c', '#7fb069', '#ffd97d', '#e4584f'];
  /* Calm burst: fewer, slower, shorter-lived pieces — a subtle response,
     not a full-screen celebration */
  const P = Array.from({ length: 40 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 180, y: innerHeight * .4,
    vx: (Math.random() - .5) * 5, vy: -Math.random() * 6 - 2, g: .22,
    s: Math.random() * 6 + 4, c: colors[Math.random() * colors.length | 0],
    r: Math.random() * Math.PI, vr: (Math.random() - .5) * .2, life: 55 + Math.random() * 25
  }));
  (function tick() {
    ctx.clearRect(0, 0, c.width, c.height);
    let alive = false;
    for (const p of P) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      if (p.life > 0) {
        alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.min(1, p.life / 40);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6);
        ctx.restore();
      }
    }
    alive ? requestAnimationFrame(tick) : ctx.clearRect(0, 0, c.width, c.height);
  })();
}

/* One shared AudioContext for all beeps — instead of creating a new one on every call
   (which would pile up unused contexts) */
let beepCtx = null;
function getBeepCtx() {
  if (!beepCtx) beepCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (beepCtx.state === 'suspended') beepCtx.resume();
  return beepCtx;
}

export function beep() {
  try {
    const ac = getBeepCtx();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.25, t + .02);
      g.gain.exponentialRampToValueAtTime(.001, t + .35);
      o.start(t); o.stop(t + .4);
    });
  } catch (e) {}
}