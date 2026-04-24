import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpanEntity } from '../../entities/span.entity.js';
import { TraceEntity } from '../../entities/trace.entity.js';
import { SpansService } from './spans.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([TraceEntity, SpanEntity])],
  providers: [SpansService],
  exports: [SpansService],
})
export class ObservabilityModule {}
