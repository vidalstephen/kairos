import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { SpanType } from '../../../database/enums.js';
import type { SpanEntity } from '../../../entities/span.entity.js';
import type { TraceEntity } from '../../../entities/trace.entity.js';
import { SpansService } from '../spans.service.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

type MockRepo<T extends object> = {
  [K in keyof Repository<T>]: ReturnType<typeof vi.fn>;
};

function mockRepo<T extends object>(): MockRepo<T> {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    save: vi.fn((e: unknown) => Promise.resolve(e)),
    create: vi.fn((e: unknown) => e),
    update: vi.fn().mockResolvedValue(undefined),
    existsBy: vi.fn(),
  } as unknown as MockRepo<T>;
}

function makeService(
  tracesRepoOverrides: Partial<MockRepo<TraceEntity>> = {},
  spansRepoOverrides: Partial<MockRepo<SpanEntity>> = {},
) {
  const tracesRepo = { ...mockRepo<TraceEntity>(), ...tracesRepoOverrides };
  const spansRepo = { ...mockRepo<SpanEntity>(), ...spansRepoOverrides };
  return {
    service: new SpansService(
      tracesRepo as unknown as Repository<TraceEntity>,
      spansRepo as unknown as Repository<SpanEntity>,
    ),
    tracesRepo,
    spansRepo,
  };
}

// ── Trace lifecycle ────────────────────────────────────────────────────────────

describe('SpansService.startTrace', () => {
  it('creates a trace and returns its id', async () => {
    const trace = { id: 'trace-1', sessionId: null, rootSpanId: null, startedAt: new Date(), endedAt: null };
    const { service } = makeService({
      create: vi.fn().mockReturnValue(trace),
      save: vi.fn().mockResolvedValue(trace),
    });

    const traceId = await service.startTrace('sess-1');
    expect(traceId).toBe('trace-1');
  });

  it('creates a trace without sessionId', async () => {
    const trace = { id: 'trace-2', sessionId: null, rootSpanId: null, startedAt: new Date(), endedAt: null };
    const { service } = makeService({
      create: vi.fn().mockReturnValue(trace),
      save: vi.fn().mockResolvedValue(trace),
    });

    const traceId = await service.startTrace();
    expect(traceId).toBe('trace-2');
  });
});

describe('SpansService.startSpan', () => {
  it('creates a span and returns its id', async () => {
    const trace = { id: 'trace-1', sessionId: null, rootSpanId: null, startedAt: new Date(), endedAt: null };
    const span = { id: 'some-uuid', traceId: 'trace-1', spanType: SpanType.EGO_PASS, name: 'test-span' };
    const { service } = makeService(
      {
        findOne: vi.fn().mockResolvedValue(trace),
        save: vi.fn().mockResolvedValue(trace),
      },
      {
        create: vi.fn().mockReturnValue(span),
        save: vi.fn().mockResolvedValue(span),
      },
    );

    const spanId = await service.startSpan('trace-1', SpanType.EGO_PASS, 'test-span');
    expect(typeof spanId).toBe('string');
    expect(spanId.length).toBeGreaterThan(0);
  });

  it('sets root_span_id when trace has none', async () => {
    const trace = { id: 'trace-1', sessionId: null, rootSpanId: null, startedAt: new Date(), endedAt: null };
    const { service, tracesRepo } = makeService(
      {
        findOne: vi.fn().mockResolvedValue(trace),
        save: vi.fn().mockImplementation((t: TraceEntity) => Promise.resolve(t)),
      },
      {
        create: vi.fn().mockImplementation((e: unknown) => ({ ...e as object, id: 'span-uuid' })),
        save: vi.fn().mockImplementation((e: unknown) => Promise.resolve(e)),
      },
    );

    await service.startSpan('trace-1', SpanType.TOOL_CALL, 'tool-exec');
    // Should have updated the trace's rootSpanId
    expect(tracesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ rootSpanId: expect.any(String) }),
    );
  });
});

describe('SpansService.endSpan', () => {
  it('calls update with duration and status', async () => {
    const { service, spansRepo } = makeService();
    const start = new Date(Date.now() - 100);

    await service.endSpan('span-1', start, 'ok');
    expect(spansRepo.update).toHaveBeenCalledWith(
      { id: 'span-1', startedAt: start },
      expect.objectContaining({ status: 'ok', durationMs: expect.any(Number) }),
    );
  });

  it('sets error status and message', async () => {
    const { service, spansRepo } = makeService();
    const start = new Date(Date.now() - 50);

    await service.endSpan('span-1', start, 'error', 'something went wrong');
    expect(spansRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'error', errorMessage: 'something went wrong' }),
    );
  });
});

describe('SpansService.endTrace', () => {
  it('sets endedAt on the trace', async () => {
    const trace = { id: 'trace-1', sessionId: null, rootSpanId: null, startedAt: new Date(), endedAt: null };
    const { service, tracesRepo } = makeService({
      findOne: vi.fn().mockResolvedValue(trace),
      save: vi.fn().mockImplementation((t: TraceEntity) => Promise.resolve(t)),
    });

    await service.endTrace('trace-1');
    expect(tracesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ endedAt: expect.any(Date) }),
    );
  });

  it('throws NotFoundException when trace not found', async () => {
    const { service } = makeService({
      findOne: vi.fn().mockResolvedValue(null),
    });

    await expect(service.endTrace('missing')).rejects.toThrow(NotFoundException);
  });
});
