// PostgREST / supabase-js query helpers.

// Escape a value for embedded use inside a PostgREST logical-operator filter
// string (e.g. `.or("title.ilike.*...*")`). Characters that PostgREST treats
// specially inside a filter value must be backslash-escaped.
export function escapeFilter(value: string): string {
  return value.replace(/[\\*.,()[\]"]/g, (c) => `\\${c}`);
}

// `contains`-style wildcard pattern for use inside a `.or()` string.
// PostgREST uses `*` as its single wildcard, matching on both sides.
export function orLikePattern(value: string): string {
  return `*${escapeFilter(value)}*`;
}

// `contains`, case-insensitive, as a Postgres LIKE pattern passed as a bind
// parameter (used with `.ilike(column, pattern)`). Literal `%`, `_` and `\`
// in the user's value are escaped so they match literally.
export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}