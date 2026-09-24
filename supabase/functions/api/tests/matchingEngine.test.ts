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
import { extractFeatureVector } from "../matching/featureExtractor.ts";
import {
  compareFeatureVectors,
  scoreToConfidence,
  CONFIDENCE_THRESHOLDS,
  CONTRADICTION_FACTOR,
  STRONG_MATCH,
  PARTIAL_MATCH,
} from "../matching/ruleBasedMatcher.ts";
import {
  calculateTextSimilarity,
  calculateFieldSimilarity,
  calculateLocationSimilarity,
  calculateDateSimilarity,
} from "../matching/similarity.ts";
import { findEligibleCandidates, rankMatches } from "../matching/aiMatchingService.ts";

const baseTime = "2026-09-08T10:00:00Z";

function makeReport(overrides: Record<string, unknown> = {}) {
  const item = {
    title: "Black Nike Backpack",
    category: "Bags",
    description: "Black Nike backpack with a red keychain and a small tear on the left strap.",
    color: "Black",
    brand: "Nike",
    model: null,
    uniqueFeatures: "Red keychain, small tear on left strap",
    condition: "Used",
    size: "Large",
    imageUrl: null,
    ...((overrides.item as Record<string, unknown>) || {}),
  };
  return {
    id: (overrides.id as string) || "r1",
    userId: (overrides.userId as string) || "u1",
    type: (overrides.type as string) || "LOST",
    location: overrides.location === undefined ? "Library, 2nd floor" : overrides.location,
    dateTime: (overrides.dateTime as string) || baseTime,
    communityId: overrides.communityId === undefined ? null : overrides.communityId,
    item: { ...item, ...((overrides.item as Record<string, unknown>) || {}) },
  };
}

type Op = { kind: "eq" | "in"; col: string; value: unknown };

function fakeClient(candidates: Record<string, unknown>[]) {
  const ops: Op[] = [];
  const query: Record<string, unknown> = {
    select() {
      return query;
    },
    eq(col: string, value: unknown) {
      ops.push({ kind: "eq", col, value });
      return query;
    },
    in(col: string, value: unknown) {
      ops.push({ kind: "in", col, value });
      return query;
    },
    then(resolve: (value: unknown) => void) {
      let filtered = [...candidates];
      for (const op of ops) {
        filtered = filtered.filter((candidate) => {
          if (op.kind === "eq") return candidate[op.col] === op.value;
          return (op.value as unknown[]).includes(candidate[op.col]);
        });
      }
      resolve({ data: filtered, error: null });
    },
  };
  const client = {
    from() {
      return query;
    },
  };
  return { client, ops };
}

describe("similarity functions", () => {
  it("returns 1 for identical text", () => {
    assertEquals(calculateTextSimilarity("black wallet", "black wallet"), 1);
  });

  it("is case insensitive", () => {
    assertEquals(calculateTextSimilarity("Black Wallet", "black wallet"), 1);
  });

  it("ignores word order", () => {
    assertEquals(calculateTextSimilarity("black blue red", "red black blue"), 1);
  });

  it("returns partial scores for overlapping words", () => {
    assertAlmostEquals(calculateTextSimilarity("black wallet", "black leather wallet")!, 2 / 3, 0.01);
  });

  it("returns null for empty or null inputs", () => {
    assertEquals(calculateTextSimilarity("", "wallet"), null);
    assertEquals(calculateTextSimilarity(null, undefined), null);
  });

  it("returns 0 for completely different strings", () => {
    assertEquals(calculateTextSimilarity("black wallet", "red backpack"), 0);
    assertEquals(calculateFieldSimilarity("Nike", "Adidas"), 0);
  });

  it("splits locations on commas", () => {
    assertAlmostEquals(calculateLocationSimilarity("Library, 3rd Floor", "3rd Floor")!, 2 / 3, 0.01);
  });

  it("scores date proximity", () => {
    assertEquals(calculateDateSimilarity(baseTime, "2026-09-08T10:30:00Z"), 1);
    assertEquals(calculateDateSimilarity(baseTime, "2026-09-08T15:00:00Z"), 0.8);
    assertEquals(calculateDateSimilarity(baseTime, "2026-09-21T10:00:00Z"), 0);
    assertEquals(calculateDateSimilarity(null, baseTime), null);
  });
});

describe("confidence thresholds", () => {
  it("maps scores to demo confidence levels", () => {
    assertEquals(scoreToConfidence(0.95), "high");
    assertEquals(scoreToConfidence(CONFIDENCE_THRESHOLDS.high), "high");
    assertEquals(scoreToConfidence(0.5), "medium");
    assertEquals(scoreToConfidence(CONFIDENCE_THRESHOLDS.medium), "medium");
    assertEquals(scoreToConfidence(0.2), "low");
  });

  it("exposes documented thresholds and constants", () => {
    assertEquals(CONFIDENCE_THRESHOLDS, { high: 0.7, medium: 0.4 });
    assertEquals(PARTIAL_MATCH, 0.4);
    assertEquals(STRONG_MATCH, 0.9);
    assertEquals(CONTRADICTION_FACTOR, 0.5);
  });
});

