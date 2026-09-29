import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import { stub } from "@std/testing/mock";
import { getImageSimilarity } from "../matching/mlClient.ts";

const IMAGE_A = "https://res.cloudinary.com/demo/image/upload/lost-a.jpg";
const IMAGE_B = "https://res.cloudinary.com/demo/image/upload/found-b.jpg";

type FetchCall = { url: string; init: RequestInit };

const ML_URL = "http://ml.internal:8000";

/** Stub the ML base URL and capture every fetch the client makes. */
function withMl(
  calls: FetchCall[],
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  const envStub = stub(Deno.env, "get", (key: string) => (key === "LEFTBEHIND_ML_SERVICE_URL" ? ML_URL : undefined));
  const fetchStub = stub(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(responder(String(input), init ?? {}));
  });
  return {
    restore() {
      fetchStub.restore();
      envStub.restore();
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getImageSimilarity", () => {
  it("returns null without calling fetch when the ML URL is not configured", async () => {
    let called = false;
    const envStub = stub(Deno.env, "get", () => undefined);
    const fetchStub = stub(globalThis, "fetch", () => {
      called = true;
      return Promise.resolve(jsonResponse({ image_similarity: 0.81 }));
    });
    try {
      assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
      assertEquals(called, false, "fetch must not run when ML is unconfigured");
    } finally {
      fetchStub.restore();
      envStub.restore();
    }
  });

  it("returns the similarity from a successful response", async () => {
    const calls: FetchCall[] = [];
    const harness = withMl(calls, () => jsonResponse({ image_similarity: 0.81 }));
    try {
      assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), 0.81);
    } finally {
      harness.restore();
    }
  });

  it("returns null when the service reports a null similarity", async () => {
    const harness = withMl([], () => jsonResponse({ image_similarity: null }));
    try {
      assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
    } finally {
      harness.restore();
    }
  });

  it("returns null on a non-2xx response", async () => {
    const calls: FetchCall[] = [];
    const harness = withMl(calls, () => jsonResponse({ detail: "nope" }, 503));
    try {
      assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
    } finally {
      harness.restore();
    }
  });

  it("aborts on the configured timeout and returns null", async () => {
    const envStub = stub(Deno.env, "get", (key: string) => {
      if (key === "LEFTBEHIND_ML_SERVICE_URL") return ML_URL;
      if (key === "LEFTBEHIND_ML_TIMEOUT_MS") return "25";
      return undefined;
    });
    // never resolves on its own: only the AbortSignal ends it
    const fetchStub = stub(globalThis, "fetch", (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        }
      })
    );
    try {
      assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
    } finally {
      fetchStub.restore();
      envStub.restore();
    }
  });

  it("defaults the timeout to 2000ms when not configured", async () => {
    let deadlineMs = 0;
    const envStub = stub(Deno.env, "get", (key: string) =>
      key === "LEFTBEHIND_ML_SERVICE_URL" ? ML_URL : undefined
    );
    // never settles on its own; the AbortSignal ends it
    const fetchStub = stub(globalThis, "fetch", (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const started = Date.now();
        signal?.addEventListener("abort", () => {
          deadlineMs = Date.now() - started;
          reject(new DOMException("aborted", "AbortError"));
        });
      })
    );
    try {
      assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
      // allow slack for timer granularity, but it must be the ~2s budget and
      // emphatically not the old 8s default
      assertEquals(deadlineMs >= 1900, true, `aborted after only ${deadlineMs}ms`);
      assertEquals(deadlineMs < 6000, true, `timeout was not bounded: ${deadlineMs}ms`);
    } finally {
      fetchStub.restore();
      envStub.restore();
    }
  });

  it("honours an explicit timeout override", async () => {
    let deadlineMs = 0;
    const envStub = stub(Deno.env, "get", (key: string) => {
      if (key === "LEFTBEHIND_ML_SERVICE_URL") return ML_URL;
      if (key === "LEFTBEHIND_ML_TIMEOUT_MS") return "300";
      return undefined;
    });
    const fetchStub = stub(globalThis, "fetch", (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const started = Date.now();
        init?.signal?.addEventListener("abort", () => {
          deadlineMs = Date.now() - started;
          reject(new DOMException("aborted", "AbortError"));
        });
      })
    );
    try {
      assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
      assertEquals(deadlineMs >= 250, true, `override ignored, aborted after ${deadlineMs}ms`);
      assertEquals(deadlineMs < 2000, true, `override not applied: ${deadlineMs}ms`);
    } finally {
      fetchStub.restore();
      envStub.restore();
    }
  });

  it("falls back to the default for an unusable timeout value", async () => {
    for (const raw of ["0", "-1", "abc", ""]) {
      let called = false;
      const envStub = stub(Deno.env, "get", (key: string) => {
        if (key === "LEFTBEHIND_ML_SERVICE_URL") return ML_URL;
        if (key === "LEFTBEHIND_ML_TIMEOUT_MS") return raw;
        return undefined;
      });
      // resolve instantly so the timeout value never actually fires
      const fetchStub = stub(globalThis, "fetch", () => {
        called = true;
        return Promise.resolve(jsonResponse({ image_similarity: 0.5 }));
      });
      try {
        assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), 0.5);
        assertEquals(called, true);
      } finally {
        fetchStub.restore();
        envStub.restore();
      }
    }
  });

  it("returns null on a network failure", async () => {
    const envStub = stub(Deno.env, "get", (key: string) =>
      key === "LEFTBEHIND_ML_SERVICE_URL" ? ML_URL : undefined
    );
    const fetchStub = stub(globalThis, "fetch", () => Promise.reject(new TypeError("boom")));
    try {
      assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
    } finally {
      fetchStub.restore();
      envStub.restore();
    }
  });

  it("returns null on a malformed JSON body", async () => {
    const harness = withMl([], () => new Response("{not json", { status: 200 }));
    try {
      assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
    } finally {
      harness.restore();
    }
  });

  it("returns null when image_similarity is absent from the response", async () => {
    const calls: FetchCall[] = [];
    const harness = withMl(calls, () => jsonResponse({ final_score: 0.9, decision: "HIGH_CONFIDENCE" }));
    try {
      assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
    } finally {
      harness.restore();
    }
  });

  it("returns null for a non-numeric similarity", async () => {
    const cases: unknown[] = ["0.81", Number.NaN, Number.POSITIVE_INFINITY, {}, true];
    for (const value of cases) {
      const calls: FetchCall[] = [];
      const harness = withMl(calls, () => jsonResponse({ image_similarity: value }));
      try {
        assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
      } finally {
        harness.restore();
      }
    }
  });

  it("returns null for a similarity outside the cosine range", async () => {
    for (const value of [1.0001, -1.0001, 42]) {
      const calls: FetchCall[] = [];
      const harness = withMl(calls, () => jsonResponse({ image_similarity: value }));
      try {
        assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), null);
      } finally {
        harness.restore();
      }
    }
  });

  it("accepts the boundary values of the cosine range", async () => {
    for (const value of [-1, 0, 1]) {
      const calls: FetchCall[] = [];
      const harness = withMl(calls, () => jsonResponse({ image_similarity: value }));
      try {
        assertEquals(await getImageSimilarity(IMAGE_A, IMAGE_B), value);
      } finally {
        harness.restore();
      }
    }
  });

  it("posts to the predict endpoint with both image URLs and placeholder features", async () => {
    const calls: FetchCall[] = [];
    const harness = withMl(calls, () => jsonResponse({ image_similarity: 0.81 }));
    try {
      await getImageSimilarity(IMAGE_A, IMAGE_B);

      assertEquals(calls.length, 1);
      const call = calls[0];
      assertEquals(call.url, `${ML_URL}/predict`);
      assertEquals(call.init.method, "POST");
      assertEquals((call.init.headers as Record<string, string>)["Content-Type"], "application/json");

      const body = JSON.parse(call.init.body as string) as {
        metadata_features: Record<string, unknown>;
        image_a: string;
        image_b: string;
      };
      assertEquals(body.image_a, IMAGE_A);
      assertEquals(body.image_b, IMAGE_B);

      const features = body.metadata_features;
      const expected = [
        "category_similarity",
        "title_similarity",
        "description_similarity",
        "color_similarity",
        "brand_similarity",
        "model_similarity",
        "unique_feature_similarity",
        "condition_similarity",
        "size_similarity",
        "location_similarity",
        "time_similarity",
      ];
      assertEquals(Object.keys(features).sort(), [...expected].sort());
      for (const name of expected) {
        assertExists(features[name], `${name} must be present`);
        assertEquals(typeof features[name], "number", `${name} must be numeric`);
        assertEquals(features[name], 0, `${name} must be the 0.0 placeholder`);
      }
    } finally {
      harness.restore();
    }
  });
});
