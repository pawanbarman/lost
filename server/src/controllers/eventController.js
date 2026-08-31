import prisma from '../config/database.js';

export const createEvent = async (req, res) => {
  try {
    const { name, venue, location, startDate, endDate } = req.body;
    
    const event = await prisma.event.create({
      data: {
        name,
        venue,
        location,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        qrCode: `/event/${Date.now()}`
      }
    });

    res.status(201).json(event);
  } catch (error) {
    throw error;
  }
};

export const getEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: { active: true },
      orderBy: { startDate: 'desc' }
    });

    res.json(events);
  } catch (error) {
    throw error;
  }
};

export const getEventById = async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        reports: {
          include: {
            item: true,
            user: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    throw error;
  }
};

export const updateEvent = async (req, res) => {
  try {
    const { name, venue, location, startDate, endDate, active } = req.body;
    
    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: {
        name,
        venue,
        location,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        active
      }
    });

    res.json(event);
  } catch (error) {
    throw error;
  }
};

export const deleteEvent = async (req, res) => {
  try {
    await prisma.event.delete({
      where: { id: req.params.id }
    });

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    throw error;
  }
};
