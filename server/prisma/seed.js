import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@leftbehind.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@leftbehind.com',
      passwordHash: adminPassword,
      role: 'ADMIN'
    }
  });
  console.log('Created admin user:', admin.email);

  const user1Password = await bcrypt.hash('user123', 10);
  const user1 = await prisma.user.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      passwordHash: user1Password,
      role: 'USER'
    }
  });

  const user2Password = await bcrypt.hash('user123', 10);
  const user2 = await prisma.user.upsert({
    where: { email: 'jane@example.com' },
    update: {},
    create: {
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '+0987654321',
      passwordHash: user2Password,
      role: 'USER'
    }
  });
  console.log('Created demo users');

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
  console.log('Created demo event');

  const existingLostReport = await prisma.report.findFirst({
    where: { userId: user1.id, type: 'LOST' }
  });

  if (!existingLostReport) {
    const item1 = await prisma.item.create({
      data: {
        title: 'Black Leather Wallet',
        category: 'Wallets',
        description: 'Black leather wallet with brand logo. Contains debit cards, ID card, and some cash. Has a small scratch on the back.',
        privateDetails: 'Blue sticker inside the flap, contains a library card with number LIB-2024-8831, emergency contact photo taped inside',
        imageUrl: null
      }
    });

    const lostReport1 = await prisma.report.create({
      data: {
        userId: user1.id,
        itemId: item1.id,
        type: 'LOST',
        location: 'Library, 2nd floor',
        dateTime: new Date('2026-03-10T14:30:00'),
        eventId: event.id,
        status: 'LOST'
      }
    });

    const item2 = await prisma.item.create({
      data: {
        title: 'Black Wallet',
        category: 'Wallets',
        description: 'Found black leather wallet near the library entrance. Contains cards and cash.',
        currentLocation: 'Security Desk, Main Gate',
        imageUrl: null
      }
    });

    const foundReport1 = await prisma.report.create({
      data: {
        userId: user2.id,
        itemId: item2.id,
        type: 'FOUND',
        location: 'Library entrance',
        dateTime: new Date('2026-03-10T15:00:00'),
        eventId: event.id,
        status: 'FOUND'
      }
    });

    const match = await prisma.match.create({
      data: {
        lostReportId: lostReport1.id,
        foundReportId: foundReport1.id,
        score: 85,
        status: 'PENDING'
      }
    });

    await prisma.report.update({ where: { id: lostReport1.id }, data: { status: 'POSSIBLE_MATCH' } });
    await prisma.report.update({ where: { id: foundReport1.id }, data: { status: 'POSSIBLE_MATCH' } });

    const item3 = await prisma.item.create({
      data: {
        title: 'iPhone 15 Pro',
        category: 'Electronics',
        description: 'Space gray iPhone 15 Pro with a blue case. Screen has a tempered glass protector.',
        privateDetails: 'Wallpaper is a sunset photo from Manali trip, has a crack near the top left corner, phone case has initials "JD" engraved',
        imageUrl: null
      }
    });

    await prisma.report.create({
      data: {
        userId: user1.id,
        itemId: item3.id,
        type: 'LOST',
        location: 'Cafeteria',
        dateTime: new Date('2026-03-11T12:00:00'),
        status: 'LOST'
      }
    });

    const item4 = await prisma.item.create({
      data: {
        title: 'Car Keys',
        category: 'Keys',
        description: 'Toyota car keys with a keychain that has a small teddy bear attached.',
        currentLocation: 'Lost & Found Office, Admin Building',
        imageUrl: null
      }
    });

    await prisma.report.create({
      data: {
        userId: user2.id,
        itemId: item4.id,
        type: 'FOUND',
        location: 'Parking lot',
        dateTime: new Date('2026-03-11T16:00:00'),
        status: 'FOUND'
      }
    });

    const item5 = await prisma.item.create({
      data: {
        title: 'Blue Backpack',
        category: 'Bags',
        description: 'Navy blue Jansport backpack with laptop compartment. Contains textbooks and a water bottle.',
        privateDetails: 'Has a "CS Club" pin on the front strap, laptop sleeve has a sticker of a cat, side pocket has a broken zipper',
        imageUrl: null
      }
    });

    await prisma.report.create({
      data: {
        userId: user1.id,
        itemId: item5.id,
        type: 'LOST',
        location: 'CS Building, Room 301',
        dateTime: new Date('2026-03-12T10:30:00'),
        status: 'LOST'
      }
    });

    await prisma.notification.create({
      data: {
        userId: user1.id,
        message: 'Possible match found for your lost Black Leather Wallet (Score: 85%)',
        type: 'MATCH_FOUND'
      }
    });

    console.log('Created demo reports, matches, and notifications');
  } else {
    console.log('Demo reports already exist, skipping');
  }

  console.log('\nSeed completed successfully!');
  console.log('\nDemo credentials:');
  console.log('Admin: admin@leftbehind.com / admin123');
  console.log('User 1: john@example.com / user123');
  console.log('User 2: jane@example.com / user123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
