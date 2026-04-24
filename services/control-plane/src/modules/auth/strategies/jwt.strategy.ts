import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Repository } from 'typeorm';
import { RevokedTokenEntity } from '../../../entities/revoked-token.entity.js';
import type { JwtPayload, JwtUser } from '../types.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectRepository(RevokedTokenEntity)
    private readonly revokedTokens: Repository<RevokedTokenEntity>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtUser> {
    const revoked = await this.revokedTokens.existsBy({ jti: payload.jti });
    if (revoked) {
      return Promise.reject(new Error('Token has been revoked'));
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
