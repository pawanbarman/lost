import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from '../validators/authValidator.js';
import { reportSchema, updateReportSchema } from '../validators/reportValidator.js';
import { claimSchema } from '../validators/claimValidator.js';

describe('auth validators', () => {
  describe('registerSchema', () => {
    it('accepts valid registration', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      });
      expect(result.success).toBe(true);
    });

    it('rejects short name', () => {
      const result = registerSchema.safeParse({ name: 'J', email: 'john@example.com', password: 'password123' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = registerSchema.safeParse({ name: 'John', email: 'not-an-email', password: 'password123' });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = registerSchema.safeParse({ name: 'John', email: 'john@example.com', password: '123' });
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('accepts valid login', () => {
      const result = loginSchema.safeParse({ email: 'john@example.com', password: 'password123' });
      expect(result.success).toBe(true);
    });

    it('rejects empty password', () => {
      const result = loginSchema.safeParse({ email: 'john@example.com', password: '' });
      expect(result.success).toBe(false);
    });
  });
});

describe('report validators', () => {
  describe('reportSchema', () => {
    it('accepts a valid LOST report', () => {
      const result = reportSchema.safeParse({
        type: 'LOST',
        title: 'Black Wallet',
        category: 'Wallet',
        description: 'A black leather wallet with a silver clasp',
        location: 'Student Union',
        dateTime: new Date().toISOString(),
        privateDetails: 'Contains a single house key',
        currentLocation: 'Lost and Found office'
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid type', () => {
      const result = reportSchema.safeParse({
        type: 'BANANA',
        title: 'Black Wallet',
        category: 'Wallet',
        description: 'A black leather wallet with a silver clasp',
        location: 'Student Union',
        dateTime: new Date().toISOString()
      });
      expect(result.success).toBe(false);
    });

    it('rejects short title', () => {
      const result = reportSchema.safeParse({
        type: 'LOST',
        title: 'W',
        category: 'Wallet',
        description: 'A black leather wallet with a silver clasp',
        location: 'Student Union',
        dateTime: new Date().toISOString()
      });
      expect(result.success).toBe(false);
    });

    it('rejects short description', () => {
      const result = reportSchema.safeParse({
        type: 'LOST',
        title: 'Wallet',
        category: 'Wallet',
        description: 'Too short',
        location: 'Student Union',
        dateTime: new Date().toISOString()
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateReportSchema', () => {
    it('accepts partial updates', () => {
      const result = updateReportSchema.safeParse({ location: 'Library' });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = updateReportSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects invalid field', () => {
      const result = updateReportSchema.safeParse({ title: 'x' });
      expect(result.success).toBe(false);
    });
  });
});

describe('claim validator', () => {
  it('accepts valid claim', () => {
    const result = claimSchema.safeParse({
      matchId: 'abc-123',
      verificationDetails: 'Serial number on the device is ABC123'
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing matchId', () => {
    const result = claimSchema.safeParse({ verificationDetails: 'Some verification details here' });
    expect(result.success).toBe(false);
  });

  it('rejects short verification details', () => {
    const result = claimSchema.safeParse({ matchId: 'abc', verificationDetails: 'too short' });
    expect(result.success).toBe(false);
  });
});
