import { getAccessToken, removeAccessToken } from "../features/auth/utils/authStorage";

const API_BASE_URL = '/api';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
    method?: HttpMethod;
    body?: unknown;
    token?: string | null;
}

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

export async function http<T>(
    path: string,
    options: RequestOptions = {},
): Promise<T> {

    const token = options.token === null
        ? null
        : options.token ?? getAccessToken();

    const { method = 'GET', body } = options;

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
    const responseData = parseResponseText(responseText);

    if (!response.ok) {
        if (response.status === 401 && token) {
            removeAccessToken();
            window.dispatchEvent(new Event('auth:unauthorized')); // 순환 참조 방지를 위해 이벤트 이름을 문자열로 지정
        }

        throw new ApiError(
            response.status,
            getErrorMessage(responseData, response.status),
            responseData,
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return responseData as T;
}