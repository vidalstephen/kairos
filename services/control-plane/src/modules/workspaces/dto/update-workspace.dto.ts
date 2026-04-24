import { z } from 'zod';

export const UpdateWorkspaceDto = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  settings: z.record(z.unknown()).optional(),
});

export type UpdateWorkspaceDto = z.infer<typeof UpdateWorkspaceDto>;
