// src/prisma/prisma-exception.filter.ts

import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    switch (exception.code) {
        case 'P2002':
            throw new ConflictException('이미 존재하는 데이터입니다.');

        case 'P2025':
            throw new NotFoundException('데이터를 찾을 수 없습니다.');

        case 'P2003':
            throw new BadRequestException('잘못된 참조 데이터입니다.');

        default:
            throw exception;
    }
  }
}