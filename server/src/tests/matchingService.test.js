import { describe, it, expect } from 'vitest';
import {
  calculateSimilarity,
  calculateLocationScore,
  calculateDateTimeScore,
  calculateScoreBreakdown,
  calculateTotalScore,
  MATCH_WEIGHTS
} from '../services/matchingService.js';

const baseTime = '2026-08-31T10:00:00Z';

function makeReport({ title, category, description, location, dateTime = baseTime }) {
  return {
    item: { title, category, description },
    location,
    dateTime
  };
}

describe('calculateSimilarity', () => {
  it('returns 100 for identical strings', () => {
    expect(calculateSimilarity('black wallet', 'black wallet')).toBe(100);
  });

  it('is case insensitive', () => {
    expect(calculateSimilarity('Black Wallet', 'black wallet')).toBe(100);
  });

  it('returns partial scores for overlapping words', () => {
    // "black wallet" vs "black leather wallet" -> union 3 words, intersection 2
    expect(calculateSimilarity('black wallet', 'black leather wallet')).toBe(67);
  });

  it('returns 0 for empty or null inputs', () => {
    expect(calculateSimilarity('', 'wallet')).toBe(0);
    expect(calculateSimilarity(null, undefined)).toBe(0);
  });

  it('returns 0 for completely different strings', () => {
    expect(calculateSimilarity('black wallet', 'red backpack')).toBe(0);
  });
});

describe('calculateLocationScore', () => {
  it('returns 100 for identical locations', () => {
    expect(calculateLocationScore('Student Union', 'Student Union')).toBe(100);
  });

  it('splits on commas', () => {
    expect(calculateLocationScore('Library, 3rd Floor', '3rd Floor')).toBe(67);
  });

  it('returns 0 for null inputs', () => {
    expect(calculateLocationScore(null, 'Library')).toBe(0);
  });
});

describe('calculateDateTimeScore', () => {
  it('returns 100 within 1 hour', () => {
    expect(calculateDateTimeScore(baseTime, '2026-08-31T10:30:00Z')).toBe(100);
  });

  it('returns 80 within 6 hours', () => {
    expect(calculateDateTimeScore(baseTime, '2026-08-31T15:00:00Z')).toBe(80);
  });

  it('returns decreasing scores for larger gaps', () => {
    expect(calculateDateTimeScore(baseTime, '2026-09-01T05:00:00Z')).toBeLessThan(80);
    expect(calculateDateTimeScore(baseTime, '2026-09-05T00:00:00Z')).toBe(0);
  });

  it('returns 0 for null dates', () => {
    expect(calculateDateTimeScore(null, baseTime)).toBe(0);
  });
});

describe('calculateTotalScore', () => {
  it('returns 100 for perfect matches across all factors', () => {
    const score = calculateTotalScore({ category: 100, keywords: 100, description: 100, location: 100, dateTime: 100 });
    expect(score).toBe(100);
  });

  it('returns 0 when all factors are zero', () => {
    const score = calculateTotalScore({ category: 0, keywords: 0, description: 0, location: 0, dateTime: 0 });
    expect(score).toBe(0);
  });

  it('respects weight proportions', () => {
    // Only category (25%) matching -> expect 25
    const score = calculateTotalScore({ category: 100, keywords: 0, description: 0, location: 0, dateTime: 0 });
    expect(score).toBe(25);
  });

  it('weights sum to 100', () => {
    expect(Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('calculateScoreBreakdown', () => {
  it('returns a breakdown with all factor keys', () => {
    const result = calculateScoreBreakdown(
      makeReport({ title: 'black wallet', category: 'Wallet', description: 'black leather wallet', location: 'Library' }),
      makeReport({ title: 'black wallet', category: 'Wallet', description: 'black leather wallet', location: 'Library' })
    );

    expect(result.breakdown).toHaveProperty('category');
    expect(result.breakdown).toHaveProperty('keywords');
    expect(result.breakdown).toHaveProperty('description');
    expect(result.breakdown).toHaveProperty('location');
    expect(result.breakdown).toHaveProperty('dateTime');
    expect(result.total).toBe(100);
  });

  it('scores identical reports as a high-confidence match', () => {
    const result = calculateScoreBreakdown(
      makeReport({ title: 'black wallet', category: 'Wallet', description: 'a black leather wallet', location: 'Student Union' }),
      makeReport({ title: 'black wallet', category: 'Wallet', description: 'a black leather wallet', location: 'Student Union' })
    );
    expect(result.total).toBeGreaterThanOrEqual(90);
  });

  it('scores unrelated reports below the 60 threshold', () => {
    const result = calculateScoreBreakdown(
      makeReport({ title: 'black wallet', category: 'Wallet', description: 'leather wallet', location: 'Library' }),
      makeReport({ title: 'blue umbrella', category: 'Umbrella', description: 'folding blue umbrella', location: 'Cafeteria' })
    );
    expect(result.total).toBeLessThan(60);
  });
});
