import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import { rankMatches } from "../matching/aiMatchingService.ts";
import {
  createMlImageSimilarityProvider,
  mlImageSimilarityProvider,
} from "../matching/mlImageProvider.ts";

const baseTime = "2026-09-08T10:00:00Z";

const LOST_URL = "https://res.cloudinary.com/demo/image/upload/lost.png";
const FOUND_URL = "https://res.cloudinary.com/demo/image/upload/found.png";

function makeReport(overrides: Record<string, unknown> = {}) {
  const item = {
    title: "Black Nike Backpack",
    category: "Bags",
    description: "Black Nike backpack with a red keychain.",
    color: "Black",
    brand: "Nike",
    model: null,
    uniqueFeatures: "Red keychain",
    condition: "Used",
    size: "Large",
    imageUrl: LOST_URL,
    ...((overrides.item as Record<string, unknown>) || {}),
  };
  return {
    id: (overrides.id as string) || "r1",
    userId: (overrides.userId as string) || "u1",
    type: (overrides.type as string) || "LOST",
    location: "Library, 2nd floor",
    dateTime: baseTime,
    communityId: null,
    community: null,
    user: { id: (overrides.userId as string) || "u1", name: "x" },
    item: { ...item, ...((overrides.item as Record<string, unknown>) || {}) },
  };
}

type Sim = (a: string, b: string) => Promise<number | null>;

describe("ml image similarity provider", () => {
  it("forwards both image URLs to the similarity function", async () => {
    const seen: [string, string][] = [];
    const provider = createMlImageSimilarityProvider((a, b) => {
      seen.push([a, b]);
      return Promise.resolve(0.81);
    });

    const result = await provider({ imageUrl: LOST_URL }, { imageUrl: FOUND_URL });

    assertEquals(result, 0.81);
    assertEquals(seen, [[LOST_URL, FOUND_URL]]);
  });

  it("does not call the similarity function when the source has no image", async () => {
    let called = false;
    const provider = createMlImageSimilarityProvider(() => {
      called = true;
      return Promise.resolve(0.81);
    });

    const result = await provider({ imageUrl: null }, { imageUrl: FOUND_URL });

    assertEquals(result, null);
    assertEquals(called, false, "ML must not be called without a source image");
  });

  it("does not call the similarity function when the candidate has no image", async () => {
    let called = false;
    const provider = createMlImageSimilarityProvider(() => {
      called = true;
      return Promise.resolve(0.81);
    });

    const result = await provider({ imageUrl: LOST_URL }, { imageUrl: null });

    assertEquals(result, null);
    assertEquals(called, false, "ML must not be called without a candidate image");
  });

  it("treats an empty or whitespace imageUrl as no image", async () => {
    let called = false;
    const provider = createMlImageSimilarityProvider(() => {
      called = true;
      return Promise.resolve(0.81);
    });

    assertEquals(await provider({ imageUrl: "" }, { imageUrl: FOUND_URL }), null);
    assertEquals(await provider({ imageUrl: "   " }, { imageUrl: FOUND_URL }), null);
    assertEquals(called, false);
  });

  it("returns null when the ML service reports no similarity", async () => {
    const provider = createMlImageSimilarityProvider(() => Promise.resolve(null));
    assertEquals(await provider({ imageUrl: LOST_URL }, { imageUrl: FOUND_URL }), null);
  });

  it("returns null when the ML service throws", async () => {
    const provider = createMlImageSimilarityProvider(() => Promise.reject(new Error("ml down")));
    assertEquals(await provider({ imageUrl: LOST_URL }, { imageUrl: FOUND_URL }), null);
  });

  it("exposes a ready-to-use provider instance", () => {
    assertEquals(typeof mlImageSimilarityProvider, "function");
  });
});

