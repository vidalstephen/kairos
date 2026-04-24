import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { RunStatus } from '../../../database/enums.js';
import type { RunEntity } from '../../../entities/run.entity.js';
import type { RunTraceEntity } from '../../../entities/run-trace.entity.js';
import { RunsService } from '../runs.service.js';

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
    update: vi.fn(),
    existsBy: vi.fn(),
  } as unknown as MockRepo<T>;
}

function makeRun(overrides: Partial<RunEntity> = {}): RunEntity {
  return {
    id: 'run-1',
    sessionId: 'sess-1',
    workspaceId: 'ws-1',
    agentRole: 'assistant',
    modelId: 'claude-3-5-sonnet',
    status: RunStatus.QUEUED,
    tokensIn: 0,
    tokensOut: 0,
    budgetTokens: null,
    budgetTimeMs: null,
    costUsd: null,
    startedAt: new Date(),
    endedAt: null,
    error: null,
    parentRunId: null,
    ...overrides,
  } as RunEntity;
}

function makeService(
  runsRepoOverrides: Partial<MockRepo<RunEntity>> = {},
  tracesRepoOverrides: Partial<MockRepo<RunTraceEntity>> = {},
) {
  const runsRepo = { ...mockRepo<RunEntity>(), ...runsRepoOverrides };
  const tracesRepo = { ...mockRepo<RunTraceEntity>(), ...tracesRepoOverrides };
  const queue = {
    add: vi.fn().mockResolvedValue({ id: 'run-1' }),
    getJob: vi.fn().mockResolvedValue(null),
  };
  return {
    service: new RunsService(
      runsRepo as unknown as Repository<RunEntity>,
      tracesRepo as unknown as Repository<RunTraceEntity>,
      queue as never,
    ),
    runsRepo,
    tracesRepo,
    queue,
  };
}

// ── Enqueue ────────────────────────────────────────────────────────────────────

describe('RunsService.enqueue', () => {
  it('creates run, pushes to queue, and appends trace', async () => {
    const run = makeRun();
    const { service, runsRepo, tracesRepo, queue } = makeService({
      create: vi.fn().mockReturnValue(run),
      save: vi.fn().mockResolvedValue(run),
    });

    const result = await service.enqueue({
      session_id: 'sess-1',
      workspace_id: 'ws-1',
      agent_role: 'assistant',
      model_id: 'claude-3-5-sonnet',
    });

    expect(result.id).toBe('run-1');
    expect(queue.add).toHaveBeenCalledWith(
      'process',
      expect.objectContaining({ runId: 'run-1' }),
      expect.any(Object),
    );
    expect(runsRepo.save).toHaveBeenCalledTimes(1); // run saved once
    expect(tracesRepo.save).toHaveBeenCalledTimes(1); // trace via appendTrace
  });
});

// ── State machine ──────────────────────────────────────────────────────────────

