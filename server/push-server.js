/* ═══ دَفتَرچه — Web Push Server (production-hardened) ═══
   Stores Web Push subscriptions and dispatches due-date reminders with
   VAPID authentication, so notifications arrive even when the PWA is fully
   closed (including iOS 16.4+ standalone).

   ── Setup ──
   1) npm install            (inside server/)
   2) Generate VAPID keys once — the private key NEVER leaves the server:
        npm run keys
   3) Environment variables (never in source control):
        VAPID_PUBLIC_KEY     required — served by GET /api/vapid-public-key
        VAPID_PRIVATE_KEY    required — server only, never logged/returned
        ADMIN_API_KEY        required — protects /send-due-reminders and /test-push
        ALLOWED_ORIGIN       recommended in production (e.g. https://app.example)
        ENABLE_TEST_PUSH     default: enabled unless NODE_ENV=production
        PORT                 default 3100
   4) Start:  npm start

   ── Endpoints ──
   GET  /api/vapid-public-key   → public (the key is public by design)
   POST /api/subscribe          → public (browser lifecycle), strictly validated
   POST /api/unsubscribe        → public (browser lifecycle), strictly validated
   POST /api/send-due-reminders → Authorization: Bearer <ADMIN_API_KEY>
   POST /api/test-push          → Authorization: Bearer <ADMIN_API_KEY>
                                  (also gated by ENABLE_TEST_PUSH)

   Send failures are isolated: a 404/410 Gone drops the dead subscription,
   any other error is logged (without secrets) and the batch continues. */

const express = require('express');
const webpush = require('web-push');

const PORT = process.env.PORT || 3100;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CONTACT = process.env.VAPID_CONTACT || 'mailto:admin@daftarche.app';

/* ── CORS ──
   Production must declare its origin explicitly. The wildcard is only
   tolerated in development — and even there, browser credentials are never
   enabled, so nothing rides on the user's session. */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || (NODE_ENV === 'production' ? null : '*');
if (NODE_ENV === 'production' && !ALLOWED_ORIGIN) {
  console.error('[push-server] در production مقدار ALLOWED_ORIGIN باید صریح باشد (مثلاً https://app.example).');
  process.exit(1);
}

/* ── Admin auth ──
   The operational endpoints (CRON trigger, test push) are statelessly
   protected by a shared admin key from the environment. The key is never
   logged and never echoed back. */
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
if (!ADMIN_API_KEY || ADMIN_API_KEY.length < 16) {
  console.error('[push-server] ADMIN_API_KEY در environment تنظیم نشده (حداقل ۱۶ کاراکتر).');
  console.error('           نمونهٔ ساخت: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"');
  process.exit(1);
}

/* ── VAPID ──
   Keys come strictly from the environment; without them the server refuses
   to start rather than silently sending unauthenticated pushes. */
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('[push-server] VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY در environment تنظیم نشده‌اند.');
  console.error('           یک‌بار با «npm run keys» بسازید و به‌عنوان environment variable ست کنید.');
  process.exit(1);
}

webpush.setVapidDetails(CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/* ── Subscription store ──
   In-memory for a single-instance deployment; persisted to
   subscriptions.json atomically (tmp file + rename) so a crash mid-write
   can never truncate the real store. A corrupted file is quarantined at
   boot instead of crashing the server forever. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const STORE_FILE = path.join(__dirname, 'subscriptions.json');

let subscriptions = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  for (const s of Array.isArray(raw) ? raw : []) {
    if (s && typeof s.endpoint === 'string' && s.keys) subscriptions.set(s.endpoint, s);
  }
  console.log(`[push-server] ${subscriptions.size} اشتراک از دیسک بازیابی شد.`);
} catch (err) {
  if (err.code !== 'ENOENT') {
    /* Quarantine the unreadable file — the data stays on disk for a human,
       and the server boots clean instead of crash-looping. */
    const quarantine = `${STORE_FILE}.corrupt-${Date.now()}`;
    try { fs.renameSync(STORE_FILE, quarantine); } catch (_) {}
    console.error(`[push-server] فروشگاه اشتراک‌ها خراب بود؛ به «${path.basename(quarantine)}» منتقل و از صفر شروع شد.`);
  }
}

