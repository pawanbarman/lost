import prisma from '../config/database.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const REPORT_SELECT = {
  id: true,
  type: true,
  status: true,
  location: true,
  dateTime: true,
  createdAt: true,
  communityId: true,
  item: {
    select: {
      id: true,
      title: true,
      category: true,
      description: true,
      imageUrl: true,
      currentLocation: true,
      color: true,
      brand: true,
      model: true,
      uniqueFeatures: true,
      condition: true,
      size: true
    }
  },
  community: {
    select: {
      id: true,
      name: true
    }
  },
  user: {
    select: {
      id: true,
      name: true
    }
  }
};

const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return parsed;
};

const buildCommunityFilter = (req) => {
  if (req.user.role === 'ADMIN' && req.query.communityId) {
    return { communityId: req.query.communityId };
  }
  if (req.user.communityId) {
    return { communityId: req.user.communityId };
  }
  return {};
};

export const getFoundFeed = async (req, res) => {
  try {
    const { q, category, color, brand, location, dateFrom, dateTo, status, sort } = req.query;
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);

    const communityFilter = buildCommunityFilter(req);

    const itemFilters = {};
    if (category) itemFilters.category = category;
    if (color) itemFilters.color = { contains: color, mode: 'insensitive' };
    if (brand) itemFilters.brand = { contains: brand, mode: 'insensitive' };

    const where = {
      type: 'FOUND',
      ...communityFilter
    };

    if (status) {
      where.status = status;
    } else {
      where.status = { notIn: ['CLAIMED', 'RETURNED', 'CLOSED'] };
    }

    if (location) {
      where.location = { contains: location, mode: 'insensitive' };
    }

    if (Object.keys(itemFilters).length > 0) {
      where.item = itemFilters;
    }

    const searchConditions = [];
    if (q) {
      searchConditions.push({
        item: {
          title: { contains: q, mode: 'insensitive' }
        }
      });
      searchConditions.push({
        item: {
          category: { contains: q, mode: 'insensitive' }
        }
      });
      searchConditions.push({
        item: {
          color: { contains: q, mode: 'insensitive' }
        }
      });
      searchConditions.push({
        item: {
          brand: { contains: q, mode: 'insensitive' }
        }
      });
      searchConditions.push({
        item: {
          model: { contains: q, mode: 'insensitive' }
        }
      });
      searchConditions.push({
        item: {
          uniqueFeatures: { contains: q, mode: 'insensitive' }
        }
      });
      searchConditions.push({
        location: { contains: q, mode: 'insensitive' }
      });
      where.OR = searchConditions;
    }

    const dateFilter = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!Number.isNaN(from.getTime())) dateFilter.gte = from;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!Number.isNaN(to.getTime())) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
          to.setHours(23, 59, 59, 999);
        }
        dateFilter.lte = to;
      }
    }
    if (Object.keys(dateFilter).length > 0) {
      where.dateTime = dateFilter;
    }

    const orderBy = sort === 'oldest' ? { dateTime: 'asc' } : { dateTime: 'desc' };

    const [total, reports] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        select: REPORT_SELECT,
        orderBy,
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    res.json({
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    throw error;
  }
};