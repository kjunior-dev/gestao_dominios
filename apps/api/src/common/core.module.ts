import { Global,Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { RuntimeService } from './runtime.service';
@Global()
@Module({providers:[DatabaseService,RuntimeService],exports:[DatabaseService,RuntimeService]})
export class CoreModule {}
