import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtUser } from '../auth/types.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: JwtUser) {
    const result = CreateWorkspaceDto.safeParse(body);
    if (!result.success) throw new ZodError(result.error.issues);
    return this.workspacesService.create(user.id, result.data);
  }

  @Get()
  async findAll(@CurrentUser() user: JwtUser) {
    return this.workspacesService.findAll(user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.workspacesService.findOne(id, user.id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtUser) {
    const result = UpdateWorkspaceDto.safeParse(body);
    if (!result.success) throw new ZodError(result.error.issues);
    return this.workspacesService.update(id, user.id, result.data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtUser): Promise<void> {
    return this.workspacesService.remove(id, user.id);
  }

  @Get(':id/provider-status')
  async getProviderStatus(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.workspacesService.getProviderStatus(id, user.id);
  }

  // ── Membership ──────────────────────────────────────────────────────────

  @Post(':id/members')
  async addMember(
    @Param('id') workspaceId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtUser,
  ) {
    const result = AddMemberDto.safeParse(body);
    if (!result.success) throw new ZodError(result.error.issues);
    return this.workspacesService.addMember(workspaceId, user.id, result.data);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') workspaceId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    return this.workspacesService.removeMember(workspaceId, user.id, targetUserId);
  }

  @Patch(':id/members/:userId')
  async updateMemberRole(
    @Param('id') workspaceId: string,
    @Param('userId') targetUserId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtUser,
  ) {
    const result = UpdateMemberDto.safeParse(body);
    if (!result.success) throw new ZodError(result.error.issues);
    return this.workspacesService.updateMemberRole(workspaceId, user.id, targetUserId, result.data);
  }
}
