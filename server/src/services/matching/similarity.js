const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

export function normalize(value) {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase().trim().replace(NON_ALPHANUMERIC, ' ');
}

export function tokenize(value) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

export function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

export function calculateTextSimilarity(a, b) {
  if (!hasValue(a) || !hasValue(b)) return null;

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.length === 0 || tokensB.length === 0) return null;
  if (tokensA.join(' ') === tokensB.join(' ')) return 1;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }

  const union = new Set([...setA, ...setB]).size;
  if (union === 0) return 0;

  return intersection / union;
}

export function calculateFieldSimilarity(a, b) {
  return calculateTextSimilarity(a, b);
}

export function calculateLocationSimilarity(a, b) {
  return calculateTextSimilarity(a, b);
}

export function calculateDateSimilarity(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null;

  const d1 = new Date(a);
  const d2 = new Date(b);

  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;

  const diffHours = Math.abs(d1 - d2) / (1000 * 60 * 60);

  if (diffHours <= 1) return 1;
  if (diffHours <= 6) return 0.8;
  if (diffHours <= 12) return 0.6;
  if (diffHours <= 24) return 0.4;
  if (diffHours <= 48) return 0.2;

  return 0;
}