import prisma from '../../config/database.js';
import { extractFeatureVector } from './featureExtractor.js';
import { compareFeatureVectors } from './ruleBasedMatcher.js';

const ACTIVE_STATUSES = ['LOST', 'FOUND', 'POSSIBLE_MATCH'];
const DEFAULT_LIMIT = 10;

export async function findEligibleCandidates(report) {
  const oppositeType = report.type === 'LOST' ? 'FOUND' : 'LOST';

  const where = {
    type: oppositeType,
    status: { in: ACTIVE_STATUSES }
  };

  if (report.communityId) {
    where.communityId = report.communityId;
  }

  const candidates = await prisma.report.findMany({
    where,
    include: {
      item: true,
      community: true,
      user: { select: { id: true, name: true } }
    }
  });

  return candidates.filter((candidate) => candidate.userId !== report.userId);
}

export function rankMatches(report, candidates, options = {}) {
  const limit = options.limit || DEFAULT_LIMIT;
  const imageSimilarityProvider = options.imageSimilarity || null;

  const matches = candidates.map((candidate) => {
    const isLostSource = report.type === 'LOST';
    const lost = isLostSource ? report : candidate;
    const found = isLostSource ? candidate : report;

    const lostFeatures = extractFeatureVector(lost);
    const foundFeatures = extractFeatureVector(found);

    let imageSimilarity = null;
    if (typeof imageSimilarityProvider === 'function') {
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
      report: candidate
    };
  });

  matches.sort((a, b) => b.score - a.score);

  return { matches: matches.slice(0, limit) };
}