# AGENTS.md — قواعد ثابت پروژهٔ دَفتَرچه

این فایل برای هر انسان یا عاملی است که در این ریپو ویرایش می‌کند. جزئیات کامل در `README.md` است؛ اینجا فقط قواعدی آمده که نباید شکسته شوند.

## نسخه و انتشار
- **تنها محل نوشتن شماره نسخه: `js/version.js`** (`DAFTARCHE_RELEASE` و `DAFTARCHE_BUILD`).
- هر تغییری در فایل‌های پوسته (`index.html`، `manifest.webmanifest`، `css/`، `js/`، فونت/آیکون/شخصیت‌ها) → `BUILD` جلو برود.
- هر انتشار → `RELEASE` جلو برود + ورودی در `js/changelog.js` + بخش در `CHANGELOG.md`.
- فایل جدید در `css/` یا `js/` → حتماً به فهرست `SHELL` در `sw.js` اضافه شود، وگرنه آفلاین بالا نمی‌آید.
- پیش از انتشار: `node --test` سبز باشد.

## پایان خط
- همهٔ فایل‌های متنی **LF** هستند (`.gitattributes`). با ویرایشگر CRLF نساز.

## فارسی و راست‌چین
- روی متن فارسی `letter-spacing` و `text-transform: uppercase` نگذار.
- فقط خصوصیت‌های منطقی: `inline-start/inline-end`، نه `left/right` (در margin، padding، text-align و موقعیت).
- فیلدهای تایپی روی iOS دست‌کم ۱۶px (قاعدهٔ `@supports (-webkit-touch-callout: none)` در `css/base.css`).
- ارقام فارسی با `js/utils.js`، تقویم شمسی با `js/jalali.js`، هفته از شنبه.
- رنگ فقط از توکن‌های `--color-*` می‌آید؛ هیچ hex تازه‌ای داخل کامپوننت‌ها نه.

## داده و امنیت
- متن کاربر هرگز بدون `textContent` یا `esc()` (از `js/utils.js`) داخل `innerHTML` نرود.
- نوشتن در `localStorage` از طریق `js/store.js` انجام شود، نه مستقیم.
- کلیدهای VAPID و `ADMIN_API_KEY` فقط از محیط سرور می‌آیند؛ هرگز در ریپو.
