import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { RedisIoAdapter } from './redis/redis-io.adapter';


async function bootstrap() {
    const logger = new Logger('Bootstrap');

    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);

    const configFileName = configService.get<string>('ENV_NAME') ?? '';

    const redisIoAdapter = new RedisIoAdapter(
        app,
        configService.getOrThrow<string>('REDIS_URL'),
    );

    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);

    app.use(cookieParser());
    app.enableCors({
        origin: configService.get<string>('CORS_ORIGIN') ?? '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
    });

    app.setGlobalPrefix('api');
    app.useGlobalFilters(new PrismaExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));

    const PORT = configService.get<number>('PORT') ?? 3000;

    await app.listen(PORT);

    logger.log(`Config File Name ${configFileName}`);
    logger.log(`Application is running on: ${await app.getUrl()}`);

}
bootstrap();
