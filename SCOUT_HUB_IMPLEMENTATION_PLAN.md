# SCOUT HUB — Phased Implementation Plan & Execution Checklist
**خطة التنفيذ التفصيلية لمنصة كشافة هب**

---

## Phase Status Summary

- [x] **Phase 0 — Project Assessment & Architecture Blueprint**
  - [x] Assess workspace and environment requirements
  - [x] Create comprehensive architecture blueprint (`SCOUT_HUB_ARCHITECTURE.md`)
  - [x] Create implementation roadmap (`SCOUT_HUB_IMPLEMENTATION_PLAN.md`)
  - [x] Design relational PostgreSQL schema (`SCOUT_HUB_DATABASE.md`)
  - [x] Define security & RLS model (`SCOUT_HUB_SECURITY.md`)

- [ ] **Phase 1 — Foundation & Scout Design System**
  - [ ] Initialize Next.js 14+ App Router with TypeScript strict mode
  - [ ] Configure Tailwind CSS with the Scout Adventure Palette:
    - Forest Green (`#173C32`), Emerald (`#23836B`), Warm Sand (`#F5EBD8`), Soft Cream (`#FCF9F2`), Adventure Orange (`#E89B50`), Charcoal (`#24342E`)
  - [ ] Set up Cairo & Tajawal Arabic typography, full RTL layout support
  - [ ] Install essential icon set (`lucide-react`) and utility packages (`clsx`, `tailwind-merge`, `canvas-confetti`)
  - [ ] Build shared mobile-first UI components (Button, Card, Badge, Modal/Drawer, Tabs, Input, LoadingSkeleton)
  - [ ] Build high-converting, adventure-themed Public Landing Page with clear value propositions and CTA
  - [ ] Configure PWA manifest (`manifest.json` / `manifest.ts`), icons, and theme configuration

- [ ] **Phase 2 — Supabase PostgreSQL Schema, RLS & Authentication**
  - [ ] Write SQL schema migration file with all normalized tables:
    - `profiles`, `user_roles`, `stages`, `team_distributions`, `team_distribution_versions`, `teams`, `team_memberships`, `friday_sessions`, `weekly_responses`, `attendance_records`, `qr_credentials`, `achievement_definitions`, `member_achievements`, `audit_logs`, `app_settings`
  - [ ] Write Row Level Security (RLS) policies for all tables
  - [ ] Implement Supabase client libraries (browser client, server-action client, service-role admin client)
  - [ ] Build secure Member Registration with scout stage, commitment preference, and validation
  - [ ] Implement login, session persistence, role-aware routing, and first-admin bootstrap mechanism
  - [ ] Provide mock/fallback provider mode for local offline developer testing when remote credentials are unset

- [ ] **Phase 3 — Member Experience & Digital Scout ID Card**
  - [ ] Member Dashboard: Personal welcome greeting, stage badge, next Friday status, assigned team teaser
  - [ ] Weekly Participation Response: 3 options with live counter, window check, and persistence
  - [ ] Digital Scout ID Card:
    - Member name, Scout stage, Serial ID, Team name (if published), Badges
    - Dynamic QR code generation utilizing unpredictable bearer token
    - Flip animation / Scout badge design with high-contrast borders
    - Print-friendly layout for physical plastic/paper card batch printing
    - Token rotation/revocation action

- [ ] **Phase 4 — Team Distribution Engine & Publishing Workflow**
  - [ ] Implement fair, deterministic, seeded team distribution algorithm:
    - **Mode A (Mixed Stages)**: Balances team size, stage proportions (Stage 1/2/3), and commitment preferences
    - **Mode B (Separated Stages)**: Independent sub-distributions per stage with individual team counts
  - [ ] Step-by-step distribution builder wizard (Choose members -> Select mode -> Configure team counts/names -> Seeded generation)
  - [ ] Draft preview & mobile-friendly manual member move/swap dialogs
  - [ ] Versioned atomic publishing workflow (Draft -> Published -> Archived)
  - [ ] Real-time member team reveal screen with celebratory confetti animation and privacy-guarded teammate list

- [ ] **Phase 5 — Friday Meetings & Fast Mobile QR Attendance Scanner**
  - [ ] Friday Session Creator: Date, time, lateness threshold (e.g. 15 mins post-start), open/close state
  - [ ] Mobile-Optimized QR Scanner:
    - Camera access with back-camera preference (`facingMode: "environment"`)
    - High-visibility scanning target frame, low-light flashlight toggle
    - Live QR token lookup against server
    - Member preview card (Name, Photo placeholder, Stage, Team)
    - Fast Uniform toggle (بالزي / بدون الزي)
    - Authoritative server timestamp (On-time vs Late)
    - Anti-duplicate scan safeguard with instantaneous visual/haptic feedback
  - [ ] Manual Attendance Fallback: Search by name or member ID with audit trail
  - [ ] Attendance editing with reason logging for authorized administrators

- [ ] **Phase 6 — Analytics, Gamification & Data Exports**
  - [ ] Admin Analytics Dashboard: KPIs, stage distributions, weekly attendance rate, uniform compliance rate
  - [ ] Scout Gamification Badges: "أول حضور", "3 جمع متتالية", "ملتزم بالزي", "حضور مبكر", "عضو نشيط"
  - [ ] Team points tally and leaderboard
  - [ ] Export engine: CSV and Excel-compatible reports with proper Arabic UTF-8 BOM encoding for members, rosters, and sessions

- [ ] **Phase 7 — Verification, Testing, Seed Data & Production Readiness**
  - [ ] Unit & algorithm tests for Team Distribution Engine (edge cases: uneven counts, single member, zero members in stage)
  - [ ] Security and RLS verification tests
  - [ ] Development seed script with 60 realistic Arabic scout members across all 3 stages
  - [ ] Production build (`npm run build`) verification and zero-error TypeScript validation
  - [ ] Deployment guides (`SCOUT_HUB_DEPLOYMENT.md`, `SCOUT_HUB_TEST_REPORT.md`)
