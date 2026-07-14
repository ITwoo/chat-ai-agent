import { getAccessToken, removeAccessToken, saveAccessToken } from "../features/auth/utils/authStorage";

const API_BASE_URL = '/api';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
    method?: HttpMethod;
    body?: unknown;
    token?: string | null;
}

type RefreshTokenResponse = {
    accessToken: string;
};

let refreshAccessTokenPromise: Promise<string> | null = null;

export class ApiError extends Error {
    status: number;
    data?: unknown;

    constructor(status: number, message: string, data?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        if (data) {
            this.data = data;
        }
    }
}

function parseResponseText(text: string): unknown {
    if (!text) {
        return undefined;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return text;
    }
}

function getErrorMessage(data: unknown, status: number): string {
    if (typeof data === 'object' && data !== null && 'message' in data) {
        const message = data.message;

        if (Array.isArray(message)) {
            return message.join('\n');
        }

        return String(message);
    }

    if (typeof data === 'string' && data.trim()) {
        return data;
    }

    return `API 요청 실패 (HTTP ${status})`;
}

async function request(
    path: string,
    method: HttpMethod,
    body: unknown,
    token: string | null
): Promise<{
    response: Response;
    data: unknown;
}> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
    });

    const responseText = await response.text();
    const data = parseResponseText(responseText);

    return {
        response,
        data,
    };
}

export async function refreshAccessToken(): Promise<string> {
    if(!refreshAccessTokenPromise) {
        refreshAccessTokenPromise = (async () => {
            const { response, data } = await request(
                '/auth/refresh',
                'POST',
                undefined,
                null,
            );

            if(!response.ok) {
                throw new ApiError(
                    response.status,
                    getErrorMessage(data, response.status),
                    data,
                );
            }

            const refreshData = data as RefreshTokenResponse;

            if(!refreshData?.accessToken) {
                throw new ApiError(
                    response.status,
                    'accessToken이 응답에 없습니다.',
                    data,
                );
            }

            saveAccessToken(refreshData.accessToken);

            return refreshData.accessToken;
        })().finally(() => {
            refreshAccessTokenPromise = null;
        });
    }

    return refreshAccessTokenPromise;
}

export async function http<T>(
    path: string,
    options: RequestOptions = {},
): Promise<T> {

    const { method = 'GET', body } = options;

    const token = options.token === null
        ? null
        : options.token ?? getAccessToken();


    let { response, data } = await request(path, method, body, token);
    
    if(!response.ok && response.status === 401 && token) {
        console.log('401')
        try {
            const newAccessToken = await refreshAccessToken();
            
            const retryResult = await request(
                path,
                method,
                body,
                newAccessToken,
            );
            
            response = retryResult.response;
            data = retryResult.data;
        } catch {
            removeAccessToken();
            window.dispatchEvent(new Event('auth:unauthorized'));
            
            throw new ApiError(
                401,
                '인증이 만료되었습니다. 다시 로그인해주세요.',
            );
        }
    }

    if (!response.ok) {
        if (response.status === 401 && token) {
            removeAccessToken();
            window.dispatchEvent(new Event('auth:unauthorized')); // 순환 참조 방지를 위해 이벤트 이름을 문자열로 지정
        }

        throw new ApiError(
            response.status,
            getErrorMessage(data, response.status),
            data,
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return data as T;
}