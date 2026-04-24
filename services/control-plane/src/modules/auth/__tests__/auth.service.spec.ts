import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { RefreshTokenEntity } from '../../../entities/refresh-token.entity.js';
import { UserEntity } from '../../../entities/user.entity.js';
import { UserRole } from '../../../database/enums.js';
import { AuthService } from '../auth.service.js';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeUser(overrides?: Partial<UserEntity>): UserEntity {
  return {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: '$2b$12$placeholderhashedvalue.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    displayName: 'Test User',
    role: UserRole.VIEWER,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    refreshTokens: [],
    ownedWorkspaces: [],
    memberships: [],
    ...overrides,
  };
}

function makeRefreshToken(overrides?: Partial<RefreshTokenEntity>): RefreshTokenEntity {
  return {
    id: 'rt-uuid-1',
    userId: 'user-uuid-1',
    tokenHash: '$2b$12$placeholderhashedvalue.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date('2025-01-01'),
    user: null as unknown as UserEntity,
    ...overrides,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type MockRepo<T extends object> = {
  [K in keyof Repository<T>]: ReturnType<typeof vi.fn>;
};

function mockRepo<T extends object>(): MockRepo<T> {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    existsBy: vi.fn(),
    createQueryBuilder: vi.fn(),
  } as unknown as MockRepo<T>;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: MockRepo<UserEntity>;
  let rtRepo: MockRepo<RefreshTokenEntity>;
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    userRepo = mockRepo<UserEntity>();
    rtRepo = mockRepo<RefreshTokenEntity>();
    jwtService = { signAsync: vi.fn().mockResolvedValue('signed-jwt') };

    // Direct instantiation — bypasses NestJS DI for true unit tests
    service = new AuthService(
      userRepo as unknown as Repository<UserEntity>,
      rtRepo as unknown as Repository<RefreshTokenEntity>,
      jwtService as unknown as JwtService,
      { getOrThrow: vi.fn().mockReturnValue('test-jwt-secret') } as unknown as ConfigService,
    );
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns tokens + user when credentials are valid', async () => {
      const hash = await bcrypt.hash('correct-password', 12);
      const user = makeUser({ passwordHash: hash });

      vi.mocked(userRepo.findOne).mockResolvedValue(user);
      vi.mocked(rtRepo.create).mockImplementation((v) => v as RefreshTokenEntity);
      vi.mocked(rtRepo.save).mockResolvedValue(makeRefreshToken());

      const result = await service.login({ email: user.email, password: 'correct-password' }); // pragma: allowlist secret

      expect(result.access_token).toBe('signed-jwt');
      expect(result.refresh_token).toBeTruthy();
      expect(result.user.email).toBe(user.email);
    });

    it('throws UnauthorizedException when user is not found', async () => {
      vi.mocked(userRepo.findOne).mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'any' }), // pragma: allowlist secret
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      const hash = await bcrypt.hash('real-password', 12);
      const user = makeUser({ passwordHash: hash });

      vi.mocked(userRepo.findOne).mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'wrong-password' }), // pragma: allowlist secret
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('issues a new token pair and revokes the old one', async () => {
      const rawToken = 'some-64-char-hex-token-value-placeholder-here-xxxxxxxxxx';
      const hash = await bcrypt.hash(rawToken, 12);
      const rt = makeRefreshToken({ tokenHash: hash });
      const user = makeUser();

      const qb = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([rt]),
      };

      vi.mocked(rtRepo.createQueryBuilder).mockReturnValue(
        qb as unknown as ReturnType<Repository<RefreshTokenEntity>['createQueryBuilder']>,
      );
      vi.mocked(rtRepo.update).mockResolvedValue({ affected: 1 } as never);
      vi.mocked(userRepo.findOne).mockResolvedValue(user);
      vi.mocked(rtRepo.create).mockImplementation((v) => v as RefreshTokenEntity);
      vi.mocked(rtRepo.save).mockResolvedValue(makeRefreshToken());

      const result = await service.refresh(rawToken);

      expect(result.access_token).toBe('signed-jwt');
      expect(result.refresh_token).toBeTruthy();
      expect(rtRepo.update).toHaveBeenCalledWith(rt.id, { revokedAt: expect.any(Date) });
    });

    it('throws UnauthorizedException when token is not found', async () => {
      const qb = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(rtRepo.createQueryBuilder).mockReturnValue(
        qb as unknown as ReturnType<Repository<RefreshTokenEntity>['createQueryBuilder']>,
      );

      await expect(service.refresh('no-such-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user no longer exists', async () => {
      const rawToken = 'some-64-char-hex-token-value-placeholder-here-xxxxxxxxxx';
      const hash = await bcrypt.hash(rawToken, 12);
      const rt = makeRefreshToken({ tokenHash: hash });

      const qb = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([rt]),
      };

      vi.mocked(rtRepo.createQueryBuilder).mockReturnValue(
        qb as unknown as ReturnType<Repository<RefreshTokenEntity>['createQueryBuilder']>,
      );
      vi.mocked(rtRepo.update).mockResolvedValue({ affected: 1 } as never);
      vi.mocked(userRepo.findOne).mockResolvedValue(null);

      await expect(service.refresh(rawToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      const rawToken = 'some-64-char-hex-token-value-placeholder-here-xxxxxxxxxx';
      const hash = await bcrypt.hash(rawToken, 12);
      const rt = makeRefreshToken({ tokenHash: hash });

      const qb = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([rt]),
      };

      vi.mocked(rtRepo.createQueryBuilder).mockReturnValue(
        qb as unknown as ReturnType<Repository<RefreshTokenEntity>['createQueryBuilder']>,
      );
      vi.mocked(rtRepo.update).mockResolvedValue({ affected: 1 } as never);

      await service.logout(rawToken);

      expect(rtRepo.update).toHaveBeenCalledWith(rt.id, { revokedAt: expect.any(Date) });
    });

    it('succeeds silently when token is not found (no-op)', async () => {
      const qb = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(rtRepo.createQueryBuilder).mockReturnValue(
        qb as unknown as ReturnType<Repository<RefreshTokenEntity>['createQueryBuilder']>,
      );

      await expect(service.logout('unknown-token')).resolves.toBeUndefined();
      expect(rtRepo.update).not.toHaveBeenCalled();
    });
  });

  // ── me ─────────────────────────────────────────────────────────────────────

  describe('me', () => {
    it('returns the current user profile', async () => {
      const user = makeUser();
      vi.mocked(userRepo.findOne).mockResolvedValue(user);

      const result = await service.me(user.id);

      expect(result.id).toBe(user.id);
      expect(result.email).toBe(user.email);
    });

    it('throws NotFoundException when user does not exist', async () => {
      vi.mocked(userRepo.findOne).mockResolvedValue(null);

      await expect(service.me('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });
});
