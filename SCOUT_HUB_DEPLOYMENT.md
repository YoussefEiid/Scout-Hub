# SCOUT HUB — Production Deployment & Operations Guide
**دليل النشر والتشغيل الميداني المعتمد لمنصة كشافة هب**

---

## 1. نظرة عامة على البنية التحتية
- **Web & API Tier**: Next.js 16 App Router (Node.js runtime, Server Actions, Turbopack, PWA).
- **Edge Routing & Proxy**: Next.js 16 Proxy (`src/proxy.ts`) with zero-trust session validation.
- **Database & Auth Tier**: Supabase (PostgreSQL 15+, Supabase Auth, Row Level Security, SECURITY DEFINER RPC functions with locked `search_path = public`).
- **PWA Tier**: Installable mobile manifest (`/manifest.webmanifest`), offline fallback UI, RTL Arabic mobile-first design.

---

## 2. متغيرات البيئة للإنتاج (.env.production / Vercel Secrets)

| المتغير | الحساسية | الوصف | القيمة النموذجية |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | عام | رابط مشروع Supabase | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | عام | مفتاح Anon العام للعميل والمصادقة المبدئية | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **سري للغاية** | مفتاح خادم الخدمة فقط لإنشاء المستخدمين وحركات التعويض | `eyJhbGciOi...` |
| `SCOUT_DEMO_MODE` | عام | وضع العرض التجريبي (معطل جبريًا في الإنتاج `NODE_ENV=production`) | `false` |
| `NEXT_PUBLIC_APP_URL` | عام | النطاق الرسمي للتطبيق | `https://scouthub.app` |
| `DEFAULT_TIMEZONE` | عام | المنطقة الزمنية الرسمية لجلسات الجمعة | `Africa/Cairo` |

> [!CAUTION]
> **مفتاح الخدمة (SUPABASE_SERVICE_ROLE_KEY)**: لا يتم استدعاؤه مطلقًا في واجهات العميل أو متصفح الكشاف. يتم عزله حصريًا داخل `src/lib/supabase/admin.ts` لأداء العمليات الإدارية الحرجة وحركات التعويض (Compensating Transactions) أثناء التسجيل.

---

## 3. تطبيق ترحيلات قاعدة البيانات (Database Migrations)

يجب تطبيق ملفات الترحيل بالترتيب التالي على مشروع Supabase:

1. **`supabase/migrations/001_initial_schema.sql`**:
   - ينشئ الجداول الـ 15 الأساسية، القيود الفريدة، والفهارس.
   - يعتمد دالة `gen_random_uuid()` القياسية لنواة PostgreSQL.

2. **`supabase/migrations/002_production_hardening.sql`**:
   - تثبيت `search_path = public` على كافة دوال `SECURITY DEFINER`.
   - قفل النشر التنافسي للفرق عبر `pg_advisory_xact_lock`.
   - القيد الفريد الجزئي `uq_one_current_published` لضمان نسخة واحدة منشورة فقط في أي لحظة.
   - تسجيل الحضور اللحظي بتوقيت خادم القاهرة ومنع التكرار نهائيًا `(session_id, member_id)`.
   - حماية رموز QR وحجبها عن واجهات الاستعلام وسجلات التدقيق `audit_logs`.

---

## 4. تهيئة الحساب الإداري الأول (Super Admin Bootstrap)

بعد تطبيق الترحيلات:
1. قم بإنشاء حسابك عبر صفحة التسجيل `/register`.
2. ادخل إلى **SQL Editor** في لوحة تحكم Supabase وقم بترقية الحساب:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'super_admin'
   FROM public.profiles
   WHERE member_number = 'SCT-2026-0001'
   ON CONFLICT (user_id, role) DO NOTHING;
   ```
3. بمجرد الترقية، يصبح بإمكان السوبر أدمن تعيين قادة الحضور وتوزيع الفرق وإدارتها من واجهة `/admin`.

---

## 5. تشغيل فحوصات التكامل والجاهزية للإنتاج

قبل فتح المنصة للأعضاء، قم بتشغيل حزم الاختبارات الآلية:

```bash
# 1. اختبار دوال وسياسات قاعدة البيانات في بيئة معزولة
npx tsx --test tests/db/migrations.pglite.test.ts

# 2. اختبار المنطق الحسابي وأمان رموز QR وتوزيع الفرق
npm test

# 3. اختبار خلو الواجهات من تسريب مفاتيح الخدمة وإزالة التجاوزات
npx tsx --test tests/security/static-guards.test.ts

# 4. اختبار التكامل الحي مع Supabase (عند توفر المتغيرات)
npx tsx --test tests/integration/supabase.live.test.ts

# 5. الفحص البرمجي الكامل (0 أخطاء و 0 تحذيرات)
npm run lint

# 6. بناء حزمة الإنتاج الرسمية
npm run build
```

---

## 6. إجراءات الطوارئ والنسخ الاحتياطي

- تفعيل النسخ الاحتياطي اليومي الآلي في Supabase.
- تصدير نسخة احتياطية فورية قبل أي معسكر كبير:
  ```bash
  pg_dump -h db.your-project.supabase.co -U postgres -d postgres -F c -b -v -f scout_hub_production_backup.dump
  ```
