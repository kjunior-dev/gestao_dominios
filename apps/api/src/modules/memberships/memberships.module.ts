import {Module} from '@nestjs/common';
import {MembershipsController} from './memberships.controller';
@Module({controllers:[MembershipsController]}) export class MembershipsModule {}
