# سرور پوش دَفتَرچه

## راه‌اندازی (یک‌بار)

```bash
cd server
npm install
npm run keys          # یک جفت کلید VAPID می‌سازد
```

خروجی `npm run keys` دو رشته است:

- `publicKey` → به کلاینت می‌رسد (داخل `/api/vapid-public-key` سرو می‌شود)
- `privateKey` → **فقط** روی سرور در environment variable می‌ماند

## اجرا

```bash
# لینوکس / مک
VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... npm start

# ویندوز (PowerShell)
$env:VAPID_PUBLIC_KEY="..."; $env:VAPID_PRIVATE_KEY="..."; npm start
```

متغیرهای محیطی:

| متغیر | لازم؟ | توضیح |
|---|---|---|
| `VAPID_PUBLIC_KEY` | بله | کلید عمومی VAPID |
| `VAPID_PRIVATE_KEY` | بله | کلید خصوصی — هرگز در کلاینت یا گیت قرار نگیرد |
| `PORT` | خیر | پیش‌فرض ۳۱۰۰ |
| `ALLOWED_ORIGIN` | خیر | اگر PWA روی دامنهٔ دیگری است، origin آن را ست کنید |
| `VAPID_CONTACT` | خیر | `mailto:` تماس برای push service |
| `TASKS_URL` | خیر | اگر لیست کارها از API می‌آید، آدرس آن برای کران |

## CRON یادآوری‌ها

هر چند دقیقه یک‌بار:

```bash
curl -X POST https://your-server/api/send-due-reminders \
  -H "Content-Type: application/json" \
  -d '{"tasks":[{"id":"1","text":"خرید نان","dueDate":"2026-09-17","done":false}]}'
```

سرور خودش کارهای امروز/عقب‌افتاده را فیلتر و برای همهٔ دستگاه‌های مشترک push می‌فرستد.

## تست

```bash
curl -X POST https://your-server/api/test-push
```

## استقرار

- همان origin سرو PWA ساده‌ترین حالت است (کلاینت `SERVER = '/'` فرض می‌کند).
- اگر جدا است، در `js/push-service.js` مقدار `SERVER` را به آدرس سرور تغییر دهید.
- فایل `subscriptions.json` را در بکاپ‌ها نگه دارید — دستگاه‌های مشترک کاربران آنجاست.
- کلید خصوصی VAPID هرگز در گیت، کلاینت یا لاگ قرار نمی‌گیرد.
