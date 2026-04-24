import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { RUNS_QUEUE } from './runs.service.js';
import type { RunsService } from './runs.service.js';

export interface RunJobPayload {
  runId: string;
  payload: Record<string, unknown>;
}

const BUDGET_CHECK_INTERVAL_MS = 5_000;

@Processor(RUNS_QUEUE)
export class RunConsumer extends WorkerHost {
  private readonly logger = new Logger(RunConsumer.name);

  constructor(private readonly runsService: RunsService) {
    super();
  }

  async process(job: Job<RunJobPayload>): Promise<void> {
    const { runId } = job.data;
    this.logger.log(`Processing run ${runId}`);

    // Transition to RUNNING
    await this.runsService.start(runId);

    // Set up a budget-check interval
    const budgetInterval = setInterval(async () => {
      try {
        const result = await this.runsService.checkBudget(runId);
        if (result.exceeded) {
          this.logger.warn(`Run ${runId} budget exceeded: ${result.reason}`);
          clearInterval(budgetInterval);
          await this.runsService.timeout(runId);
          // Throw to fail the BullMQ job cleanly
          throw new Error(`Budget exceeded: ${result.reason}`);
        }
      } catch {
        clearInterval(budgetInterval);
      }
    }, BUDGET_CHECK_INTERVAL_MS);

    try {
      // Phase 1: stub execution — real cognition engine wires here in Phase 2+
      await this.runStub(runId, job.data.payload);

      clearInterval(budgetInterval);

      // Final budget check before completing
      const budget = await this.runsService.checkBudget(runId);
      if (budget.exceeded) {
        await this.runsService.timeout(runId);
        return;
      }

      await this.runsService.complete(runId, 0, 0, null);
      this.logger.log(`Run ${runId} completed`);
    } catch (err: unknown) {
      clearInterval(budgetInterval);
      const message = err instanceof Error ? err.message : String(err);
      // Don't double-transition if already timed out
      const run = await this.runsService.findOne(runId);
      if (run?.status === 'RUNNING') {
        await this.runsService.fail(runId, {
          code: 'RUN_FAILED',
          message,
        });
      }
      throw err; // Re-throw so BullMQ can retry / mark failed
    }
  }

  // Stub: replaced by real agent execution in Phase 2+
  private async runStub(
    _runId: string,
    _payload: Record<string, unknown>,
  ): Promise<void> {
    // No-op for Phase 1
  }
}
