import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from './redis.service';

const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
end
return 0
`;

export type RedisLock = {
    key: string;
    token: string;
};

@Injectable()
export class RedisLockService {
    constructor(private readonly redisService: RedisService) {}

    async acquire(key: string, ttlMs: number): Promise<RedisLock | null> {
        const token = randomUUID();
        const result = await this.redisService.getClient().set(key, token, 'PX', ttlMs, 'NX');

        return result === 'OK' ? { key, token } : null;
    }

    async release(lock: RedisLock): Promise<boolean> {
        const result = await this.redisService
            .getClient()
            .eval(RELEASE_LOCK_SCRIPT, 1, lock.key, lock.token);

        return Number(result) === 1;
    }
}