describe("rankMatches with ML image evidence", () => {
  it("feeds ML image similarity into the image field", async () => {
    const report = makeReport();
    const candidate = makeReport({
      id: "r2",
      userId: "u2",
      type: "FOUND",
      item: { imageUrl: FOUND_URL },
    });

    const { matches } = await rankMatches(report as never, [candidate] as never, {
      imageSimilarity: createMlImageSimilarityProvider(() => Promise.resolve(0.88)),
    });

    assertEquals(matches[0].imageSimilarity, 0.88);
    assertEquals(matches[0].evidence.image.similarity, 0.88);
    // 0.88 sits between PARTIAL_MATCH (0.4) and STRONG_MATCH (0.9)
    assertEquals(matches[0].evidence.image.status, "partial");
  });

  it("marks a strong image similarity as a match", async () => {
    const report = makeReport();
    const candidate = makeReport({
      id: "r2",
      userId: "u2",
      type: "FOUND",
      item: { imageUrl: FOUND_URL },
    });

    const { matches } = await rankMatches(report as never, [candidate] as never, {
      imageSimilarity: createMlImageSimilarityProvider(() => Promise.resolve(0.95)),
    });

    assertEquals(matches[0].evidence.image.status, "match");
  });

  it("scores a pair with images but no ML result exactly as metadata-only", async () => {
    const report = makeReport();
    const candidate = makeReport({
      id: "r2",
      userId: "u2",
      type: "FOUND",
      item: { imageUrl: FOUND_URL },
    });

    const withMl = await rankMatches(report as never, [candidate] as never, {
      imageSimilarity: createMlImageSimilarityProvider(() => Promise.resolve(null)),
    });
    const withoutProvider = await rankMatches(report as never, [candidate] as never);

    // a null similarity must leave the weighted score untouched
    assertEquals(withMl.matches[0].score, withoutProvider.matches[0].score);
    assertEquals(withMl.matches[0].confidence, withoutProvider.matches[0].confidence);
    assertEquals(withMl.matches[0].imageSimilarity, null);
    assertEquals(withMl.matches[0].evidence.image.status, "missing");
  });

  it("matches metadata-only behaviour when the source report has no image", async () => {
    const report = makeReport({ item: { imageUrl: null } });
    const candidate = makeReport({
      id: "r2",
      userId: "u2",
      type: "FOUND",
      item: { imageUrl: FOUND_URL },
    });

    let called = 0;
    const { matches } = await rankMatches(report as never, [candidate] as never, {
      imageSimilarity: createMlImageSimilarityProvider(() => {
        called++;
        return Promise.resolve(0.99);
      }),
    });

    assertEquals(called, 0, "no ML call for a source report without an image");
    assertEquals(matches[0].imageSimilarity, null);
    assertEquals(matches[0].evidence.image.status, "missing");
  });

  it("matches metadata-only behaviour when the candidate has no image", async () => {
    const report = makeReport();
    const candidate = makeReport({ id: "r2", userId: "u2", type: "FOUND", item: { imageUrl: null } });

    let called = 0;
    const { matches } = await rankMatches(report as never, [candidate] as never, {
      imageSimilarity: createMlImageSimilarityProvider(() => {
        called++;
        return Promise.resolve(0.99);
      }),
    });

    assertEquals(called, 0, "no ML call for a candidate without an image");
    assertEquals(matches[0].imageSimilarity, null);
  });

  it("keeps matching when the ML service throws for every candidate", async () => {
    const report = makeReport();
    const candidates = [1, 2, 3].map((i) =>
      makeReport({ id: `r${i}`, userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } })
    );

    const { matches } = await rankMatches(report as never, candidates as never, {
      imageSimilarity: createMlImageSimilarityProvider(() => Promise.reject(new Error("ml down"))),
    });

    assertEquals(matches.length, 3);
    for (const match of matches) {
      assertEquals(match.imageSimilarity, null);
      assertExists(match.score);
    }
  });

  it("bounds concurrent ML calls to 2", async () => {
    const report = makeReport();
    const candidates = Array.from({ length: 8 }, (_, i) =>
      makeReport({ id: `r${i}`, userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } })
    );

    let inFlight = 0;
    let peak = 0;
    let calls = 0;

    const { matches } = await rankMatches(report as never, candidates as never, {
      imageSimilarity: createMlImageSimilarityProvider(() => {
        calls++;
        inFlight++;
        peak = Math.max(peak, inFlight);
        return new Promise<number | null>((resolve) =>
          setTimeout(() => {
            inFlight--;
            resolve(0.5);
          }, 5)
        );
      }),
    });

    assertEquals(calls, 8, "every candidate with images is compared once");
    assertEquals(matches.length, 8);
    assertEquals(peak <= 2, true, `peak concurrency was ${peak}, expected at most 2`);
    assertEquals(peak, 2, "the pool should actually reach the limit");
  });

  it("calls the ML provider once per source/candidate pair", async () => {
    const report = makeReport();
    // distinct image per candidate, so each pair is genuinely different
    const candidates = Array.from({ length: 6 }, (_, i) =>
      makeReport({
        id: `r${i}`,
        userId: "u2",
        type: "FOUND",
        item: { imageUrl: `${FOUND_URL}?v=${i}` },
      })
    );

    const seen: string[] = [];
    await rankMatches(report as never, candidates as never, {
      imageSimilarity: createMlImageSimilarityProvider((a, b) => {
        seen.push(`${a}|${b}`);
        return Promise.resolve(0.5);
      }),
    });

    assertEquals(seen.length, 6, "six candidates means six requests");
    assertEquals(new Set(seen).size, 6, "each pair must be requested exactly once");
  });

  it("does not re-request a pair that appears twice in the candidate list", async () => {
    const report = makeReport();
    const duplicate = makeReport({ id: "r1", userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } });

    let calls = 0;
    const { matches } = await rankMatches(
      report as never,
      [duplicate, makeReport({ id: "r1", userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } })] as never,
      {
        imageSimilarity: createMlImageSimilarityProvider(() => {
          calls++;
          return Promise.resolve(0.5);
        }),
      },
    );

    assertEquals(calls, 1, "the duplicate pair must reuse the in-flight result");
    assertEquals(matches.length, 2);
    assertEquals(matches[0].imageSimilarity, 0.5);
  });

  it("does not cache across separate rankMatches operations", async () => {
    const report = makeReport();
    const candidate = makeReport({ id: "r2", userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } });

    let calls = 0;
    const provider = createMlImageSimilarityProvider(() => {
      calls++;
      return Promise.resolve(0.5);
    });

    await rankMatches(report as never, [candidate] as never, { imageSimilarity: provider });
    await rankMatches(report as never, [candidate] as never, { imageSimilarity: provider });

    assertEquals(calls, 2, "each operation requests fresh, as there is no cross-request cache");
  });

  it("keeps a rejecting provider from poisoning the per-pair memo", async () => {
    const report = makeReport();
    const candidate = makeReport({ id: "r2", userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } });

    const { matches } = await rankMatches(report as never, [candidate, candidate] as never, {
      imageSimilarity: () => Promise.reject(new Error("ml down")),
    });

    assertEquals(matches.length, 2);
    assertEquals(matches[0].imageSimilarity, null);
    assertEquals(matches[1].imageSimilarity, null);
    assertExists(matches[0].score);
  });

  it("still ranks and limits correctly with ML enabled", async () => {
    const report = makeReport();
    const candidates = [1, 2, 3, 4].map((i) =>
      makeReport({ id: `r${i}`, userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } })
    );

    const { matches } = await rankMatches(report as never, candidates as never, {
      limit: 2,
      imageSimilarity: createMlImageSimilarityProvider(() => Promise.resolve(0.5)),
    });

    assertEquals(matches.length, 2);
    assertEquals(
      matches.map((m) => m.score),
      [...matches.map((m) => m.score)].sort((a, b) => b - a),
    );
  });
});

