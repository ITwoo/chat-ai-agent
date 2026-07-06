import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';

export function RegisterPage() {
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setError(null);
            setIsSubmitting(true);

            await authApi.signUp({
                username,
                password,
            });

            navigate('/login', { replace: true });
        } catch (error) {
            setError(error instanceof Error ? error.message : '회원가입 실패');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className="mx-auto max-w-md">
            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 text-lg font-bold text-white">
                        B
                    </div>
                    <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-900">
                        회원가입
                    </h1>
                    <p className="mt-2 text-sm text-gray-500">
                        새 계정을 만들고 게시판을 시작하세요.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                    <div>
                        <label className="text-sm font-medium text-gray-700">
                            사용자명
                        </label>
                        <input
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            autoComplete="username"
                            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-900 focus:ring-4 focus:ring-gray-100"
                            placeholder="username"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">
                            비밀번호
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-900 focus:ring-4 focus:ring-gray-100"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSubmitting ? '가입 중...' : '회원가입'}
                    </button>
                </form>

                <p className="mt-6 text-center text-sm text-gray-500">
                    이미 계정이 있나요?{' '}
                    <Link
                        to="/login"
                        className="font-semibold text-gray-900 hover:underline"
                    >
                        로그인
                    </Link>
                </p>
            </div>
        </section>
    );
}