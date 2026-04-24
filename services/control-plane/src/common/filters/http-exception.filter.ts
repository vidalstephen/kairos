import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';

const STATUS_TO_CODE: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'AUTH_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

function statusToCode(status: number): string {
  return STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();

      let message = exception.message;
      let details: Record<string, unknown> = {};

      if (typeof raw === 'object' && raw !== null) {
        const obj = raw as Record<string, unknown>;
        if (typeof obj['message'] === 'string') {
          message = obj['message'];
        }
        if (obj['details'] != null) {
          details = obj['details'] as Record<string, unknown>;
        }
      }

      res.status(status).json({
        code: statusToCode(status),
        message,
        details,
        request_id: requestId,
      });
      return;
    }

    if (exception instanceof ZodError) {
      res.status(HttpStatus.BAD_REQUEST).json({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: { issues: exception.issues },
        request_id: requestId,
      });
      return;
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: {},
      request_id: requestId,
    });
  }
}
