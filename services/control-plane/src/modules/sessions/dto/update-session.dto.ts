import { z } from 'zod';
import { SessionMode } from '../../../database/enums.js';

export const UpdateSessionDto = z.object({
  agent_id: z.string().uuid().nullable().optional(),
  persona_id: z.string().uuid().nullable().optional(),
  mode: z.nativeEnum(SessionMode).optional(),
});

export type UpdateSessionDto = z.infer<typeof UpdateSessionDto>;
