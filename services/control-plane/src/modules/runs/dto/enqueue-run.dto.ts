import { z } from 'zod';

export const EnqueueRunSchema = z.object({
  session_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  agent_role: z.string().min(1),
  model_id: z.string().min(1),
  parent_run_id: z.string().uuid().nullable().optional(),
  budget_tokens: z.number().int().positive().nullable().optional(),
  budget_time_ms: z.number().int().positive().nullable().optional(),
  payload: z.record(z.unknown()).optional(),
});

export type EnqueueRunDto = z.infer<typeof EnqueueRunSchema>;
