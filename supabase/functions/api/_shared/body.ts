import type { Context } from "oak";

export async function readJson<T>(ctx: Context): Promise<T> {
  return await ctx.request.body.json() as T;
}

export async function readFormData(ctx: Context): Promise<FormData> {
  return await ctx.request.body.formData() as FormData;
}

export function strField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  if (value === null) return undefined;
  return typeof value === "string" ? value : undefined;
}

export function fileField(form: FormData, name: string): File | undefined {
  const value = form.get(name);
  return value instanceof File ? value : undefined;
}