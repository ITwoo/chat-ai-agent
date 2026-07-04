import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "../auth/utils/authStorage";

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let socket : Socket | null = null;

export function connectChatSocket() {
    const token = getAccessToken();

    if(!token) {
        throw new Error("access token not found");
    }

    if(socket?.connected) {
        return socket;
    }

    socket = io(API_URL, {
        auth: {
            token
        },
        transports: ['websocket'],
    });

    return socket;
}

export function getChatSocket() {
    return socket;
}

export function disconnectChatSocket() {
    if(socket){
        socket.disconnect();
        socket = null;
    }
}
