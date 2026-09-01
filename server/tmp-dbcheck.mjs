import dotenv from 'dotenv';
dotenv.config();
const prisma = (await import('./src/config/database.js')).default;
try {
  const c = await prisma.user.count();
  const rc = await prisma.report.count();
  const mc = await prisma.match.count();
  const cc = await prisma.claim.count();
  console.log('DB CONNECTION OK - users=' + c + ' reports=' + rc + ' matches=' + mc + ' claims=' + cc);
} catch (e) {
  console.log('DB ERROR: ' + e.message);
} finally {
  await prisma.$disconnect();
}
