import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { Repository } from 'typeorm';
import { RefreshTokenEntity } from '../../entities/refresh-token.entity.js';
import { UserEntity } from '../../entities/user.entity.js';
import type { LoginDto } from './dto/login.dto.js';
import type { JwtPayload } from './types.js';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  user: Pick<UserEntity, 'id' | 'email' | 'displayName' | 'role' | 'createdAt'>;
}

export interface RefreshResult {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokens: Repository<RefreshTokenEntity>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.users.findOne({ where: { email: dto.email } });

    // Constant-time comparison: always bcrypt.compare even if user not found
    // to prevent timing attacks that reveal which emails are registered.
    const dummyHash =
      '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const hashToCheck = user?.passwordHash ?? dummyHash;

    const valid = await bcrypt.compare(dto.password, hashToCheck);

    if (user == null || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user);
  }

  async refresh(rawToken: string): Promise<RefreshResult> {
    const tokenRecord = await this.findValidRefreshToken(rawToken);
    if (tokenRecord == null) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.users.findOne({ where: { id: tokenRecord.userId } });
    if (user == null) {
      throw new UnauthorizedException('User not found');
    }

    // Rotating: revoke old token before issuing new pair
    await this.refreshTokens.update(tokenRecord.id, { revokedAt: new Date() });

    const result = await this.issueTokens(user);
    return { access_token: result.access_token, refresh_token: result.refresh_token };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenRecord = await this.findValidRefreshToken(rawToken);
    if (tokenRecord != null) {
      await this.refreshTokens.update(tokenRecord.id, { revokedAt: new Date() });
    }
    // Silently succeed if token not found — don't expose existence
  }

  async me(userId: string): Promise<Pick<UserEntity, 'id' | 'email' | 'displayName' | 'role' | 'createdAt'>> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (user == null) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async issueTokens(user: UserEntity): Promise<LoginResult> {
    const jti = randomBytes(16).toString('hex');

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti,
    };

    const jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: jwtSecret,
      expiresIn: '15m',
    });

    const rawRefresh = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = await bcrypt.hash(rawRefresh, BCRYPT_ROUNDS);

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash,
        expiresAt,
        revokedAt: null,
      }),
    );

    return {
      access_token: accessToken,
      refresh_token: rawRefresh,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }

  private async findValidRefreshToken(
    rawToken: string,
  ): Promise<RefreshTokenEntity | null> {
    const now = new Date();

    // Load recent unexpired, non-revoked tokens for the bcrypt comparison.
    // We cannot query by hash directly (bcrypt is one-way), so we fetch
    // candidates and compare in-process. Limit to 20 to bound the work;
    // in practice each user has very few active tokens.
    const candidates = await this.refreshTokens
      .createQueryBuilder('rt')
      .where('rt.revokedAt IS NULL')
      .andWhere('rt.expiresAt > :now', { now })
      .orderBy('rt.createdAt', 'DESC')
      .take(20)
      .getMany();

    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const match = await bcrypt.compare(rawToken, candidate.tokenHash);
      if (match) {
        return candidate;
      }
    }

    return null;
  }
}
