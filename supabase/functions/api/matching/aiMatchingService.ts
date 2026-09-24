import { db } from "../_shared/db.ts";
import { ITEM_FULL, REPORT_COLUMNS, USER_NARROW } from "../_shared/selectors.ts";
import { extractFeatureVector, type FeatureVector } from "./featureExtractor.ts";
import { compareFeatureVectors, type CompareResult } from "./ruleBasedMatcher.ts";

const ACTIVE_STATUSES = ["LOST", "FOUND", "POSSIBLE_MATCH"];
const DEFAULT_LIMIT = 10;

export interface Candidate {
  id: string;
  userId: string;
  type: string;
  status: string;
  location: string;
  communityId: string | null;
  dateTime: string;
  item: Record<string, unknown>;
  community: Record<string, unknown> | null;
  user: { id: string; name: string };
}

export interface RankedCandidate {
  lostReportId: string;
  foundReportId: string;
  lostReportOwnerId: string;
  score: number;
  confidence: CompareResult["confidence"];
  evidence: CompareResult["evidence"];
  summary: CompareResult["summary"];
  imageSimilarity: number | null;
  report: Candidate;
}

export interface RankResult {
  matches: RankedCandidate[];
}

const CANDIDATE_SELECT = `${REPORT_COLUMNS},item:Item(${ITEM_FULL}),community:Community(*),user:User(${USER_NARROW})`;

async function findEligibleCandidates(
  report: { type: string; communityId?: string | null; userId: string },
  client: ReturnType<typeof db> = db(),
): Promise<Candidate[]> {
  const oppositeType = report.type === "LOST" ? "FOUND" : "LOST";

  let query = client
    .from("Report")
    .select(CANDIDATE_SELECT)
    .eq("type", oppositeType)
    .in("status", ACTIVE_STATUSES);

  if (report.communityId) {
    query = query.eq("communityId", report.communityId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const candidates = (data ?? []) as unknown as Candidate[];
  return candidates.filter((candidate) => candidate.userId !== report.userId);
}

function rankMatches(
  report: { id: string; userId: string; type: string; item: Record<string, unknown> },
  candidates: Candidate[],
  options: {
    limit?: number;
    imageSimilarity?: ((a: Record<string, unknown>, b: Record<string, unknown>) => number) | null;
  } = {},
): RankResult {
  const limit = options.limit || DEFAULT_LIMIT;
  const imageSimilarityProvider = options.imageSimilarity || null;

  const matches: RankedCandidate[] = candidates.map((candidate) => {
    const isLostSource = report.type === "LOST";
    const lost = isLostSource ? report : candidate;
    const found = isLostSource ? candidate : report;

    const lostFeatures: FeatureVector = extractFeatureVector(lost);
    const foundFeatures: FeatureVector = extractFeatureVector(found);

    let imageSimilarity: number | null = null;
    if (typeof imageSimilarityProvider === "function") {
      imageSimilarity = imageSimilarityProvider(lost.item, found.item);
    }

    const result = compareFeatureVectors(lostFeatures, foundFeatures, { imageSimilarity });

    return {
      lostReportId: lost.id,
      foundReportId: found.id,
      lostReportOwnerId: lost.userId,
      score: result.score,
      confidence: result.confidence,
      evidence: result.evidence,
      summary: result.summary,
      imageSimilarity,
      report: candidate,
    };
  });

  matches.sort((a, b) => b.score - a.score);

  return { matches: matches.slice(0, limit) };
}

export { findEligibleCandidates, rankMatches };