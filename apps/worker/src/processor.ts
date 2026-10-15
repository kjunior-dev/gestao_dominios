import { notificationTemplate } from '@devtrust/commerce';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDecipheriv } from 'node:crypto';
import type { PrismaClient } from '@devtrust/database';
import type { NotificationJob } from '@devtrust/contracts';
export function payload(value: string, key: string) {
  const [iv, tag, body] = value.split('.').map((v) => Buffer.from(v, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  decipher.setAAD(Buffer.from('notification'));
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'),
  ) as { link: string };
}
export async function processNotification(
  data: NotificationJob,
  db: PrismaClient,
  key: string,
  mailbox: string,
  delivery?: {
    get: (key: string) => Promise<string | null>;
    del: (key: string) => Promise<number>;
  },
) {
  const notification = await db.notification.findUniqueOrThrow({
    where: { id: data.notificationId },
    include: { user: { select: { email: true } } },
  });
  if (notification.status === 'SENT') return { duplicate: true };
  const deliveryKey = 'notification:delivery:' + notification.id;
  const encrypted = await delivery?.get(deliveryKey);
  if (
    ['VERIFY_EMAIL', 'RESET_PASSWORD'].includes(notification.type) &&
    !encrypted
  )
    throw new Error('Delivery material expired or unavailable');
  const content = encrypted ? payload(encrypted, key) : {};
  await mkdir(resolve(mailbox), { recursive: true, mode: 0o700 });
  await writeFile(
    resolve(mailbox, notification.id + '.json'),
    JSON.stringify({
      transport: 'DEVELOPMENT_ONLY',
      to: notification.user.email,
      subject: notification.subject,
      ...content,
      ...notificationTemplate(
        notification.type,
        notification.subject,
        (content as { link?: string }).link,
      ),
    }),
    { mode: 0o600 },
  );
  await db.notification.update({
    where: { id: notification.id },
    data: { status: 'SENT', sentAt: new Date(), encryptedPayload: null },
  });
  if (delivery) await delivery.del(deliveryKey).catch(() => 0);
  return { duplicate: false };
}
