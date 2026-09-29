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

/**
 * Build the image-similarity provider for a candidate pair.
 *
 * Accepts a sync or async provider so the rule-based matcher stays usable
 * without ML, and so existing callers/tests can pass a plain function.
 */
type ImageSimilarityFn = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) => number | null | Promise<number | null>;

// At most this many ML image requests are in flight at once. Candidates are
// scored against the same source report, so an unbounded Promise.all would
// open one connection per candidate against the DINOv2 service.
const IMAGE_CONCURRENCY = 2;

// Wall-clock budget for the whole ML image-evidence phase of ONE rankMatches
// call. With 2 concurrent requests, 10 imaged candidates is 5 waves, so the
// per-request timeout alone does not bound how long report creation waits.
const DEFAULT_ML_MATCHING_DEADLINE_MS = 5000;

function mlMatchingDeadlineMs(): number {
  // read at call time, not import time, so tests can vary it
  const raw = Number(Deno.env.get("LEFTBEHIND_ML_MATCHING_DEADLINE_MS"));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ML_MATCHING_DEADLINE_MS;
}

/**
 * Race an in-flight ML request against the operation deadline.
 *
 * Resolves to null when the deadline wins, so a slow or wedged service can
 * never stall ranking: the candidate simply ends up with no image evidence and
 * the existing metadata-only score is used. The underlying request is left to
 * finish on its own (it is already bounded by LEFTBEHIND_ML_TIMEOUT_MS); we
 * only stop waiting for it.
 */
function withinDeadline(
  work: Promise<number | null>,
  remainingMs: number,
): Promise<number | null> {
  if (remainingMs <= 0) return Promise.resolve(null);
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), remainingMs);
  });
  // clearTimeout matters: without it a stale timer would pin the event loop
  // for the rest of the budget after ranking has already finished.
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}

async function rankMatches(
  report: { id: string; userId: string; type: string; item: Record<string, unknown> },
  candidates: Candidate[],
  options: {
    limit?: number;
    imageSimilarity?: ImageSimilarityFn | null;
  } = {},
): Promise<RankResult> {
  const limit = options.limit || DEFAULT_LIMIT;
  const imageSimilarityProvider = options.imageSimilarity || null;

  const matches: RankedCandidate[] = new Array(candidates.length);
  let nextIndex = 0;

  // Per-operation memo of the provider call, keyed by the source/candidate pair.
  // Caching the promise (not the value) means two workers that reach the same
  // pair concurrently share one in-flight request. Scoped to this call on
  // purpose: no cross-request cache, so a report edit always sees fresh scores.
  const imageCache = new Map<string, Promise<number | null>>();

  // One budget for the whole image-evidence phase of this operation.
  const imageDeadline = Date.now() + mlMatchingDeadlineMs();

  // Worker pool: each worker takes the next unclaimed candidate until the list
  // is exhausted, so at most IMAGE_CONCURRENCY candidates are in flight.
  const workerCount = Math.min(IMAGE_CONCURRENCY, candidates.length);
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++;
      if (index >= candidates.length) return;
      const candidate = candidates[index];

      const isLostSource = report.type === "LOST";
      const lost = isLostSource ? report : candidate;
      const found = isLostSource ? candidate : report;

      const lostFeatures: FeatureVector = extractFeatureVector(lost);
      const foundFeatures: FeatureVector = extractFeatureVector(found);

      let imageSimilarity: number | null = null;
      if (typeof imageSimilarityProvider === "function") {
        // Expired budget: start no new ML work at all. The candidate still
        // gets scored, just without image evidence.
        const remaining = imageDeadline - Date.now();
        if (remaining > 0) {
          const key = `${lost.id}:${found.id}`;
          let pending = imageCache.get(key);
          if (pending === undefined) {
            // A provider failure degrades to null, i.e. "no image evidence".
            // Resolve defensively so a rejecting - or synchronously throwing -
            // provider cannot poison the cache or reject the whole ranking.
            pending = Promise.resolve()
              .then(() => imageSimilarityProvider(lost.item, found.item))
              .then((value) => value ?? null)
              .catch(() => null);
            imageCache.set(key, pending);
          }
          imageSimilarity = await withinDeadline(pending, remaining);
        }
      }

      // The weighted rule-based score remains authoritative; the image
      // similarity only becomes extra evidence for the existing image field.
      const result = compareFeatureVectors(lostFeatures, foundFeatures, {
        imageSimilarity,
      });

      matches[index] = {
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
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  matches.sort((a, b) => b.score - a.score);

  return { matches: matches.slice(0, limit) };
}

export { findEligibleCandidates, rankMatches };