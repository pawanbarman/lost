import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/database.js', () => {
  return {
    default: {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn()
      },
      report: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      },
      item: {
        create: vi.fn(),
        update: vi.fn()
      },
      match: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn()
      },
      claim: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn()
      },
      notification: {
        create: vi.fn(),
        findMany: vi.fn()
      },
      auditLog: {
        create: vi.fn()
      },
      event: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      },
      category: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn()
      }
    }
  };
});

vi.mock('../services/matchingService.js', () => ({
  matchingService: {
    findMatches: vi.fn().mockResolvedValue([]),
    getMatchesForUser: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('../utils/jwt.js', () => ({
  generateToken: vi.fn(() => 'mock-token')
}));

const prisma = (await import('../config/database.js')).default;
const { matchingService } = await import('../services/matchingService.js');

const app = (await import('../app.js')).default;

const jwt = await import('jsonwebtoken');
const { config } = await import('../config/index.js');

function makeAuth(user = { id: 'u1', role: 'USER' }) {
  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });
  return { Authorization: `Bearer ${token}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockReset();
});

describe('POST /api/auth/register', () => {
  it('registers a user and returns a token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1', name: 'Test User', email: 'test@example.com', role: 'USER', createdAt: new Date()
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBe('mock-token');
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('rejects duplicate email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email already registered');
  });

  it('rejects invalid payload', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'bad', password: '1' });

    expect(res.status).toBe(400);
  });
});

describe('Authorization boundaries', () => {
  it('rejects requests without a token on protected route', async () => {
    const res = await request(app).get('/api/reports/my');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin access to admin endpoints', async () => {
    // Authenticate as a regular user
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'User', email: 'u@x.com', role: 'USER' });
    const res = await request(app).get('/api/admin/users').set(makeAuth({ id: 'u1', role: 'USER' }));
    expect(res.status).toBe(403);
  });

  it('allows admin access to admin endpoints', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Admin', email: 'a@x.com', role: 'ADMIN' });
    prisma.user.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/admin/users').set(makeAuth({ id: 'u1', role: 'ADMIN' }));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Report ownership', () => {
  it('blocks a non-owner from updating a report', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'owner-id', name: 'User', email: 'u@x.com', role: 'USER' });
    // Report belongs to a different user
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', userId: 'someone-else', itemId: 'i1' });

    const res = await request(app)
      .put('/api/reports/r1')
      .set(makeAuth())
      .send({ location: 'Library' });

    expect(res.status).toBe(403);
  });

  it('allows owner to update own report', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'User', email: 'u@x.com', role: 'USER' });
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1', itemId: 'i1' });
    prisma.report.update.mockResolvedValue({ id: 'r1', location: 'Library', item: { id: 'i1' } });

    const res = await request(app)
      .put('/api/reports/r1')
      .set(makeAuth())
      .send({ location: 'Library' });

    expect(res.status).toBe(200);
  });

  it('blocks a non-owner from viewing private details', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'User', email: 'u@x.com', role: 'USER' });
    prisma.report.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'elsewhere',
      item: { privateDetails: 'SECRET' }
    });

    const res = await request(app).get('/api/reports/r1').set(makeAuth());

    expect(res.status).toBe(200);
    expect(res.body.item.privateDetails).toBeUndefined();
  });

  it('allows owner to view their own private details', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'User', email: 'u@x.com', role: 'USER' });
    prisma.report.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      item: { privateDetails: 'SECRET' }
    });

    const res = await request(app).get('/api/reports/r1').set(makeAuth());

    expect(res.status).toBe(200);
    expect(res.body.item.privateDetails).toBe('SECRET');
  });
});
