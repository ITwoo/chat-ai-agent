import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "../auth/utils/authStorage";
import { refreshAccessToken } from "../../api/http";

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let socket: Socket | null = null;
let isRefreshingSocketToken = false;

function createSocket(token: string): Socket {
    const nextSocket = io(API_URL, {
        auth: {
            token,
        },
        transports: ['websocket'],
    });

    nextSocket.on('connect_error', (error) => {
        console.warn('[socket connect_error]', error.message);

        if(error.message === 'Unauthorized') {    
            void reconnectWithFreshAceessToken();
        }
    });

    nextSocket.on('disconnect', (reason) => {
        console.warn('[socket disconnected]]', reason)

        if(reason === 'io server disconnect') {
            void reconnectWithFreshAceessToken();
        }
    })

    return nextSocket;
}

async function reconnectWithFreshAceessToken(): Promise<void> {
    if(!socket || isRefreshingSocketToken) {
        return;
    }

    isRefreshingSocketToken = true;

    try {
        const newAccessToken = await refreshAccessToken();

        socket.auth = {
            token: newAccessToken,
        };

        if(!socket.connected) {
            socket.connect();
        }
    } catch (error) {
        console.error('[socket refresh failed]', error);

        disconnectChatSocket();

        window.dispatchEvent(new Event('auth:unauthorized'));
    } finally {
        isRefreshingSocketToken = false;
    }
    
}

export function connectChatSocket() {
    const token = getAccessToken();

    if(!token) {
        throw new Error ('access token not found');
    }

    if(socket?.connected) {
        return socket;
    }

    if(socket) {
        socket.auth = {
            token,
        };

        socket.connect();
        
        return socket;
    }
    socket = createSocket(token);

    return socket;
}

export function getChatSocket() {
    return socket;
}

export function disconnectChatSocket() {
    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
    }
    
    isRefreshingSocketToken = false;
}
