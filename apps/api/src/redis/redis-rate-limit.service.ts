import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])

if count == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;

export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
};

@Injectable()
export class RedisRateLimitService {
    constructor(private readonly redisService: RedisService) {}

    async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
        const result = await this.redisService
            .getClient()
            .eval(RATE_LIMIT_SCRIPT, 1, key, windowMs);

        const [count, ttl] = result as [number, number];
        const allowed = count <= limit;

        return {
            allowed,
            remaining: Math.max(limit - count, 0),
            retryAfterMs: allowed ? 0 : Math.max(ttl, 0),
        };
    }
}