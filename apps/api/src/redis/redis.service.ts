import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);

    private readonly client: Redis;

    constructor(
        configService: ConfigService,
    ) {
        const redisUrl = configService.getOrThrow<string>('REDIS_URL');

        this.client = new Redis(redisUrl, {
            lazyConnect: true,
            connectTimeout: 5_000,
            maxRetriesPerRequest: 1,
        });

        this.client.on('error', (error) => {
            this.logger.error(
                'Redis 연결 오류',
                error instanceof Error
                    ? error.stack
                    : String(error),
            );
        });
    }

    async onModuleInit(): Promise<void> {
        await this.client.connect();

        const response = await this.client.ping();

        this.logger.log(`Redis 연결 완료: ${response}`);
    }

    async onModuleDestroy(): Promise<void> {
        if (this.client.status === 'end') {
            return;
        }

        await this.client.quit();
    }

    getClient(): Redis {
        return this.client;
    }
}