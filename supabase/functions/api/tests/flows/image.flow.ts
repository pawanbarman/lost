// End-to-end image upload verification for Phase 3.
// Run with:
//   deno run --allow-env --allow-net --allow-read tests/flows/image.flow.ts
// Requires:
//   - a running API on BASE_URL (default http://localhost:8000)
//   - Cloudinary credentials in supabase/functions/api/.env
//   - TEST_IMAGE env var pointing to a .jpg file to upload (or ./test-image.jpg)
// Behavior mirrors tests/flows/integration.flow.ts helpers. No seeded/demo
// accounts are used — a throwaway user is registered at runtime.

const BASE_URL = Deno.env.get("BASE_URL") ?? "http://localhost:8000";
const RUN_IP = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

async function call(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    "x-forwarded-for": RUN_IP,
  };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name} -- ${detail}`);
  }
}

async function upload(method: string, path: string, token: string, image: File, fields: Record<string, string>): Promise<{ status: number; body: any }> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("image", image);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-forwarded-for": RUN_IP,
    },
    body: form,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// Locate the test image.
const imagePath = Deno.env.get("TEST_IMAGE") ?? "./test-image.jpg";
const imageBytes = await Deno.readFile(imagePath);
const validTypes = ["image/jpeg", "image/png", "image/webp"];
const mimeForName = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
};
const mime = validTypes.includes(Deno.env.get("TEST_IMAGE_MIME") ?? "") ? Deno.env.get("TEST_IMAGE_MIME")! : mimeForName(imagePath);
const imageFile = new File([imageBytes], imagePath.split(/[\\/]/).pop() ?? "image.jpg", { type: mime });
const badFile = new File([imageBytes], "photo.txt", { type: "text/plain" });

console.log(`Image flow (${imageFile.name}, ${mime}, ${imageBytes.length} bytes) targeting ${BASE_URL} from ${RUN_IP}`);

const step = crypto.randomUUID().slice(0, 8);
const title = `Flow Photo Item ${step}`;

// Register a throwaway user (no seeded accounts exist).
const reg = await call("POST", "/api/auth/register", {
  body: { name: "Image Flow Tester", email: `flow-img-${step}@example.com`, password: "flowpass123" },
});
check("register throwaway user 201", reg.status === 201 && !!reg.body?.token, JSON.stringify(reg.body));
const john = reg.body?.token as string;

// Reject non-image files before hitting Cloudinary.
const badUpload = await upload("POST", "/api/reports", john, badFile, {
  type: "FOUND",
  title: "Not used",
  category: "Other",
  description: "This upload should be rejected outright.",
  location: "Nowhere",
  dateTime: new Date().toISOString().slice(0, 16),
});
check("non-image file rejected 400", badUpload.status === 400 && badUpload.body?.error === "Images only (JPEG, PNG, WEBP)", JSON.stringify(badUpload.body));

// Create a FOUND report with an image.
const create = await upload("POST", "/api/reports", john, imageFile, {
  type: "FOUND",
  title,
  category: "Electronics",
  description: "Photo verification item with a clear image for end to end testing.",
  location: "Student Services, Ground Floor",
  dateTime: new Date().toISOString().slice(0, 16),
  communityId: "com-campus",
  color: "Silver",
  brand: "FlowTest",
  model: "Cam X",
  uniqueFeatures: "Test lens marking #hidden",
});
check("create FOUND with image 201", create.status === 201 && create.body?.item?.title === title, JSON.stringify(create.body)?.slice(0, 300));
const reportId = create.body?.id as string | undefined;
const url1: string | undefined = create.body?.item?.imageUrl;
check("imageUrl is a Cloudinary URL", typeof url1 === "string" && /^https:\/\/res\.cloudinary\.com\//.test(url1!), url1 ?? "missing");

// The Cloudinary asset is publicly fetchable.
if (url1) {
  const img = await fetch(url1);
  check("stored image URL fetches 200", img.status === 200, `status ${img.status}`);
  check("stored image content-type is an image", (img.headers.get("Content-Type") ?? "").startsWith("image/"), img.headers.get("Content-Type") ?? "");
}

// Public reports list exposes imageUrl (no auth).
if (reportId) {
  const list = await call("GET", "/api/reports?type=FOUND");
  const hit = Array.isArray(list.body) ? list.body.find((r: any) => r.id === reportId) : null;
  check(
    "public report list shows imageUrl",
    !!hit && typeof hit?.item?.imageUrl === "string" && hit.item.imageUrl === url1,
    JSON.stringify(hit)?.slice(0, 200),
  );
}

// Replace the image via PUT — must produce a different Cloudinary URL.
if (reportId && url1) {
  const replace = await upload("PUT", `/api/reports/${reportId}`, john, imageFile, {
    title,
    category: "Electronics",
    description: "Photo verification item with a clear image for end to end testing.",
  });
  const url2: string | undefined = replace.body?.item?.imageUrl;
  check("PUT replaces imageUrl", replace.status === 200 && typeof url2 === "string" && url2 !== url1 && /^https:\/\/res\.cloudinary\.com\//.test(url2!), JSON.stringify(replace.body)?.slice(0, 200));
}

// Report detail exposes imageUrl to the owner.
if (reportId) {
  const detail = await call("GET", `/api/reports/${reportId}`, { token: john });
  check("report detail has imageUrl", detail.status === 200 && typeof detail.body?.item?.imageUrl === "string" && /^https:\/\/res\.cloudinary\.com\//.test(detail.body.item.imageUrl), JSON.stringify(detail.body)?.slice(0, 200));
}

// Cleanup.
if (reportId) {
  const del = await call("DELETE", `/api/reports/${reportId}`, { token: john });
  check("cleanup delete report", del.status === 200 && del.body?.message === "Report deleted successfully", JSON.stringify(del.body));
}

console.log(`\n${passed} passed, ${failed} failed`);
Deno.exit(failed > 0 ? 1 : 0);