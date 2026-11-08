-- Migration 006: NON-DESTRUCTIVE EMERGENCY ROLLBACK (WRITE FREEZE)
-- This is a safe operational rollback, NOT a schema downgrade to Migration 005.
-- It preserves team_distributions.year_id, all records, RLS and the per-year indexes.
-- It disables team mutations from normal authenticated clients during incident recovery.
-- It does NOT remove data and can be reverted by reapplying the final GRANT statements
-- in Migration 006 after the incident is resolved.
-- IMPORTANT: service_role and database administrators retain privileges; pause backend
-- jobs using those elevated roles separately. Secure a real backup first.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.save_team_distribution_draft(text, text, text, jsonb, uuid)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_team_distribution(uuid)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.move_draft_member(uuid, uuid, uuid)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.swap_draft_members(uuid, uuid, uuid)
  FROM authenticated;

-- Block direct table writes, if such grants were present.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.team_distributions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.teams FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.team_memberships FROM authenticated;

-- Verify no accidental data/schema removal has occurred.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='team_distributions' AND column_name='year_id'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK_HALTED: year_id column missing; manual review required';
  END IF;
END $$;
COMMIT;

-- NOTE: A full schema downgrade to Migration 005 cannot be made lossless merely
-- by dropping year_id and recreating the old unique index. Recover the database
-- from a verified point-in-time backup if full schema rollback is truly required.
-- This script intentionally preserves all post-Migration-006 data and schema.
