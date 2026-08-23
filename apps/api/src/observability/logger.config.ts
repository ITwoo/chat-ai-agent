import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { requestContextStorage } from './request-context';

class ApplicationLogger extends ConsoleLogger {
    protected getJsonLogObject(
        message: unknown,
        options: {
            context: string;
            logLevel: LogLevel;
            writeStreamType?: 'stdout' | 'stderr';
            errorStack?: unknown;
        },
    ) {
        const logObject = super.getJsonLogObject(message, options);
        const requestId = requestContextStorage.getStore()?.requestId;

        return requestId
            ? {
                ...logObject,
                requestId,
            }
            : logObject;
    }
}

export function createApplicationLogger(): ConsoleLogger {
    return new ApplicationLogger({
        json: process.env.NODE_ENV === 'production',
    }); 
}