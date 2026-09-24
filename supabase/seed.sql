-- Supabase seed (port of server/prisma/seed.js)
-- Reference data only: communities, categories, and a demo event. No demo
-- user accounts are seeded.
--
-- Idempotent: communities/categories/event upsert on their keys.

-- Communities
INSERT INTO "Community" (id, name, code, description, "createdAt", "updatedAt")
VALUES
  ('com-campus', 'University Campus', 'campus', 'Colleges, libraries and student facilities', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('com-office', 'TechCorp Office', 'office', 'Company building and office blocks', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('com-city', 'City Fest 2026', 'city', 'Public event venues and festival grounds', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Categories
INSERT INTO "Category" (id, name, "createdAt")
SELECT 'cat-' || name, name, CURRENT_TIMESTAMP
FROM unnest(ARRAY['Electronics','Wallets','Keys','Clothing','Bags','Books','Accessories','Documents','Others']) AS name
ON CONFLICT (name) DO NOTHING;

-- Reference event
INSERT INTO "Event" (id, name, venue, location, "startDate", "endDate", "qrCode", "createdAt")
VALUES ('event-college-fest-2026', 'College Fest 2026', 'Main Campus', 'University Ground',
        '2026-03-15T00:00:00', '2026-03-17T00:00:00', '/event/college-fest-2026', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;