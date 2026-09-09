import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

if (nodeEnv === 'production') {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is required when NODE_ENV=production. Refusing to start with an insecure fallback secret.'
    );
  }
  if (!process.env.CLIENT_URL) {
    throw new Error(
      'CLIENT_URL is required when NODE_ENV=production to configure CORS. Refusing to start.'
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required when NODE_ENV=production.'
    );
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error(
      'Cloudinary configuration missing: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required in production.'
    );
  }
}

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv,
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-key',
  databaseUrl: process.env.DATABASE_URL,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880, // 5MB
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
};
