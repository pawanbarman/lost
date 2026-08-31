import prisma from '../config/database.js';

const WEIGHTS = {
  category: 25,
  keywords: 25,
  description: 20,
  location: 20,
  dateTime: 10
};

export const MATCH_WEIGHTS = WEIGHTS;

export function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 100;
  
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  
  const intersection = words1.filter(word => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];
  
  if (union.length === 0) return 0;
  return Math.round((intersection.length / union.length) * 100);
}

export function calculateLocationScore(loc1, loc2) {
  if (!loc1 || !loc2) return 0;
  
  const l1 = loc1.toLowerCase();
  const l2 = loc2.toLowerCase();
  
  if (l1 === l2) return 100;
  
  const words1 = l1.split(/[\s,]+/);
  const words2 = l2.split(/[\s,]+/);
  
  const intersection = words1.filter(word => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];
  
  if (union.length === 0) return 0;
  return Math.round((intersection.length / union.length) * 100);
}

export function calculateDateTimeScore(date1, date2) {
  if (!date1 || !date2) return 0;
  
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  const diffHours = Math.abs(d1 - d2) / (1000 * 60 * 60);
  
  if (diffHours <= 1) return 100;
  if (diffHours <= 6) return 80;
  if (diffHours <= 12) return 60;
  if (diffHours <= 24) return 40;
  if (diffHours <= 48) return 20;
  
  return 0;
}

export function calculateScoreBreakdown(report, oppositeReport) {
  const categoryScore = report.item.category === oppositeReport.item.category ? 100 : 0;
  const keywordScore = calculateSimilarity(report.item.title, oppositeReport.item.title);
  const descriptionScore = calculateSimilarity(report.item.description, oppositeReport.item.description);
  const locationScore = calculateLocationScore(report.location, oppositeReport.location);
  const dateTimeScore = calculateDateTimeScore(report.dateTime, oppositeReport.dateTime);

  return {
    total: calculateTotalScore({ category: categoryScore, keywords: keywordScore, description: descriptionScore, location: locationScore, dateTime: dateTimeScore }),
    breakdown: {
      category: categoryScore,
      keywords: keywordScore,
      description: descriptionScore,
      location: locationScore,
      dateTime: dateTimeScore
    }
  };
}

export function calculateTotalScore(breakdown) {
  return Math.round(
    (breakdown.category * WEIGHTS.category +
     breakdown.keywords * WEIGHTS.keywords +
     breakdown.description * WEIGHTS.description +
     breakdown.location * WEIGHTS.location +
     breakdown.dateTime * WEIGHTS.dateTime) / 100
  );
}

export const matchingService = {
  async findMatches(reportId) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { item: true }
    });

    if (!report) return [];

    const oppositeType = report.type === 'LOST' ? 'FOUND' : 'LOST';
    
    const oppositeReports = await prisma.report.findMany({
      where: {
        type: oppositeType,
        status: { in: ['LOST', 'FOUND', 'POSSIBLE_MATCH'] }
      },
      include: { item: true }
    });

    const matches = [];

    for (const oppositeReport of oppositeReports) {
      if (oppositeReport.userId === report.userId) continue;

      const { total: totalScore, breakdown } = calculateScoreBreakdown(report, oppositeReport);

      if (totalScore >= 60) {
        matches.push({
          lostReportId: report.type === 'LOST' ? report.id : oppositeReport.id,
          foundReportId: report.type === 'FOUND' ? report.id : oppositeReport.id,
          score: totalScore,
          breakdown
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);

    for (const match of matches) {
      const existingMatch = await prisma.match.findFirst({
        where: {
          lostReportId: match.lostReportId,
          foundReportId: match.foundReportId
        }
      });

      if (!existingMatch) {
        const created = await prisma.match.create({
          data: {
            lostReportId: match.lostReportId,
            foundReportId: match.foundReportId,
            score: match.score
          }
        });

        await prisma.report.update({
          where: { id: match.lostReportId },
          data: { status: 'POSSIBLE_MATCH' }
        });

        await prisma.report.update({
          where: { id: match.foundReportId },
          data: { status: 'POSSIBLE_MATCH' }
        });

        const lostReportOwner = await prisma.report.findUnique({
          where: { id: match.lostReportId },
          select: { userId: true }
        });

        if (lostReportOwner) {
          await prisma.notification.create({
            data: {
              userId: lostReportOwner.userId,
              message: `We found a possible match for your lost item (Score: ${match.score}%)`,
              type: 'MATCH_FOUND'
            }
          });
        }
      }
    }

    return matches;
  },

  async getMatchesForUser(userId) {
    const userReports = await prisma.report.findMany({
      where: { userId },
      select: { id: true }
    });

    const reportIds = userReports.map(r => r.id);

    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { lostReportId: { in: reportIds } },
          { foundReportId: { in: reportIds } }
        ]
      },
      include: {
        lostReport: {
          include: {
            item: true,
            user: { select: { id: true, name: true } }
          }
        },
        foundReport: {
          include: {
            item: true,
            user: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { score: 'desc' }
    });

    return matches;
  }
};
