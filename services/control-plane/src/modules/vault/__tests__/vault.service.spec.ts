/**
 * VaultService unit tests.
 * Tests HMAC signing, resolve with access log, and error handling.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialAccessLogEntity } from '../../../entities/credential-access-log.entity.js';
import { VaultService } from '../vault.service.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

type MockRepo<T extends object> = {
  [K in keyof Repository<T>]: ReturnType<typeof vi.fn>;
};

function mockRepo<T extends object>(): MockRepo<T> {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    save: vi.fn((e: T) => Promise.resolve(e)),
    create: vi.fn((e: Partial<T>) => e as T),
    update: vi.fn(),
    existsBy: vi.fn(),
  } as unknown as MockRepo<T>;
}

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    VAULT_INTERNAL_URL: 'http://kairos-vault:8001',
    VAULT_AUTH_SECRET: 'test-secret-99', // pragma: allowlist secret
    ...overrides,
  };
  return {
    getOrThrow: vi.fn((key: string) => {
      if (!(key in defaults)) throw new Error(`Config key not found: ${key}`);
      return defaults[key as string];
    }),
  } as unknown as ConfigService;
}

function makeService(
  fetchMock: typeof globalThis.fetch,
  repoOverrides?: Partial<MockRepo<CredentialAccessLogEntity>>,
): VaultService {
  vi.stubGlobal('fetch', fetchMock);
  const repo = { ...mockRepo<CredentialAccessLogEntity>(), ...repoOverrides };
  return new VaultService(makeConfig(), repo as unknown as Repository<CredentialAccessLogEntity>);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('VaultService.resolve', () => {
  it('returns resolved value and writes access log', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ resolved: 'secret-val', access_id: 'acc-uuid-1' }),
    });
    const repo = mockRepo<CredentialAccessLogEntity>();
    const service = makeService(fetchMock as unknown as typeof fetch, repo);

    const result = await service.resolve({
      alias: 'kairos-github-token',
      caller: 'control-plane',
      purpose: 'tool-dispatch',
      runId: 'run-uuid-1',
    });

    expect(result.resolved).toBe('secret-val');
    expect(result.accessId).toBe('acc-uuid-1');
    expect(repo.save).toHaveBeenCalledOnce();

    const logEntry = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Partial<CredentialAccessLogEntity>;
    expect(logEntry?.alias).toBe('kairos-github-token');
    expect(logEntry?.callerService).toBe('control-plane');
    expect(logEntry?.purpose).toBe('tool-dispatch');
    expect(logEntry?.accessId).toBe('acc-uuid-1');
    expect(logEntry?.runId).toBe('run-uuid-1');
  });

  it('throws NotFoundException when vault returns 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ detail: { code: 'unknown_alias', message: 'Alias not found: ghost' } }),
    });
    const service = makeService(fetchMock as unknown as typeof fetch);

    await expect(
      service.resolve({ alias: 'ghost', caller: 'cp', purpose: 'p' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws InternalServerErrorException when vault is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = makeService(fetchMock as unknown as typeof fetch);

    await expect(
      service.resolve({ alias: 'k', caller: 'cp', purpose: 'p' }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('throws InternalServerErrorException when vault returns 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('internal error'),
    });
    const service = makeService(fetchMock as unknown as typeof fetch);

    await expect(
      service.resolve({ alias: 'k', caller: 'cp', purpose: 'p' }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});

describe('VaultService.store', () => {
  it('returns storedAt on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ stored: true, created_at: '2026-04-25T00:00:00Z' }),
    });
    const service = makeService(fetchMock as unknown as typeof fetch);

    const result = await service.store({
      alias: 'new-alias',
      value: 'some-value',
      metadata: { description: 'Test alias' },
    });

    expect(result.storedAt).toBe('2026-04-25T00:00:00Z');
  });
});

describe('VaultService.health', () => {
  it('returns health status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'ok', entries: 5, oldest_access_ms: 1000 }),
    });
    const service = makeService(fetchMock as unknown as typeof fetch);

    const result = await service.health();

    expect(result.status).toBe('ok');
    expect(result.entries).toBe(5);
    expect(result.oldestAccessMs).toBe(1000);
  });
});

describe('VaultService signature', () => {
  it('sends X-Internal-Signature header on POST requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ stored: true, created_at: '2026-04-25T00:00:00Z' }),
    });
    const service = makeService(fetchMock as unknown as typeof fetch);

    await service.store({
      alias: 'sig-test',
      value: 'v',
      metadata: { description: 'd' },
    });

    const [, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Internal-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(headers['X-Internal-Service']).toBe('control-plane');
  });
});
