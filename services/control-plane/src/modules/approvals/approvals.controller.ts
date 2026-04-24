import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZodError } from 'zod';
import { ApprovalStateMachine } from '../../database/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtUser } from '../auth/types.js';
import {
  CreateApprovalSchema,
  ResolveApprovalSchema,
} from './approvals.service.js';
import type { ApprovalQuery } from './approvals.service.js';
import { ApprovalsService } from './approvals.service.js';

@Controller('approvals')
@UseGuards(JwtAuthGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: JwtUser) {
    const result = CreateApprovalSchema.safeParse(body);
    if (!result.success) throw new ZodError(result.error.issues);
    return this.approvalsService.create(result.data, user.id);
  }

  @Get()
  async findAll(
    @Query('session_id') sessionId?: string,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedState =
      state !== undefined &&
      Object.values(ApprovalStateMachine).includes(state as ApprovalStateMachine)
        ? (state as ApprovalStateMachine)
        : undefined;

    const query: ApprovalQuery = {};
    if (sessionId !== undefined) query.sessionId = sessionId;
    if (parsedState !== undefined) query.state = parsedState;
    if (cursor !== undefined) query.cursor = cursor;
    if (limit !== undefined) query.limit = parseInt(limit, 10);

    return this.approvalsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.approvalsService.findOne(id);
  }

  @Post(':id/resolve')
  async resolve(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtUser) {
    const result = ResolveApprovalSchema.safeParse(body);
    if (!result.success) throw new ZodError(result.error.issues);
    return this.approvalsService.resolve(id, result.data, user.id);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.approvalsService.cancel(id, user.id);
  }
}

@Controller('approvals/webhook')
export class ApprovalsWebhookController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post(':jti')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('jti') jti: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const signature = req.headers['x-kairos-signature'];
    if (typeof signature !== 'string' || !signature.startsWith('sha256=')) {
      return { code: 'INVALID_SIGNATURE', message: 'Missing or malformed x-kairos-signature header' };
    }

    if (
      body == null ||
      typeof body !== 'object' ||
      !('decision' in body) ||
      (body as Record<string, unknown>)['decision'] !== 'approved' &&
      (body as Record<string, unknown>)['decision'] !== 'denied'
    ) {
      return { code: 'VALIDATION_FAILED', message: 'decision must be "approved" or "denied"' };
    }

    const decision = (body as Record<string, unknown>)['decision'] as 'approved' | 'denied';
    const rawBody: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(body));

    return this.approvalsService.resolveViaWebhook(jti, decision, signature, rawBody);
  }
}