// helper: run body with a specific deadline env value, restoring env after
async function withDeadlineEnv<T>(value: string | undefined, body: () => Promise<T>): Promise<T> {
  const prior = Deno.env.get("LEFTBEHIND_ML_MATCHING_DEADLINE_MS");
  if (value === undefined) Deno.env.delete("LEFTBEHIND_ML_MATCHING_DEADLINE_MS");
  else Deno.env.set("LEFTBEHIND_ML_MATCHING_DEADLINE_MS", value);
  try {
    return await body();
  } finally {
    if (prior === undefined) Deno.env.delete("LEFTBEHIND_ML_MATCHING_DEADLINE_MS");
    else Deno.env.set("LEFTBEHIND_ML_MATCHING_DEADLINE_MS", prior);
  }
}

describe("ML matching deadline", () => {
  // a provider that never resolves on its own, to exercise the deadline
  const neverProvider = () => new Promise<number>(() => {});

  it("defaults the deadline to 5000ms when the env var is unset", async () => {
    // a 4900ms wait must be cut off by the 5000ms default, not by luck
    const report = makeReport();
    const candidate = makeReport({ id: "r2", userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } });

    const t0 = Date.now();
    const { matches } = await withDeadlineEnv(undefined, () =>
      rankMatches(report as never, [candidate] as never, {
        imageSimilarity: () => Promise.resolve(0.5).then(() => new Promise<number>(() => {})),
      })
    );
    // must not have returned instantly; the provider never settles on its own
    assertEquals(matches.length, 1);
    assertEquals(Date.now() - t0 >= 4900, true, "should wait out the default budget");
  });

  it("honors an explicit deadline override", async () => {
    const report = makeReport();
    const candidate = makeReport({ id: "r2", userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } });

    const t0 = Date.now();
    const { matches } = await withDeadlineEnv("150", () =>
      rankMatches(report as never, [candidate] as never, { imageSimilarity: neverProvider })
    );
    const elapsed = Date.now() - t0;

    assertEquals(elapsed >= 140, true, `elapsed ${elapsed}ms, expected >= 140ms`);
    assertEquals(elapsed < 1000, true, `elapsed ${elapsed}ms, expected well under 1s`);
    assertEquals(matches[0].imageSimilarity, null);
  });

  for (const bad of ["0", "-1", "abc", ""]) {
    it(`falls back to the 5000ms default for an invalid deadline ${JSON.stringify(bad)}`, async () => {
      const report = makeReport();
      const candidate = makeReport({ id: "r2", userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } });

      const t0 = Date.now();
      const { matches } = await withDeadlineEnv(bad, () =>
        // 800ms < 5000ms, so if the bad value were used as 0 or tiny the
        // result would return immediately instead of waiting
        rankMatches(report as never, [candidate] as never, {
          imageSimilarity: () => new Promise((resolve) => setTimeout(() => resolve(0.5), 800)),
        })
      );
      const elapsed = Date.now() - t0;

      assertEquals(matches[0].imageSimilarity, 0.5, "the slow result must still arrive");
      assertEquals(elapsed >= 750, true, `elapsed ${elapsed}ms, invalid deadline must not shorten the budget`);
    });
  }

  it("stops starting new ML requests once the deadline expires", async () => {
    const report = makeReport();
    // 6 candidates at concurrency 2, each taking 120ms, with a 200ms deadline: waves start at
    // 0ms and 120ms, and the third wave at 240ms is past the deadline, so it never starts.
    // The deadline must sit clear of both wave boundaries -- at 250ms it landed only 10ms after
    // the third wave, so whether it started came down to timer jitter.
    const candidates = Array.from({ length: 6 }, (_, i) =>
      makeReport({ id: `r${i}`, userId: "u2", type: "FOUND", item: { imageUrl: `${FOUND_URL}?v=${i}` } })
    );

    let started = 0;
    const { matches } = await withDeadlineEnv("200", () =>
      rankMatches(report as never, candidates as never, {
        imageSimilarity: createMlImageSimilarityProvider(() => {
          started++;
          return new Promise((resolve) => setTimeout(() => resolve(0.5), 120));
        }),
      })
    );

    assertEquals(started < 6, true, `started ${started}/6, deadline must block later requests`);
    assertEquals(matches.length, 6, "every candidate must still be ranked");
    // candidates land in two null-image groups: started but cut off mid-flight,
    // and never started because the budget was gone. Together they must cover
    // every candidate that did not finish in time.
    const nulls = matches.filter((m) => m.imageSimilarity === null).length;
    assertEquals(nulls >= 6 - started, true, `started ${started}, nulls ${nulls}`);
    assertEquals(
      nulls + matches.filter((m) => m.imageSimilarity === 0.5).length,
      6,
      "every candidate ends with either a real similarity or null",
    );
  });

  it("does not hang on an in-flight request and still returns every candidate", async () => {
    const report = makeReport();
    const candidates = Array.from({ length: 5 }, (_, i) =>
      makeReport({ id: `r${i}`, userId: "u2", type: "FOUND", item: { imageUrl: `${FOUND_URL}?v=${i}` } })
    );

    const t0 = Date.now();
    const { matches } = await withDeadlineEnv("200", () =>
      // never settles: only the deadline can end this call
      rankMatches(report as never, candidates as never, { imageSimilarity: neverProvider })
    );
    const elapsed = Date.now() - t0;

    assertEquals(elapsed < 1000, true, `rankMatches took ${elapsed}ms with a hung provider`);
    assertEquals(matches.length, 5, "all candidates ranked despite the hang");
    for (const m of matches) assertEquals(m.imageSimilarity, null);
  });

  it("falls back to metadata-only scores after the deadline expires", async () => {
    const report = makeReport();
    const candidates = Array.from({ length: 3 }, (_, i) =>
      makeReport({ id: `r${i}`, userId: "u2", type: "FOUND", item: { imageUrl: `${FOUND_URL}?v=${i}` } })
    );

    const { matches } = await withDeadlineEnv("100", () =>
      rankMatches(report as never, candidates as never, { imageSimilarity: neverProvider })
    );
    const { matches: legacy } = await rankMatches(report as never, candidates as never);

    assertEquals(
      matches.map((m) => m.score),
      legacy.map((m) => m.score),
      "expired ML must reproduce the metadata-only score exactly",
    );
    assertEquals(
      matches.map((m) => m.evidence.image.status),
      legacy.map((m) => m.evidence.image.status),
    );
  });

  it("keeps concurrency at or below 2 under a deadline", async () => {
    const report = makeReport();
    const candidates = Array.from({ length: 8 }, (_, i) =>
      makeReport({ id: `r${i}`, userId: "u2", type: "FOUND", item: { imageUrl: `${FOUND_URL}?v=${i}` } })
    );

    let active = 0;
    let peak = 0;
    await withDeadlineEnv("2000", () =>
      rankMatches(report as never, candidates as never, {
        imageSimilarity: createMlImageSimilarityProvider(() => {
          active++;
          peak = Math.max(peak, active);
          return new Promise((resolve) =>
            setTimeout(() => {
              active--;
              resolve(0.5);
            }, 20)
          );
        }),
      })
    );

    assertEquals(peak <= 2, true, `peak concurrency was ${peak}, expected at most 2`);
  });

  it("still deduplicates a pair within one deadline-bounded operation", async () => {
    const report = makeReport();
    const duplicate = makeReport({ id: "r1", userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } });

    let calls = 0;
    const { matches } = await withDeadlineEnv("2000", () =>
      rankMatches(
        report as never,
        [duplicate, makeReport({ id: "r1", userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } })] as never,
        {
          imageSimilarity: createMlImageSimilarityProvider(() => {
            calls++;
            return Promise.resolve(0.5);
          }),
        },
      )
    );

    assertEquals(calls, 1, "the memo must still collapse the duplicate pair");
    assertEquals(matches.length, 2);
  });

  it("degrades to metadata-only when the ML service is unavailable", async () => {
    const report = makeReport();
    const candidates = [1, 2].map((i) =>
      makeReport({ id: `r${i}`, userId: "u2", type: "FOUND", item: { imageUrl: `${FOUND_URL}?v=${i}` } })
    );

    const { matches } = await withDeadlineEnv("2000", () =>
      rankMatches(report as never, candidates as never, {
        imageSimilarity: () => Promise.reject(new Error("connection refused")),
      })
    );
    const { matches: legacy } = await rankMatches(report as never, candidates as never);

    assertEquals(matches.map((m) => m.score), legacy.map((m) => m.score));
    for (const m of matches) assertEquals(m.imageSimilarity, null);
  });

  it("does not block the event loop after the deadline", async () => {
    // the timer must be cleared, otherwise Deno would keep the runtime alive
    await withDeadlineEnv("2000", async () => {
      const report = makeReport();
      const candidate = makeReport({ id: "r2", userId: "u2", type: "FOUND", item: { imageUrl: FOUND_URL } });
      await rankMatches(report as never, [candidate] as never, {
        imageSimilarity: () => Promise.resolve(0.5),
      });
    });
    assertEquals(true, await new Promise((r) => setTimeout(() => r(true), 0)));
  });
});
