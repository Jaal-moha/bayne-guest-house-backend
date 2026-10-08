import { ArgumentsHost, Catch, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

// Prisma raises P2025 when update or delete finds no row. Without this, every such route returns 500.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaNotFoundFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    super.catch(exception.code === 'P2025' ? new NotFoundException('Record not found') : exception, host);
  }
}
