-- Supabase seed (port of server/prisma/seed.js)
-- Demo credentials:
--   Admin: admin@leftbehind.com / admin123
--   User 1: john@example.com / user123
--   User 2: jane@example.com / user123
--
-- Idempotent: users/communities/categories/event upsert on their keys; the demo
-- report/match block only inserts when john has no LOST report yet (same guard as the
-- Prisma seed's `findFirst`).

-- Users (passwordHash precomputed with bcryptjs, cost 10)
INSERT INTO "User" (id, name, email, phone, "passwordHash", role, "createdAt", "updatedAt")
VALUES
  ('usr-admin', 'Admin User', 'admin@leftbehind.com', NULL,
   '$2a$10$.29T50b2jmBlNDqh/zSuqetY..arFFOJ.Drlokn/pctv1JWJCiwRu',
   'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usr-john', 'John Doe', 'john@example.com', '+1234567890',
   '$2a$10$/6kiehbg75em83CsHjfKue0xaW2kEmwyMcUsMt.uGidPjRMUIm8S2',
   'USER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usr-jane', 'Jane Smith', 'jane@example.com', '+0987654321',
   '$2a$10$/6kiehbg75em83CsHjfKue0xaW2kEmwyMcUsMt.uGidPjRMUIm8S2',
   'USER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (email) DO NOTHING;

-- Communities
INSERT INTO "Community" (id, name, code, description, "createdAt", "updatedAt")
VALUES
  ('com-campus', 'University Campus', 'campus', 'Colleges, libraries and student facilities', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('com-office', 'TechCorp Office', 'office', 'Company building and office blocks', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('com-city', 'City Fest 2026', 'city', 'Public event venues and festival grounds', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

UPDATE "User" SET "communityId" = 'com-campus' WHERE email IN ('john@example.com', 'jane@example.com');

-- Categories
INSERT INTO "Category" (id, name, "createdAt")
SELECT 'cat-' || name, name, CURRENT_TIMESTAMP
FROM unnest(ARRAY['Electronics','Wallets','Keys','Clothing','Bags','Books','Accessories','Documents','Others']) AS name
ON CONFLICT (name) DO NOTHING;

-- Demo event
INSERT INTO "Event" (id, name, venue, location, "startDate", "endDate", "qrCode", "createdAt")
VALUES ('event-college-fest-2026', 'College Fest 2026', 'Main Campus', 'University Ground',
        '2026-03-15T00:00:00', '2026-03-17T00:00:00', '/event/college-fest-2026', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- Demo reports, matches, notifications (guarded like the Prisma seed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Report" r JOIN "User" u ON u.id = r."userId"
             WHERE u.email = 'john@example.com' AND r.type = 'LOST') THEN
    RAISE NOTICE 'Demo reports already exist, skipping';
    RETURN;
  END IF;

  INSERT INTO "Item" (id, title, category, description, "privateDetails", "currentLocation", color, brand, model, condition, size, "uniqueFeatures", "imageUrl", "createdAt", "updatedAt")
  VALUES
    ('item-black-wallet-lost', 'Black Leather Wallet', 'Wallets',
     'Black leather wallet with brand logo. Contains debit cards, ID card, and some cash. Has a small scratch on the back.',
     'Blue sticker inside the flap, contains a library card with number LIB-2024-8831, emergency contact photo taped inside',
     NULL, 'Black', NULL, NULL, 'Good', NULL, 'Small scratch on the back', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('item-black-wallet-found', 'Black Wallet', 'Wallets',
     'Found black leather wallet near the library entrance. Contains cards and cash.',
     NULL, 'Security Desk, Main Gate', 'Black', NULL, NULL, 'Good', NULL, 'Small scratch on the back', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('item-iphone-15-pro', 'iPhone 15 Pro', 'Electronics',
     'Space gray iPhone 15 Pro with a blue case. Screen has a tempered glass protector.',
     'Wallpaper is a sunset photo from Manali trip, has a crack near the top left corner, phone case has initials "JD" engraved',
     NULL, 'Space Gray', 'Apple', 'iPhone 15 Pro', 'Used', NULL, 'Crack near top left corner, blue case, tempered glass screen protector', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('item-car-keys', 'Car Keys', 'Keys',
     'Toyota car keys with a keychain that has a small teddy bear attached.',
     NULL, 'Lost & Found Office, Admin Building', NULL, 'Toyota', NULL, NULL, NULL, 'Keychain with a small teddy bear', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('item-blue-backpack', 'Blue Backpack', 'Bags',
     'Navy blue Jansport backpack with laptop compartment. Contains textbooks and a water bottle.',
     'Has a "CS Club" pin on the front strap, laptop sleeve has a sticker of a cat, side pocket has a broken zipper',
     NULL, 'Navy Blue', 'Jansport', NULL, NULL, NULL, '"CS Club" pin on front strap, cat sticker in laptop sleeve, broken zipper on side pocket', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('item-nike-backpack', 'Black Nike Backpack', 'Bags',
     'Black Nike backpack with a red keychain attached to the zipper. Small tear on the left strap.',
     NULL, 'Security Desk, New Library Building', 'Black', 'Nike', NULL, 'Used', NULL, 'Red keychain attached to zipper, small tear on left strap', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "Report" (id, "userId", "itemId", type, location, "dateTime", "eventId", "communityId", status, "createdAt", "updatedAt")
  VALUES
    ('rep-wallet-lost', 'usr-john', 'item-black-wallet-lost', 'LOST', 'Library, 2nd floor',
     '2026-03-10T14:30:00', 'event-college-fest-2026', 'com-campus', 'LOST', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('rep-wallet-found', 'usr-jane', 'item-black-wallet-found', 'FOUND', 'Library entrance',
     '2026-03-10T15:00:00', 'event-college-fest-2026', 'com-campus', 'FOUND', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('rep-iphone-lost', 'usr-john', 'item-iphone-15-pro', 'LOST', 'Cafeteria',
     '2026-03-11T12:00:00', NULL, 'com-campus', 'LOST', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('rep-car-keys-found', 'usr-jane', 'item-car-keys', 'FOUND', 'Parking lot',
     '2026-03-11T16:00:00', NULL, 'com-campus', 'FOUND', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('rep-backpack-lost', 'usr-john', 'item-blue-backpack', 'LOST', 'CS Building, Room 301',
     '2026-03-12T10:30:00', NULL, 'com-campus', 'LOST', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('rep-backpack-found', 'usr-jane', 'item-nike-backpack', 'FOUND', 'Library, 2nd floor',
     '2026-03-12T09:15:00', NULL, 'com-campus', 'FOUND', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  -- The wallet pair becomes a POSSIBLE_MATCH (mirrors the Prisma seed's match + report update)
  INSERT INTO "Match" (id, "lostReportId", "foundReportId", score, status, "createdAt")
  VALUES ('match-wallet-001', 'rep-wallet-lost', 'rep-wallet-found', 85, 'PENDING', CURRENT_TIMESTAMP);

  UPDATE "Report" SET status = 'POSSIBLE_MATCH', "updatedAt" = CURRENT_TIMESTAMP
   WHERE id IN ('rep-wallet-lost', 'rep-wallet-found');

  RAISE NOTICE 'Created demo reports, matches';
END $$;