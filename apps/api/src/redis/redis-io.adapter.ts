import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
    private pubClient?: Redis;
    private subClient?: Redis;
    private adapterConstructor?: ReturnType<typeof createAdapter>;

    constructor(app: INestApplicationContext, private readonly redisUrl: string) {
        super(app);
    }

    async connectToRedis(): Promise<void> {
        this.pubClient = new Redis(this.redisUrl, { lazyConnect: true });
        this.subClient = this.pubClient.duplicate();

        await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
        this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    }

    createIOServer(port: number, options?: ServerOptions): Server {
        if (!this.adapterConstructor) {
            throw new Error('Socket.IO Redis Adapter가 초기화되지 않았습니다.');
        }

        const server = super.createIOServer(port, options) as Server;
        server.adapter(this.adapterConstructor);

        return server;
    }

    async close(server: Server): Promise<void> {
        void Promise.allSettled([
            this.pubClient?.quit(),
            this.subClient?.quit(),
        ]);

        super.close(server);
    }
}