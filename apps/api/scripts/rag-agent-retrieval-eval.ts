import { io, type Socket } from 'socket.io-client';
import type {
    ChatMessageResponse,
    ChatRoomResponse,
    LoginResponse,
} from '@repo/shared';
import {
    RAG_RETRIEVAL_EVAL_CASES,
    type RagRetrievalEvalCase,
} from './eval/rag-retrieval-eval.dataset';

type ScenarioStatus =
    | 'COMPLETED'
    | 'APPROVAL_REQUIRED'
    | 'FAILED'
    | 'CANCELLED';

type CompletedResult = {
    status: 'COMPLETED';
    message: ChatMessageResponse;
};

type NonCompletedResult = {
    status: Exclude<ScenarioStatus, 'COMPLETED'>;
    message: null;
};

type AgentResult =
    | CompletedResult
    | NonCompletedResult;

type RagAgentEvalResult = {
    name: string;
    status: ScenarioStatus;
    resultCount: number;
    retrievedFiles: string;
    hit: boolean | null;
    passed: boolean;
    elapsedMs: number;
};

const BASE_URL =
    process.env.BENCHMARK_BASE_URL ??
    'http://localhost:3000';

const USERNAME =
    getRequiredEnv('RAG_EVAL_USERNAME');

const PASSWORD =
    getRequiredEnv('RAG_EVAL_PASSWORD');

const TIMEOUT_MS =
    getPositiveNumberEnv(
        'BENCHMARK_TIMEOUT_MS',
        120_000,
    );

async function main(): Promise<void> {
    console.log('RAG agent retrieval eval started');

    const accessToken = await signIn();
    const socket = await connectSocket(accessToken);

    const results: RagAgentEvalResult[] = [];

    try {
        const evalCases = getEvalCases();

        console.log('RAG agent retrieval eval started');
        console.log(
            `Cases: ${evalCases.map((testCase) => testCase.name).join(', ')}`,
        );

        for (const testCase of evalCases) {
            const result = await evaluateCase(
                socket,
                accessToken,
                testCase,
            );

            results.push(result);

            console.log(
                `[${testCase.name}] ` +
                `${result.status} ` +
                `${result.elapsedMs}ms ` +
                `passed=${result.passed}`,
            );
        }
    } finally {
        socket.disconnect();
    }

    console.table(results);

    printMetrics(results);

    if (results.some((result) => !result.passed)) {
        process.exitCode = 1;
    }
}

async function evaluateCase(
    socket: Socket,
    accessToken: string,
    testCase: RagRetrievalEvalCase,
): Promise<RagAgentEvalResult> {
    const room = await createRoom(
        accessToken,
        `[RAG AGENT EVAL] ${testCase.name}`,
    );

    await joinRoom(socket, room.id);

    const startedAt = performance.now();

    try {
        const agentQuery =
            `업로드한 문서를 기준으로 다음 질문에 답해줘.\n\n` +
            testCase.query;

        const agentResult = await sendMessageAndWait(
            socket,
            room.id,
            agentQuery,
        );

        const elapsedMs = Math.round(
            performance.now() - startedAt,
        );

        if (
            agentResult.status !== 'COMPLETED' ||
            !agentResult.message
        ) {
            return {
                name: testCase.name,
                status: agentResult.status,
                resultCount: 0,
                retrievedFiles: '',
                hit: testCase.negative
                    ? null
                    : false,
                passed: false,
                elapsedMs,
            };
        }

        const citations =
            agentResult.message.ragCitations ?? [];

        const retrievedFiles = [
            ...new Set(
                citations.map(
                    (citation) => citation.fileName,
                ),
            ),
        ];

        if (testCase.negative) {
            return {
                name: testCase.name,
                status: agentResult.status,
                resultCount: citations.length,
                retrievedFiles:
                    retrievedFiles.join(', '),
                hit: null,
                passed: citations.length === 0,
                elapsedMs,
            };
        }

        if (!testCase.expectedFile) {
            throw new Error(
                `${testCase.name}: expectedFile is required.`,
            );
        }

        const hit = citations.some(
            (citation) =>
                citation.fileName.endsWith(
                    testCase.expectedFile!,
                ),
        );

        return {
            name: testCase.name,
            status: agentResult.status,
            resultCount: citations.length,
            retrievedFiles:
                retrievedFiles.join(', '),
            hit,
            passed: hit,
            elapsedMs,
        };
    } finally {
        await leaveRoom(socket, room.id);
    }
}

