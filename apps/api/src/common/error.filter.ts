import { Inject } from '@nestjs/common';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Prisma } from '@devtrust/database';
import type { Response } from 'express';
import { RuntimeService } from './runtime.service';
@Catch()
export class ErrorFilter implements ExceptionFilter {
  constructor(@Inject(RuntimeService) private runtime: RuntimeService) {}
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500,
      message = 'Ocorreu um erro interno',
      fields: unknown;
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      message =
        typeof body === 'string' ? body : (body as { message: string }).message;
      fields =
        typeof body === 'object'
          ? (body as { fields?: unknown }).fields
          : undefined;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        status = 409;
        message = 'Já existe um registo com estes dados';
      } else if (error.code === 'P2025') {
        status = 404;
        message = 'Registo não encontrado';
      } else if (error.code === 'P2034') {
        status = 409;
        message = 'Alteração concorrente. Tente novamente.';
      }
    }
    if (status === 500)
      this.runtime.logger.error({
        event: 'request.failed',
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    response
      .status(status)
      .json({ error: { status, message, ...(fields ? { fields } : {}) } });
  }
}
