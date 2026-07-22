import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisLockService } from './redis-lock.service';
import { RedisRateLimitService } from './redis-rate-limit.service';

@Module({
    providers: [
        RedisService,
        RedisLockService,
        RedisRateLimitService,
    ],
    exports: [
        RedisService,
        RedisLockService,
        RedisRateLimitService,
    ],
})
export class RedisModule {}