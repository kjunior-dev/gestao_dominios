import 'dotenv/config';
import {createApp} from './bootstrap';
import {RuntimeService} from './common/runtime.service';
createApp().then(async app=>{const runtime=app.get(RuntimeService);await app.listen(runtime.env.API_PORT,'0.0.0.0');runtime.logger.info({event:'api.started',port:runtime.env.API_PORT});}).catch(()=>{process.stderr.write('API startup failed. Check required environment and service connectivity.\n');process.exit(1);});