describe("compareFeatureVectors", () => {
  it("scores an identical lost/found pair as a strong match", () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(makeReport({ id: "r2", userId: "u2", type: "FOUND" }));

    const result = compareFeatureVectors(lost, found);

    assertGreaterOrEqual(result.score, 0.9);
    assertEquals(result.confidence, "high");
    assertEquals(result.evidence.category.status, "match");
    assertEquals(result.evidence.brand.status, "match");
    assertEquals(result.evidence.color.status, "match");
  });

  it("scores same category but different unique features lower than a full match", () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(
      makeReport({
        id: "r2",
        userId: "u2",
        type: "FOUND",
        item: { uniqueFeatures: "Blue water bottle, car keys" },
      }),
    );

    const full = compareFeatureVectors(
      lost,
      extractFeatureVector(makeReport({ id: "r3", userId: "u3", type: "FOUND" })),
    );
    const result = compareFeatureVectors(lost, found);

    assertEquals(full.score, 1);
    assertLess(result.score, full.score);
    assertGreater(result.score, 0.5);
    assertLess(result.score, 0.9);
    assertEquals(result.evidence.uniqueFeatures.status, "different");
    assertEquals(result.evidence.uniqueFeatures.matching, []);
  });

  it("keeps a strong score when information is missing instead of contradicting", () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(
      makeReport({
        id: "r2",
        userId: "u2",
        type: "FOUND",
        item: { brand: null, model: null, uniqueFeatures: null },
      }),
    );

    const result = compareFeatureVectors(lost, found);

    assertGreaterOrEqual(result.score, 0.7);
    assertEquals(result.confidence, "high");
    assertEquals(result.evidence.brand.status, "missing");
    assertEquals(result.evidence.model.status, "missing");
    assert(result.summary.missing.includes("Brand"));
    assertFalse(result.summary.missing.includes("Model"));
  });

  it("penalizes a contradictory brand", () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(
      makeReport({ id: "r2", userId: "u2", type: "FOUND", item: { brand: "Adidas" } }),
    );

    const result = compareFeatureVectors(lost, found);

    assertEquals(result.evidence.brand.status, "contradictory");
    assert(result.evidence.brand.contradictory.includes("Adidas"));
    assert(result.summary.contradictory.includes("Brand: Nike vs Adidas"));
    assertLess(result.score, 0.9);
    assertGreater(result.score, 0.6);
  });

  it("scores a different category as a weak match", () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(
      makeReport({
        id: "r2",
        userId: "u2",
        type: "FOUND",
        item: {
          title: "Silver iPhone",
          category: "Electronics",
          description: "Silver iPhone 15 Pro with Face ID.",
          color: "Silver",
          brand: "Apple",
          model: "iPhone 15 Pro",
          uniqueFeatures: "Face ID, telephoto camera",
          size: "Small",
        },
        location: "Cafeteria",
      }),
    );

    const result = compareFeatureVectors(lost, found);

    assertEquals(result.evidence.category.status, "contradictory");
    assertLess(result.score, 0.4);
    assertEquals(result.confidence, "low");
  });

  it("matches the same item expressed in slightly different wording", () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(
      makeReport({
        id: "r2",
        userId: "u2",
        type: "FOUND",
        item: {
          title: "Nike Backpack Black",
          description: "A black Nike backpack, carries a red keychain, the left strap has a small tear.",
        },
      }),
    );

    assertEquals(calculateTextSimilarity("Black Nike Backpack", "Nike Backpack Black"), 1);
    const result = compareFeatureVectors(lost, found);

    assertGreaterOrEqual(result.score, 0.85);
    assertEquals(result.confidence, "high");
  });

  it("handles null and empty optional fields without crashing", () => {
    const empty = makeReport({
      item: {
        title: "",
        category: "",
        description: "",
        color: null,
        brand: null,
        model: null,
        uniqueFeatures: null,
        condition: null,
        size: null,
        imageUrl: null,
      },
      location: "",
    });

    const result = compareFeatureVectors(extractFeatureVector(empty), extractFeatureVector(empty));

    assertLess(result.score, 0.4);
    assertEquals(result.confidence, "low");
    assertEquals(result.evidence.category.status, "missing");
    assertFalse(result.summary.matching.includes("Same category"));
    assertEquals(result.summary.missing, []);
  });

  it("ignores missing image similarity instead of treating it as evidence", () => {
    const lost = extractFeatureVector(makeReport({ item: { imageUrl: "/uploads/a.jpg" } }));
    const found = extractFeatureVector(
      makeReport({ id: "r2", userId: "u2", type: "FOUND", item: { imageUrl: "/uploads/b.jpg" } }),
    );

    const result = compareFeatureVectors(lost, found);

    assertEquals(result.evidence.image.status, "missing");
    assertEquals(result.score, 1);
  });

  it("uses a supplied image similarity when available", () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(makeReport({ id: "r2", userId: "u2", type: "FOUND" }));

    const result = compareFeatureVectors(lost, found, { imageSimilarity: 0.88 });

    assertEquals(result.evidence.image.status, "partial");
    assertEquals(result.evidence.image.similarity, 0.88);
  });

  it("generates structured evidence for every feature", () => {
    const lost = extractFeatureVector(makeReport());
    const found = extractFeatureVector(makeReport({ id: "r2", userId: "u2", type: "FOUND" }));

    const result = compareFeatureVectors(lost, found);
    const keys = [
      "category",
      "title",
      "description",
      "color",
      "brand",
      "model",
      "uniqueFeatures",
      "condition",
      "size",
      "location",
      "time",
      "image",
    ];

    for (const key of keys) {
      const fieldEvidence = result.evidence[key];
      assertExists(fieldEvidence);
      assert("status" in fieldEvidence);
      assert("similarity" in fieldEvidence);
      assert("matching" in fieldEvidence);
      assert("missing" in fieldEvidence);
      assert("contradictory" in fieldEvidence);
    }

    assert(Array.isArray(result.summary.matching));
    assert(Array.isArray(result.summary.missing));
    assert(Array.isArray(result.summary.contradictory));
  });
});

