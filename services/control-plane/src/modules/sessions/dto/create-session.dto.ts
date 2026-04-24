import { z } from 'zod';

export const CreateSessionDto = z.object({
  agent_id: z.string().uuid().optional(),
  persona_id: z.string().uuid().optional(),
});

export type CreateSessionDto = z.infer<typeof CreateSessionDto>;
