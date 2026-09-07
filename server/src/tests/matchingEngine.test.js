import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractFeatureVector } from '../services/matching/featureExtractor.js';
import {
  compareFeatureVectors,
  scoreToConfidence,
  CONFIDENCE_THRESHOLDS,
  CONTRADICTION_FACTOR,
  STRONG_MATCH,
  PARTIAL_MATCH
} from '../services/matching/ruleBasedMatcher.js';
import {
  calculateTextSimilarity,
  calculateFieldSimilarity,
  calculateLocationSimilarity,
  calculateDateSimilarity
} from '../services/matching/similarity.js';
import { findEligibleCandidates, rankMatches } from '../services/matching/aiMatchingService.js';

vi.mock('../config/database.js', () => ({
  default: {
    report: { findMany: vi.fn() }
  }
}));

const prisma = (await import('../config/database.js')).default;

const baseTime = '2026-09-08T10:00:00Z';

beforeEach(() => {
  vi.clearAllMocks();
});

function mockFindManyWithWhere(results) {
  prisma.report.findMany.mockImplementation(async ({ where }) =>
    results.filter((candidate) => {
      if (where.communityId && candidate.communityId !== where.communityId) return false;
      return true;
    })
  );
}

function makeReport(overrides = {}) {
  const item = {
    title: 'Black Nike Backpack',
    category: 'Bags',
    description: 'Black Nike backpack with a red keychain and a small tear on the left strap.',
    color: 'Black',
    brand: 'Nike',
    model: null,
    uniqueFeatures: 'Red keychain, small tear on left strap',
    condition: 'Used',
    size: 'Large',
    imageUrl: null,
    ...(overrides.item || {})
  };
  return {
    id: overrides.id || 'r1',
    userId: overrides.userId || 'u1',
    type: overrides.type || 'LOST',
    location: overrides.location === undefined ? 'Library, 2nd floor' : overrides.location,
    dateTime: overrides.dateTime || baseTime,
    communityId: overrides.communityId === undefined ? null : overrides.communityId,
    item: { ...item, ...(overrides.item || {}) }
  };
}

describe('similarity functions', () => {
  it('returns 1 for identical text', () => {
    expect(calculateTextSimilarity('black wallet', 'black wallet')).toBe(1);
  });

  it('is case insensitive', () => {
    expect(calculateTextSimilarity('Black Wallet', 'black wallet')).toBe(1);
  });

  it('ignores word order', () => {
    expect(calculateTextSimilarity('black blue red', 'red black blue')).toBe(1);
  });

  it('returns partial scores for overlapping words', () => {
    expect(calculateTextSimilarity('black wallet', 'black leather wallet')).toBeCloseTo(2 / 3, 2);
  });

  it('returns null for empty or null inputs', () => {
    expect(calculateTextSimilarity('', 'wallet')).toBeNull();
    expect(calculateTextSimilarity(null, undefined)).toBeNull();
  });

  it('returns 0 for completely different strings', () => {
    expect(calculateTextSimilarity('black wallet', 'red backpack')).toBe(0);
    expect(calculateFieldSimilarity('Nike', 'Adidas')).toBe(0);
  });

  it('splits locations on commas', () => {
    expect(calculateLocationSimilarity('Library, 3rd Floor', '3rd Floor')).toBeCloseTo(2 / 3, 2);
  });

  it('scores date proximity', () => {
    expect(calculateDateSimilarity(baseTime, '2026-09-08T10:30:00Z')).toBe(1);
    expect(calculateDateSimilarity(baseTime, '2026-09-08T15:00:00Z')).toBe(0.8);
    expect(calculateDateSimilarity(baseTime, '2026-09-21T10:00:00Z')).toBe(0);
    expect(calculateDateSimilarity(null, baseTime)).toBeNull();
  });
});

describe('confidence thresholds', () => {
  it('maps scores to demo confidence levels', () => {
    expect(scoreToConfidence(0.95)).toBe('high');
    expect(scoreToConfidence(CONFIDENCE_THRESHOLDS.high)).toBe('high');
    expect(scoreToConfidence(0.5)).toBe('medium');
    expect(scoreToConfidence(CONFIDENCE_THRESHOLDS.medium)).toBe('medium');
    expect(scoreToConfidence(0.2)).toBe('low');
  });

  it('exposes documented thresholds and constants', () => {
    expect(CONFIDENCE_THRESHOLDS).toEqual({ high: 0.7, medium: 0.4 });
    expect(PARTIAL_MATCH).toBe(0.4);
    expect(STRONG_MATCH).toBe(0.9);
    expect(CONTRADICTION_FACTOR).toBe(0.5);
  });
});

