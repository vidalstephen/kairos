import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { MemberRole } from '../../../database/enums.js';
import { WorkspaceEntity } from '../../../entities/workspace.entity.js';
import { WorkspaceMemberEntity } from '../../../entities/workspace-member.entity.js';
import { WorkspacesService } from '../workspaces.service.js';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeWorkspace(overrides?: Partial<WorkspaceEntity>): WorkspaceEntity {
  return {
    id: 'ws-uuid-1',
    name: 'Test Workspace',
    description: null,
    settings: {},
    defaultAgentId: null,
    createdBy: 'user-uuid-1',
    createdAt: new Date('2025-01-01'),
    deletedAt: null,
    createdByUser: null as never,
    defaultAgent: null,
    members: [],
    ...overrides,
  };
}

function makeMember(overrides?: Partial<WorkspaceMemberEntity>): WorkspaceMemberEntity {
  return {
    workspaceId: 'ws-uuid-1',
    userId: 'user-uuid-1',
    role: MemberRole.OWNER,
    addedAt: new Date('2025-01-01'),
    workspace: null as never,
    user: null as never,
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
    delete: vi.fn(),
    existsBy: vi.fn(),
    count: vi.fn(),
    createQueryBuilder: vi.fn(),
  } as unknown as MockRepo<T>;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let wsRepo: MockRepo<WorkspaceEntity>;
  let memberRepo: MockRepo<WorkspaceMemberEntity>;

  beforeEach(() => {
    wsRepo = mockRepo<WorkspaceEntity>();
    memberRepo = mockRepo<WorkspaceMemberEntity>();

    service = new WorkspacesService(
      wsRepo as unknown as Repository<WorkspaceEntity>,
      memberRepo as unknown as Repository<WorkspaceMemberEntity>,
    );
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates workspace and OWNER member row', async () => {
      const userId = 'user-uuid-1';
      const dto = { name: 'My WS' };
      const ws = makeWorkspace({ name: dto.name, createdBy: userId });
      const ownerMember = makeMember({ userId, role: MemberRole.OWNER });

      wsRepo.create.mockReturnValue(ws);
      wsRepo.save.mockResolvedValue(ws);
      memberRepo.create.mockReturnValue(ownerMember);
      memberRepo.save.mockResolvedValue(ownerMember);

      const result = await service.create(userId, dto);

      expect(wsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: dto.name, createdBy: userId }),
      );
      expect(memberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: ws.id, userId, role: MemberRole.OWNER }),
      );
      expect(result).toBe(ws);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException when workspace does not exist', async () => {
      wsRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing-id', 'user-uuid-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user is not a member', async () => {
      const ws = makeWorkspace();
      wsRepo.findOne.mockResolvedValue(ws);
      memberRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(ws.id, 'other-user')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns workspace when user is a member', async () => {
      const ws = makeWorkspace();
      const member = makeMember();
      wsRepo.findOne.mockResolvedValue(ws);
      memberRepo.findOne.mockResolvedValue(member);

      const result = await service.findOne(ws.id, member.userId);
      expect(result).toBe(ws);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws ForbiddenException when requester is VIEWER', async () => {
      const ws = makeWorkspace();
      const member = makeMember({ role: MemberRole.VIEWER });
      wsRepo.findOne.mockResolvedValue(ws);
      memberRepo.findOne.mockResolvedValue(member);

      await expect(service.update(ws.id, member.userId, { name: 'New' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes the workspace (sets deletedAt)', async () => {
      const ws = makeWorkspace();
      const member = makeMember({ role: MemberRole.OWNER });
      wsRepo.findOne.mockResolvedValue(ws);
      memberRepo.findOne.mockResolvedValue(member);
      wsRepo.save.mockResolvedValue({ ...ws, deletedAt: new Date() });

      await service.remove(ws.id, member.userId);

      expect(wsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
    });
  });

  // ── ensurePersonalWorkspace ────────────────────────────────────────────────

  describe('ensurePersonalWorkspace', () => {
    it('creates Personal workspace when user has none', async () => {
      const userId = 'user-uuid-1';
      const qb = {
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(null),
      };
      wsRepo.createQueryBuilder.mockReturnValue(qb);

      const ws = makeWorkspace({ name: 'Personal', createdBy: userId });
      const member = makeMember({ userId, role: MemberRole.OWNER });
      wsRepo.create.mockReturnValue(ws);
      wsRepo.save.mockResolvedValue(ws);
      memberRepo.create.mockReturnValue(member);
      memberRepo.save.mockResolvedValue(member);

      await service.ensurePersonalWorkspace(userId);

      expect(wsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Personal', createdBy: userId }),
      );
    });

    it('does not create workspace when user already has one', async () => {
      const userId = 'user-uuid-1';
      const qb = {
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(makeWorkspace()),
      };
      wsRepo.createQueryBuilder.mockReturnValue(qb);

      await service.ensurePersonalWorkspace(userId);

      expect(wsRepo.create).not.toHaveBeenCalled();
    });
  });

  // ── addMember ──────────────────────────────────────────────────────────────

  describe('addMember', () => {
    it('throws ConflictException when member already exists', async () => {
      const ws = makeWorkspace();
      const requesterMember = makeMember({ role: MemberRole.OWNER });
      wsRepo.findOne.mockResolvedValue(ws);
      memberRepo.findOne
        .mockResolvedValueOnce(requesterMember) // findOne → requireMembership
        .mockResolvedValueOnce(requesterMember) // requireRole → requireMembership
        .mockResolvedValueOnce(makeMember({ userId: 'other-user' })); // conflict check

      await expect(
        service.addMember(ws.id, requesterMember.userId, {
          user_id: 'other-user',
          role: MemberRole.VIEWER,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
