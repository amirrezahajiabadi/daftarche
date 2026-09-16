/* ═══ دَفتَرچه — Web Push Server ═══
   Lightweight Node.js backend that stores Web Push subscriptions and
   dispatches due-date reminders with VAPID authentication, so notifications
   arrive even when the PWA is fully closed (including iOS 16.4+ standalone).

   ── Setup ──
   1) npm install            (inside server/)
   2) Generate VAPID keys once — the private key NEVER leaves the server:
        npm run keys
   3) Put them in environment variables (never in source control):
        Windows (PowerShell):  $env:VAPID_PUBLIC_KEY="..."; $env:VAPID_PRIVATE_KEY="..."
        Linux/macOS:           VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... node push-server.js
   4) Start:  npm start        (listens on PORT, default 3100)
   5) Serve the PWA from the same origin as this server, or set ALLOWED_ORIGIN
      to the PWA's origin for CORS.

   ── Endpoints ──
   GET  /api/vapid-public-key   → { publicKey }
   POST /api/subscribe          → body: full PushSubscription JSON
   POST /api/unsubscribe        → body: { endpoint }
   POST /api/send-due-reminders → body: { tasks: [{ id, text, dueDate, done }] }
                                  (or a scheduled call with no body reads TASKS_URL)

   Send failures are isolated: a 404/410 Gone drops the dead subscription,
   any other error is logged and the batch continues. */

const express = require('express');
const webpush = require('web-push');

const PORT = process.env.PORT || 3100;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const CONTACT = process.env.VAPID_CONTACT || 'mailto:admin@daftarche.app';

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
   In-memory by design for a single-instance deployment; persisted to
   subscriptions.json so restarts do not orphan devices. */
const fs = require('fs');
const path = require('path');
const STORE_FILE = path.join(__dirname, 'subscriptions.json');

let subscriptions = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  for (const s of Array.isArray(raw) ? raw : []) {
    if (s && s.endpoint && s.keys) subscriptions.set(s.endpoint, s);
  }
  console.log(`[push-server] ${subscriptions.size} اشتراک از دیسک بازیابی شد.`);
} catch { /* first boot or unreadable file — start clean */ }

function persistStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify([...subscriptions.values()], null, 2));
  } catch (err) {
    console.error('[push-server] ذخیرهٔ فروشگاه اشتراک‌ها ناموفق بود:', err.message);
  }
}

/* ── App ── */
const app = express();
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* TM-01: the client needs the public key to subscribe. */
app.get('/api/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

function validSubscription(body) {
  return !!body
    && typeof body.endpoint === 'string' && body.endpoint.startsWith('http')
    && !!body.keys
    && typeof body.keys.p256dh === 'string'
    && typeof body.keys.auth === 'string';
}

/* TM-02: the browser's PushSubscription arrives here (sub.toJSON()). */
app.post('/api/subscribe', (req, res) => {
  const sub = req.body;
  if (!validSubscription(sub)) {
    return res.status(400).json({ error: 'endpoint و keys الزامی هستند' });
  }
  subscriptions.set(sub.endpoint, sub);
  persistStore();
  res.json({ ok: true, count: subscriptions.size });
});

app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'endpoint الزامی است' });
  }
  subscriptions.delete(endpoint);
  persistStore();
  res.json({ ok: true, count: subscriptions.size });
});

/* ── Dispatch ──
   One failing endpoint never blocks the rest of the batch. */
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
        console.error(`[push-server] ارسال ناموفق (${statusCode || 'بدون کد'}):`, err.message);
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
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    tag: `task-due-${task.id}`,
    dir: 'rtl',
    lang: 'fa',
    data: { url: '/', taskId: task.id, action: 'open-tasks' },
  };
}

/* Manual / CRON trigger. Accepts the task list inline, or fetches it from
   TASKS_URL when the app exposes one; without either it no-ops safely. */
app.post('/api/send-due-reminders', async (req, res) => {
  try {
    let tasks = Array.isArray(req.body && req.body.tasks) ? req.body.tasks : null;

    if (!tasks && process.env.TASKS_URL) {
      const r = await fetch(process.env.TASKS_URL);
      tasks = await r.json();
    }
    if (!tasks) {
      return res.status(400).json({ error: 'tasks الزامی است (یا TASKS_URL را تنظیم کنید)' });
    }

    const today = new Date();
    const dayKey = d =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStr = dayKey(today);

    const due = tasks.filter(t =>
      t && !t.done && t.dueDate && (t.dueDate === todayStr || t.dueDate < todayStr)
    );

    let sent = 0, removed = 0, failed = 0;
    for (const t of due) {
      const r = await sendToAll(reminderPayload({ ...t, overdue: t.dueDate < todayStr }));
      sent += r.sent; removed += r.removed; failed += r.failed;
    }
    res.json({ ok: true, dueCount: due.length, sent, removed, failed, subscribers: subscriptions.size });
  } catch (err) {
    console.error('[push-server] send-due-reminders ناموفق:', err);
    res.status(500).json({ error: 'خطای داخلی' });
  }
});

/* One-shot test push to every subscriber (TM-03 / TM-04). */
app.post('/api/test-push', async (_req, res) => {
  const r = await sendToAll({
    title: 'دَفتَرچه',
    body: 'این یک اعلان آزمایشی است — پوش فعال است! 🎉',
    tag: 'test-push',
    data: { url: '/' },
  });
  res.json({ ok: true, ...r });
});

app.listen(PORT, () => {
  console.log(`[push-server] روی پورت ${PORT} گوش می‌دهد — ${subscriptions.size} اشتراک فعال.`);
});
