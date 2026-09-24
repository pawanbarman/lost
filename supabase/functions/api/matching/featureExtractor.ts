export interface FeatureField {
  key: string;
  label: string;
  type: "strict" | "fuzzy" | "time" | "image";
  weight: number;
}

export const FEATURE_FIELDS: FeatureField[] = [
  { key: "category", label: "Category", type: "strict", weight: 0.12 },
  { key: "title", label: "Title", type: "fuzzy", weight: 0.08 },
  { key: "description", label: "Description", type: "fuzzy", weight: 0.06 },
  { key: "color", label: "Color", type: "strict", weight: 0.08 },
  { key: "brand", label: "Brand", type: "strict", weight: 0.1 },
  { key: "model", label: "Model", type: "strict", weight: 0.15 },
  { key: "uniqueFeatures", label: "Unique features", type: "fuzzy", weight: 0.18 },
  { key: "condition", label: "Condition", type: "strict", weight: 0.03 },
  { key: "size", label: "Size", type: "strict", weight: 0.04 },
  { key: "location", label: "Location", type: "fuzzy", weight: 0.04 },
  { key: "time", label: "Time", type: "time", weight: 0.02 },
  { key: "image", label: "Image", type: "image", weight: 0.1 },
];

export interface FeatureVector {
  category: string | null;
  title: string | null;
  description: string | null;
  color: string | null;
  brand: string | null;
  model: string | null;
  uniqueFeatures: string | null;
  condition: string | null;
  size: string | null;
  location: string | null;
  time: string | null;
  image: string | null;
}

export function extractFeatureVector(report: {
  item?: Record<string, unknown>;
  location?: unknown;
  dateTime?: unknown;
}): FeatureVector {
  const item = report.item ?? {};
  return {
    category: (item.category as string) || null,
    title: (item.title as string) || null,
    description: (item.description as string) || null,
    color: (item.color as string) || null,
    brand: (item.brand as string) || null,
    model: (item.model as string) || null,
    uniqueFeatures: (item.uniqueFeatures as string) || null,
    condition: (item.condition as string) || null,
    size: (item.size as string) || null,
    location: (report.location as string) || null,
    time: (report.dateTime as string) || null,
    image: (item.imageUrl as string) || null,
  };
}