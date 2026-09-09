import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/index.js', () => ({
  config: {
    nodeEnv: 'test',
    cloudinaryCloudName: 'test-cloud',
    cloudinaryApiKey: 'test-key',
    cloudinaryApiSecret: 'test-secret'
  }
}));

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: vi.fn((options, callback) => {
        const mockStream = {
          end: vi.fn(),
          write: vi.fn()
        };
        setImmediate(() => {
          if (callback) {
            callback(null, { secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1234567890/leftbehind/reports/test-id.jpg' });
          }
        });
        return mockStream;
      }),
      destroy: vi.fn().mockResolvedValue({ result: 'ok' })
    }
  }
}));

import { storageService } from '../services/storageService.js';
import { v2 as cloudinary } from 'cloudinary';

describe('storageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadImage', () => {
    it('uploads image to Cloudinary and returns secure_url', async () => {
      const buffer = Buffer.from('fake-image-data');
      const url = await storageService.uploadImage(buffer, { folder: 'test', publicId: 'test-id' });

      expect(url).toBe('https://res.cloudinary.com/test-cloud/image/upload/v1234567890/leftbehind/reports/test-id.jpg');
      expect(cloudinary.uploader.upload_stream).toHaveBeenCalled();
    });

    it('uses default folder when not provided', async () => {
      const buffer = Buffer.from('fake-image-data');
      await storageService.uploadImage(buffer);

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({ folder: 'leftbehind/reports' }),
        expect.any(Function)
      );
    });

    it('generates collision-resistant publicId when not provided', async () => {
      const buffer = Buffer.from('fake-image-data');
      await storageService.uploadImage(buffer);

      const call = cloudinary.uploader.upload_stream.mock.calls[0];
      expect(call[0].public_id).toMatch(/^report-\d+-[a-z0-9]+$/);
    });
  });

  describe('deleteImage', () => {
    it('deletes image from Cloudinary', async () => {
      const result = await storageService.deleteImage('test-public-id');
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('test-public-id');
      expect(result).toEqual({ result: 'ok' });
    });

    it('returns null for empty publicId', async () => {
      const result = await storageService.deleteImage(null);
      expect(result).toBeNull();
    });
  });

  describe('extractPublicIdFromUrl', () => {
    it('extracts public ID from Cloudinary URL', () => {
      const url = 'https://res.cloudinary.com/test-cloud/image/upload/v1234567890/leftbehind/reports/test-id.jpg';
      const publicId = storageService.extractPublicIdFromUrl(url);
      expect(publicId).toBe('leftbehind/reports/test-id');
    });

    it('returns null for empty URL', () => {
      expect(storageService.extractPublicIdFromUrl(null)).toBeNull();
      expect(storageService.extractPublicIdFromUrl('')).toBeNull();
    });
  });
});