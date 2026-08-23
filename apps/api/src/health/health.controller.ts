import {
    Controller,
    Get,
    ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { RedisService } from '../redis/redis.service';


@Controller('health')
export class HealthController {
    constructor(
        private readonly prisma: PrismaService,

        private readonly redis: RedisService,

    ) { }

    @Get('live')
    getLiveness() {
        return {
            status: 'ok',
        };
    }

    @Get('ready')
    async getReadiness() {
        const [databaseResult, redisResult] = await Promise.allSettled([
            this.prisma.$queryRaw`SELECT 1`,
            this.redis.getClient().ping(),
        ]);

        const checks = {
            database: databaseResult.status === 'fulfilled' ? 'up' : 'down',
            redis: redisResult.status === 'fulfilled' ? 'up' : 'down',
        };

        if (checks.database === 'down' || checks.redis === 'down') {
            throw new ServiceUnavailableException({
                status: 'unavailable',
                checks,
            });
        }

        return {
            status: 'ok',
            checks,
        };
    }

    @Get()
    getHealth() {
        return this.getReadiness();
    }
}