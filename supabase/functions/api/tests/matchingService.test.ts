import { describe, it } from "@std/testing/bdd";
import {
  assertEquals,
  assert,
  assertFalse,
  assertGreater,
  assertGreaterOrEqual,
  assertLess,
  assertAlmostEquals,
  assertExists,
} from "@std/assert";
import {
  calculateSimilarity,
  calculateLocationScore,
  calculateDateTimeScore,
  calculateScoreBreakdown,
  calculateTotalScore,
  MATCH_WEIGHTS,
} from "../matching/matchingService.ts";

const baseTime = "2026-08-31T10:00:00Z";

function makeReport({ title, category, description, location, dateTime = baseTime }: {
  title: string;
  category: string;
  description: string;
  location: string;
  dateTime?: string;
}) {
  return {
    item: { title, category, description },
    location,
    dateTime,
  };
}

describe("calculateSimilarity", () => {
  it("returns 100 for identical strings", () => {
    assertEquals(calculateSimilarity("black wallet", "black wallet"), 100);
  });

  it("is case insensitive", () => {
    assertEquals(calculateSimilarity("Black Wallet", "black wallet"), 100);
  });

  it("returns partial scores for overlapping words", () => {
    assertEquals(calculateSimilarity("black wallet", "black leather wallet"), 67);
  });

  it("returns 0 for empty or null inputs", () => {
    assertEquals(calculateSimilarity("", "wallet"), 0);
    assertEquals(calculateSimilarity(null, undefined), 0);
  });

  it("returns 0 for completely different strings", () => {
    assertEquals(calculateSimilarity("black wallet", "red backpack"), 0);
  });
});

describe("calculateLocationScore", () => {
  it("returns 100 for identical locations", () => {
    assertEquals(calculateLocationScore("Student Union", "Student Union"), 100);
  });

  it("splits on commas", () => {
    assertEquals(calculateLocationScore("Library, 3rd Floor", "3rd Floor"), 67);
  });

  it("returns 0 for null inputs", () => {
    assertEquals(calculateLocationScore(null, "Library"), 0);
  });
});

describe("calculateDateTimeScore", () => {
  it("returns 100 within 1 hour", () => {
    assertEquals(calculateDateTimeScore(baseTime, "2026-08-31T10:30:00Z"), 100);
  });

  it("returns 80 within 6 hours", () => {
    assertEquals(calculateDateTimeScore(baseTime, "2026-08-31T15:00:00Z"), 80);
  });

  it("returns decreasing scores for larger gaps", () => {
    assertLess(calculateDateTimeScore(baseTime, "2026-09-01T05:00:00Z"), 80);
    assertEquals(calculateDateTimeScore(baseTime, "2026-09-05T00:00:00Z"), 0);
  });

  it("returns 0 for null dates", () => {
    assertEquals(calculateDateTimeScore(null, baseTime), 0);
  });
});

describe("calculateTotalScore", () => {
  it("returns 100 for perfect matches across all factors", () => {
    const score = calculateTotalScore({
      category: 100,
      keywords: 100,
      description: 100,
      location: 100,
      dateTime: 100,
    });
    assertEquals(score, 100);
  });

  it("returns 0 when all factors are zero", () => {
    const score = calculateTotalScore({
      category: 0,
      keywords: 0,
      description: 0,
      location: 0,
      dateTime: 0,
    });
    assertEquals(score, 0);
  });

  it("respects weight proportions", () => {
    const score = calculateTotalScore({
      category: 100,
      keywords: 0,
      description: 0,
      location: 0,
      dateTime: 0,
    });
    assertEquals(score, 25);
  });

  it("weights sum to 100", () => {
    assertEquals(Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  });
});

describe("calculateScoreBreakdown", () => {
  it("returns a breakdown with all factor keys", () => {
    const result = calculateScoreBreakdown(
      makeReport({
        title: "black wallet",
        category: "Wallet",
        description: "black leather wallet",
        location: "Library",
      }),
      makeReport({
        title: "black wallet",
        category: "Wallet",
        description: "black leather wallet",
        location: "Library",
      }),
    );

    assertExists(result.breakdown.category);
    assertExists(result.breakdown.keywords);
    assertExists(result.breakdown.description);
    assertExists(result.breakdown.location);
    assertExists(result.breakdown.dateTime);
    assertEquals(result.total, 100);
  });

  it("scores identical reports as a high-confidence match", () => {
    const result = calculateScoreBreakdown(
      makeReport({
        title: "black wallet",
        category: "Wallet",
        description: "a black leather wallet",
        location: "Student Union",
      }),
      makeReport({
        title: "black wallet",
        category: "Wallet",
        description: "a black leather wallet",
        location: "Student Union",
      }),
    );
    assertGreaterOrEqual(result.total, 90);
  });

  it("scores unrelated reports below the 60 threshold", () => {
    const result = calculateScoreBreakdown(
      makeReport({
        title: "black wallet",
        category: "Wallet",
        description: "leather wallet",
        location: "Library",
      }),
      makeReport({
        title: "blue umbrella",
        category: "Umbrella",
        description: "folding blue umbrella",
        location: "Cafeteria",
      }),
    );
    assertLess(result.total, 60);
  });
});