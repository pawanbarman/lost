import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prisma = {
  user: { findUnique: vi.fn() },
  report: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  item: {},
  match: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  claim: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  notification: { create: vi.fn() },
  auditLog: {},
  event: {},
  category: {},
  community: {}
};

prisma.$transaction = vi.fn(async (fn) => fn(prisma));

vi.mock('../config/database.js', () => ({ default: prisma }));

vi.mock('../services/matchingService.js', () => ({
  matchingService: {
    findMatches: vi.fn().mockResolvedValue([]),
    getMatchesForUser: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('../utils/jwt.js', () => ({
  generateToken: vi.fn(() => 'mock-token')
}));

const app = (await import('../app.js')).default;

const jwt = await import('jsonwebtoken');
const { config } = await import('../config/index.js');

function makeAuth(user = { id: 'u1', role: 'USER' }) {
  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });
  return { Authorization: `Bearer ${token}` };
}

const USERS = {
  lost: { id: 'u-lost', role: 'USER', communityId: 'comm-campus' },
  found: { id: 'u-found', role: 'USER', communityId: 'comm-campus' },
  stranger: { id: 'u-stranger', role: 'USER', communityId: 'comm-campus' },
  admin: { id: 'u-admin', role: 'ADMIN', communityId: 'comm-campus' }
};

function makeItem(id, privateDetails) {
  return {
    id,
    title: 'Black Nike Backpack',
    category: 'Backpacks',
    description: 'Black backpack with blue zipper',
    privateDetails,
    currentLocation: id === 'i-lost' ? null : 'Security Desk',
    color: 'Black',
    brand: 'Nike',
    model: 'Backpack Pro',
    uniqueFeatures: 'Blue zipper, small tear',
    condition: 'Used',
    size: 'Medium'
  };
}

function makeMatch({
  foundStatus = 'FOUND',
  lostStatus = 'LOST',
  foundUserId = 'u-found',
  lostUserId = 'u-lost'
} = {}) {
  return {
    id: 'm1',
    lostReportId: 'lr1',
    foundReportId: 'fr1',
    score: 88,
    status: 'PENDING',
    lostReport: {
      id: 'lr1',
      type: 'LOST',
      status: lostStatus,
      userId: lostUserId,
      communityId: 'comm-campus',
      item: makeItem('i-lost', 'Has a red gym card with owner initials'),
      user: { id: lostUserId, name: 'John' }
    },
    foundReport: {
      id: 'fr1',
      type: 'FOUND',
      status: foundStatus,
      userId: foundUserId,
      communityId: 'comm-campus',
      item: makeItem('i-found', 'Contains a red gym card with owner initials'),
      user: { id: foundUserId, name: 'Jane' }
    }
  };
}

const pendingClaim = {
  id: 'c1',
  matchId: 'm1',
  claimantId: 'u-lost',
  reportId: 'fr1',
  verificationDetails: 'Smells like sunscreen',
  status: 'PENDING',
  adminNotes: null,
  createdAt: new Date('2026-09-02T10:00:00Z'),
  updatedAt: new Date('2026-09-02T10:00:00Z')
};

function mockAuthUser(key = 'lost') {
  prisma.user.findUnique.mockResolvedValue({ name: 'Someone', email: 's@x.com', ...USERS[key] });
}

function mockCreatedClaim({ status = 'PENDING', adminNotes = null } = {}) {
  return {
    id: 'c1',
    matchId: 'm1',
    claimantId: 'u-lost',
    reportId: 'fr1',
    verificationDetails: 'Smells like sunscreen',
    status,
    adminNotes,
    match: makeMatch(),
    claimant: { id: 'u-lost', name: 'John', email: 'john@x.com' }
  };
}

beforeEach(() => {
  for (const key of Object.keys(prisma)) {
    if (key === '$transaction') continue;
    for (const sub of Object.keys(prisma[key])) {
      prisma[key][sub].mockReset();
    }
  }
  prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
});

function approachableHttpError(err) {
  return err?.statusCode ? err.statusCode : err?.status;
}

describe('Create claim', () => {
  it('allows the lost-item owner to claim the found item', async () => {
    mockAuthUser('lost');
    prisma.match.findUnique.mockResolvedValue(makeMatch());
    prisma.claim.findFirst.mockResolvedValue(null);
    prisma.claim.create.mockResolvedValue(mockCreatedClaim());
    prisma.notification.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/claims')
      .set(makeAuth(USERS.lost))
      .send({ matchId: 'm1', verificationDetails: 'Smells like sunscreen' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(prisma.claim.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reportId: 'fr1', verificationDetails: 'Smells like sunscreen' })
      })
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });

  it('rejects a found owner trying to claim the lost report', async () => {
    mockAuthUser('found');
    prisma.match.findUnique.mockResolvedValue(makeMatch());

    const res = await request(app)
      .post('/api/claims')
      .set(makeAuth(USERS.found))
      .send({ matchId: 'm1', verificationDetails: 'Smells like sunscreen' });

    expect(res.status).toBe(403);
    expect(prisma.claim.create).not.toHaveBeenCalled();
  });

  it('rejects an unrelated user claiming a match', async () => {
    mockAuthUser('stranger');
    prisma.match.findUnique.mockResolvedValue(makeMatch());

    const res = await request(app)
      .post('/api/claims')
      .set(makeAuth(USERS.stranger))
      .send({ matchId: 'm1', verificationDetails: 'Smells like sunscreen' });

    expect(res.status).toBe(403);
  });

  it('rejects a duplicate claim for the same item', async () => {
    mockAuthUser('lost');
    prisma.match.findUnique.mockResolvedValue(makeMatch());
    prisma.claim.findFirst.mockResolvedValue(pendingClaim);

    const res = await request(app)
      .post('/api/claims')
      .set(makeAuth(USERS.lost))
      .send({ matchId: 'm1', verificationDetails: 'Smells like sunscreen' });

    expect(res.status).toBe(400);
    expect(prisma.claim.create).not.toHaveBeenCalled();
  });

  it('rejects a claim when the item is already recovered', async () => {
    mockAuthUser('lost');
    prisma.match.findUnique.mockResolvedValue(makeMatch({ foundStatus: 'CLAIMED' }));

    const res = await request(app)
      .post('/api/claims')
      .set(makeAuth(USERS.lost))
      .send({ matchId: 'm1', verificationDetails: 'Smells like sunscreen' });

    expect(res.status).toBe(400);
    expect(prisma.claim.create).not.toHaveBeenCalled();
  });

  it('rejects a claim across communities', async () => {
    mockAuthUser('lost');
    prisma.user.findUnique.mockResolvedValue({ name: 'John', email: 'j@x.com', ...USERS.lost, communityId: 'comm-city' });
    prisma.match.findUnique.mockResolvedValue(makeMatch());

    const res = await request(app)
      .post('/api/claims')
      .set(makeAuth({ ...USERS.lost, communityId: 'comm-city' }))
      .send({ matchId: 'm1', verificationDetails: 'Smells like sunscreen' });

    expect(res.status).toBe(403);
    expect(prisma.claim.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown match', async () => {
    mockAuthUser('lost');
    prisma.match.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/claims')
      .set(makeAuth(USERS.lost))
      .send({ matchId: 'nope', verificationDetails: 'Smells like sunscreen' });

    expect(res.status).toBe(404);
  });

  it('rejects missing or too-short verification details', async () => {
    mockAuthUser('lost');
    prisma.match.findUnique.mockResolvedValue(makeMatch());

    const res = await request(app)
      .post('/api/claims')
      .set(makeAuth(USERS.lost))
      .send({ matchId: 'm1', verificationDetails: 'short' });

    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/claims').send({ matchId: 'm1', verificationDetails: 'Smells like sunscreen' });
    expect(res.status).toBe(401);
  });
});

describe('Admin review', () => {
  it('requires admin role to review claims', async () => {
    mockAuthUser('lost');
    prisma.claim.findUnique.mockResolvedValue(pendingClaim);

    const res = await request(app)
      .put('/api/claims/c1/status')
      .set(makeAuth(USERS.lost))
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(403);
  });

  it('approves a pending claim atomically and claims the item', async () => {
    mockAuthUser('admin');
    prisma.claim.findUnique.mockResolvedValue({
      ...pendingClaim,
      match: makeMatch()
    });
    prisma.report.updateMany.mockResolvedValue({ count: 1 });
    prisma.claim.updateMany.mockResolvedValue({ count: 1 });
    prisma.report.update.mockResolvedValue({});
    prisma.match.update.mockResolvedValue({});
    prisma.notification.create.mockResolvedValue({});
    prisma.claim.findFirst.mockResolvedValue(mockCreatedClaim({ status: 'APPROVED', adminNotes: 'Docs verified' }));

    const res = await request(app)
      .put('/api/claims/c1/status')
      .set(makeAuth(USERS.admin))
      .send({ status: 'APPROVED', adminNotes: 'Docs verified' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    expect(prisma.report.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CLAIMED' } })
    );
    const rejectCompetitor = prisma.claim.updateMany.mock.calls.find(
      (c) => c[0].data.status === 'REJECTED'
    );
    expect(rejectCompetitor).toBeDefined();
    expect(rejectCompetitor[0].where.reportId).toBe('fr1');
    expect(rejectCompetitor[0].where.id.not).toBe('c1');
  });

  it('rejects approval of a claim that is not pending', async () => {
    mockAuthUser('admin');
    prisma.claim.findUnique.mockResolvedValue({
      ...pendingClaim,
      status: 'APPROVED',
      match: makeMatch()
    });

    const res = await request(app)
      .put('/api/claims/c1/status')
      .set(makeAuth(USERS.admin))
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(400);
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });

  it('rejects approval when the item is already claimed', async () => {
    mockAuthUser('admin');
    prisma.claim.findUnique.mockResolvedValue({
      ...pendingClaim,
      match: makeMatch({ foundStatus: 'CLAIMED' })
    });

    const res = await request(app)
      .put('/api/claims/c1/status')
      .set(makeAuth(USERS.admin))
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(400);
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });

  it('guards against double approval via atomic updateMany', async () => {
    mockAuthUser('admin');
    prisma.claim.findUnique.mockResolvedValue({
      ...pendingClaim,
      match: makeMatch()
    });
    prisma.report.updateMany.mockResolvedValue({ count: 1 });
    prisma.claim.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .put('/api/claims/c1/status')
      .set(makeAuth(USERS.admin))
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(400);
    expect(prisma.report.update).not.toHaveBeenCalled();
  });

  it('rejects a pending claim', async () => {
    mockAuthUser('admin');
    prisma.claim.findUnique.mockResolvedValue({
      ...pendingClaim,
      match: { foundReport: { userId: 'u-found' } }
    });
    prisma.claim.updateMany.mockResolvedValue({ count: 1 });
    prisma.notification.create.mockResolvedValue({});
    prisma.claim.findFirst.mockResolvedValue(mockCreatedClaim({ status: 'REJECTED', adminNotes: 'No proof' }));

    const res = await request(app)
      .put('/api/claims/c1/status')
      .set(makeAuth(USERS.admin))
      .send({ status: 'REJECTED', adminNotes: 'No proof' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
    const guardCall = prisma.claim.updateMany.mock.calls[0];
    expect(guardCall[0].data.status).toBe('REJECTED');
  });

  it('rejects rejecting a non-pending claim', async () => {
    mockAuthUser('admin');
    prisma.claim.findUnique.mockResolvedValue({
      ...pendingClaim,
      status: 'APPROVED',
      match: { foundReport: { userId: 'u-found' } }
    });
    prisma.claim.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .put('/api/claims/c1/status')
      .set(makeAuth(USERS.admin))
      .send({ status: 'REJECTED' });

    expect(res.status).toBe(400);
  });
});

describe('Handover', () => {
  function baseClaim(status) {
    return {
      ...pendingClaim,
      status,
      match: makeMatch()
    };
  }

  it('starts a handover on an approved claim', async () => {
    mockAuthUser('lost');
    prisma.claim.findUnique.mockResolvedValue(baseClaim('APPROVED'));
    prisma.claim.updateMany.mockResolvedValue({ count: 1 });
    prisma.notification.create.mockResolvedValue({});
    prisma.claim.findFirst.mockResolvedValue(mockCreatedClaim({ status: 'UNDER_HANDOVER' }));

    const res = await request(app)
      .put('/api/claims/c1/handover')
      .set(makeAuth(USERS.lost))
      .send({ action: 'START' });

    expect(res.status).toBe(200);
    expect(prisma.claim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1', status: 'APPROVED' },
        data: expect.objectContaining({ status: 'UNDER_HANDOVER' })
      })
    );
  });

  it('completes a handover and marks both reports returned', async () => {
    mockAuthUser('found');
    prisma.claim.findUnique.mockResolvedValue(baseClaim('UNDER_HANDOVER'));
    prisma.claim.updateMany.mockResolvedValue({ count: 1 });
    prisma.report.update.mockResolvedValue({});
    prisma.notification.create.mockResolvedValue({});
    prisma.claim.findFirst.mockResolvedValue(mockCreatedClaim({ status: 'COMPLETED' }));

    const res = await request(app)
      .put('/api/claims/c1/handover')
      .set(makeAuth(USERS.found))
      .send({ action: 'COMPLETE' });

    expect(res.status).toBe(200);
    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lr1' }, data: { status: 'RETURNED' } })
    );
    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fr1' }, data: { status: 'RETURNED' } })
    );
  });

  it('does not allow an uninvolved user to manage the handover', async () => {
    mockAuthUser('stranger');
    prisma.claim.findUnique.mockResolvedValue(baseClaim('APPROVED'));

    const res = await request(app)
      .put('/api/claims/c1/handover')
      .set(makeAuth(USERS.stranger))
      .send({ action: 'START' });

    expect(res.status).toBe(403);
  });

  it('requires the claim to be approved before starting handover', async () => {
    mockAuthUser('lost');
    prisma.claim.findUnique.mockResolvedValue(baseClaim('PENDING'));
    prisma.claim.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .put('/api/claims/c1/handover')
      .set(makeAuth(USERS.lost))
      .send({ action: 'START' });

    expect(res.status).toBe(400);
  });

  it('rejects an invalid handover action', async () => {
    mockAuthUser('lost');
    prisma.claim.findUnique.mockResolvedValue(baseClaim('APPROVED'));

    const res = await request(app)
      .put('/api/claims/c1/handover')
      .set(makeAuth(USERS.lost))
      .send({ action: 'NOPE' });

    expect(res.status).toBe(400);
  });
});

describe('Privacy protection', () => {
  it('strips privateDetails and adminNotes from a user list', async () => {
    mockAuthUser('lost');
    prisma.claim.findMany.mockResolvedValue([
      mockCreatedClaim({ adminNotes: 'internal review' })
    ]);

    const res = await request(app).get('/api/claims').set(makeAuth(USERS.lost));

    expect(res.status).toBe(200);
    const detail = res.body[0];
    expect(detail.adminNotes).toBeUndefined();
    expect(detail.match.lostReport.item.privateDetails).toBeUndefined();
    expect(detail.match.foundReport.item.privateDetails).toBeUndefined();
  });

  it('keeps adminNotes and privateDetails for admins', async () => {
    mockAuthUser('admin');
    prisma.claim.findMany.mockResolvedValue([
      mockCreatedClaim({ adminNotes: 'internal review' })
    ]);

    const res = await request(app).get('/api/claims').set(makeAuth(USERS.admin));

    expect(res.status).toBe(200);
    expect(res.body[0].adminNotes).toBe('internal review');
    expect(res.body[0].match.lostReport.item.privateDetails).toBeDefined();
    expect(res.body[0].match.foundReport.item.privateDetails).toBeDefined();
  });

  it('strips adminNotes when creating a claim as a user', async () => {
    mockAuthUser('lost');
    prisma.match.findUnique.mockResolvedValue(makeMatch());
    prisma.claim.findFirst.mockResolvedValue(null);
    prisma.claim.create.mockResolvedValue(mockCreatedClaim({ adminNotes: 'x' }));
    prisma.notification.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/claims')
      .set(makeAuth(USERS.lost))
      .send({ matchId: 'm1', verificationDetails: 'Smells like sunscreen' });

    expect(res.status).toBe(201);
    expect(res.body.adminNotes).toBeUndefined();
    expect(res.body.match.foundReport.item.privateDetails).toBeUndefined();
  });

  it('limits claim detail to the claimant or an admin', async () => {
    mockAuthUser('stranger');
    prisma.claim.findUnique.mockResolvedValue(mockCreatedClaim());

    const res = await request(app).get('/api/claims/c1').set(makeAuth(USERS.stranger));

    expect(res.status).toBe(403);
  });

  it('returns claim detail to the claimant without private data', async () => {
    mockAuthUser('lost');
    prisma.claim.findUnique.mockResolvedValue(mockCreatedClaim({ adminNotes: 'internal review' }));

    const res = await request(app).get('/api/claims/c1').set(makeAuth(USERS.lost));

    expect(res.status).toBe(200);
    expect(res.body.adminNotes).toBeUndefined();
    expect(res.body.match.foundReport.item.privateDetails).toBeUndefined();
  });

  it('strips privateDetails from match detail', async () => {
    mockAuthUser('lost');
    prisma.match.findUnique.mockResolvedValue(makeMatch());

    const res = await request(app).get('/api/matches/m1').set(makeAuth(USERS.lost));

    expect(res.status).toBe(200);
    expect(res.body.lostReport.item.privateDetails).toBeUndefined();
    expect(res.body.foundReport.item.privateDetails).toBeUndefined();
  });

  it('denies match detail to uninvolved users', async () => {
    mockAuthUser('stranger');
    prisma.match.findUnique.mockResolvedValue(makeMatch());

    const res = await request(app).get('/api/matches/m1').set(makeAuth(USERS.stranger));

    expect(res.status).toBe(403);
  });
});