# SCOUT HUB — Security Architecture, RBAC & Privacy Model
**معمارية الأمان والصلاحيات وحماية خصوصية الكشافة**

---

## 1. Threat Model & Privacy Principles for Scout Minors
Scout organizations frequently handle rosters containing youth and minors. The security architecture adheres to strict privacy-by-design standards:
1. **Zero Raw Identification in QR**: The QR code encodes only a random high-entropy UUID (`qr_credentials.id`). It does **not** contain the scout's name, phone number, email, or internal database primary key.
2. **Contact Information Confidentiality**: Ordinary members cannot query teammate phone numbers, emails, addresses, or private commitment preferences. Teammate views are strictly restricted to: full name, scout stage, avatar, and assigned patrol role.
3. **Server-Authoritative Clock**: Scanned attendance times are determined solely by PostgreSQL server clock (`NOW()`), preventing clock-skew tampering on client devices.
4. **Credential Rotation & Instant Invalidation**: If an ID card is lost, stolen, or photographed by an unauthorized third party, the leader can revoke the credential in one click. Old tokens immediately fail validation.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Permission / Capability | Super Admin | Admin | Attendance Leader | Member | Public/Guest |
|---|:---:|:---:|:---:|:---:|:---:|
| **Register new account** | - | - | - | - | Yes |
| **View landing page** | Yes | Yes | Yes | Yes | Yes |
| **View own profile & Scout ID Card** | Yes | Yes | Yes | Yes | No |
| **Submit Friday RSVP Response** | Yes | Yes | Yes | Yes | No |
| **View published team roster** | Yes | Yes | Yes | Yes | No |
| **View unpublished team drafts** | Yes | Yes | No | No | No |
| **Scan QR / Record Friday attendance** | Yes | Yes | Yes | No | No |
| **Manual attendance entry / correction** | Yes | Yes | With Reason | No | No |
| **Generate & publish teams** | Yes | Yes | No | No | No |
| **Create Friday meetings** | Yes | Yes | No | No | No |
| **Export member CSV / Excel reports** | Yes | Yes | No | No | No |
| **Assign or change user roles** | Yes | No | No | No | No |
| **Access audit logs & system settings** | Yes | Read-only | No | No | No |

---

## 3. PostgreSQL Row Level Security (RLS) Strategy

All tables have RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).

### 3.1 Profiles Table
- **SELECT**:
  - `auth.uid() = id`: Member can read their full personal profile.
  - Leaders/Admins (`user_roles.role IN ('super_admin', 'admin', 'attendance_leader')`): Can read member records.
  - Other Members: Cannot access private contact columns (`phone`, `initial_commitment`).
- **INSERT**:
  - `auth.uid() = id`: Authenticated user can create their initial profile during onboarding.
- **UPDATE**:
  - `auth.uid() = id`: Member can update non-privileged fields (avatar, display name).
  - Admin: Can update stage, active status, etc.

### 3.2 QR Credentials
- **SELECT**:
  - Member can read only their own active credential: `auth.uid() = member_id AND is_active = TRUE`.
  - Authorized scanner (`attendance_leader`, `admin`): Can look up a credential by ID to verify attendance.
- **INSERT / UPDATE**:
  - Only `admin` / `super_admin` can revoke or issue new tokens.

### 3.3 Teams & Team Memberships
- **SELECT**:
  - If distribution is `published`: Authenticated members can view team names and member names in their team.
  - If distribution is `draft`: Visible **only** to `admin` and `super_admin`. Regular members return 0 rows.
- **INSERT / UPDATE / DELETE**:
  - Only `admin` and `super_admin`.

### 3.4 Attendance Records
- **SELECT**:
  - Member can view only their own attendance history (`auth.uid() = member_id`).
  - Leaders/Admins can view all records for their group.
- **INSERT**:
  - Only users with role `attendance_leader`, `admin`, or `super_admin`.

---

## 4. Admin Bootstrapping
To prevent unauthorized privilege escalation:
- The first administrator is bootstrapped via:
  1. A secure migration seed script using a pre-configured admin email, OR
  2. A dedicated server-side environment variable `INITIAL_SUPER_ADMIN_EMAIL` that elevates the first registered account matching that email during initial registration.
- No client-side request can mutate `user_roles` without verifying admin authorization on the server.
