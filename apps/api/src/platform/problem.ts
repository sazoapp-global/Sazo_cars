// RFC 9457 problem+json errors with a stable machine `code` (API Outline §2).
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { LimitReached } from './limits.js';

export class Problem extends HttpException {
  constructor(status: number, readonly code: string, title: string, detail?: string, readonly errors?: unknown[]) {
    super({ title, detail }, status);
  }
}

export const badRequest = (code: string, detail: string, errors?: unknown[]) =>
  new Problem(HttpStatus.BAD_REQUEST, code, 'Invalid request', detail, errors);
export const notFound = (code: string, detail: string) => new Problem(HttpStatus.NOT_FOUND, code, 'Not found', detail);

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly log = new Logger('ProblemFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { type: 'about:blank', title: 'Internal error', status, code: 'internal_error' };

    if (exception instanceof Problem) {
      status = exception.getStatus();
      const r = exception.getResponse() as { title: string; detail?: string };
      body = { type: 'about:blank', title: r.title, status, code: exception.code, detail: r.detail, errors: exception.errors };
    } else if (exception instanceof LimitReached) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      body = { type: 'about:blank', title: 'Too many requests', status, code: 'limit_reached', detail: exception.message };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      body = { type: 'about:blank', title: exception.message, status, code: `http_${status}` };
    } else {
      this.log.error(exception);
    }
    res.status(status).type('application/problem+json').json(body);
  }
}
