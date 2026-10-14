-- ============================================================================
-- MIGRATION 017: Guard tasks.comments against inline media / oversized payloads
--
-- Incident: proof photos/PDFs were stored as base64 inside tasks.comments (JSONB).
-- 9 tasks weighed 6-10 MB each (~40 MB total), `SELECT * FROM tasks` exceeded the
-- API statement timeout and the Task Management board rendered as empty.
--
-- Fix (data): scratch/migrate_task_media_to_storage.cjs moved the blobs to the
--             `whatsapp-media` bucket (task-proofs/) and left only URLs behind.
-- Fix (code): src/lib/db.js uploads media to Storage before saving a comment.
-- Fix (here): database refuses to ever accept such a payload again.
--
-- Run ONCE in the Supabase SQL editor (AFTER the data migration has been applied).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_task_comments_payload()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.comments IS NOT NULL AND (
       octet_length(NEW.comments::text) > 262144            -- 256 KB per task is plenty for text + URLs
    OR NEW.comments::text LIKE '%"data:%;base64,%'          -- inline base64 data URL
  ) THEN
    RAISE EXCEPTION
      'tasks.comments rejected: inline base64 or oversized media is not allowed. Upload the file to Storage and save its URL instead.'
      USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_task_comments ON public.tasks;
CREATE TRIGGER trg_guard_task_comments
  BEFORE INSERT OR UPDATE OF comments ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_task_comments_payload();

-- Keep the default board query (ORDER BY created_at DESC) fast as the table grows.
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks (created_at DESC);

-- Verify: should list zero rows once the data migration is done.
-- SELECT id, title, octet_length(comments::text) AS bytes
-- FROM public.tasks
-- WHERE octet_length(comments::text) > 262144 OR comments::text LIKE '%"data:%;base64,%';
