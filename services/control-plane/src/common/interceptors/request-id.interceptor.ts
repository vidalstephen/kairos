import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    res.setHeader('X-Request-ID', requestId);

    return next.handle().pipe(
      tap(() => {
        // Request ID is already set on the response header; no mutation needed.
      }),
    );
  }
}