describe("findEligibleCandidates (community scoping)", () => {
  it("restricts candidates to the same community and excludes same-user reports", async () => {
    const candidates = [
      { id: "a", userId: "u2", type: "FOUND", status: "FOUND", communityId: "c1" },
      { id: "b", userId: "u2", type: "FOUND", status: "FOUND", communityId: "c2" },
      { id: "c", userId: "u1", type: "FOUND", status: "FOUND", communityId: "c1" },
    ];
    const { client, ops } = fakeClient(candidates);

    const result = await findEligibleCandidates(
      { type: "LOST", userId: "u1", communityId: "c1" },
      client as never,
    );

    assert(ops.some((op) => op.kind === "eq" && op.col === "type" && op.value === "FOUND"));
    assert(ops.some((op) => op.kind === "eq" && op.col === "communityId" && op.value === "c1"));
    const statusOp = ops.find((op) => op.kind === "in" && op.col === "status");
    assertExists(statusOp);
    assertEquals(statusOp.value, ["LOST", "FOUND", "POSSIBLE_MATCH"]);
    assertEquals(result as unknown[], [
      { id: "a", userId: "u2", type: "FOUND", status: "FOUND", communityId: "c1" },
    ]);
  });

  it("keeps backward compatibility when the report has no communityId", async () => {
    const { client, ops } = fakeClient([]);

    await findEligibleCandidates({ type: "LOST", userId: "u1", communityId: null }, client as never);

    assertEquals(ops.some((op) => op.col === "communityId"), false);
  });
});

describe("rankMatches", () => {
  it("returns matches sorted by score descending", () => {
    const report = makeReport();

    const strong = makeReport({ id: "r-strong", userId: "u2", type: "FOUND" });
    const medium = makeReport({
      id: "r-medium",
      userId: "u2",
      type: "FOUND",
      item: { uniqueFeatures: "Blue water bottle, car keys" },
    });
    const weak = makeReport({
      id: "r-weak",
      userId: "u2",
      type: "FOUND",
      item: {
        title: "Silver iPhone",
        category: "Electronics",
        description: "Silver iPhone 15 Pro with Face ID.",
        color: "Silver",
        brand: "Apple",
        uniqueFeatures: "Face ID, telephoto camera",
        size: "Small",
      },
    });

    const { matches } = rankMatches(report as never, [weak, medium, strong] as never);

    assertEquals(
      matches.map((m) => m.score),
      [...matches.map((m) => m.score)].sort((a, b) => b - a),
    );
    assertEquals(matches[0].foundReportId, "r-strong");
    assertEquals(matches[0].score, 1);
  });

  it("limits the number of returned matches", () => {
    const report = makeReport();
    const candidates = [1, 2, 3].map((i) =>
      makeReport({
        id: `r${i}`,
        userId: "u2",
        type: "FOUND",
        item: { uniqueFeatures: `feature ${i}` },
      })
    );

    const { matches } = rankMatches(report as never, candidates as never, { limit: 2 });

    assertEquals(matches.length, 2);
  });

  it("exposes an optional image similarity provider hook", () => {
    const report = makeReport();
    const candidate = makeReport({ id: "r2", userId: "u2", type: "FOUND" });

    const { matches } = rankMatches(report as never, [candidate] as never, {
      imageSimilarity: () => 0.91,
    });

    assertEquals(matches[0].imageSimilarity, 0.91);
    assertEquals(matches[0].evidence.image.status, "match");
  });
});