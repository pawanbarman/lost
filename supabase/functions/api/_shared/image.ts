import { env } from "./env.ts";
import { ApiError } from "./error.ts";
import { uploadImage } from "./cloudinary.ts";

const ALLOWED_TYPES = /jpeg|jpg|png|webp/;
const CHAT_MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB


export interface ImageOptions {
  folderSuffix?: string;
  maxSize?: number;
}
export { CHAT_MAX_FILE_SIZE };
export async function handleImage(
  file: File | undefined,
  user?: { id?: string },
  options?: ImageOptions,
): Promise<string | null> {
  if (!file) return null;

  const filename = file.name ?? "";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const okExt = ALLOWED_TYPES.test(ext);
  const okMime = ALLOWED_TYPES.test(file.type);

  if (!(okMime && okExt)) {
    throw new ApiError("Images only (JPEG, PNG, WEBP)", 400);
  }

  const maxSize = options?.maxSize ?? env.maxFileSize;
  if (file.size > maxSize) {
    throw new ApiError("File too large. Maximum size is 5MB.", 400);
  }

  const folder = options?.folderSuffix
    ? `lost-and-found/${options.folderSuffix}`
    : `lost-and-found/reports/${user?.id || "anonymous"}`;
  const publicId = `img-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  return await uploadImage(buffer, { folder, publicId });
}