import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/database.js', () => {
  return {
    default: {
      user: {
        findUnique: vi.fn()
      },
      report: {
        findMany: vi.fn(),
        count: vi.fn()
      },
      item: {},
      match: {},
      claim: {},
      notification: {},
      auditLog: {},
      event: {},
      category: {},
      community: {}
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
const app = (await import('../app.js')).default;

const jwt = await import('jsonwebtoken');
const { config } = await import('../config/index.js');

function makeAuth(user = { id: 'u1', role: 'USER' }) {
  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });
  return { Authorization: `Bearer ${token}` };
}

const foundReport = {
  id: 'f1',
  type: 'FOUND',
  status: 'FOUND',
  location: 'Campus Library',
  dateTime: new Date('2026-09-01T10:00:00Z'),
  createdAt: new Date('2026-09-01T10:00:00Z'),
  communityId: 'comm-campus',
  item: {
    id: 'i1',
    title: 'Black Nike Backpack',
    category: 'Backpacks',
    description: 'Black backpack with blue zipper',
    imageUrl: null,
    currentLocation: 'Security Desk',
    color: 'Black',
    brand: 'Nike',
    model: 'Backpack Pro',
    uniqueFeatures: 'Blue zipper, small tear',
    condition: 'Used',
    size: 'Medium',
    privateDetails: 'SECRET'
  },
  community: { id: 'comm-campus', name: 'Campus' },
  user: { id: 'u2', name: 'Jane' }
};

function mockUser(mock = { id: 'u1', role: 'USER', communityId: 'comm-campus' }) {
  prisma.user.findUnique.mockResolvedValue({ name: 'User', email: 'u@x.com', ...mock });
}

function mockFeed(reports = [foundReport]) {
  prisma.report.findMany.mockResolvedValue(reports);
  prisma.report.count.mockResolvedValue(reports.length);
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockReset();
  prisma.report.findMany.mockReset();
  prisma.report.count.mockReset();
});

