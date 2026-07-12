import { http } from '../../../api/http';
import type {
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    UserResponse,
} from '@repo/shared';

export const authApi = {
    signIn(data: LoginRequest): Promise<LoginResponse> {
        return http<LoginResponse>('/auth/signin', {
            method: 'POST',
            body: data,
            token: null, // 로그인 시에는 토큰이 없으므로 null로 설정
        });
    },

    signUp(data: RegisterRequest): Promise<void> {
        return http('/auth/signup', {
            method: 'POST',
            body: data,
            token: null, // 회원가입 시에는 토큰이 없으므로 null로 설정
        });
    },

    getMe(): Promise<UserResponse> {
        return http<UserResponse>('/auth/me', {
            method: 'GET',
        });
    },

    refresh(): Promise<LoginResponse> {
        return http<LoginResponse>('/auth/refresh', {
            method: 'POST',
            token: null,
        });
    },

    logout(): Promise<void> {
        return http<void>('/auth/logout', {
            method: 'POST',
            token: null,
        });
    },
};