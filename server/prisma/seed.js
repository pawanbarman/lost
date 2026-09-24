import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  const communities = [
    { code: 'campus', name: 'University Campus', description: 'Colleges, libraries and student facilities' },
    { code: 'office', name: 'TechCorp Office', description: 'Company building and office blocks' },
    { code: 'city', name: 'City Fest 2026', description: 'Public event venues and festival grounds' }
  ];
  for (const c of communities) {
    await prisma.community.upsert({
      where: { code: c.code },
      update: { name: c.name, description: c.description },
      create: c
    });
  }
  console.log('Created communities');

  const categories = ['Electronics', 'Wallets', 'Keys', 'Clothing', 'Bags', 'Books', 'Accessories', 'Documents', 'Others'];
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat },
      update: {},
      create: { name: cat }
    });
  }
  console.log('Created categories');

  const event = await prisma.event.upsert({
    where: { id: 'event-college-fest-2026' },
    update: {},
    create: {
      id: 'event-college-fest-2026',
      name: 'College Fest 2026',
      venue: 'Main Campus',
      location: 'University Ground',
      startDate: new Date('2026-03-15'),
      endDate: new Date('2026-03-17'),
      qrCode: '/event/college-fest-2026'
    }
  });
  console.log('Created event');

  console.log('\nSeed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });