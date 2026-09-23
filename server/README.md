# سرور پوش دَفتَرچه

بک‌اند Web Push برای ارسال یادآوری‌های موعد کارها حتی وقتی اپ کاملاً بسته است (شامل PWA نصب‌شده در iOS/iPadOS 16.4+).

> زیرساخت موکول: در انتشار فعلی دَفتَرچه، کلاینت اشتراک Push نمی‌سازد و سیستم اعلان رسمی، یادآور محلی درون اپ است. این سرور اختیاری است و تا فعال شدن واقعی Web Push، سرو نمی‌شود.

## راه‌اندازی (یک‌بار)

```bash
cd server
npm install
npm run keys          # یک جفت کلید VAPID می‌سازد
```

خروجی `npm run keys` دو رشته است:

- `publicKey` → به کلاینت می‌رسد (داخل `/api/vapid-public-key` سرو می‌شود)
- `privateKey` → **فقط** روی سرور در environment variable می‌ماند

ساخت کلید مدیریتی (برای endpointهای عملیاتی):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## اجرا

```bash
# لینوکس / مک
VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... ADMIN_API_KEY=... \
ALLOWED_ORIGIN=https://your-domain.example NODE_ENV=production npm start

# ویندوز (PowerShell)
$env:VAPID_PUBLIC_KEY="..."; $env:VAPID_PRIVATE_KEY="..."; $env:ADMIN_API_KEY="..."; npm start
```

## متغیرهای محیطی

| متغیر | لازم؟ | توضیح |
|---|---|---|
| `VAPID_PUBLIC_KEY` | بله | کلید عمومی VAPID — از API عمومی سرو می‌شود |
| `VAPID_PRIVATE_KEY` | بله | کلید خصوصی — هرگز در کلاینت، گیت یا لاگ قرار نمی‌گیرد |
| `ADMIN_API_KEY` | بله | کلید احراز endpointهای عملیاتی (حداقل ۱۶ کاراکتر). بدون آن سرور بالا نمی‌آید |
| `ALLOWED_ORIGIN` | بله در production | origin صریح PWA (مثلاً `https://app.example`). در production نبودنش خطای راه‌اندازی است |
| `ADMIN_API_KEY` | — | مقدارش هرگز لاگ نمی‌شود |
| `NODE_ENV` | خیر | `production` → CORS اجباری، test-push پیش‌فرض خاموش |
| `ENABLE_TEST_PUSH` | خیر | `true`/`false` — در production پیش‌فرض خاموش است |
| `PORT` | خیر | پیش‌فرض ۳۱۰۰ |
| `VAPID_CONTACT` | خیر | `mailto:` تماس برای push service |
| `TASKS_URL` | خیر | اگر لیست کارها از API می‌آید، آدرس آن برای کران |

## امنیت

- **احراز عملیاتی:** `POST /api/send-due-reminders` و `POST /api/test-push` هدر `Authorization: Bearer <ADMIN_API_KEY>` می‌خواهند؛ مقایسه در زمان ثابت انجام می‌شود.
- **CORS:** فقط `ALLOWED_ORIGIN` اعلام‌شده پاس می‌گیرد؛ origin ناشناخته هیچ هدر CORS ندارد. در production مقدار `*` پذیرفته نیست.
- **Rate limit:** هر IP و هر endpoint سقف دارد (اشتراک/لغو ۳۰ در دقیقه، کران ۴ در دقیقه، تست ۲ در دقیقه) با هدرهای `X-RateLimit-*` و `Retry-After`.
- **اعتبارسنجی:** endpoint فقط HTTPS؛ طول فیلدها محدود؛ بستهٔ کارها حداکثر ۵۰۰ آیتم؛ بدنهٔ درخواست حداکثر ۱۶KB.
- **لاگ:** هیچ کلید خصوصی، توکن، `keys.auth`/`keys.p256dh` یا آبجکت کامل اشتراک لاگ نمی‌شود. endpointها فقط با هش یک‌طرفهٔ کوتاه ظاهر می‌شوند.
- **خطاها:** پاسخ همیشه `{ "error": "..." }` ساختاریافته است — بدون stack trace و مسیر فایل.
- **ذخیره‌سازی:** نوشتن `subscriptions.json` اتمی است (فایل موقت + rename) و از Promise chain رد می‌شود؛ فایل خراب هنگام بوت قرنطینه (`*.corrupt-...`) و سرور تمیز بالا می‌آید.

## Endpointها

| Endpoint | دسترسی | توضیح |
|---|---|---|
| `GET /api/vapid-public-key` | عمومی | کلید عمومی (ذاتاً غیرمحرمانه) |
| `POST /api/subscribe` | عمومی | ثبت اشتراک مرورگر؛ اعتبارسنجی سخت، فیلدهای اضافی حذف می‌شوند |
| `POST /api/unsubscribe` | عمومی | حذف اشتراک با endpoint |
| `POST /api/send-due-reminders` | Bearer | تریگر CRON |
| `POST /api/test-push` | Bearer + `ENABLE_TEST_PUSH` | اعلان آزمایشی؛ در production پیش‌فرض ۴۰۴ |

## CRON یادآوری‌ها

هر چند دقیقه یک‌بار:

```bash
curl -X POST https://your-server/api/send-due-reminders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{"tasks":[{"id":"1","text":"خرید نان","dueDate":"2026-09-17","done":false}]}'
```

سرور کارهای امروز/عقب‌افتاده را فیلتر و برای همهٔ دستگاه‌های مشترک push می‌فرستد. یک ایمنی ضد-spam هم دارد: اگر همان مجموعهٔ کارهای سررسیددار داخل پنجرهٔ ۱۰ دقیقه‌ای دوباره بیاید، batch تکراری رد می‌شود (`skipped: duplicate-batch`).

## تست

فقط در حالت development یا با `ENABLE_TEST_PUSH=true`:

```bash
curl -X POST https://your-server/api/test-push \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

## استقرار

- همان origin سرو PWA ساده‌ترین حالت است (کلاینت `SERVER = '/'` فرض می‌کند).
- اگر جدا است، در `js/push-service.js` مقدار `SERVER` را به آدرس سرور تغییر دهید.
- فایل `subscriptions.json` را در بکاپ‌ها نگه دارید — دستگاه‌های مشترک کاربران آنجاست. نوشتنش اتمی است ولی خودتان هم دوره‌ای از آن بکاپ بگیرید.
- کلید خصوصی VAPID و `ADMIN_API_KEY` هرگز در گیت، کلاینت یا لاگ قرار نمی‌گیرند؛ فقط از environment تزریق می‌شوند.
