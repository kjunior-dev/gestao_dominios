import { PrismaClient } from '@prisma/client';
import { hash, argon2id } from 'argon2';
const db = new PrismaClient();
async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 1 || password.length > 128)
    throw new Error('Set SEED_PASSWORD with 1–128 characters.');
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
  const registrar = await db.registrar.upsert({
    where: { code: 'openprovider' },
    create: {
      code: 'openprovider',
      name: 'Openprovider',
      status: 'ACTIVE',
      configurationReference: 'env:OPENPROVIDER',
    },
    update: {},
  });
  for (const extension of ['com', 'net', 'org']) {
    const tld = await db.tld.upsert({
      where: { extension },
      create: {
        extension,
        displayName: '.' + extension,
        isActive: false,
        isFeatured: true,
      },
      update: {},
    });
    await db.tldRegistrar.upsert({
      where: {
        tldId_registrarId: { tldId: tld.id, registrarId: registrar.id },
      },
      create: {
        tldId: tld.id,
        registrarId: registrar.id,
        isActive: false,
        supportsRegistration: true,
      },
      update: {},
    });
  }
  console.log('Development seed ready: cliente@example.test');
}
main().finally(() => db.$disconnect());
