/* ═══ موتور صدا: موسیقی پروسیجرال + صدای محیط + آهنگ‌های کاربر (IndexedDB) ═══ */

let ctx = null, musicGain = null, ambGain = null;

function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.gain.value = parseFloat(localStorage.getItem('daftarche-vol-music') ?? '0.8');
    musicGain.connect(ctx.destination);
  }
  if (!ambGain) {
    ambGain = ctx.createGain();
    ambGain.gain.value = parseFloat(localStorage.getItem('daftarche-vol-amb') ?? '0.8');
    ambGain.connect(ctx.destination);
  }
  return ctx;
}

export function unlockAudio() { try { ensureCtx(); } catch (e) {} }

/* ── ولوم ── */
export function setMusicVolume(v) {
  if (musicGain) musicGain.gain.value = v;
  if (userAudio) userAudio.volume = v * .95;
  localStorage.setItem('daftarche-vol-music', v);
}
export function setAmbVolume(v) {
  if (ambGain) ambGain.gain.value = v;
  localStorage.setItem('daftarche-vol-amb', v);
}
export function getVolumes() {
  return {
    m: parseFloat(localStorage.getItem('daftarche-vol-music') ?? '0.8'),
    a: parseFloat(localStorage.getItem('daftarche-vol-amb') ?? '0.8'),
  };
}

/* ── بافرهای نویز ── */
let whiteBuf = null, brownBuf = null, dropBuf = null;
function getWhite(c) {
  if (!whiteBuf) {
    const len = c.sampleRate * 2; whiteBuf = c.createBuffer(1, len, c.sampleRate);
    const d = whiteBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return whiteBuf;
}
function getBrown(c) {
  if (!brownBuf) {
    const len = c.sampleRate * 2; brownBuf = c.createBuffer(1, len, c.sampleRate);
    const d = brownBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
  }
  return brownBuf;
}
function getDrop(c) {
  if (!dropBuf) {
    const len = (c.sampleRate * .08) | 0; dropBuf = c.createBuffer(1, len, c.sampleRate);
    const d = dropBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  return dropBuf;
}

/* ═══ موسیقی پروسیجرال ═══ */
export const MUSIC_TRACKS = {
  night:  { label: 'آرامش شب',   root: 196.00, scale: [0, 3, 5, 7, 10], bpm: 7,  wave: 'sine' },
  spring: { label: 'صبح بهاری',  root: 261.63, scale: [0, 2, 4, 7, 9],  bpm: 11, wave: 'triangle' },
  deep:   { label: 'تمرکز عمیق', root: 146.83, scale: [0, 5, 7, 12],    bpm: 5,  wave: 'sine' },
};
export const TRACK_KEYS = Object.keys(MUSIC_TRACKS);

function startProc(key) {
  const c = ensureCtx(), cfg = MUSIC_TRACKS[key];
  const out = c.createGain(); out.gain.value = 0; out.connect(musicGain);
  out.gain.linearRampToValueAtTime(.8, c.currentTime + 2);
  const nodes = [out];
  [0, 7].forEach(semi => {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.value = (cfg.root / 2) * Math.pow(2, semi / 12);
    const g = c.createGain(); g.gain.value = .045;
    o.connect(g); g.connect(out); o.start(); nodes.push(o);
  });
  let next = c.currentTime + .3;
  const step = () => {
    while (next < c.currentTime + 1.2) {
      if (Math.random() < .85) {
        const deg = cfg.scale[(Math.random() * cfg.scale.length) | 0];
        const oct = Math.random() < .25 ? 2 : 1;
        const f = cfg.root * oct * Math.pow(2, deg / 12);
        const o = c.createOscillator(); o.type = cfg.wave; o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0, next);
        g.gain.linearRampToValueAtTime(.14, next + .04);
        g.gain.exponentialRampToValueAtTime(.0001, next + 2.4);
        o.connect(g); g.connect(out);
        o.start(next); o.stop(next + 2.6);
      }
      next += (60 / cfg.bpm) * (Math.random() < .3 ? 1.5 : 1);
    }
  };
  step();
  const iv = setInterval(step, 400);
  return {
    stop() {
      clearInterval(iv);
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, .5);
      setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); try { out.disconnect(); } catch (e) {} }, 1500);
    }
  };
}

