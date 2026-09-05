/* ═══ جشن کاغذرنگی + صدای زنگ ═══ */

import { $ } from './utils.js';

export function confetti() {
  const c = $('#confetti'), ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#f4703a', '#ffb45c', '#7fb069', '#ffd97d', '#e4584f'];
  const P = Array.from({ length: 130 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 220, y: innerHeight * .35,
    vx: (Math.random() - .5) * 9, vy: -Math.random() * 9 - 3, g: .28,
    s: Math.random() * 7 + 4, c: colors[Math.random() * colors.length | 0],
    r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, life: 90 + Math.random() * 40
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

/* یک AudioContext مشترک برای همهٔ بیپ‌ها — به‌جای ساختن یکی جدید در هر فراخوانی
   (که context های بلااستفاده رو تجمیع می‌کرد) */
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