let persistChain = Promise.resolve();
function persistStore() {
  /* Serialize writes through a promise chain (no torn interleaving) and
     land them atomically: write to a unique tmp file, then rename over the
     real store — rename is atomic on POSIX and effectively atomic on NTFS. */
  persistChain = persistChain.then(() => new Promise(resolve => {
    const tmp = `${STORE_FILE}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFile(tmp, JSON.stringify([...subscriptions.values()], null, 2), err => {
      if (err) {
        console.error('[push-server] ذخیرهٔ فروشگاه اشتراک‌ها ناموفق بود:', err.code || err.message);
        try { fs.unlinkSync(tmp); } catch (_) {}
        return resolve();
      }
      fs.rename(tmp, STORE_FILE, renameErr => {
        if (renameErr) {
          console.error('[push-server] جایگزینی فروشگاه ناموفق بود:', renameErr.code || renameErr.message);
          try { fs.unlinkSync(tmp); } catch (_) {}
        }
        resolve();
      });
    });
  })).catch(() => {});
}

/* ── Redacted logging ──
   Endpoints appear in logs only as a short one-way hash: enough to correlate
   failures across retries, useless for reconstructing the URL or identity.
   Keys, auth tokens and full subscription objects never reach the log. */
function epHash(endpoint) {
  try { return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 10); }
  catch { return '?'; }
}

/* ── Rate limiting ──
   Fixed-window counter per bucket, per IP. Deliberately tiny (no store, no
   dependency): enough to stop hammering and brute-force, not a real WAF. */
const RATE_RULES = {
  subscribe:       { windowMs: 60_000,  max: 30 },
  unsubscribe:     { windowMs: 60_000,  max: 30 },
  'send-due-reminders': { windowMs: 60_000, max: 4 },
  'test-push':     { windowMs: 60_000,  max: 2 },
};
const rateBuckets = new Map();   // `${rule}|${ip}` → { count, resetAt }
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
}, 120_000).unref();

function rateLimit(rule, req, res) {
  const cfg = RATE_RULES[rule];
  if (!cfg) return true;
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || '?';
  const now = Date.now();
  const key = `${rule}|${ip}`;
  let b = rateBuckets.get(key);
  if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + cfg.windowMs }; rateBuckets.set(key, b); }
  b.count++;
  res.setHeader('X-RateLimit-Limit', cfg.max);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, cfg.max - b.count));
  if (b.count > cfg.max) {
    res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000));
    return false;
  }
  return true;
}

/* ── App ── */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

/* Bodies are capped hard: a megabyte-class payload must never enter the
   handlers — subscribe/unsubscribe are a few hundred bytes at most and the
   reminder batch is bounded by MAX_TASKS below. */
app.use(express.json({ limit: '16kb' }));

/* Security headers on every response. API responses are never cached. */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/* CORS — strict in production, convenient in development. Unknown origins
   get no CORS headers, so browsers refuse to read the response. */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGIN === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (!origin) {
    /* No Origin header → same-origin request (curl, the PWA itself). */
  } else if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Vary', 'Origin');
  } else {
    /* Unknown origin: rejected outright — not merely denied CORS headers —
       so a hostile site cannot even reach the handlers. */
    return fail(res, 403, 'مبدأ درخواست مجاز نیست');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function fail(res, status, msg) {
  res.status(status).json({ error: msg });
}

/* ── Validation helpers ── */
const MAX_TEXT = 200;
const MAX_TASKS = 500;
const ENDPOINT_MAX = 2048;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isHttpsUrl(s) {
  if (typeof s !== 'string' || s.length > ENDPOINT_MAX) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !!u.host;
  } catch { return false; }
}

function isBase64Url(s, min, max) {
  return typeof s === 'string'
    && s.length >= min && s.length <= max
    && /^[A-Za-z0-9\-_=+/]+$/.test(s);
}

function validSubscription(sub) {
  return !!sub && !Array.isArray(sub) && typeof sub === 'object'
    && isHttpsUrl(sub.endpoint)
    && !!sub.keys && typeof sub.keys === 'object' && !Array.isArray(sub.keys)
    && isBase64Url(sub.keys.p256dh, 40, 256)
    && isBase64Url(sub.keys.auth, 8, 64);
}

/* Admin guard — constant-time comparison so timing cannot leak the key.
   (Node's timingSafeEqual requires equal lengths; the length leak is
   negligible against a 32-byte random key, but the compare itself is safe.) */
function authorized(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(ADMIN_API_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res) {
  if (authorized(req)) return true;
  fail(res, 401, 'دسترسی مجاز نیست');
  return false;
}

/* TM-01: the client needs the public key to subscribe. */
app.get('/api/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

/* TM-02: the browser's PushSubscription arrives here (sub.toJSON()).
   Extra unknown properties are stripped — only what the push service needs
   is ever stored. Duplicates overwrite to the same key, so the map is
   deduplicated by construction. */
app.post('/api/subscribe', (req, res) => {
  if (!rateLimit('subscribe', req, res)) return fail(res, 429, 'درخواست‌های زیاد؛ کمی بعد دوباره تلاش کنید');
  const body = req.body;
  if (!validSubscription(body)) {
    return fail(res, 400, 'endpoint یا keys نامعتبر است');
  }
  const clean = { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth }, savedAt: Date.now() };
  subscriptions.set(clean.endpoint, clean);
  persistStore();
  res.json({ ok: true, count: subscriptions.size });
});

app.post('/api/unsubscribe', (req, res) => {
  if (!rateLimit('unsubscribe', req, res)) return fail(res, 429, 'درخواست‌های زیاد؛ کمی بعد دوباره تلاش کنید');
  const { endpoint } = req.body || {};
  if (!isHttpsUrl(endpoint)) {
    return fail(res, 400, 'endpoint نامعتبر است');
  }
  subscriptions.delete(endpoint);
  persistStore();
  res.json({ ok: true, count: subscriptions.size });
});

/* ── Dispatch ──
   One failing endpoint never blocks the rest of the batch; 404/410 drop
   the dead subscription immediately so it is never retried. */
async function sendToAll(payload) {
  const results = { sent: 0, removed: 0, failed: 0 };
  const dead = [];

  await Promise.all([...subscriptions.values()].map(async sub => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      results.sent++;
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        dead.push(sub.endpoint);           // TM-05: subscription expired/unsubscribed
        results.removed++;
      } else {
        results.failed++;
        /* Category + redacted endpoint hash + status only — no message body,
           no subscription material. */
        console.error(`[push-server] ارسال ناموفق: status=${statusCode || 'none'} endpoint=${epHash(sub.endpoint)} category=${(err && err.name) || 'UnknownError'}`);
      }
    }
  }));

  if (dead.length) {
    for (const endpoint of dead) subscriptions.delete(endpoint);
    persistStore();
  }
  return results;
}

/* Persian, RTL notification payload — matches the SW push handler. */
function reminderPayload(task) {
  const isOverdue = task.overdue;
  return {
    title: isOverdue ? 'دَفتَرچه — یه کار از موعدش گذشت!' : 'دَفتَرچه — یادآوری کار',
    body: isOverdue
      ? `مهلت «${task.text}» گذشته!`
      : `مهلت «${task.text}» رسید!`,
    /* Relative to the app, not to the origin: the client resolves these
       against its own base, so they stay right under a project subpath. */
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/icon-192.png',
    tag: `task-due-${task.id}`,
    dir: 'rtl',
    lang: 'fa',
    data: { url: '/', taskId: task.id, action: 'open-tasks' },
  };
}

function sanitizeTask(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
  if (typeof t.id !== 'string' || !t.id || t.id.length > 64) return null;
  if (typeof t.text !== 'string' || !t.text || t.text.length > MAX_TEXT) return null;
  if (typeof t.dueDate !== 'string' || !DATE_RE.test(t.dueDate)) return null;
  if (typeof t.done !== 'boolean') return null;
  return { id: t.id, text: t.text, dueDate: t.dueDate, done: t.done };
}

/* ── CRON dedup window ──
   A misbehaving or overlapping CRON must not turn into notification spam:
   the same due-task set inside this window is answered once and skipped
   after. Local (per-process), deliberately simple. */
const DEDUP_WINDOW_MS = 10 * 60_000;
let lastBatchFingerprint = null;
let lastBatchAt = 0;

/* Manual / CRON trigger. Accepts the task list inline (bounded), or fetches
   it from TASKS_URL when the app exposes one; without either it no-ops. */
app.post('/api/send-due-reminders', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!rateLimit('send-due-reminders', req, res)) return fail(res, 429, 'درخواست‌های زیاد؛ کمی بعد دوباره تلاش کنید');
  try {
    let rawTasks = Array.isArray(req.body && req.body.tasks) ? req.body.tasks : null;

    if (!rawTasks && process.env.TASKS_URL) {
      const r = await fetch(process.env.TASKS_URL);
      const j = await r.json();
      rawTasks = Array.isArray(j) ? j : (Array.isArray(j && j.tasks) ? j.tasks : null);
    }
    if (!rawTasks) {
      return fail(res, 400, 'tasks الزامی است (یا TASKS_URL را تنظیم کنید)');
    }
    if (rawTasks.length > MAX_TASKS) {
      return fail(res, 413, 'تعداد کارها بیش از حد مجاز است');
    }

    const tasks = rawTasks.map(sanitizeTask).filter(Boolean);

    const today = new Date();
    const dayKey = d =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStr = dayKey(today);

    const due = tasks.filter(t =>
      !t.done && (t.dueDate === todayStr || t.dueDate < todayStr)
    );

    /* Dedup: identical due-sets inside the window are skipped silently. */
    const fingerprint = crypto.createHash('sha256')
      .update(JSON.stringify(due.map(t => t.id).sort())).digest('hex');
    const now = Date.now();
    if (due.length && fingerprint === lastBatchFingerprint && now - lastBatchAt < DEDUP_WINDOW_MS) {
      return res.json({ ok: true, skipped: 'duplicate-batch', dueCount: due.length, subscribers: subscriptions.size });
    }
    if (due.length) { lastBatchFingerprint = fingerprint; lastBatchAt = now; }

    let sent = 0, removed = 0, failed = 0;
    for (const t of due) {
      const r = await sendToAll(reminderPayload({ ...t, overdue: t.dueDate < todayStr }));
      sent += r.sent; removed += r.removed; failed += r.failed;
    }
    res.json({ ok: true, dueCount: due.length, sent, removed, failed, subscribers: subscriptions.size });
  } catch (err) {
    /* Structured, minimal — no stack trace ever leaves the process. */
    console.error('[push-server] send-due-reminders ناموفق:', (err && err.name) || 'Error');
    fail(res, 500, 'خطای داخلی');
  }
});

/* One-shot test push to every subscriber (TM-03 / TM-04).
   Admin-only, and off entirely in production unless explicitly enabled. */
const ENABLE_TEST_PUSH = process.env.ENABLE_TEST_PUSH
  ? process.env.ENABLE_TEST_PUSH !== 'false'
  : NODE_ENV !== 'production';

app.post('/api/test-push', async (req, res) => {
  if (!ENABLE_TEST_PUSH) return fail(res, 404, 'یافت نشد');
  if (!requireAdmin(req, res)) return;
  if (!rateLimit('test-push', req, res)) return fail(res, 429, 'درخواست‌های زیاد؛ کمی بعد دوباره تلاش کنید');
  const r = await sendToAll({
    title: 'دَفتَرچه',
    body: 'این یک اعلان آزمایشی است — پوش فعال است! 🎉',
    tag: 'test-push',
    data: { url: '/' },
  });
  res.json({ ok: true, ...r });
});

/* JSON body parse errors and anything unhandled come back structured —
   never as an HTML stack page and never with internal details. */
app.use((err, _req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') return fail(res, 400, 'JSON نامعتبر است');
  if (err && err.type === 'entity.too.large') return fail(res, 413, 'حجم درخواست بیش از حد مجاز است');
  console.error('[push-server] خطای پردازش:', (err && err.name) || 'Error');
  fail(res, 500, 'خطای داخلی');
});

app.listen(PORT, () => {
  console.log(`[push-server] روی پورت ${PORT} گوش می‌دهد — ${subscriptions.size} اشتراک فعال — env=${NODE_ENV} test-push=${ENABLE_TEST_PUSH ? 'on' : 'off'}`);
});
