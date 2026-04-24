import type { UserRole } from '../../database/enums.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  jti: string;
}

export interface JwtUser {
  id: string;
  email: string;
  role: UserRole;
}
