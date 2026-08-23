import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

describe('HealthController', () => {
    let controller: HealthController;

    const prisma = {
         $queryRaw: jest.fn<() => Promise<unknown>>(),
    };

    const redisClient = {
        ping: jest.fn<() => Promise<string>>(),
    };

    const redis = {
        getClient: jest.fn(() => redisClient),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        
        prisma.$queryRaw.mockResolvedValue(undefined);
        redisClient.ping.mockResolvedValue('PONG');

        const module: TestingModule =
            await Test.createTestingModule({
                controllers: [
                    HealthController,
                ],
                providers: [
                    {
                        provide: PrismaService,
                        useValue: prisma,
                    },
                    {
                        provide: RedisService,
                        useValue: redis,
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

    it('should report liveness without checking dependencies', () => {
        expect(controller.getLiveness()).toEqual({
            status: 'ok',
        });

        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(redisClient.ping).not.toHaveBeenCalled();
    });

    it('should report readiness when dependencies are available', async () => {
        await expect(controller.getReadiness()).resolves.toEqual({
            status: 'ok',
            checks: {
                database: 'up',
                redis: 'up',
            },
        });

        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
        expect(redisClient.ping).toHaveBeenCalledTimes(1);
    });

    it('should report unavailable when a dependency is down', async () => {
        prisma.$queryRaw.mockRejectedValueOnce(
            new Error('database unavailable'),
        );

        await expect(controller.getReadiness()).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        );

        expect(redisClient.ping).toHaveBeenCalledTimes(1);
    });
});