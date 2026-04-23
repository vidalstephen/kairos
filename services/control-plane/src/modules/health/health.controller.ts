import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): { status: string } {
    // Phase 0: no dependencies checked yet. Extended in Phase 1.
    return { status: 'ok' };
  }
}