describe('compareFeatureVectors', () => {
  it('scores an identical lost/found pair as a strong match', () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(makeReport({ id: 'r2', userId: 'u2', type: 'FOUND' }));

    const result = compareFeatureVectors(lost, found);

    expect(result.score).toBeGreaterThanOrEqual(0.9);
    expect(result.confidence).toBe('high');
    expect(result.evidence.category.status).toBe('match');
    expect(result.evidence.brand.status).toBe('match');
    expect(result.evidence.color.status).toBe('match');
  });

  it('scores same category but different unique features lower than a full match', () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(
      makeReport({
        id: 'r2',
        userId: 'u2',
        type: 'FOUND',
        item: { uniqueFeatures: 'Blue water bottle, car keys' }
      })
    );

    const full = compareFeatureVectors(lost, extractFeatureVector(makeReport({ id: 'r3', userId: 'u3', type: 'FOUND' })));
    const result = compareFeatureVectors(lost, found);

    expect(full.score).toBe(1);
    expect(result.score).toBeLessThan(full.score);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.score).toBeLessThan(0.9);
    expect(result.evidence.uniqueFeatures.status).toBe('different');
    expect(result.evidence.uniqueFeatures.matching).toEqual([]);
  });

  it('keeps a strong score when information is missing instead of contradicting', () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(
      makeReport({
        id: 'r2',
        userId: 'u2',
        type: 'FOUND',
        item: { brand: null, model: null, uniqueFeatures: null }
      })
    );

    const result = compareFeatureVectors(lost, found);

    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.confidence).toBe('high');
    expect(result.evidence.brand.status).toBe('missing');
    expect(result.evidence.model.status).toBe('missing');
    expect(result.summary.missing).toContain('Brand');
    expect(result.summary.missing).not.toContain('Model');
  });

  it('penalizes a contradictory brand', () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(
      makeReport({ id: 'r2', userId: 'u2', type: 'FOUND', item: { brand: 'Adidas' } })
    );

    const result = compareFeatureVectors(lost, found);

    expect(result.evidence.brand.status).toBe('contradictory');
    expect(result.evidence.brand.contradictory).toContain('Adidas');
    expect(result.summary.contradictory).toContain('Brand: Nike vs Adidas');
    expect(result.score).toBeLessThan(0.9);
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('scores a different category as a weak match', () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(
      makeReport({
        id: 'r2',
        userId: 'u2',
        type: 'FOUND',
        item: {
          title: 'Silver iPhone',
          category: 'Electronics',
          description: 'Silver iPhone 15 Pro with Face ID.',
          color: 'Silver',
          brand: 'Apple',
          model: 'iPhone 15 Pro',
          uniqueFeatures: 'Face ID, telephoto camera',
          size: 'Small'
        },
        location: 'Cafeteria'
      })
    );

    const result = compareFeatureVectors(lost, found);

    expect(result.evidence.category.status).toBe('contradictory');
    expect(result.score).toBeLessThan(0.4);
    expect(result.confidence).toBe('low');
  });

  it('matches the same item expressed in slightly different wording', () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(
      makeReport({
        id: 'r2',
        userId: 'u2',
        type: 'FOUND',
        item: {
          title: 'Nike Backpack Black',
          description: 'A black Nike backpack, carries a red keychain, the left strap has a small tear.'
        }
      })
    );

    expect(calculateTextSimilarity('Black Nike Backpack', 'Nike Backpack Black')).toBe(1);
    const result = compareFeatureVectors(lost, found);

    expect(result.score).toBeGreaterThanOrEqual(0.85);
    expect(result.confidence).toBe('high');
  });

  it('handles null and empty optional fields without crashing', () => {
    const empty = makeReport({
      item: {
        title: '',
        category: '',
        description: '',
        color: null,
        brand: null,
        model: null,
        uniqueFeatures: null,
        condition: null,
        size: null,
        imageUrl: null
      },
      location: ''
    });

    const result = compareFeatureVectors(extractFeatureVector(empty), extractFeatureVector(empty));

    expect(result.score).toBeLessThan(0.4);
    expect(result.confidence).toBe('low');
    expect(result.evidence.category.status).toBe('missing');
    expect(result.summary.matching).not.toContain('Same category');
    expect(result.summary.missing).toEqual([]);
  });

  it('ignores missing image similarity instead of treating it as evidence', () => {
    const lost = extractFeatureVector(makeReport({ item: { imageUrl: '/uploads/a.jpg' } }));
    const found = extractFeatureVector(makeReport({ id: 'r2', userId: 'u2', type: 'FOUND', item: { imageUrl: '/uploads/b.jpg' } }));

    const result = compareFeatureVectors(lost, found);

    expect(result.evidence.image.status).toBe('missing');
    expect(result.score).toBe(1);
  });

  it('uses a supplied image similarity when available', () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(makeReport({ id: 'r2', userId: 'u2', type: 'FOUND' }));

    const result = compareFeatureVectors(lost, found, { imageSimilarity: 0.88 });

    expect(result.evidence.image.status).toBe('partial');
    expect(result.evidence.image.similarity).toBe(0.88);
  });

  it('generates structured evidence for every feature', () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(makeReport({ id: 'r2', userId: 'u2', type: 'FOUND' }));

    const result = compareFeatureVectors(lost, found);
    const keys = ['category', 'title', 'description', 'color', 'brand', 'model', 'uniqueFeatures', 'condition', 'size', 'location', 'time', 'image'];

    for (const key of keys) {
      const fieldEvidence = result.evidence[key];
      expect(fieldEvidence).toBeDefined();
      expect(fieldEvidence).toHaveProperty('status');
      expect(fieldEvidence).toHaveProperty('similarity');
      expect(fieldEvidence).toHaveProperty('matching');
      expect(fieldEvidence).toHaveProperty('missing');
      expect(fieldEvidence).toHaveProperty('contradictory');
    }

    expect(Array.isArray(result.summary.matching)).toBe(true);
    expect(Array.isArray(result.summary.missing)).toBe(true);
    expect(Array.isArray(result.summary.contradictory)).toBe(true);
  });
});

