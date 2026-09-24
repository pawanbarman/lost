import { db } from "../_shared/db.ts";
import { rpcCall } from "../_shared/rpc.ts";
import { MATCH_DETAIL_SELECT, REPORT_COLUMNS, ITEM_FULL } from "../_shared/selectors.ts";
import { findEligibleCandidates, rankMatches } from "./aiMatchingService.ts";
import { compareFeatureVectors } from "./ruleBasedMatcher.ts";
import { extractFeatureVector } from "./featureExtractor.ts";

export const MATCH_WEIGHTS = {
  category: 25,
  keywords: 25,
  description: 20,
  location: 20,
  dateTime: 10,
};

export function calculateSimilarity(str1: unknown, str2: unknown): number {
  if (!str1 || !str2) return 0;

  const s1 = String(str1).toLowerCase();
  const s2 = String(str2).toLowerCase();

  if (s1 === s2) return 100;

  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);

  const intersection = words1.filter((word) => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];

  if (union.length === 0) return 0;
  return Math.round((intersection.length / union.length) * 100);
}

export function calculateLocationScore(loc1: unknown, loc2: unknown): number {
  if (!loc1 || !loc2) return 0;

  const l1 = String(loc1).toLowerCase();
  const l2 = String(loc2).toLowerCase();

  if (l1 === l2) return 100;

  const words1 = l1.split(/[\s,]+/);
  const words2 = l2.split(/[\s,]+/);

  const intersection = words1.filter((word) => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];

  if (union.length === 0) return 0;
  return Math.round((intersection.length / union.length) * 100);
}

export function calculateDateTimeScore(date1: unknown, date2: unknown): number {
  if (!date1 || !date2) return 0;

  const d1 = new Date(date1 as string | number | Date);
  const d2 = new Date(date2 as string | number | Date);

  const diffHours = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60);

  if (diffHours <= 1) return 100;
  if (diffHours <= 6) return 80;
  if (diffHours <= 12) return 60;
  if (diffHours <= 24) return 40;
  if (diffHours <= 48) return 20;

  return 0;
}

export function calculateScoreBreakdown(
  report: { item: { category?: unknown; title?: unknown; description?: unknown }; location?: unknown; dateTime?: unknown },
  oppositeReport: { item: { category?: unknown; title?: unknown; description?: unknown }; location?: unknown; dateTime?: unknown },
) {
  const categoryScore = report.item.category === oppositeReport.item.category ? 100 : 0;
  const keywordScore = calculateSimilarity(report.item.title, oppositeReport.item.title);
  const descriptionScore = calculateSimilarity(report.item.description, oppositeReport.item.description);
  const locationScore = calculateLocationScore(report.location, oppositeReport.location);
  const dateTimeScore = calculateDateTimeScore(report.dateTime, oppositeReport.dateTime);

  const breakdown = {
    category: categoryScore,
    keywords: keywordScore,
    description: descriptionScore,
    location: locationScore,
    dateTime: dateTimeScore,
  };

  return {
    total: calculateTotalScore(breakdown),
    breakdown,
  };
}

export function calculateTotalScore(breakdown: {
  category: number;
  keywords: number;
  description: number;
  location: number;
  dateTime: number;
}): number {
  return Math.round(
    (breakdown.category * MATCH_WEIGHTS.category +
      breakdown.keywords * MATCH_WEIGHTS.keywords +
      breakdown.description * MATCH_WEIGHTS.description +
      breakdown.location * MATCH_WEIGHTS.location +
      breakdown.dateTime * MATCH_WEIGHTS.dateTime) / 100,
  );
}

const PERSISTENCE_THRESHOLD = 0.6;

type MatchRow = {
  id?: string;
  lostReport?: Record<string, unknown>;
  foundReport?: Record<string, unknown>;
  confidence?: string;
};

function enrichWithEvidence<T extends MatchRow>(match: T): T {
  const lostFeatures = match.lostReport ? extractFeatureVector(match.lostReport) : {} as never;
  const foundFeatures = match.foundReport ? extractFeatureVector(match.foundReport) : {} as never;

  const result = compareFeatureVectors(lostFeatures, foundFeatures, {});

  (match as Record<string, unknown>).evidence = result.evidence;
  (match as Record<string, unknown>).summary = result.summary;
  (match as Record<string, unknown>).confidence = result.confidence || (match as Record<string, unknown>).confidence;

  const strip = (report: Record<string, unknown> | undefined) => {
    const item = report?.item as Record<string, unknown> | undefined;
    if (item && item.privateDetails !== undefined) {
      delete item.privateDetails;
    }
  };
  strip(match.lostReport);
  strip(match.foundReport);

  return match;
}

export const matchingService = {
  async findMatches(reportId: string) {
    const report = await db()
      .from("Report")
      .select(`id,type,userId,communityId,location,dateTime,item:Item(${ITEM_FULL})`)
      .eq("id", reportId)
      .maybeSingle();
    const reportData = report.data as {
      id: string;
      type: string;
      userId: string;
      communityId: string | null;
      location: string;
      dateTime: string;
      item: Record<string, unknown>;
    } | null;
    if (report.error) throw report.error;
    if (!reportData) return [];

    const candidates = await findEligibleCandidates(reportData);
    const ranked = rankMatches(reportData as never, candidates);

    const matches = [];

    for (const candidate of ranked.matches) {
      if (candidate.score < PERSISTENCE_THRESHOLD) continue;

      const { data: existing, error: existingError } = await db()
        .from("Match")
        .select("id")
        .eq("lostReportId", candidate.lostReportId)
        .eq("foundReportId", candidate.foundReportId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) continue;

      const score = Math.round(candidate.score * 100);

      const created = await rpcCall<{ match_id: string }>("create_match_and_notify", {
        p_lost_report_id: candidate.lostReportId,
        p_found_report_id: candidate.foundReportId,
        p_score: score,
      });

      matches.push({
        id: created.match_id,
        lostReportId: candidate.lostReportId,
        foundReportId: candidate.foundReportId,
        score,
        confidence: candidate.confidence,
        evidence: candidate.evidence,
        summary: candidate.summary,
      });
    }

    return matches;
  },

  async getMatchesForUser(userId: string) {
    const userReports = await db()
      .from("Report")
      .select("id")
      .eq("userId", userId);
    if (userReports.error) throw userReports.error;

    const reportIds = (userReports.data ?? []).map((r) => r.id as string);

    if (reportIds.length === 0) return [];

    const { data, error } = await db()
      .from("Match")
      .select(MATCH_DETAIL_SELECT)
      .or(`lostReportId.in.(${reportIds.join(",")}),foundReportId.in.(${reportIds.join(",")})`)
      .order("score", { ascending: false });

    if (error) throw error;

    return (data ?? []).map((match) => enrichWithEvidence(match as MatchRow));
  },
};