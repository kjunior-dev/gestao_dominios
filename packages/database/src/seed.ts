import { PrismaClient } from '@prisma/client';
import { hash, argon2id } from 'argon2';
const db = new PrismaClient();
async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error('Set SEED_PASSWORD with at least 12 characters.');
  const user = await db.user.upsert({
    where: { email: 'cliente@example.test' },
    update: {},
    create: {
      email: 'cliente@example.test',
      firstName: 'Cliente',
      lastName: 'DevTrust',
      passwordHash: await hash(password, { type: argon2id }),
    },
  });
  const org = await db.organization.upsert({
    where: { slug: 'demonstracao' },
    update: {},
    create: {
      name: 'Organização demonstrativa',
      slug: 'demonstracao',
      type: 'BUSINESS',
      country: 'CV',
    },
  });
  await db.organizationMember.upsert({
    where: {
      userId_organizationId: { userId: user.id, organizationId: org.id },
    },
    update: {},
    create: { userId: user.id, organizationId: org.id, role: 'OWNER' },
  });
  console.log('Development seed ready: cliente@example.test');
}
main().finally(() => db.$disconnect());
