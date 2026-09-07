export const FEATURE_FIELDS = [
  { key: 'category', label: 'Category', type: 'strict', weight: 0.12 },
  { key: 'title', label: 'Title', type: 'fuzzy', weight: 0.08 },
  { key: 'description', label: 'Description', type: 'fuzzy', weight: 0.06 },
  { key: 'color', label: 'Color', type: 'strict', weight: 0.08 },
  { key: 'brand', label: 'Brand', type: 'strict', weight: 0.1 },
  { key: 'model', label: 'Model', type: 'strict', weight: 0.15 },
  { key: 'uniqueFeatures', label: 'Unique features', type: 'fuzzy', weight: 0.18 },
  { key: 'condition', label: 'Condition', type: 'strict', weight: 0.03 },
  { key: 'size', label: 'Size', type: 'strict', weight: 0.04 },
  { key: 'location', label: 'Location', type: 'fuzzy', weight: 0.04 },
  { key: 'time', label: 'Time', type: 'time', weight: 0.02 },
  { key: 'image', label: 'Image', type: 'image', weight: 0.1 }
];

export function extractFeatureVector(report) {
  const item = report.item || {};

  return {
    category: item.category || null,
    title: item.title || null,
    description: item.description || null,
    color: item.color || null,
    brand: item.brand || null,
    model: item.model || null,
    uniqueFeatures: item.uniqueFeatures || null,
    condition: item.condition || null,
    size: item.size || null,
    location: report.location || null,
    time: report.dateTime || null,
    image: item.imageUrl || null
  };
}