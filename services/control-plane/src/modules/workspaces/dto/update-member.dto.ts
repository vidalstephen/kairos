import { z } from 'zod';
import { MemberRole } from '../../../database/enums.js';

export const UpdateMemberDto = z.object({
  role: z.nativeEnum(MemberRole),
});

export type UpdateMemberDto = z.infer<typeof UpdateMemberDto>;
