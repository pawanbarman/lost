const key = (name: string, fallback = ""): string => {
  const value = Deno.env.get(name);
  return value === undefined || value === null ? fallback : value;
};

export const env = {
  supabaseUrl: key("SUPABASE_URL"),
  serviceRoleKey: key("SUPABASE_SERVICE_ROLE_KEY"),
  jwtSecret: key("JWT_SECRET"),
  cloudinaryCloudName: key("CLOUDINARY_CLOUD_NAME"),
  cloudinaryApiKey: key("CLOUDINARY_API_KEY"),
  cloudinaryApiSecret: key("CLOUDINARY_API_SECRET"),
  maxFileSize: Number(key("MAX_FILE_SIZE", String(5 * 1024 * 1024))),
  allowedOrigins: key(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:54321",
  ).split(",").map((item) => item.trim()).filter(Boolean),
};