import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import { RunStatus } from '../../database/enums.js';
import { RunEntity } from '../../entities/run.entity.js';
import { RunTraceEntity } from '../../entities/run-trace.entity.js';
import type { EnqueueRunDto } from './dto/enqueue-run.dto.js';

export const RUNS_QUEUE = 'runs';

export interface BudgetCheckResult {
  exceeded: boolean;
  reason: string | null;
}

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    @InjectRepository(RunEntity)
    private readonly runs: Repository<RunEntity>,
    @InjectRepository(RunTraceEntity)
    private readonly runTraces: Repository<RunTraceEntity>,
    @InjectQueue(RUNS_QUEUE)
    private readonly runsQueue: Queue,
  ) {}

  async enqueue(dto: EnqueueRunDto): Promise<RunEntity> {
    const run = this.runs.create({
      sessionId: dto.session_id,
      workspaceId: dto.workspace_id,
      agentRole: dto.agent_role,
      modelId: dto.model_id,
      parentRunId: dto.parent_run_id ?? null,
      budgetTokens: dto.budget_tokens ?? null,
      budgetTimeMs: dto.budget_time_ms ?? null,
      status: RunStatus.QUEUED,
      tokensIn: 0,
      tokensOut: 0,
    });

    const saved = await this.runs.save(run);

    await this.runsQueue.add(
      'process',
      { runId: saved.id, payload: dto.payload ?? {} },
      { jobId: saved.id, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );

    await this.appendTrace(saved.id, 'enqueued', { dto });
    this.logger.log(`Run ${saved.id} enqueued`);
    return saved;
  }

  async start(runId: string): Promise<RunEntity> {
    const run = await this.findOrFail(runId);
    if (run.status !== RunStatus.QUEUED) {
      throw new BadRequestException(`Run ${runId} is not QUEUED (current: ${run.status})`);
    }
    run.status = RunStatus.RUNNING;
    run.startedAt = new Date();
    const saved = await this.runs.save(run);
    await this.appendTrace(runId, 'started', {});
    return saved;
  }

  async complete(
    runId: string,
    tokensIn: number,
    tokensOut: number,
    costUsd: string | null,
  ): Promise<RunEntity> {
    const run = await this.findOrFail(runId);
    if (run.status !== RunStatus.RUNNING) {
      throw new BadRequestException(`Run ${runId} is not RUNNING (current: ${run.status})`);
    }
    run.status = RunStatus.COMPLETED;
    run.tokensIn = tokensIn;
    run.tokensOut = tokensOut;
    run.costUsd = costUsd;
    run.endedAt = new Date();
    const saved = await this.runs.save(run);
    await this.appendTrace(runId, 'completed', { tokensIn, tokensOut, costUsd });
    return saved;
  }

  async fail(runId: string, error: Record<string, unknown>): Promise<RunEntity> {
    const run = await this.findOrFail(runId);
    if (run.status !== RunStatus.RUNNING) {
      throw new BadRequestException(`Run ${runId} is not RUNNING (current: ${run.status})`);
    }
    run.status = RunStatus.FAILED;
    run.endedAt = new Date();
    run.error = error;
    const saved = await this.runs.save(run);
    await this.appendTrace(runId, 'failed', { error });
    return saved;
  }

  async cancel(runId: string): Promise<RunEntity> {
    const run = await this.findOrFail(runId);
    if (run.status !== RunStatus.QUEUED && run.status !== RunStatus.RUNNING) {
      throw new BadRequestException(`Run ${runId} cannot be cancelled (current: ${run.status})`);
    }

    // Remove from queue if still queued
    if (run.status === RunStatus.QUEUED) {
      try {
        const job = await this.runsQueue.getJob(runId);
        await job?.remove();
      } catch {
        // Job may already be processing — best effort
      }
    }

    run.status = RunStatus.CANCELLED;
    run.endedAt = new Date();
    const saved = await this.runs.save(run);
    await this.appendTrace(runId, 'cancelled', {});
    return saved;
  }

  async timeout(runId: string): Promise<RunEntity> {
    const run = await this.findOrFail(runId);
    if (run.status !== RunStatus.RUNNING) {
      throw new BadRequestException(`Run ${runId} is not RUNNING (current: ${run.status})`);
    }
    run.status = RunStatus.TIMED_OUT;
    run.endedAt = new Date();
    const saved = await this.runs.save(run);
    await this.appendTrace(runId, 'timed_out', {});
    return saved;
  }

  async checkBudget(runId: string): Promise<BudgetCheckResult> {
    const run = await this.findOrFail(runId);

    if (run.budgetTokens != null) {
      const totalTokens = run.tokensIn + run.tokensOut;
      if (totalTokens >= run.budgetTokens) {
        return {
          exceeded: true,
          reason: `Token budget exceeded: ${totalTokens} / ${run.budgetTokens}`,
        };
      }
    }

    if (run.budgetTimeMs != null && run.startedAt != null) {
      const elapsedMs = Date.now() - run.startedAt.getTime();
      if (elapsedMs >= run.budgetTimeMs) {
        return {
          exceeded: true,
          reason: `Time budget exceeded: ${elapsedMs}ms / ${run.budgetTimeMs}ms`,
        };
      }
    }

    return { exceeded: false, reason: null };
  }

  async appendTrace(
    runId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<RunTraceEntity> {
    const trace = this.runTraces.create({ runId, eventType, payload });
    return this.runTraces.save(trace);
  }

  async findOne(runId: string): Promise<RunEntity | null> {
    return this.runs.findOne({ where: { id: runId } });
  }

  private async findOrFail(runId: string): Promise<RunEntity> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (run == null) {
      throw new NotFoundException(`Run ${runId} not found`);
    }
    return run;
  }
}
