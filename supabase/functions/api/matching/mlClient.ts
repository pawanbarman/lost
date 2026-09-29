// Client for the standalone LeftBehind Python ML service.
//
// This is the IMAGE-ONLY half of the integration. The TypeScript matcher keeps
// full ownership of scoring: metadata similarity, weighted scoring, contradiction
// penalties, coverage, confidence, the persistence threshold, Match creation,
// POSSIBLE_MATCH, and notifications all stay where they are.
//
// We take exactly one value from Python: `image_similarity` (the DINOv2 cosine
// similarity between the two images). Everything else in the response
// (`metadata_probability`, `final_score`, `decision`) is deliberately ignored -
// see the placeholder note below.
//
// The client never throws. Any failure resolves to `null`, which is the value
// the existing rule-based matcher already treats as "no image evidence", so an
// unavailable ML service cannot break a report submission.

// Bounded so a stalled or cold DINOv2 service can never hold a report-creation
// request open. Ranked candidates are compared in waves of two, so this is the
// per-request budget, not the total. Override with LEFTBEHIND_ML_TIMEOUT_MS.
const DEFAULT_TIMEOUT_MS = 2000;

// The Python /predict endpoint requires metadata_features, but this integration
// does not use Python for metadata. These zeros are placeholders that exist
// only to satisfy that required field and activate the image branch; they are
// NOT derived from, and must never be read as, real similarities. The
// `metadata_probability` / `final_score` / `decision` that come back are
// therefore meaningless here and are not consumed.
const PLACEHOLDER_METADATA_FEATURES: Record<string, number> = {
  category_similarity: 0.0,
  title_similarity: 0.0,
  description_similarity: 0.0,
  color_similarity: 0.0,
  brand_similarity: 0.0,
  model_similarity: 0.0,
  unique_feature_similarity: 0.0,
  condition_similarity: 0.0,
  size_similarity: 0.0,
  location_similarity: 0.0,
  time_similarity: 0.0,
};

type FailureCategory =
  | "timeout"
  | "network"
  | "http"
  | "malformed"
  | "invalid-similarity";

function warn(category: FailureCategory): void {
  // category only - never the image URLs, the request body, the configured
  // base URL, or a stack trace
  console.warn(`[ml] image similarity request failed: ${category}`);
}

/**
 * DINOv2 cosine similarity for two Cloudinary image URLs.
 *
 * @param imageA Cloudinary https URL from Item.imageUrl
 * @param imageB Cloudinary https URL from Item.imageUrl
 * @returns similarity in [-1, 1], or null when ML is unconfigured or failed
 */
export async function getImageSimilarity(
  imageA: string,
  imageB: string,
): Promise<number | null> {
  // read at call time rather than from _shared/env.ts, which snapshots the
  // environment at import and would make this untestable
  const baseUrl = Deno.env.get("LEFTBEHIND_ML_SERVICE_URL");
  if (!baseUrl) return null;

  const rawTimeout = Number(Deno.env.get("LEFTBEHIND_ML_TIMEOUT_MS"));
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0
    ? rawTimeout
    : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata_features: PLACEHOLDER_METADATA_FEATURES,
        image_a: imageA,
        image_b: imageB,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      warn("http");
      return null;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      warn("malformed");
      return null;
    }

    const similarity = (payload as { image_similarity?: unknown } | null)?.image_similarity;
    if (similarity === null) return null;

    if (typeof similarity !== "number" || !Number.isFinite(similarity)) {
      warn("invalid-similarity");
      return null;
    }
    // cosine similarity is bounded; anything outside is a bad response
    if (similarity < -1 || similarity > 1) {
      warn("invalid-similarity");
      return null;
    }

    return similarity;
  } catch (err) {
    warn(err instanceof DOMException && err.name === "AbortError" ? "timeout" : "network");
    return null;
  } finally {
    clearTimeout(timer);
  }
}
