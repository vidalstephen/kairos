import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import type { Repository } from 'typeorm';
import { SpanType } from '../../database/enums.js';
import { SpanEntity } from '../../entities/span.entity.js';
import { TraceEntity } from '../../entities/trace.entity.js';

@Injectable()
export class SpansService {
  private readonly logger = new Logger(SpansService.name);

  constructor(
    @InjectRepository(TraceEntity)
    private readonly traces: Repository<TraceEntity>,
    @InjectRepository(SpanEntity)
    private readonly spans: Repository<SpanEntity>,
  ) {}

  async startTrace(sessionId?: string): Promise<string> {
    const trace = this.traces.create({
      sessionId: sessionId ?? null,
      rootSpanId: null,
    });
    const saved = await this.traces.save(trace);
    return saved.id;
  }

  async startSpan(
    traceId: string,
    spanType: SpanType,
    name: string,
    options?: {
      parentSpanId?: string | null;
      attributes?: Record<string, unknown>;
    },
  ): Promise<string> {
    const spanId = crypto.randomUUID();
    const now = new Date();
    const span = this.spans.create({
      id: spanId,
      startedAt: now,
      traceId,
      parentSpanId: options?.parentSpanId ?? null,
      spanType,
      name,
      attributes: options?.attributes ?? {},
      status: 'ok',
    });
    await this.spans.save(span);

    // Update trace root_span_id if this is the first span
    const trace = await this.traces.findOne({ where: { id: traceId } });
    if (trace != null && trace.rootSpanId == null) {
      trace.rootSpanId = spanId;
      await this.traces.save(trace);
    }

    return spanId;
  }

  async endSpan(
    spanId: string,
    startedAt: Date,
    status: 'ok' | 'error' = 'ok',
    errorMessage?: string | null,
  ): Promise<void> {
    const now = new Date();
    const durationMs = now.getTime() - startedAt.getTime();
    await this.spans.update(
      { id: spanId, startedAt },
      {
        endedAt: now,
        durationMs,
        status,
        errorMessage: errorMessage ?? null,
      },
    );
  }

  async endTrace(traceId: string): Promise<void> {
    const trace = await this.traces.findOne({ where: { id: traceId } });
    if (trace == null) {
      throw new NotFoundException(`Trace ${traceId} not found`);
    }
    trace.endedAt = new Date();
    await this.traces.save(trace);
  }

  async findTrace(traceId: string): Promise<TraceEntity | null> {
    return this.traces.findOne({ where: { id: traceId } });
  }
}
