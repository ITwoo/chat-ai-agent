import type { LoginRequest, UserResponse } from "@repo/shared";
import { create } from "zustand";
import { getAccessToken, removeAccessToken, saveAccessToken } from "../utils/authStorage";
import { authApi } from "../api/authApi";

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthState = {
    user: UserResponse | null;
    authStatus: AuthStatus;

    initAuth: () => Promise<void>;
    login: (data: LoginRequest) => Promise<void>;
    logout: () => Promise<void>;
    clearAuth: () => void;
    isAuthenticated: () => boolean;
};

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    authStatus: 'loading',

    initAuth: async () => {
        const token = getAccessToken();

        if (token) {
            try {
                const user = await authApi.getMe();

                set({
                    user,
                    authStatus: 'authenticated',
                });

                return;
            } catch {
                removeAccessToken();
            }
        }

        try {
            const response = await authApi.refresh();

            saveAccessToken(response.accessToken);

            const user = await authApi.getMe();

            set({
                user,
                authStatus: 'authenticated',
            });
        } catch {
            removeAccessToken();

            set({
                user: null,
                authStatus: 'unauthenticated',
            });
        }
    },

    login: async (data: LoginRequest) => {
        const response = await authApi.signIn(data);

        saveAccessToken(response.accessToken);

        const user = await authApi.getMe();

        set({
            user,
            authStatus: 'authenticated',
        });
    },

    clearAuth: () => {
        removeAccessToken();

        set({
            user: null,
            authStatus: 'unauthenticated',
        });
    },

    logout: async () => {
        try {
            await authApi.logout();
        } finally {
            get().clearAuth();
        }
    },

    isAuthenticated: () => {
        return get().authStatus === 'authenticated';
    }

}));