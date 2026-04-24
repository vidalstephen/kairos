import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { MemberRole } from '../../database/enums.js';
import { WorkspaceEntity } from '../../entities/workspace.entity.js';
import { WorkspaceMemberEntity } from '../../entities/workspace-member.entity.js';
import type { AddMemberDto } from './dto/add-member.dto.js';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import type { UpdateMemberDto } from './dto/update-member.dto.js';
import type { UpdateWorkspaceDto } from './dto/update-workspace.dto.js';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto): Promise<WorkspaceEntity> {
    const workspace = this.workspaces.create({
      name: dto.name,
      description: dto.description ?? null,
      settings: dto.settings ?? {},
      createdBy: userId,
    });
    const saved = await this.workspaces.save(workspace);

    const member = this.members.create({
      workspaceId: saved.id,
      userId,
      role: MemberRole.OWNER,
    });
    await this.members.save(member);

    return saved;
  }

  async findAll(userId: string): Promise<WorkspaceEntity[]> {
    return this.workspaces
      .createQueryBuilder('w')
      .innerJoin('workspace_members', 'wm', 'wm.workspace_id = w.id AND wm.user_id = :userId', {
        userId,
      })
      .where('w.deleted_at IS NULL')
      .orderBy('w.created_at', 'ASC')
      .getMany();
  }

  async findOne(id: string, userId: string): Promise<WorkspaceEntity> {
    const workspace = await this.workspaces.findOne({ where: { id } });
    if (workspace == null || workspace.deletedAt != null) {
      throw new NotFoundException('Workspace not found');
    }
    await this.requireMembership(id, userId);
    return workspace;
  }

  async update(id: string, userId: string, dto: UpdateWorkspaceDto): Promise<WorkspaceEntity> {
    const workspace = await this.findOne(id, userId);
    await this.requireRole(id, userId, [MemberRole.OWNER, MemberRole.ADMIN]);

    if (dto.name !== undefined) workspace.name = dto.name;
    if (dto.description !== undefined) workspace.description = dto.description;
    if (dto.settings !== undefined) workspace.settings = dto.settings;

    return this.workspaces.save(workspace);
  }

  async remove(id: string, userId: string): Promise<void> {
    const workspace = await this.findOne(id, userId);
    await this.requireRole(id, userId, [MemberRole.OWNER]);

    workspace.deletedAt = new Date();
    await this.workspaces.save(workspace);
  }

  async addMember(
    workspaceId: string,
    requesterId: string,
    dto: AddMemberDto,
  ): Promise<WorkspaceMemberEntity> {
    await this.findOne(workspaceId, requesterId);
    await this.requireRole(workspaceId, requesterId, [MemberRole.OWNER, MemberRole.ADMIN]);

    const existing = await this.members.findOne({
      where: { workspaceId, userId: dto.user_id },
    });
    if (existing != null) {
      throw new ConflictException('User is already a member');
    }

    const member = this.members.create({
      workspaceId,
      userId: dto.user_id,
      role: dto.role,
    });
    return this.members.save(member);
  }

  async removeMember(
    workspaceId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.findOne(workspaceId, requesterId);
    await this.requireRole(workspaceId, requesterId, [MemberRole.OWNER, MemberRole.ADMIN]);

    const member = await this.members.findOne({
      where: { workspaceId, userId: targetUserId },
    });
    if (member == null) {
      throw new NotFoundException('Member not found');
    }
    await this.members.remove(member);
  }

  async updateMemberRole(
    workspaceId: string,
    requesterId: string,
    targetUserId: string,
    dto: UpdateMemberDto,
  ): Promise<WorkspaceMemberEntity> {
    await this.findOne(workspaceId, requesterId);
    await this.requireRole(workspaceId, requesterId, [MemberRole.OWNER]);

    const member = await this.members.findOne({
      where: { workspaceId, userId: targetUserId },
    });
    if (member == null) {
      throw new NotFoundException('Member not found');
    }
    member.role = dto.role;
    return this.members.save(member);
  }

  async ensurePersonalWorkspace(userId: string): Promise<void> {
    const existing = await this.workspaces
      .createQueryBuilder('w')
      .innerJoin('workspace_members', 'wm', 'wm.workspace_id = w.id AND wm.user_id = :userId', {
        userId,
      })
      .where('w.deleted_at IS NULL')
      .getOne();

    if (existing == null) {
      await this.create(userId, { name: 'Personal' });
    }
  }

  async getProviderStatus(
    id: string,
    userId: string,
  ): Promise<{ openai: boolean; anthropic: boolean; openrouter: boolean }> {
    await this.findOne(id, userId);
    return { openai: false, anthropic: false, openrouter: false };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async requireMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberEntity> {
    const member = await this.members.findOne({ where: { workspaceId, userId } });
    if (member == null) {
      throw new ForbiddenException('Access denied');
    }
    return member;
  }

  private async requireRole(
    workspaceId: string,
    userId: string,
    allowed: MemberRole[],
  ): Promise<void> {
    const member = await this.requireMembership(workspaceId, userId);
    if (!allowed.includes(member.role)) {
      throw new ForbiddenException('Insufficient role');
    }
  }
}