async function signIn(): Promise<string> {
    const response = await request<LoginResponse>(
        '/api/auth/signin',
        {
            method: 'POST',
            body: JSON.stringify({
                username: USERNAME,
                password: PASSWORD,
            }),
        },
    );

    return response.accessToken;
}

async function createRoom(
    accessToken: string,
    title: string,
): Promise<ChatRoomResponse> {
    return request<ChatRoomResponse>(
        '/api/chat/rooms',
        {
            method: 'POST',
            body: JSON.stringify({
                title,
            }),
        },
        accessToken,
    );
}

async function connectSocket(
    accessToken: string,
): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = io(BASE_URL, {
            auth: {
                token: accessToken,
            },
            transports: ['websocket'],
            reconnection: false,
        });

        const timeout = setTimeout(() => {
            socket.disconnect();

            reject(
                new Error(
                    'Socket connection timed out.',
                ),
            );
        }, TIMEOUT_MS);

        socket.once('connect', () => {
            clearTimeout(timeout);
            resolve(socket);
        });

        socket.once(
            'connect_error',
            (error) => {
                clearTimeout(timeout);
                socket.disconnect();
                reject(error);
            },
        );
    });
}

async function joinRoom(
    socket: Socket,
    roomId: number,
): Promise<void> {
    return waitForRoomAck(
        socket,
        'join_room',
        'joined_room',
        roomId,
    );
}

async function leaveRoom(
    socket: Socket,
    roomId: number,
): Promise<void> {
    return waitForRoomAck(
        socket,
        'leave_room',
        'left_room',
        roomId,
    );
}

async function waitForRoomAck(
    socket: Socket,
    emitEvent: string,
    responseEvent: string,
    roomId: number,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timeout);

            socket.off(
                responseEvent,
                handleResponse,
            );

            socket.off(
                'chat_error',
                handleError,
            );
        };

        const handleResponse = (
            data: { roomId: number },
        ) => {
            if (data.roomId !== roomId) {
                return;
            }

            cleanup();
            resolve();
        };

        const handleError = (
            data: { message?: string },
        ) => {
            cleanup();

            reject(
                new Error(
                    data.message ??
                    `${emitEvent} failed.`,
                ),
            );
        };

        const timeout = setTimeout(() => {
            cleanup();

            reject(
                new Error(
                    `${responseEvent} timed out.`,
                ),
            );
        }, TIMEOUT_MS);

        socket.on(
            responseEvent,
            handleResponse,
        );

        socket.on(
            'chat_error',
            handleError,
        );

        socket.emit(
            emitEvent,
            {
                roomId,
            },
        );
    });
}

async function sendMessageAndWait(
    socket: Socket,
    roomId: number,
    content: string,
): Promise<AgentResult> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timeout);

            socket.off(
                'assistant_message_completed',
                handleCompleted,
            );

            socket.off(
                'assistant_approval_required',
                handleApprovalRequired,
            );

            socket.off(
                'assistant_message_failed',
                handleFailed,
            );

            socket.off(
                'assistant_message_cancelled',
                handleCancelled,
            );

            socket.off(
                'chat_error',
                handleError,
            );
        };

        const handleCompleted = (
            data: {
                roomId: number;
                message: ChatMessageResponse;
            },
        ) => {
            if (data.roomId !== roomId) {
                return;
            }

            cleanup();

            resolve({
                status: 'COMPLETED',
                message: data.message,
            });
        };

        const handleApprovalRequired = (
            data: { roomId: number },
        ) => {
            if (data.roomId !== roomId) {
                return;
            }

            cleanup();

            resolve({
                status: 'APPROVAL_REQUIRED',
                message: null,
            });
        };

        const handleFailed = (
            data: { roomId: number },
        ) => {
            if (data.roomId !== roomId) {
                return;
            }

            cleanup();

            resolve({
                status: 'FAILED',
                message: null,
            });
        };

        const handleCancelled = (
            data: { roomId: number },
        ) => {
            if (data.roomId !== roomId) {
                return;
            }

            cleanup();

            resolve({
                status: 'CANCELLED',
                message: null,
            });
        };

        const handleError = (
            data: { message?: string },
        ) => {
            cleanup();

            reject(
                new Error(
                    data.message ??
                    'Chat request failed.',
                ),
            );
        };

        const timeout = setTimeout(() => {
            cleanup();

            reject(
                new Error(
                    `send_message timed out: roomId=${roomId}`,
                ),
            );
        }, TIMEOUT_MS);

        socket.on(
            'assistant_message_completed',
            handleCompleted,
        );

        socket.on(
            'assistant_approval_required',
            handleApprovalRequired,
        );

        socket.on(
            'assistant_message_failed',
            handleFailed,
        );

        socket.on(
            'assistant_message_cancelled',
            handleCancelled,
        );

        socket.on(
            'chat_error',
            handleError,
        );

        socket.emit(
            'send_message',
            {
                roomId,
                content,
            },
        );
    });
}

