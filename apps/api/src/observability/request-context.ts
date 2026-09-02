import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
    requestId: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestId<T>(
    requestId: string | undefined,
    callback: () => T,
): T {
    if (!requestId) return callback();

    return requestContextStorage.run({ requestId }, callback);
}