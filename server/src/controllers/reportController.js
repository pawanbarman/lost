import prisma from '../config/database.js';
import { reportSchema, updateReportSchema } from '../validators/reportValidator.js';
import { matchingService } from '../services/matchingService.js';

export const createReport = async (req, res) => {
  try {
    const validatedData = reportSchema.parse(req.body);
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const item = await prisma.item.create({
      data: {
        title: validatedData.title,
        category: validatedData.category,
        description: validatedData.description,
        imageUrl,
        privateDetails: validatedData.privateDetails || null,
        currentLocation: validatedData.currentLocation || null
      }
    });

    const report = await prisma.report.create({
      data: {
        userId: req.user.id,
        itemId: item.id,
        type: validatedData.type,
        location: validatedData.location,
        dateTime: new Date(validatedData.dateTime),
        eventId: validatedData.eventId,
        status: validatedData.type === 'LOST' ? 'LOST' : 'FOUND'
      },
      include: {
        item: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Run matching
    await matchingService.findMatches(report.id);

    res.status(201).json(report);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors[0].message });
    }
    throw error;
  }
};

export const getReports = async (req, res) => {
  try {
    const { type, status, category, location, search } = req.query;
    
    const where = {};
    
    if (type) where.type = type;
    if (status) where.status = status;
    if (category) where.item = { category };
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { item: { title: { contains: search, mode: 'insensitive' } } },
        { item: { description: { contains: search, mode: 'insensitive' } } },
        { location: { contains: search, mode: 'insensitive' } }
      ];
    }

    const reports = await prisma.report.findMany({
      where,
      include: {
        item: true,
        user: {
          select: {
            id: true,
            name: true
          }
        },
        event: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(reports);
  } catch (error) {
    throw error;
  }
};

export const getReportById = async (req, res) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: {
        item: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        event: true
      }
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Don't show private details to non-owners
    const isOwner = report.userId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      delete report.item.privateDetails;
    }

    res.json(report);
  } catch (error) {
    throw error;
  }
};

export const updateReport = async (req, res) => {
  try {
    const validatedData = updateReportSchema.parse(req.body);
    
    const report = await prisma.report.findUnique({
      where: { id: req.params.id }
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (report.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to edit this report' });
    }

    const updatedReport = await prisma.report.update({
      where: { id: req.params.id },
      data: {
        location: validatedData.location,
        dateTime: validatedData.dateTime ? new Date(validatedData.dateTime) : undefined
      },
      include: {
        item: true
      }
    });

    if (validatedData.title || validatedData.category || validatedData.description || validatedData.privateDetails !== undefined || validatedData.currentLocation !== undefined) {
      await prisma.item.update({
        where: { id: report.itemId },
        data: {
          ...(validatedData.title && { title: validatedData.title }),
          ...(validatedData.category && { category: validatedData.category }),
          ...(validatedData.description && { description: validatedData.description }),
          ...(validatedData.privateDetails !== undefined && { privateDetails: validatedData.privateDetails || null }),
          ...(validatedData.currentLocation !== undefined && { currentLocation: validatedData.currentLocation || null })
        }
      });
    }

    res.json(updatedReport);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors[0].message });
    }
    throw error;
  }
};

export const deleteReport = async (req, res) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id }
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (report.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to delete this report' });
    }

    await prisma.report.delete({
      where: { id: req.params.id }
    });

    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    throw error;
  }
};

export const getMyReports = async (req, res) => {
  try {
    const reports = await prisma.report.findMany({
      where: { userId: req.user.id },
      include: {
        item: true,
        event: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(reports);
  } catch (error) {
    throw error;
  }
};
