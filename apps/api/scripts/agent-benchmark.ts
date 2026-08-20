import { io, type Socket } from 'socket.io-client';
import type {
    ChatRoomResponse,
    LoginResponse,
} from '@repo/shared';

type BenchmarkScenario = {
    name: string;
    content: string;
};

type ScenarioStatus =
    | 'COMPLETED'
    | 'APPROVAL_REQUIRED'
    | 'FAILED'
    | 'CANCELLED';

type ScenarioResult = {
    name: string;
    roomId: number;
    status: ScenarioStatus;
    elapsedMs: number;
};

const BASE_URL =
    process.env.BENCHMARK_BASE_URL ?? 'http://localhost:3000';

const USERNAME = getRequiredEnv('BENCHMARK_USERNAME');
const PASSWORD = getRequiredEnv('BENCHMARK_PASSWORD');

const ROUNDS = getPositiveNumberEnv(
    'BENCHMARK_ROUNDS',
    1,
);

const REQUEST_INTERVAL_MS = getPositiveNumberEnv(
    'BENCHMARK_REQUEST_INTERVAL_MS',
    7_000,
);

const TIMEOUT_MS = getPositiveNumberEnv(
    'BENCHMARK_TIMEOUT_MS',
    120_000,
);

const ragQuery = process.env.BENCHMARK_RAG_QUERY?.trim();

const scenarios: BenchmarkScenario[] = [
    // {
    //     name: 'general',
    //     content: '오늘 날짜와 현재 시간을 알려줘.',
    // },
    // {
    //     name: 'expense-read',
    //     content: '이번 달 지출 내역을 보여줘.',
    // },
    // {
    //     name: 'schedule-read',
    //     content: '이번 주 일정을 알려줘.',
    // },
    // {
    //     name: 'multi-domain-read',
    //     content:
    //         '이번 달 지출 내역을 보여주고 이번 주 일정도 알려줘.',
    // },
    ...(ragQuery
        ? [
            {
                name: 'rag-read',
                content: ragQuery,
            },
        ]
        : []),
];

async function main() {
    console.log('Agent benchmark started');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Rounds: ${ROUNDS}`);
    console.log(`Scenarios: ${scenarios.length}`);

    if (!ragQuery) {
        console.log(
            'RAG scenario skipped: BENCHMARK_RAG_QUERY is not set.',
        );
    }

    const accessToken = await signIn();
    const socket = await connectSocket(accessToken);

    const results: ScenarioResult[] = [];

    try {
        for (let round = 1; round <= ROUNDS; round++) {
            console.log(`\nRound ${round}/${ROUNDS}`);

            for (
                let index = 0;
                index < scenarios.length;
                index++
            ) {
                const scenario = scenarios[index];

                const result = await executeScenario(
                    socket,
                    accessToken,
                    scenario,
                    round,
                );

                results.push(result);

                console.log(
                    [
                        `[${scenario.name}]`,
                        result.status,
                        `${result.elapsedMs}ms`,
                        `room=${result.roomId}`,
                    ].join(' '),
                );

                const isLastRequest =
                    round === ROUNDS &&
                    index === scenarios.length - 1;

                if (!isLastRequest) {
                    await delay(REQUEST_INTERVAL_MS);
                }
            }
        }
    } finally {
        socket.disconnect();
    }

    console.table(results);
}

async function executeScenario(
    socket: Socket,
    accessToken: string,
    scenario: BenchmarkScenario,
    round: number,
): Promise<ScenarioResult> {
    const room = await createRoom(
        accessToken,
        `[BENCHMARK] ${round}-${scenario.name}`,
    );

    await joinRoom(socket, room.id);

    const startedAt = performance.now();

    try {
        const status = await sendMessageAndWait(
            socket,
            room.id,
            scenario.content,
        );

        return {
            name: scenario.name,
            roomId: room.id,
            status,
            elapsedMs: Math.round(
                performance.now() - startedAt,
            ),
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
                new Error('Socket connection timed out.'),
            );
        }, TIMEOUT_MS);

        socket.once('connect', () => {
            clearTimeout(timeout);
            resolve(socket);
        });

        socket.once('connect_error', (error) => {
            clearTimeout(timeout);
            socket.disconnect();
            reject(error);
        });
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
            socket.off(responseEvent, handleResponse);
            socket.off('chat_error', handleError);
        };

        const handleResponse = (data: { roomId: number }) => {
            if (data.roomId !== roomId) {
                return;
            }

            cleanup();
            resolve();
        };

        const handleError = (data: { message?: string }) => {
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

        socket.on(responseEvent, handleResponse);
        socket.on('chat_error', handleError);

        socket.emit(emitEvent, {
            roomId,
        });
    });
}

async function sendMessageAndWait(
    socket: Socket,
    roomId: number,
    content: string,
): Promise<ScenarioStatus> {
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

        const finish = (
            status: ScenarioStatus,
        ) => {
            cleanup();
            resolve(status);
        };

        const handleCompleted = (
            data: { roomId: number },
        ) => {
            if (data.roomId === roomId) {
                finish('COMPLETED');
            }
        };

        const handleApprovalRequired = (
            data: { roomId: number },
        ) => {
            if (data.roomId === roomId) {
                finish('APPROVAL_REQUIRED');
            }
        };

        const handleFailed = (
            data: { roomId: number },
        ) => {
            if (data.roomId === roomId) {
                finish('FAILED');
            }
        };

        const handleCancelled = (
            data: { roomId: number },
        ) => {
            if (data.roomId === roomId) {
                finish('CANCELLED');
            }
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

        socket.emit('send_message', {
            roomId,
            content,
        });
    });
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

function getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim();

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
    const rawValue = process.env[name];

    if (!rawValue) {
        return fallback;
    }

    const value = Number(rawValue);

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

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

void main().catch((error) => {
    console.error(
        'Agent benchmark failed:',
        error,
    );

    process.exitCode = 1;
});