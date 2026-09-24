import { env } from "./env.ts";
import { ApiError } from "./error.ts";
import { uploadImage } from "./cloudinary.ts";

const ALLOWED_TYPES = /jpeg|jpg|png|webp/;

// Mirrors server/src/middleware/upload.js validation + production-only
// Cloudinary upload path. In the edge there is no local disk, so any provided
// file is always uploaded to Cloudinary.
export async function handleImage(
  file: File | undefined,
  user?: { id?: string },
): Promise<string | null> {
  if (!file) return null;

  const filename = file.name ?? "";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const okExt = ALLOWED_TYPES.test(ext);
  const okMime = ALLOWED_TYPES.test(file.type);

  if (!(okMime && okExt)) {
    throw new ApiError("Images only (JPEG, PNG, WEBP)", 400);
  }

  if (file.size > env.maxFileSize) {
    throw new ApiError("File too large. Maximum size is 5MB.", 400);
  }

  const folder = `lost-and-found/reports/${user?.id || "anonymous"}`;
  const publicId = `report-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  return await uploadImage(buffer, { folder, publicId });
}