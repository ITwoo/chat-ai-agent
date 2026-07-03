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
    logout: () => void;
    isAuthenticated: () => boolean;
};

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    authStatus: 'loading',

    initAuth: async () => {
        const token = getAccessToken();

        if(!token) {
            set({
                user: null,
                authStatus: 'unauthenticated',
            });
            return;
        }

        try {
            const user = await authApi.getMe();
            set({
                user,
                authStatus: 'authenticated',
            });
        } catch (error) {
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

    logout: () => {
        removeAccessToken();
        
        set({
            user: null,
            authStatus: 'unauthenticated',
        });
    },

    isAuthenticated: () => {
        return get().authStatus === 'authenticated';
    }

}));