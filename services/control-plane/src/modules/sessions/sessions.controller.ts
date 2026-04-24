import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { SessionStatus } from '../../database/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtUser } from '../auth/types.js';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { UpdateSessionDto } from './dto/update-session.dto.js';
import type { SessionQuery } from './sessions.service.js';
import { SessionsService } from './sessions.service.js';

@Controller('workspaces/:workspaceId/sessions')
@UseGuards(JwtAuthGuard)
export class WorkspaceSessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtUser,
  ) {
    const result = CreateSessionDto.safeParse(body);
    if (!result.success) throw new ZodError(result.error.issues);
    return this.sessionsService.create(workspaceId, user.id, result.data);
  }

  @Get()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: JwtUser,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedStatus =
      status !== undefined && Object.values(SessionStatus).includes(status as SessionStatus)
        ? (status as SessionStatus)
        : undefined;

    const query: SessionQuery = {};
    if (parsedStatus !== undefined) query.status = parsedStatus;
    if (cursor !== undefined) query.cursor = cursor;
    if (limit !== undefined) query.limit = parseInt(limit, 10);

    return this.sessionsService.findAll(workspaceId, user.id, query);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAll(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    return this.sessionsService.removeAll(workspaceId, user.id);
  }
}

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Query('include_messages', new ParseBoolPipe({ optional: true })) includeMessages?: boolean,
  ) {
    return this.sessionsService.findOne(id, user.id, includeMessages);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtUser) {
    const result = UpdateSessionDto.safeParse(body);
    if (!result.success) throw new ZodError(result.error.issues);
    return this.sessionsService.update(id, user.id, result.data);
  }

  @Post(':id/end')
  async end(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.sessionsService.end(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtUser): Promise<void> {
    return this.sessionsService.remove(id, user.id);
  }

  @Get(':id/trace')
  async findTrace(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.sessionsService.findTrace(id, user.id);
  }
}
