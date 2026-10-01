DROP TABLE "Location";

DELETE FROM "Item" i
WHERE i.id IN ('19044fb5-914c-4f61-8c23-4694b5507ace','dc4f4cf3-7090-42c7-b773-692286401bb8')
  AND NOT EXISTS (SELECT 1 FROM "Report" r WHERE r."itemId" = i.id);