describe('findEligibleCandidates (community scoping)', () => {
  it('restricts candidates to the same community and excludes same-user reports', async () => {
    const report = makeReport({ communityId: 'c1' });

    const candidates = [
      { id: 'a', userId: 'u2', communityId: 'c1' },
      { id: 'b', userId: 'u2', communityId: 'c2' },
      { id: 'c', userId: 'u1', communityId: 'c1' }
    ];
    mockFindManyWithWhere(candidates);

    const result = await findEligibleCandidates(report);

    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ communityId: 'c1' }) })
    );
    expect(result).toEqual([{ id: 'a', userId: 'u2', communityId: 'c1' }]);
  });

  it('keeps backward compatibility when the report has no communityId', async () => {
    const report = makeReport({ communityId: null });

    mockFindManyWithWhere([]);

    await findEligibleCandidates(report);

    const { where } = prisma.report.findMany.mock.calls[0][0];
    expect(where).not.toHaveProperty('communityId');
  });
});

describe('rankMatches', () => {
  it('returns matches sorted by score descending', () => {
    const report = makeReport();

    const strong = makeReport({ id: 'r-strong', userId: 'u2', type: 'FOUND' });
    const medium = makeReport({
      id: 'r-medium',
      userId: 'u2',
      type: 'FOUND',
      item: { uniqueFeatures: 'Blue water bottle, car keys' }
    });
    const weak = makeReport({
      id: 'r-weak',
      userId: 'u2',
      type: 'FOUND',
      item: {
        title: 'Silver iPhone',
        category: 'Electronics',
        description: 'Silver iPhone 15 Pro with Face ID.',
        color: 'Silver',
        brand: 'Apple',
        uniqueFeatures: 'Face ID, telephoto camera',
        size: 'Small'
      }
    });

    const { matches } = rankMatches(report, [weak, medium, strong]);

    expect(matches.map((m) => m.score)).toEqual([...matches.map((m) => m.score)].sort((a, b) => b - a));
    expect(matches[0].foundReportId).toBe('r-strong');
    expect(matches[0].score).toBe(1);
  });

  it('limits the number of returned matches', () => {
    const report = makeReport();
    const candidates = [1, 2, 3].map((i) =>
      makeReport({ id: `r${i}`, userId: 'u2', type: 'FOUND', item: { uniqueFeatures: `feature ${i}` } })
    );

    const { matches } = rankMatches(report, candidates, { limit: 2 });

    expect(matches).toHaveLength(2);
  });

  it('exposes an optional image similarity provider hook', () => {
    const report = makeReport();
    const candidate = makeReport({ id: 'r2', userId: 'u2', type: 'FOUND' });

    const { matches } = rankMatches(report, [candidate], { imageSimilarity: () => 0.91 });

    expect(matches[0].imageSimilarity).toBe(0.91);
    expect(matches[0].evidence.image.status).toBe('match');
  });
});