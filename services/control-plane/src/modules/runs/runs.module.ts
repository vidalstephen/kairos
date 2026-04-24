import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RunEntity } from '../../entities/run.entity.js';
import { RunTraceEntity } from '../../entities/run-trace.entity.js';
import { RunConsumer } from './run.consumer.js';
import { RunsService, RUNS_QUEUE } from './runs.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RunEntity, RunTraceEntity]),
    BullModule.registerQueue({ name: RUNS_QUEUE }),
  ],
  providers: [RunsService, RunConsumer],
  exports: [RunsService],
})
export class RunsModule {}
