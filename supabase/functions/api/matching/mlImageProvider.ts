// Adapter that feeds the rule-based matcher's image field with the DINOv2
// cosine similarity produced by the Python ML service.
//
// This is deliberately the ONLY place that knows how to turn a pair of Item
// records into an ML call, so the automatic matching path and the report
// preview path cannot drift apart.
//
// Scope is intentionally narrow:
//   - no image on either side  -> null, and the Python service is never called
//   - ML unconfigured or failing -> null, which ruleBasedMatcher already reads
//                                  as "no image evidence"
//
// The final score is still produced by compareFeatureVectors. The 0.9/0.1
// ensemble from the Python prototype is NOT applied here.

import { getImageSimilarity } from "./mlClient.ts";

type ItemLike = Record<string, unknown> | null | undefined;

export type ImageSimilarityProvider = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) => Promise<number | null>;

function imageUrlOf(item: ItemLike): string | null {
  const url = (item as { imageUrl?: unknown } | null | undefined)?.imageUrl;
  return typeof url === "string" && url.trim().length > 0 ? url : null;
}

/**
 * Build an image-similarity provider bound to a similarity function.
 *
 * The second parameter exists so tests can supply a fake without stubbing a
 * module namespace; production uses getImageSimilarity directly.
 */
export function createMlImageSimilarityProvider(
  similarity: (a: string, b: string) => Promise<number | null> = getImageSimilarity,
): ImageSimilarityProvider {
  return async (lostItem, foundItem) => {
    const lostUrl = imageUrlOf(lostItem);
    const foundUrl = imageUrlOf(foundItem);

    // Missing image evidence is the normal case for many reports. Returning
    // null here keeps the image field out of the weighted average, exactly as
    // it behaved before image similarity existed.
    if (!lostUrl || !foundUrl) return null;

    try {
      return await similarity(lostUrl, foundUrl);
    } catch {
      // An ML outage must never fail report creation or matching. null keeps
      // the existing matcher in charge.
      return null;
    }
  };
}

/** The provider used by both matchingService.findMatches and the preview route. */
export const mlImageSimilarityProvider: ImageSimilarityProvider =
  createMlImageSimilarityProvider();