function printMetrics(
    results: RagAgentEvalResult[],
): void {
    const positiveResults =
        results.filter(
            (result) => result.hit !== null,
        );

    const negativeResults =
        results.filter(
            (result) => result.hit === null,
        );

    const hitCount =
        positiveResults.filter(
            (result) => result.hit,
        ).length;

    const hitRate =
        positiveResults.length > 0
            ? hitCount /
                positiveResults.length
            : 0;

    const negativePassed =
        negativeResults.filter(
            (result) => result.passed,
        ).length;

    const negativeAccuracy =
        negativeResults.length > 0
            ? negativePassed /
                negativeResults.length
            : 0;

    const completedCount =
        results.filter(
            (result) =>
                result.status === 'COMPLETED',
        ).length;

    console.log(
        'Agent Citation Hit Rate: ' +
        formatPercent(hitRate),
    );

    console.log(
        'Negative Accuracy: ' +
        formatPercent(negativeAccuracy),
    );

    console.log(
        'Completion Rate: ' +
        formatPercent(
            completedCount / results.length,
        ),
    );
}

async function request<T>(
    path: string,
    init: RequestInit,
    accessToken?: string,
): Promise<T> {
    const response = await fetch(
        `${BASE_URL}${path}`,
        {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                ...(accessToken
                    ? {
                        Authorization:
                            `Bearer ${accessToken}`,
                    }
                    : {}),
                ...init.headers,
            },
        },
    );

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}: ${text}`,
        );
    }

    return text
        ? JSON.parse(text) as T
        : undefined as T;
}

function getRequiredEnv(
    name: string,
): string {
    const value =
        process.env[name]?.trim();

    if (!value) {
        throw new Error(
            `${name} environment variable is required.`,
        );
    }

    return value;
}

function getPositiveNumberEnv(
    name: string,
    fallback: number,
): number {
    const raw =
        process.env[name]?.trim();

    if (!raw) {
        return fallback;
    }

    const value = Number(raw);

    if (
        !Number.isFinite(value) ||
        value <= 0
    ) {
        throw new Error(
            `${name} must be a positive number.`,
        );
    }

    return value;
}

function formatPercent(
    value: number,
): string {
    return `${(value * 100).toFixed(1)}%`;
}

void main().catch((error) => {
    console.error(
        'RAG agent retrieval eval failed:',
        error,
    );

    process.exitCode = 1;
});

function getEvalCases() {
    const value =
        process.env.RAG_AGENT_EVAL_CASES?.trim();

    if (!value) {
        return RAG_RETRIEVAL_EVAL_CASES;
    }

    const names = new Set(
        value
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
    );

    const unknownNames = [...names].filter(
        (name) =>
            !RAG_RETRIEVAL_EVAL_CASES.some(
                (testCase) => testCase.name === name,
            ),
    );

    if (unknownNames.length > 0) {
        throw new Error(
            `Unknown RAG Agent eval cases: ${unknownNames.join(', ')}`,
        );
    }

    return RAG_RETRIEVAL_EVAL_CASES.filter(
        (testCase) => names.has(testCase.name),
    );
}