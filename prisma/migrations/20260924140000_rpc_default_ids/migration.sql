-- Fix RPC INSERTs: id columns are TEXT NOT NULL with no DB default (Prisma generates
-- client ids), so RPCs must supply gen_random_uuid()::text for rows they create.
-- Recreated: approve_claim, reject_claim, start_handover, complete_handover,
-- create_claim, create_match_and_notify (Notification/Claim/Match inserts).

CREATE OR REPLACE FUNCTION public.approve_claim(
  p_claim_id text,
  p_admin_notes text DEFAULT NULL,
  p_admin_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_count integer;
BEGIN
  SELECT c.id, c."claimantId", c.status, m.id AS "matchId",
         m."lostReportId", m."foundReportId",
         f."userId" AS "foundUserId", f.status AS "foundStatus"
    INTO v_claim
    FROM "Claim" c
    JOIN "Match" m ON m.id = c."matchId"
    JOIN "Report" f ON f.id = m."foundReportId"
   WHERE c.id = p_claim_id;

  IF v_claim.id IS NULL THEN
    RETURN public._lf_err(404, 'Claim not found');
  END IF;

  IF v_claim.status <> 'PENDING' THEN
    RETURN public._lf_err(400, 'Only pending claims can be approved');
  END IF;

  IF v_claim."foundStatus" IN ('CLAIMED', 'RETURNED', 'CLOSED') THEN
    RETURN public._lf_err(400, 'This item has already been claimed or recovered');
  END IF;

  UPDATE "Report"
     SET status = 'CLAIMED', "updatedAt" = CURRENT_TIMESTAMP
   WHERE id = v_claim."foundReportId"
     AND status IN ('FOUND', 'POSSIBLE_MATCH', 'UNDER_VERIFICATION');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN public._lf_err(400, 'This item has already been claimed by another claim');
  END IF;

  UPDATE "Claim"
     SET status = 'APPROVED', "adminNotes" = p_admin_notes, "updatedAt" = CURRENT_TIMESTAMP
   WHERE id = p_claim_id AND status = 'PENDING';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN public._lf_err(400, 'This claim was already processed');
  END IF;

  UPDATE "Report"
     SET status = 'UNDER_VERIFICATION', "updatedAt" = CURRENT_TIMESTAMP
   WHERE id = v_claim."lostReportId";

  UPDATE "Match" SET status = 'ACCEPTED' WHERE id = v_claim."matchId";

  UPDATE "Claim"
     SET status = 'REJECTED',
         "adminNotes" = 'Rejected: another claim was approved for this item.',
         "updatedAt" = CURRENT_TIMESTAMP
   WHERE "reportId" = v_claim."foundReportId"
     AND status = 'PENDING'
     AND id <> p_claim_id;

  INSERT INTO "Notification" (id, "userId", "message", "type")
  VALUES
    (gen_random_uuid()::text, v_claim."claimantId", 'Your claim has been approved. The item is ready for handover.', 'CLAIM_APPROVED'),
    (gen_random_uuid()::text, v_claim."foundUserId", 'A claim was approved for your found item. It is ready for handover.', 'CLAIM_APPROVED');

  RETURN jsonb_build_object('ok', true, 'claim_id', v_claim.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_claim(
  p_claim_id text,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_count integer;
BEGIN
  SELECT c.id, c."claimantId"
    INTO v_claim
    FROM "Claim" c
   WHERE c.id = p_claim_id;

  IF v_claim.id IS NULL THEN
    RETURN public._lf_err(404, 'Claim not found');
  END IF;

  UPDATE "Claim"
     SET status = 'REJECTED', "adminNotes" = p_admin_notes, "updatedAt" = CURRENT_TIMESTAMP
   WHERE id = p_claim_id AND status = 'PENDING';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN public._lf_err(400, 'Only pending claims can be rejected');
  END IF;

  INSERT INTO "Notification" (id, "userId", "message", "type")
  VALUES (gen_random_uuid()::text, v_claim."claimantId", 'Your claim has been rejected.', 'CLAIM_REJECTED');

  RETURN jsonb_build_object('ok', true, 'claim_id', v_claim.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_handover(p_claim_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_count integer;
BEGIN
  SELECT c.id, c."claimantId", m."foundReportId", f."userId" AS "foundUserId"
    INTO v_claim
    FROM "Claim" c
    JOIN "Match" m ON m.id = c."matchId"
    JOIN "Report" f ON f.id = m."foundReportId"
   WHERE c.id = p_claim_id;

  IF v_claim.id IS NULL THEN
    RETURN public._lf_err(404, 'Claim not found');
  END IF;

  UPDATE "Claim"
     SET status = 'UNDER_HANDOVER', "handoverStartedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
   WHERE id = p_claim_id AND status = 'APPROVED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN public._lf_err(400, 'Only approved claims can start a handover');
  END IF;

  INSERT INTO "Notification" (id, "userId", "message", "type")
  VALUES
    (gen_random_uuid()::text, v_claim."claimantId", 'Handover has been initiated. Review the pickup location to receive your item.', 'SYSTEM'),
    (gen_random_uuid()::text, v_claim."foundUserId", 'Handover has been initiated for the item you found. Arrange the pickup.', 'SYSTEM');

  RETURN jsonb_build_object('ok', true, 'claim_id', v_claim.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_handover(p_claim_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_count integer;
BEGIN
  SELECT c.id, c."claimantId", m."lostReportId", m."foundReportId", f."userId" AS "foundUserId"
    INTO v_claim
    FROM "Claim" c
    JOIN "Match" m ON m.id = c."matchId"
    JOIN "Report" f ON f.id = m."foundReportId"
   WHERE c.id = p_claim_id;

  IF v_claim.id IS NULL THEN
    RETURN public._lf_err(404, 'Claim not found');
  END IF;

  UPDATE "Claim"
     SET status = 'COMPLETED', "handoverCompletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
   WHERE id = p_claim_id AND status = 'UNDER_HANDOVER';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN public._lf_err(400, 'Only handovers in progress can be completed');
  END IF;

  UPDATE "Report"
     SET status = 'RETURNED', "updatedAt" = CURRENT_TIMESTAMP
   WHERE id IN (v_claim."lostReportId", v_claim."foundReportId");

  INSERT INTO "Notification" (id, "userId", "message", "type")
  VALUES
    (gen_random_uuid()::text, v_claim."claimantId", 'Your item has been successfully recovered. Handover complete.', 'ITEM_RETURNED'),
    (gen_random_uuid()::text, v_claim."foundUserId", 'The item you found has been returned to its owner. Handover complete.', 'ITEM_RETURNED');

  RETURN jsonb_build_object('ok', true, 'claim_id', v_claim.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_claim(
  p_match_id text,
  p_claimant_id text,
  p_verification_details text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_claim_id text;
  v_dup boolean;
BEGIN
  SELECT m.id, l."userId" AS "lostUserId", l."communityId" AS "lostCommunityId",
         f.id AS "foundReportId", f.status AS "foundStatus", f."userId" AS "foundUserId",
         f."communityId" AS "foundCommunityId",
         u."communityId" AS "claimantCommunityId", u.role AS "claimantRole"
    INTO v_match
    FROM "Match" m
    JOIN "Report" l ON l.id = m."lostReportId"
    JOIN "Report" f ON f.id = m."foundReportId"
    JOIN "User" u ON u.id = p_claimant_id
   WHERE m.id = p_match_id;

  IF v_match.id IS NULL THEN
    RETURN public._lf_err(404, 'Match not found');
  END IF;

  IF v_match."lostUserId" <> p_claimant_id THEN
    RETURN public._lf_err(403, 'Only the owner of the lost item may claim this match');
  END IF;

  IF v_match."foundStatus" IN ('CLAIMED', 'RETURNED', 'CLOSED') THEN
    RETURN public._lf_err(400, 'This item is no longer available for claiming');
  END IF;

  IF v_match."claimantCommunityId" IS NOT NULL
     AND v_match."foundCommunityId" IS NOT NULL
     AND v_match."claimantCommunityId" <> v_match."foundCommunityId"
     AND v_match."claimantRole" <> 'ADMIN' THEN
    RETURN public._lf_err(403, 'Cannot claim an item from a different community');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM "Claim" WHERE "claimantId" = p_claimant_id AND "reportId" = v_match."foundReportId"
  ) INTO v_dup;
  IF v_dup THEN
    RETURN public._lf_err(400, 'You have already submitted a claim for this item');
  END IF;

  INSERT INTO "Claim" (id, "matchId", "claimantId", "reportId", "verificationDetails", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, p_match_id, p_claimant_id, v_match."foundReportId", p_verification_details, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  RETURNING id INTO v_claim_id;

  INSERT INTO "Notification" (id, "userId", "message", "type")
  VALUES
    (gen_random_uuid()::text, p_claimant_id, 'Your claim has been submitted and is awaiting admin review.', 'CLAIM_SUBMITTED'),
    (gen_random_uuid()::text, v_match."foundUserId", 'A new claim was submitted for your found item and is awaiting admin review.', 'CLAIM_SUBMITTED');

  RETURN jsonb_build_object('ok', true, 'claim_id', v_claim_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_match_and_notify(
  p_lost_report_id text,
  p_found_report_id text,
  p_score integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id text;
BEGIN
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RETURN public._lf_err(400, 'Invalid match score');
  END IF;

  SELECT id INTO v_match_id
    FROM "Match"
   WHERE "lostReportId" = p_lost_report_id AND "foundReportId" = p_found_report_id;
  IF v_match_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'match_id', v_match_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "Report" WHERE id = p_lost_report_id) OR
     NOT EXISTS (SELECT 1 FROM "Report" WHERE id = p_found_report_id) THEN
    RETURN public._lf_err(404, 'Report not found');
  END IF;

  INSERT INTO "Match" (id, "lostReportId", "foundReportId", "score")
  VALUES (gen_random_uuid()::text, p_lost_report_id, p_found_report_id, p_score)
  RETURNING id INTO v_match_id;

  UPDATE "Report" SET status = 'POSSIBLE_MATCH', "updatedAt" = CURRENT_TIMESTAMP
   WHERE id IN (p_lost_report_id, p_found_report_id);

  INSERT INTO "Notification" (id, "userId", "message", "type")
  VALUES (
    gen_random_uuid()::text,
    (SELECT "userId" FROM "Report" WHERE id = p_lost_report_id),
    'We found a possible match for your lost item (Score: ' || p_score || '%)',
    'MATCH_FOUND'
  );

  RETURN jsonb_build_object('ok', true, 'match_id', v_match_id);
END;
$$;

-- Privileges (re-assert)
REVOKE EXECUTE ON FUNCTION public.approve_claim(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_claim(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_handover(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_handover(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_claim(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_match_and_notify(text, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approve_claim(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_claim(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_handover(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_handover(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_claim(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_match_and_notify(text, text, integer) TO service_role;