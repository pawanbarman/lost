import type { Context } from "oak";

// Reads either the JSON body or a multipart form body into `{ fields, file }`.
// The reports upload routes accept both content types; `image` is the single
// file field, everything else is treated as a string field.
export async function readFields(
  ctx: Context,
): Promise<{ fields: Record<string, unknown>; file?: File }> {
  const contentType = ctx.request.headers.get("Content-Type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await ctx.request.body.formData();
    const fields: Record<string, unknown> = {};
    let file: File | undefined;
    for (const [key, value] of form.entries()) {
      if (value instanceof File) {
        if (key === "image") file = value;
      } else {
        fields[key] = value;
      }
    }
    return { fields, file };
  }

  return { fields: await ctx.request.body.json() as Record<string, unknown> };
}