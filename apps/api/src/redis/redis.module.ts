import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisLockService } from './redis-lock.service';

@Module({
    providers: [
        RedisService,
        RedisLockService,
    ],
    exports: [
        RedisService,
        RedisLockService
    ],
})
export class RedisModule {}