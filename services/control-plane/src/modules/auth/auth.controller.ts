import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodError } from 'zod';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import type { LoginResult, RefreshResult } from './auth.service.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { JwtUser } from './types.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ login: { ttl: 900_000, limit: 5 } })
  async login(@Body() body: unknown): Promise<LoginResult> {
    const result = LoginDto.safeParse(body);
    if (!result.success) {
      throw new ZodError(result.error.issues);
    }
    const tokens = await this.authService.login(result.data);
    await this.workspacesService.ensurePersonalWorkspace(tokens.user.id);
    return tokens;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown): Promise<RefreshResult> {
    const result = RefreshDto.safeParse(body);
    if (!result.success) {
      throw new ZodError(result.error.issues);
    }
    return this.authService.refresh(result.data.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown): Promise<void> {
    const result = LogoutDto.safeParse(body);
    if (!result.success) {
      throw new ZodError(result.error.issues);
    }
    return this.authService.logout(result.data.refresh_token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: JwtUser): Promise<ReturnType<AuthService['me']>> {
    return this.authService.me(user.id);
  }
}
