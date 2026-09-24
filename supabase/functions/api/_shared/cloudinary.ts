import { env } from "./env.ts";

// Raw Cloudinary REST client (signed) — the `cloudinary` npm SDK relies on Node streams,
// so we talk to Cloudinary's HTTP API directly with SHA-1 signed parameters.
// Mirrors the behavior of server/src/services/storageService.js (secure_url, destroy, extractPublicId).

type UploadOptions = {
  folder: string;
  publicId: string;
};

async function signParams(params: Record<string, string>, apiSecret: string): Promise<string> {
  // Cloudinary excludes resource_type from the signature (it is carried in the
  // request URL path, e.g. /image/upload), along with file/cloud_name/api_key.
  const { resource_type: _rt, ...signable } = params;
  const canonical = Object.keys(signable)
    .sort()
    .map((k) => `${k}=${signable[k]}`)
    .join("&");
  return await sha1Hex(new TextEncoder().encode(canonical + apiSecret));
}

async function sha1Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", toArrayBuffer(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function cloudinaryConfig() {
  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    throw new Error("Cloudinary configuration missing: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
  }
  return {
    cloudName: env.cloudinaryCloudName,
    apiKey: env.cloudinaryApiKey,
    apiSecret: env.cloudinaryApiSecret,
  };
}

export async function uploadImage(
  buffer: Uint8Array,
  options: UploadOptions,
): Promise<string> {
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const params: Record<string, string> = {
    folder: options.folder,
    public_id: options.publicId,
    resource_type: "image",
    overwrite: "false",
    invalidate: "true",
    timestamp,
  };
  const signature = await signParams(params, apiSecret);

  const form = new FormData();
  form.append("file", new Blob([toArrayBuffer(buffer)]), "image.jpg");
  for (const [key, value] of Object.entries({ ...params, api_key: apiKey, signature })) {
    form.append(key, value);
  }

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: form },
  );
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(`Cloudinary upload failed: ${data?.error?.message ?? res.status}`);
  }
  return data.secure_url as string;
}

export async function deleteImage(publicId: string): Promise<void> {
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const params = {
    public_id: publicId,
    resource_type: "image",
    timestamp: Math.floor(Date.now() / 1000).toString(),
  };
  const signature = await signParams(params, apiSecret);

  const form = new FormData();
  form.append("public_id", params.public_id);
  form.append("resource_type", params.resource_type);
  form.append("timestamp", params.timestamp);
  form.append("api_key", apiKey);
  form.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    { method: "POST", body: form },
  );
  const data = await res.json();
  if (!res.ok || data.result !== "ok") {
    console.error(`Cloudinary destroy warning: ${data?.error?.message ?? data.result}`);
  }
}

export function extractPublicIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/v\d+\/(.+)\.\w+$/);
  return match ? match[1] : null;
}