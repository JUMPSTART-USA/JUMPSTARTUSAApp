import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { isProduction } from '../../config/env';

/**
 * Uniform error envelope. Internal errors never leak stack traces or query
 * details to clients (§7.1) — they are logged server-side with a correlation
 * id that IS returned, so support can match a user report to a log line.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    const correlationId = Math.random().toString(36).slice(2, 10);
    this.logger.error(
      `[${correlationId}] ${request.method} ${request.url} — unhandled: ${
        exception instanceof Error ? exception.message : String(exception)
      }`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: isProduction()
        ? `Something went wrong. Reference: ${correlationId}`
        : `${exception instanceof Error ? exception.message : 'Unknown error'} (ref ${correlationId})`,
      correlationId,
    });
  }
}
