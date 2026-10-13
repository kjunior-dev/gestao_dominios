import { PrismaClient, Prisma } from '@prisma/client';
import { hash, argon2id } from 'argon2';
const db = new PrismaClient();
async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length < 16 ||
    password.length > 128
  )
    throw new Error(
      'Provide BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (16+ characters).',
    );
  const passwordHash = await hash(password, { type: argon2id });
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(481702)`;
      if (await tx.user.count({ where: { globalRole: 'SUPER_ADMIN' } }))
        throw new Error('Bootstrap disabled: SUPER_ADMIN already exists.');
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: 'Administrador',
          lastName: 'DevTrust',
          globalRole: 'SUPER_ADMIN',
          emailVerifiedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'admin.bootstrap',
          resourceType: 'User',
          resourceId: user.id,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  console.log(
    'Administrator created. MFA enrollment required before administration access.',
  );
}
main().finally(() => db.$disconnect());
