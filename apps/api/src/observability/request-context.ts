import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
    requestId: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();