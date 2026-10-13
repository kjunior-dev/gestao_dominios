import { Inject } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RuntimeService) private runtime: RuntimeService,
  ) {}
  async enqueue(userId: string, type: string, subject: string) {
    const notification = await this.db.notification.create({
      data: { userId, type, subject },
    });
    await this.dispatch(notification.id);
    return notification;
  }
  async dispatch(id: string) {
    try {
      await this.runtime.notifications.add(
        'deliver',
        { notificationId: id },
        { jobId: id },
      );
    } catch {
      this.runtime.logger.error({
        event: 'notification.enqueue_deferred',
        notificationId: id,
      });
    }
  }
}