/* ═══ صدای محیط ═══ */
function startAmb(scene) {
  const c = ensureCtx();
  const out = c.createGain(); out.gain.value = 0; out.connect(ambGain);
  out.gain.linearRampToValueAtTime(1, c.currentTime + 1.5);
  const stops = [];

  if (scene === 'rain') {
    const src = c.createBufferSource(); src.buffer = getWhite(c); src.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
    const g = c.createGain(); g.gain.value = .16;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out); src.start();
    stops.push(src);
    const iv = setInterval(() => {
      if (Math.random() < .8) {
        const t = c.currentTime + Math.random() * .15;
        const s = c.createBufferSource(); s.buffer = getDrop(c);
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 3200; bp.Q.value = 6;
        const gg = c.createGain();
        gg.gain.setValueAtTime(.09, t); gg.gain.exponentialRampToValueAtTime(.0001, t + .09);
        s.connect(bp); bp.connect(gg); gg.connect(out); s.start(t);
      }
    }, 140);
    stops.push({ stop: () => clearInterval(iv) });
  }

  if (scene === 'sea') {
    const src = c.createBufferSource(); src.buffer = getBrown(c); src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480;
    const g = c.createGain(); g.gain.value = .22;
    const lfo = c.createOscillator(); lfo.frequency.value = .09;
    const lg = c.createGain(); lg.gain.value = .14;
    lfo.connect(lg); lg.connect(g.gain);
    const lfo2 = c.createOscillator(); lfo2.frequency.value = .023;
    const lg2 = c.createGain(); lg2.gain.value = 120;
    lfo2.connect(lg2); lg2.connect(lp.frequency);
    src.connect(lp); lp.connect(g); g.connect(out);
    src.start(); lfo.start(); lfo2.start();
    stops.push(src, lfo, lfo2);
  }

  if (scene === 'forest') {
    const src = c.createBufferSource(); src.buffer = getWhite(c); src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = c.createGain(); g.gain.value = .05;
    src.connect(lp); lp.connect(g); g.connect(out); src.start();
    stops.push(src);
    const iv = setInterval(() => {
      if (Math.random() < .5) {
        const base = 1900 + Math.random() * 900;
        const n = 2 + ((Math.random() * 2) | 0);
        for (let i = 0; i < n; i++) {
          const t = c.currentTime + i * .18 + Math.random() * .05;
          const o = c.createOscillator(); o.type = 'sine';
          o.frequency.setValueAtTime(base, t);
          o.frequency.exponentialRampToValueAtTime(base * 1.4, t + .09);
          o.frequency.exponentialRampToValueAtTime(base * .9, t + .16);
          const gg = c.createGain();
          gg.gain.setValueAtTime(0, t);
          gg.gain.linearRampToValueAtTime(.05, t + .02);
          gg.gain.exponentialRampToValueAtTime(.0001, t + .18);
          o.connect(gg); gg.connect(out); o.start(t); o.stop(t + .2);
        }
      }
    }, 2200);
    stops.push({ stop: () => clearInterval(iv) });
  }

  return {
    stop() {
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, .4);
      setTimeout(() => { stops.forEach(s => { try { s.stop(); } catch (e) {} }); try { out.disconnect(); } catch (e) {} }, 1200);
    }
  };
}

/* ═══ مدیریت پخش ═══ */
let procHandle = null, userAudio = null, userUrl = null, ambHandle = null;

function stopProc() { if (procHandle) { procHandle.stop(); procHandle = null; } }
function stopUser() {
  if (userAudio) { userAudio.pause(); userAudio = null; }
  if (userUrl) { URL.revokeObjectURL(userUrl); userUrl = null; }
}

export function setMusic(key) {
  stopProc(); stopUser();
  if (key !== 'none') procHandle = startProc(key);
}
export function playUserTrack(track) {
  stopProc(); stopUser();
  userUrl = URL.createObjectURL(track.blob);
  userAudio = new Audio(userUrl);
  userAudio.loop = true;
  userAudio.volume = getVolumes().m * .95;
  userAudio.play().catch(() => {});
}
export function stopMusicAll() { stopProc(); stopUser(); }

export function setAmbience(scene, soundOn) {
  if (ambHandle) { ambHandle.stop(); ambHandle = null; }
  if (scene !== 'none' && soundOn) ambHandle = startAmb(scene);
}

/* ═══ آهنگ‌های کاربر (IndexedDB) ═══ */
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open('daftarche-audio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbP;
}
export async function loadUserTracks() {
  try {
    const d = await db();
    return await new Promise(res => {
      const q = d.transaction('tracks').objectStore('tracks').getAll();
      q.onsuccess = () => res(q.result || []);
      q.onerror = () => res([]);
    });
  } catch { return []; }
}
export async function addUserTrack(t) {
  const d = await db();
  return new Promise(res => { const tx = d.transaction('tracks', 'readwrite'); tx.objectStore('tracks').put(t); tx.oncomplete = res; });
}
export async function removeUserTrack(id) {
  const d = await db();
  return new Promise(res => { const tx = d.transaction('tracks', 'readwrite'); tx.objectStore('tracks').delete(id); tx.oncomplete = res; });
}