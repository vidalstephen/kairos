import { z } from 'zod';
import { MemberRole } from '../../../database/enums.js';

export const AddMemberDto = z.object({
  user_id: z.string().uuid(),
  role: z.nativeEnum(MemberRole).default(MemberRole.VIEWER),
});

export type AddMemberDto = z.infer<typeof AddMemberDto>;