describe('RunsService.start', () => {
  it('transitions QUEUED → RUNNING', async () => {
    const run = makeRun({ status: RunStatus.QUEUED });
    const { service, runsRepo } = makeService({
      findOne: vi.fn().mockResolvedValue(run),
      save: vi.fn().mockImplementation((r: RunEntity) => Promise.resolve(r)),
    });

    const result = await service.start('run-1');
    expect(result.status).toBe(RunStatus.RUNNING);
    expect(result.startedAt).toBeInstanceOf(Date);
  });

  it('throws when run is not QUEUED', async () => {
    const run = makeRun({ status: RunStatus.RUNNING });
    const { service } = makeService({ findOne: vi.fn().mockResolvedValue(run) });

    await expect(service.start('run-1')).rejects.toThrow(BadRequestException);
  });

  it('throws when run not found', async () => {
    const { service } = makeService({ findOne: vi.fn().mockResolvedValue(null) });

    await expect(service.start('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('RunsService.complete', () => {
  it('transitions RUNNING → COMPLETED with token counts', async () => {
    const run = makeRun({ status: RunStatus.RUNNING });
    const { service, runsRepo } = makeService({
      findOne: vi.fn().mockResolvedValue(run),
      save: vi.fn().mockImplementation((r: RunEntity) => Promise.resolve(r)),
    });

    const result = await service.complete('run-1', 100, 50, '0.000123');
    expect(result.status).toBe(RunStatus.COMPLETED);
    expect(result.tokensIn).toBe(100);
    expect(result.tokensOut).toBe(50);
    expect(result.endedAt).toBeInstanceOf(Date);
  });

  it('throws when run is not RUNNING', async () => {
    const run = makeRun({ status: RunStatus.QUEUED });
    const { service } = makeService({ findOne: vi.fn().mockResolvedValue(run) });

    await expect(service.complete('run-1', 0, 0, null)).rejects.toThrow(BadRequestException);
  });
});

describe('RunsService.fail', () => {
  it('transitions RUNNING → FAILED with error', async () => {
    const run = makeRun({ status: RunStatus.RUNNING });
    const { service } = makeService({
      findOne: vi.fn().mockResolvedValue(run),
      save: vi.fn().mockImplementation((r: RunEntity) => Promise.resolve(r)),
    });

    const result = await service.fail('run-1', { code: 'TOOL_ERROR', message: 'boom' });
    expect(result.status).toBe(RunStatus.FAILED);
    expect(result.error).toMatchObject({ code: 'TOOL_ERROR' });
  });
});

describe('RunsService.cancel', () => {
  it('cancels a QUEUED run and removes from queue', async () => {
    const run = makeRun({ status: RunStatus.QUEUED });
    const mockJob = { remove: vi.fn().mockResolvedValue(undefined) };
    const { service } = makeService(
      {
        findOne: vi.fn().mockResolvedValue(run),
        save: vi.fn().mockImplementation((r: RunEntity) => Promise.resolve(r)),
      },
    );
    // Override queue in factory
    const { service: svc, queue } = makeService({
      findOne: vi.fn().mockResolvedValue(run),
      save: vi.fn().mockImplementation((r: RunEntity) => Promise.resolve(r)),
    });
    queue.getJob.mockResolvedValue(mockJob);

    const result = await svc.cancel('run-1');
    expect(result.status).toBe(RunStatus.CANCELLED);
    expect(mockJob.remove).toHaveBeenCalled();
  });

  it('throws when run is already completed', async () => {
    const run = makeRun({ status: RunStatus.COMPLETED });
    const { service } = makeService({ findOne: vi.fn().mockResolvedValue(run) });

    await expect(service.cancel('run-1')).rejects.toThrow(BadRequestException);
  });
});

describe('RunsService.timeout', () => {
  it('transitions RUNNING → TIMED_OUT', async () => {
    const run = makeRun({ status: RunStatus.RUNNING });
    const { service } = makeService({
      findOne: vi.fn().mockResolvedValue(run),
      save: vi.fn().mockImplementation((r: RunEntity) => Promise.resolve(r)),
    });

    const result = await service.timeout('run-1');
    expect(result.status).toBe(RunStatus.TIMED_OUT);
  });
});

// ── Budget check ───────────────────────────────────────────────────────────────

describe('RunsService.checkBudget', () => {
  it('returns not exceeded when no budget set', async () => {
    const run = makeRun({ budgetTokens: null, budgetTimeMs: null });
    const { service } = makeService({ findOne: vi.fn().mockResolvedValue(run) });

    const result = await service.checkBudget('run-1');
    expect(result.exceeded).toBe(false);
  });

  it('detects token budget exceeded', async () => {
    const run = makeRun({ budgetTokens: 100, tokensIn: 80, tokensOut: 30 });
    const { service } = makeService({ findOne: vi.fn().mockResolvedValue(run) });

    const result = await service.checkBudget('run-1');
    expect(result.exceeded).toBe(true);
    expect(result.reason).toMatch(/Token budget exceeded/);
  });

  it('detects time budget exceeded', async () => {
    const pastDate = new Date(Date.now() - 10_000);
    const run = makeRun({ budgetTimeMs: 5_000, startedAt: pastDate });
    const { service } = makeService({ findOne: vi.fn().mockResolvedValue(run) });

    const result = await service.checkBudget('run-1');
    expect(result.exceeded).toBe(true);
    expect(result.reason).toMatch(/Time budget exceeded/);
  });

  it('returns not exceeded when under both budgets', async () => {
    const run = makeRun({
      budgetTokens: 1000,
      budgetTimeMs: 60_000,
      tokensIn: 100,
      tokensOut: 50,
      startedAt: new Date(),
    });
    const { service } = makeService({ findOne: vi.fn().mockResolvedValue(run) });

    const result = await service.checkBudget('run-1');
    expect(result.exceeded).toBe(false);
  });
});
