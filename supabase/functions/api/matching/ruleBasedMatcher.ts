import { FEATURE_FIELDS, type FeatureField, type FeatureVector } from "./featureExtractor.ts";
import {
  calculateDateSimilarity,
  calculateFieldSimilarity,
  calculateLocationSimilarity,
  calculateTextSimilarity,
  hasValue,
} from "./similarity.ts";

export const CONFIDENCE_THRESHOLDS = { high: 0.7, medium: 0.4 };
export const CONTRADICTION_FACTOR = 0.5;
export const STRONG_MATCH = 0.9;
export const PARTIAL_MATCH = 0.4;
export const MIN_EVIDENCE_WEIGHT = 0.1;

type SimilarityFn = (a: unknown, b: unknown) => number | null;

const SIMILARITY_FNS: Record<string, SimilarityFn> = {
  category: calculateFieldSimilarity,
  color: calculateFieldSimilarity,
  brand: calculateFieldSimilarity,
  model: calculateFieldSimilarity,
  condition: calculateFieldSimilarity,
  size: calculateFieldSimilarity,
  title: calculateTextSimilarity,
  description: calculateTextSimilarity,
  uniqueFeatures: calculateTextSimilarity,
  location: calculateLocationSimilarity,
  time: calculateDateSimilarity,
};

const SUMMARY_LABELS: Record<string, string> = {
  category: "Category",
  title: "Title",
  description: "Description",
  color: "Color",
  brand: "Brand",
  model: "Model",
  uniqueFeatures: "Unique features",
  condition: "Condition",
  size: "Size",
  location: "Location",
  time: "Time",
  image: "Image",
};

export type Confidence = "high" | "medium" | "low";

export interface FieldEvidence {
  status: "match" | "partial" | "different" | "contradictory" | "missing";
  similarity: number | null;
  matching: string[];
  missing: string[];
  contradictory: string[];
}

export interface CompareResult {
  score: number;
  confidence: Confidence;
  evidence: Record<string, FieldEvidence>;
  summary: { matching: string[]; missing: string[]; contradictory: string[] };
}

