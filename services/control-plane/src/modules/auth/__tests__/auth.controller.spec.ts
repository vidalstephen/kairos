import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from '../../../common/filters/http-exception.filter.js';
import { UserRole } from '../../../database/enums.js';
import { AuthController } from '../auth.controller.js';
import type { LoginResult, RefreshResult } from '../auth.service.js';
import { AuthService } from '../auth.service.js';
import type { JwtUser } from '../types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockUser(): JwtUser {
  return { id: 'user-uuid-1', email: 'test@example.com', role: UserRole.VIEWER };
}

function mockLoginResult(): LoginResult {
  return {
    access_token: 'access-jwt',
    refresh_token: 'raw-refresh-token',
    user: {
      id: 'user-uuid-1',
      email: 'test@example.com',
      displayName: null,
      role: UserRole.VIEWER,
      createdAt: new Date('2025-01-01'),
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    me: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authService = {
      login: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      me: vi.fn(),
    };

    // Direct instantiation — bypasses NestJS DI for true unit tests
    controller = new AuthController(authService as unknown as AuthService);
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('delegates to authService.login with valid body', async () => {
      const expected = mockLoginResult();
      vi.mocked(authService.login).mockResolvedValue(expected);

      const result = await controller.login({ email: 'test@example.com', password: 'pass' }); // pragma: allowlist secret

      expect(authService.login).toHaveBeenCalledWith({ email: 'test@example.com', password: 'pass' }); // pragma: allowlist secret
      expect(result).toBe(expected);
    });

    it('throws ZodError when body is invalid', async () => {
      const { ZodError } = await import('zod');

      await expect(
        controller.login({ email: 'not-an-email', password: '' }),
      ).rejects.toBeInstanceOf(ZodError);
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('delegates to authService.refresh with valid body', async () => {
      const expected: RefreshResult = { access_token: 'new-jwt', refresh_token: 'new-refresh' };
      vi.mocked(authService.refresh).mockResolvedValue(expected);

      const result = await controller.refresh({ refresh_token: 'some-token' });

      expect(authService.refresh).toHaveBeenCalledWith('some-token');
      expect(result).toBe(expected);
    });

    it('throws ZodError when refresh_token is missing', async () => {
      const { ZodError } = await import('zod');

      await expect(controller.refresh({})).rejects.toBeInstanceOf(ZodError);
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('delegates to authService.logout', async () => {
      vi.mocked(authService.logout).mockResolvedValue(undefined);

      await expect(
        controller.logout({ refresh_token: 'some-token' }),
      ).resolves.toBeUndefined();

      expect(authService.logout).toHaveBeenCalledWith('some-token');
    });
  });

  // ── me ─────────────────────────────────────────────────────────────────────

  describe('me', () => {
    it('delegates to authService.me with user from JWT', async () => {
      const user = mockUser();
      const expected = {
        id: user.id,
        email: user.email,
        displayName: null,
        role: UserRole.VIEWER,
        createdAt: new Date('2025-01-01'),
      };
      vi.mocked(authService.me).mockResolvedValue(expected);

      const result = await controller.me(user);

      expect(authService.me).toHaveBeenCalledWith(user.id);
      expect(result).toBe(expected);
    });
  });
});

// ── GlobalExceptionFilter unit tests ──────────────────────────────────────────

describe('GlobalExceptionFilter', () => {
  it('formats HttpException as error envelope', () => {
    const filter = new GlobalExceptionFilter();
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const mockRes = { status: statusFn };
    const mockReq = { headers: {} };

    const host = {
      switchToHttp: () => ({
        getRequest: () => mockReq,
        getResponse: () => mockRes,
      }),
    };

    filter.catch(exception, host as never);

    expect(statusFn).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND', request_id: expect.any(String) }),
    );
  });
});
