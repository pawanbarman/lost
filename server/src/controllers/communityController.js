import prisma from '../config/database.js';

export const createCommunity = async (req, res) => {
  try {
    const { name, code, description } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Community name is required' });
    }

    const community = await prisma.community.create({
      data: {
        name: name.trim(),
        code: code ? code.trim() : null,
        description: description || null
      }
    });

    res.status(201).json(community);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A community with this code already exists' });
    }
    throw error;
  }
};

export const getCommunities = async (req, res) => {
  try {
    const communities = await prisma.community.findMany({
      orderBy: { name: 'asc' }
    });

    res.json(communities);
  } catch (error) {
    throw error;
  }
};