describe('Found Feed', () => {
  it('is found-only and cannot be changed via a type param', async () => {
    mockUser();
    mockFeed();

    const res = await request(app)
      .get('/api/found-feed?type=LOST')
      .set(makeAuth());

    expect(res.status).toBe(200);
    expect(prisma.report.findMany).toHaveBeenCalled();
    const where = prisma.report.findMany.mock.calls[0][0].where;
    expect(where.type).toBe('FOUND');
  });

  it('scopes results to the authenticated user community server-side', async () => {
    mockUser();
    mockFeed();

    const res = await request(app)
      .get('/api/found-feed?communityId=comm-city')
      .set(makeAuth());

    expect(res.status).toBe(200);
    const where = prisma.report.findMany.mock.calls[0][0].where;
    expect(where.communityId).toBe('comm-campus');
    expect(where.communityId).not.toBe('comm-city');
  });

  it('ignores client-supplied communityId for regular users (bypass prevention)', async () => {
    mockUser();
    mockFeed();

    const res = await request(app)
      .get('/api/found-feed?communityId=comm-other')
      .set(makeAuth());

    expect(res.status).toBe(200);
    const where = prisma.report.findMany.mock.calls[0][0].where;
    expect(where.communityId).toBe('comm-campus');
  });

  it('falls back gracefully when the user has no communityId', async () => {
    mockUser({ id: 'u1', role: 'USER', communityId: null });
    mockFeed();

    const res = await request(app).get('/api/found-feed').set(makeAuth());

    expect(res.status).toBe(200);
    const where = prisma.report.findMany.mock.calls[0][0].where;
    expect(where.communityId).toBeUndefined();
  });

  it('allows an admin to filter by an explicit communityId', async () => {
    mockUser({ id: 'u1', role: 'ADMIN', communityId: 'comm-campus' });
    mockFeed();

    const res = await request(app)
      .get('/api/found-feed?communityId=comm-city')
      .set(makeAuth({ id: 'u1', role: 'ADMIN' }));

    expect(res.status).toBe(200);
    const where = prisma.report.findMany.mock.calls[0][0].where;
    expect(where.communityId).toBe('comm-city');
  });

  it('returns an empty feed that still reports total', async () => {
    mockUser();
    mockFeed([]);

    const res = await request(app).get('/api/found-feed').set(makeAuth());

    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.pagination.totalPages).toBe(0);
  });

  it('authenticates and rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/found-feed');
    expect(res.status).toBe(401);
  });

  describe('filters', () => {
    it('filters by category', async () => {
      mockUser();
      mockFeed();

      await request(app).get('/api/found-feed?category=Backpacks').set(makeAuth());

      const where = prisma.report.findMany.mock.calls[0][0].where;
      expect(where.item.category).toBe('Backpacks');
    });

    it('filters by color (case-insensitive)', async () => {
      mockUser();
      mockFeed();

      await request(app).get('/api/found-feed?color=black').set(makeAuth());

      const where = prisma.report.findMany.mock.calls[0][0].where;
      expect(where.item.color).toEqual({ contains: 'black', mode: 'insensitive' });
    });

    it('filters by brand (case-insensitive)', async () => {
      mockUser();
      mockFeed();

      await request(app).get('/api/found-feed?brand=nike').set(makeAuth());

      const where = prisma.report.findMany.mock.calls[0][0].where;
      expect(where.item.brand).toEqual({ contains: 'nike', mode: 'insensitive' });
    });

    it('filters by location', async () => {
      mockUser();
      mockFeed();

      await request(app).get('/api/found-feed?location=library').set(makeAuth());

      const where = prisma.report.findMany.mock.calls[0][0].where;
      expect(where.location).toEqual({ contains: 'library', mode: 'insensitive' });
    });

    it('combines all filters together', async () => {
      mockUser();
      mockFeed();

      await request(app)
        .get('/api/found-feed?q=backpack&category=Backpacks&color=black&brand=nike&location=library&dateFrom=2026-09-01&dateTo=2026-09-02')
        .set(makeAuth());

      const where = prisma.report.findMany.mock.calls[0][0].where;
      expect(where.item.category).toBe('Backpacks');
      expect(where.item.color).toEqual({ contains: 'black', mode: 'insensitive' });
      expect(where.item.brand).toEqual({ contains: 'nike', mode: 'insensitive' });
      expect(where.location).toEqual({ contains: 'library', mode: 'insensitive' });
      expect(Array.isArray(where.OR)).toBe(true);
      expect(where.dateTime.gte).toBeInstanceOf(Date);
      expect(where.dateTime.lte).toBeInstanceOf(Date);
    });

    it('searches across item fields', async () => {
      mockUser();
      mockFeed();

      await request(app).get('/api/found-feed?q=nike').set(makeAuth());

      const where = prisma.report.findMany.mock.calls[0][0].where;
      expect(Array.isArray(where.OR)).toBe(true);
      const orKeys = where.OR.map((clause) => {
        if (clause.location) return 'location';
        return Object.keys(clause.item)[0];
      });
      expect(orKeys).toContain('title');
      expect(orKeys).toContain('brand');
      expect(orKeys).toContain('color');
      expect(orKeys).toContain('model');
      expect(orKeys).toContain('category');
      expect(orKeys).toContain('uniqueFeatures');
      expect(orKeys).toContain('location');
    });

    it('filters by date range', async () => {
      mockUser();
      mockFeed();

      await request(app)
        .get('/api/found-feed?dateFrom=2026-09-01&dateTo=2026-09-02')
        .set(makeAuth());

      const where = prisma.report.findMany.mock.calls[0][0].where;
      expect(where.dateTime.gte).toBeInstanceOf(Date);
      expect(where.dateTime.lte).toBeInstanceOf(Date);
      expect(where.dateTime.gte.toISOString()).toBe(new Date('2026-09-01').toISOString());
      expect(where.dateTime.lte.toISOString()).toBe(new Date('2026-09-02T23:59:59.999').toISOString());
    });

    it('ignores invalid date filters instead of crashing', async () => {
      mockUser();
      mockFeed();

      const res = await request(app)
        .get('/api/found-feed?dateFrom=not-a-date')
        .set(makeAuth());

      expect(res.status).toBe(200);
      const where = prisma.report.findMany.mock.calls[0][0].where;
      expect(where.dateTime).toBeUndefined();
    });
  });

  describe('sorting', () => {
    it('defaults to newest first by found date', async () => {
      mockUser();
      mockFeed();

      await request(app).get('/api/found-feed').set(makeAuth());

      const orderBy = prisma.report.findMany.mock.calls[0][0].orderBy;
      expect(orderBy).toEqual({ dateTime: 'desc' });
    });

    it('sorts oldest first when requested', async () => {
      mockUser();
      mockFeed();

      await request(app).get('/api/found-feed?sort=oldest').set(makeAuth());

      const orderBy = prisma.report.findMany.mock.calls[0][0].orderBy;
      expect(orderBy).toEqual({ dateTime: 'asc' });
    });
  });

  describe('pagination', () => {
    it('defaults to page 1 with a 20 item limit', async () => {
      mockUser();
      mockFeed();

      await request(app).get('/api/found-feed').set(makeAuth());

      const args = prisma.report.findMany.mock.calls[0][0];
      expect(args.skip).toBe(0);
      expect(args.take).toBe(20);
    });

    it('respects page and limit query parameters', async () => {
      mockUser();
      mockFeed(Array.from({ length: 30 }, () => foundReport));

      const res = await request(app)
        .get('/api/found-feed?page=2&limit=10')
        .set(makeAuth());

      const args = prisma.report.findMany.mock.calls[0][0];
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(10);
      expect(res.body.pagination.total).toBe(30);
      expect(res.body.pagination.totalPages).toBe(3);
      expect(res.body.reports).toHaveLength(30);
    });

    it('caps limit at a protected maximum', async () => {
      mockUser();
      mockFeed();

      await request(app).get('/api/found-feed?limit=1000').set(makeAuth());

      const args = prisma.report.findMany.mock.calls[0][0];
      expect(args.take).toBe(50);
    });
  });

  describe('sanitization', () => {
    it('never requests privateDetails in the feed projection', async () => {
      mockUser();
      mockFeed();

      const res = await request(app).get('/api/found-feed').set(makeAuth());

      expect(res.status).toBe(200);
      const select = prisma.report.findMany.mock.calls[0][0].select;
      expect(select.item.select.privateDetails).toBeUndefined();
      expect(select.item.select).toHaveProperty('title');
      expect(select.item.select).toHaveProperty('brand');
      expect(select.item.select).toHaveProperty('color');
    });

    it('never requests user email or phone in the feed projection', async () => {
      mockUser();
      mockFeed();

      const res = await request(app).get('/api/found-feed').set(makeAuth());

      expect(res.status).toBe(200);
      const select = prisma.report.findMany.mock.calls[0][0].select;
      expect(select.user.select.email).toBeUndefined();
      expect(select.user.select.phone).toBeUndefined();
      expect(select.user.select.name).toBe(true);
    });
  });
});