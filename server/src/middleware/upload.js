import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { storageService } from '../services/storageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.resolve(config.uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Images only (JPEG, PNG, WEBP)'));
};

let storage;
if (config.nodeEnv === 'production') {
  storage = multer.memoryStorage();
} else {
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
}

export const upload = multer({
  storage,
  limits: { fileSize: config.maxFileSize },
  fileFilter
});

export async function uploadToCloudinary(req, res, next) {
  if (config.nodeEnv !== 'production' || !req.file) {
    return next();
  }

  try {
    const folder = `leftbehind/reports/${req.user?.id || 'anonymous'}`;
    const publicId = `report-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const secureUrl = await storageService.uploadImage(req.file.buffer, { folder, publicId });
    req.file.cloudinaryUrl = secureUrl;
    next();
  } catch (error) {
    console.error('Cloudinary upload error:', error.message);
    return res.status(500).json({ error: 'Image upload failed' });
  }
}
