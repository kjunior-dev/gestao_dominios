import { Inject } from '@nestjs/common';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public, HealthProbe } from '../../common/security';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RuntimeService) private runtime: RuntimeService,
  ) {}
  @Public() @HealthProbe() @Get() async health() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      await this.runtime.redis.ping();
      const worker = !!(await this.runtime.redis.get('worker:heartbeat'));
      if (!worker) throw new Error('worker unavailable');
      return { status: 'ok', database: 'ok', redis: 'ok', worker: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Serviços indisponíveis');
    }
  }
}
