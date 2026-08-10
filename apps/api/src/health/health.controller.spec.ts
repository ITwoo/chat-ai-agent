import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { beforeEach, describe, expect, it } from '@jest/globals';

describe('HealthController', () => {
    let controller: HealthController;

    beforeEach(async () => {
        const module: TestingModule =
            await Test.createTestingModule({
                controllers: [
                    HealthController,
                ],
                providers: [
                    {
                        provide: PrismaService,
                        useValue: {},
                    },
                ],
            }).compile();

        controller = module.get<HealthController>(
            HealthController,
        );
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});