export function scoreToConfidence(score: number): Confidence {
  if (score >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (score >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

function splitUniqueFeatures(value: unknown): string[] {
  const parts = String(value)
    .split(/[,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return parts.length > 0 ? parts : [String(value).toLowerCase().trim()];
}

function emptyEvidence(label?: string): FieldEvidence {
  return {
    status: "missing",
    similarity: null,
    matching: [],
    missing: label ? [label] : [],
    contradictory: [],
  };
}

function compareField(field: FeatureField, valueA: unknown, valueB: unknown): FieldEvidence {
  const { key, label, type } = field;
  const aHas = hasValue(valueA);
  const bHas = hasValue(valueB);

  if (!aHas && !bHas) return emptyEvidence();
  if (!aHas || !bHas) return emptyEvidence(label);

  const similarity = SIMILARITY_FNS[key] ? SIMILARITY_FNS[key](valueA, valueB) : null;
  const sim = similarity === null ? 0 : similarity;

  if (key === "uniqueFeatures") {
    const tokensA = splitUniqueFeatures(valueA);
    const tokensB = splitUniqueFeatures(valueB);
    const matching = tokensA.filter((token) => tokensB.includes(token));
    const missingTokens = tokensA.filter((token) => !tokensB.includes(token));

    if (sim >= STRONG_MATCH) {
      return { status: "match", similarity: sim, matching, missing: [], contradictory: [] };
    }
    if (sim >= PARTIAL_MATCH) {
      return { status: "partial", similarity: sim, matching, missing: missingTokens, contradictory: [] };
    }
    return { status: "different", similarity: sim, matching, missing: missingTokens, contradictory: [] };
  }

  if (type === "strict") {
    if (sim === 1) {
      return { status: "match", similarity: sim, matching: [String(valueA)], missing: [], contradictory: [] };
    }
    if (sim > 0) {
      return { status: "partial", similarity: sim, matching: [], missing: [], contradictory: [] };
    }
    return { status: "contradictory", similarity: sim, matching: [], missing: [], contradictory: [String(valueB)] };
  }

  if (sim >= STRONG_MATCH) {
    return { status: "match", similarity: sim, matching: [String(valueA)], missing: [], contradictory: [] };
  }
  if (sim >= PARTIAL_MATCH) {
    return { status: "partial", similarity: sim, matching: [], missing: [], contradictory: [] };
  }
  return { status: "different", similarity: sim, matching: [], missing: [], contradictory: [] };
}

function compareImageField(valueA: unknown, similarity: number | null | undefined): FieldEvidence {
  if (
    similarity !== null &&
    similarity !== undefined &&
    typeof similarity === "number" &&
    similarity >= 0 &&
    similarity <= 1
  ) {
    const status: FieldEvidence["status"] =
      similarity >= STRONG_MATCH ? "match" : similarity >= PARTIAL_MATCH ? "partial" : "different";
    return {
      status,
      similarity,
      matching: status === "match" ? [String(valueA || "")] : [],
      missing: [],
      contradictory: [],
    };
  }
  return { status: "missing", similarity: null, matching: [], missing: [], contradictory: [] };
}

function buildSummary(
  evidence: Record<string, FieldEvidence>,
  lostFeatures: FeatureVector,
  foundFeatures: FeatureVector,
): CompareResult["summary"] {
  const matching: string[] = [];
  const missing: string[] = [];
  const contradictory: string[] = [];

  for (const field of FEATURE_FIELDS) {
    const fieldEvidence = evidence[field.key];
    if (!fieldEvidence) continue;
    const label = SUMMARY_LABELS[field.key];

    if (fieldEvidence.status === "match") {
      if (field.type === "fuzzy") {
        matching.push(`Similar ${label.toLowerCase()}`);
      } else {
        matching.push(`Same ${label.toLowerCase()}`);
      }
    } else if (fieldEvidence.status === "partial") {
      matching.push(`Partially similar ${label.toLowerCase()}`);
    }

    if (fieldEvidence.status === "missing" && fieldEvidence.missing.length > 0) {
      missing.push(label);
    }

    if (fieldEvidence.status === "contradictory") {
      const lostValue = hasValue(lostFeatures[field.key as keyof FeatureVector])
        ? String(lostFeatures[field.key as keyof FeatureVector])
        : "unknown";
      const foundValue = hasValue(foundFeatures[field.key as keyof FeatureVector])
        ? String(foundFeatures[field.key as keyof FeatureVector])
        : "unknown";
      contradictory.push(`${label}: ${lostValue} vs ${foundValue}`);
    }
  }

  const uniqueMissing = [...new Set(missing)];
  return { matching, missing: uniqueMissing, contradictory };
}

export function compareFeatureVectors(
  lostFeatures: FeatureVector,
  foundFeatures: FeatureVector,
  options: { imageSimilarity?: number | null } = {},
): CompareResult {
  const imageSimilarity = options.imageSimilarity;

  const evidence: Record<string, FieldEvidence> = {};
  let numerator = 0;
  let denominator = 0;

  for (const field of FEATURE_FIELDS) {
    const valueA = lostFeatures[field.key as keyof FeatureVector];
    const valueB = foundFeatures[field.key as keyof FeatureVector];

    if (field.type === "image") {
      const fieldEvidence = compareImageField(valueA, imageSimilarity);
      if (fieldEvidence.status !== "missing") {
        numerator += (fieldEvidence.similarity ?? 0) * field.weight;
        denominator += field.weight;
      }
      evidence[field.key] = fieldEvidence;
      continue;
    }

    const fieldEvidence = compareField(field, valueA, valueB);
    evidence[field.key] = fieldEvidence;

    if (fieldEvidence.status === "missing") continue;

    let contribution = fieldEvidence.similarity ?? 0;
    if (field.type === "strict" && fieldEvidence.status === "contradictory") {
      contribution = -CONTRADICTION_FACTOR;
    }

    numerator += contribution * field.weight;
    denominator += field.weight;
  }

  const rawScore = denominator === 0 ? 0 : Math.max(0, Math.min(1, numerator / denominator));
  const coverage = denominator >= MIN_EVIDENCE_WEIGHT ? 1 : denominator / MIN_EVIDENCE_WEIGHT;
  const score = Number((rawScore * coverage).toFixed(4));
  const confidence = scoreToConfidence(score);
  const summary = buildSummary(evidence, lostFeatures, foundFeatures);

  return { score, confidence, evidence, summary };
}