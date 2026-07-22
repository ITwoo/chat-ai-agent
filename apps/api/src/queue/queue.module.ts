import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

function parseRedisUrl(redisUrl: string) {
    const url = new URL(redisUrl);

    return {
        host: url.hostname,
        port: Number(url.port || 6379),
        username: url.username || undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        db: Number(url.pathname.slice(1) || 0),
        tls: url.protocol === 'rediss:' ? {} : undefined,
    };
}

@Module({
    imports: [
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                connection: parseRedisUrl(
                    configService.getOrThrow<string>('REDIS_URL'),
                ),
            }),
        }),
    ],
    exports: [BullModule],
})
export class QueueModule {}