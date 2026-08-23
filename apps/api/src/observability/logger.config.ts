import { ConsoleLogger } from '@nestjs/common';

export function createApplicationLogger(): ConsoleLogger {
    return new ConsoleLogger({
        json: process.env.NODE_ENV === 'production',
    });
}