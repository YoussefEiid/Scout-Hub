# SCOUT HUB — Production Deployment & Operations Guide
**دليل النشر والتشغيل لمنصة كشافة هب**

---

## 1. Hosting Architecture
- **Web & API Tier**: Vercel (Next.js App Router, Server Actions, Edge/Node Runtime)
- **Database & Auth Tier**: Supabase (PostgreSQL 15+, Supabase Auth, Row Level Security)
- **Static Assets & PWA**: Next.js optimized public bundle with Service Worker caching

---

## 2. Environment Variables Specification
Create a `.env.local` for development and configure the same secrets in Vercel Project Settings:

```ini
# Supabase Public Configuration (Client-side accessible)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase Service Role (Server-side ONLY - NEVER expose to browser)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Initial Admin Bootstrap (Optional auto-elevation on first signup)
INITIAL_SUPER_ADMIN_EMAIL=leader@scouthub.org

# Application Public URL
NEXT_PUBLIC_APP_URL=https://scouthub.vercel.app

# Timezone Default
DEFAULT_TIMEZONE=Africa/Cairo
```

---

## 3. Database Migration Deployment
1. Log into your [Supabase Dashboard](https://supabase.com/dashboard).
2. Create a new project (e.g. `scout-hub-cairo`).
3. Navigate to **SQL Editor**.
4. Paste the complete migration script from `supabase/migrations/001_initial_schema.sql` and run it.
5. Verify that all 15 tables and RLS policies are created successfully.

---

## 4. Bootstrapping the Super Admin
There are two methods to establish your first administrator:
1. **Automated via Env**:
   - Set `INITIAL_SUPER_ADMIN_EMAIL=your-email@example.com` in `.env.local` or Vercel environment variables.
   - Register an account with that email in the registration UI.
   - The onboarding trigger will automatically assign the `super_admin` role.
2. **Direct SQL Elevation**:
   - Register normally through the `/register` page.
   - Run in Supabase SQL editor:
     ```sql
     INSERT INTO user_roles (user_id, role)
     SELECT id, 'super_admin' FROM profiles WHERE full_name = 'اسم القائد'
     ON CONFLICT (user_id, role) DO NOTHING;
     ```

---

## 5. PWA & Mobile Installation Checklist
- [x] Manifest file served at `/manifest.webmanifest`
- [x] Theme color set to Forest Green (`#173C32`)
- [x] Icons provided: 192x192, 512x512 with `maskable` and `any`
- [x] Viewport meta tag configured with `viewport-fit=cover` for iOS notch safe areas
- [x] Tested on iOS Safari ("Add to Home Screen") and Android Chrome ("Install App")

---

## 6. Backup and Recovery
- Enable Supabase automated daily backups.
- For manual backup:
  ```bash
  # Export schema and data via pg_dump
  pg_dump -h db.your-project.supabase.co -U postgres -d postgres -F c -b -v -f scout_hub_backup.dump
  ```
