-- 0003: the product is now Veridoc. Move the seeded demo accounts to the new domain in place,
-- so their shipments, edits and audit rows stay attached to the same user ids.
-- (No percent signs, even in comments: the runner sends this through psycopg as a template.)
UPDATE users SET email = split_part(email, '@', 1) || '@veridoc.demo'
WHERE split_part(email, '@', 2) = 'crosscheck.demo';
