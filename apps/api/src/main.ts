import { EnvironmentError } from './config/environment';
import 'dotenv/config';
import { createApp } from './bootstrap';
import { RuntimeService } from './common/runtime.service';
createApp()
  .then(async (app) => {
    const runtime = app.get(RuntimeService);
    await app.listen(runtime.env.API_PORT, '0.0.0.0');
    runtime.logger.info({ event: 'api.started', port: runtime.env.API_PORT });
  })
  .catch((error: unknown) => {
    process.stderr.write(
      error instanceof EnvironmentError
        ? error.message + '\n'
        : 'API startup failed. Check service connectivity.\n',
    );
    process.exit(1);
  });
