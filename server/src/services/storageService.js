import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/index.js';

if (config.nodeEnv === 'production') {
  if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
    throw new Error(
      'Cloudinary configuration missing: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required in production.'
    );
  }
}

cloudinary.config({
  cloud_name: config.cloudinaryCloudName,
  api_key: config.cloudinaryApiKey,
  api_secret: config.cloudinaryApiSecret,
  secure: true
});

export const storageService = {
  async uploadImage(buffer, options = {}) {
    const folder = options.folder || 'lost-and-found/reports';
    const publicId = options.publicId || `report-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'image',
          overwrite: false,
          invalidate: true
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      );
      uploadStream.end(buffer);
    });
  },

  async deleteImage(publicId) {
    if (!publicId) return null;
    return cloudinary.uploader.destroy(publicId);
  },

  extractPublicIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/v\d+\/(.+)\.\w+$/);
    return match ? match[1] : null;
  }
};