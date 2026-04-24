import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { MemberRole, SessionStatus } from '../../../database/enums.js';
import { MessageEntity } from '../../../entities/message.entity.js';
import { SessionEntity } from '../../../entities/session.entity.js';
import { WorkspaceMemberEntity } from '../../../entities/workspace-member.entity.js';
import { SessionsService } from '../sessions.service.js';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<SessionEntity>): SessionEntity {
  return {
    id: 'session-uuid-1',
    workspaceId: 'ws-uuid-1',
    userId: 'user-uuid-1',
    status: SessionStatus.ACTIVE,
    agentId: null,
    personaId: null,
    mode: null as never,
    presenceLastPingAt: null,
    metadata: {},
    startedAt: new Date('2025-01-01'),
    endedAt: null,
    workspace: null as never,
    user: null as never,
    agent: null,
    persona: null,
    messages: [],
    runs: [],
    ...overrides,
  };
}

function makeMember(
  userId = 'user-uuid-1',
  role = MemberRole.VIEWER,
): WorkspaceMemberEntity {
  return {
    workspaceId: 'ws-uuid-1',
    userId,
    role,
    addedAt: new Date('2025-01-01'),
    workspace: null as never,
    user: null as never,
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
    delete: vi.fn(),
    remove: vi.fn(),
    query: vi.fn(),
    createQueryBuilder: vi.fn(),
  } as unknown as MockRepo<T>;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SessionsService', () => {
  let service: SessionsService;
  let sessionRepo: MockRepo<SessionEntity>;
  let messageRepo: MockRepo<MessageEntity>;
  let memberRepo: MockRepo<WorkspaceMemberEntity>;

  beforeEach(() => {
    sessionRepo = mockRepo<SessionEntity>();
    messageRepo = mockRepo<MessageEntity>();
    memberRepo = mockRepo<WorkspaceMemberEntity>();

    service = new SessionsService(
      sessionRepo as unknown as Repository<SessionEntity>,
      messageRepo as unknown as Repository<MessageEntity>,
      memberRepo as unknown as Repository<WorkspaceMemberEntity>,
    );
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('throws ForbiddenException when user is not a workspace member', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create('ws-uuid-1', 'user-uuid-1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates and returns session when user is a member', async () => {
      const member = makeMember();
      const session = makeSession();
      memberRepo.findOne.mockResolvedValue(member);
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const result = await service.create('ws-uuid-1', 'user-uuid-1', {});

      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-uuid-1', userId: 'user-uuid-1' }),
      );
      expect(result).toBe(session);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException when session does not exist', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing-id', 'user-uuid-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when session belongs to a different user', async () => {
      const session = makeSession({ userId: 'other-user' });
      sessionRepo.findOne.mockResolvedValue(session);

      await expect(service.findOne(session.id, 'user-uuid-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns session when ownership matches', async () => {
      const session = makeSession();
      sessionRepo.findOne.mockResolvedValue(session);

      const result = await service.findOne(session.id, 'user-uuid-1');
      expect(result).toBe(session);
    });
  });

  // ── end ────────────────────────────────────────────────────────────────────

  describe('end', () => {
    it('sets status=CLOSED and endedAt on the session', async () => {
      const session = makeSession();
      sessionRepo.findOne.mockResolvedValue(session);
      sessionRepo.save.mockImplementation((s) => Promise.resolve(s as SessionEntity));

      const result = await service.end(session.id, 'user-uuid-1');

      expect(result.status).toBe(SessionStatus.CLOSED);
      expect(result.endedAt).toBeInstanceOf(Date);
    });
  });

  // ── expireIdleSessions ─────────────────────────────────────────────────────

  describe('expireIdleSessions', () => {
    it('calls repository.query with EXPIRED status and threshold', async () => {
      sessionRepo.query.mockResolvedValue(undefined);

      await service.expireIdleSessions();

      expect(sessionRepo.query).toHaveBeenCalledOnce();
      const [sql, params] = sessionRepo.query.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('UPDATE sessions');
      expect(sql).toContain('status = $1');
      expect(params[0]).toBe(SessionStatus.EXPIRED);
      expect(params[3]).toBeInstanceOf(Date);
    });
  });
});
