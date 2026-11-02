-- 0002: cache the open-flag count beside the cached status. Both are written only by
-- recompute_status(), so the list page doesn't recompute flags per row.
ALTER TABLE shipments ADD COLUMN open_flag_count INTEGER NOT NULL DEFAULT 0;
