import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../features/auth/store/authStore';

export function Layout() {
    const navigate = useNavigate();

    const authStatus = useAuthStore((state) => state.authStatus);
    const initAuth = useAuthStore((state) => state.initAuth);
    const logout = useAuthStore((state) => state.logout);
    const user = useAuthStore((state) => state.user);

    useEffect(() => {
        initAuth();

        function handleUnauthorized() {
            logout();
        }

        window.addEventListener('auth:unauthorized', handleUnauthorized);

        return () => {
            window.removeEventListener('auth:unauthorized', handleUnauthorized);
        };
    }, [initAuth, logout]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const isAuthenticated = authStatus === 'authenticated';

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        [
            'rounded-lg px-3 py-2 text-sm font-medium transition',
            isActive
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        ].join(' ');

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-8">
                        <Link to="/" className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-sm font-bold text-white">
                                B
                            </div>
                            <span className="text-lg font-bold tracking-tight">
                                Board App
                            </span>
                        </Link>

                        <nav className="flex items-center gap-1">
                            <NavLink to="/" className={navLinkClass}>
                                Home
                            </NavLink>
                            <NavLink to="/boards" className={navLinkClass}>
                                Boards
                            </NavLink>
                            <NavLink to="/chat" className={navLinkClass}>
                                AI 채팅
                            </NavLink>
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        {authStatus === 'loading' ? (
                            <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-200" />
                        ) : isAuthenticated ? (
                            <>
                                {user && (
                                    <span className="hidden text-sm text-gray-500 sm:inline">
                                        {user.username}
                                    </span>
                                )}

                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                                >
                                    Logout
                                </button>
                            </>
                        ) : (
                            <>
                                <Link
                                    to="/login"
                                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                                >
                                    Login
                                </Link>
                                <Link
                                    to="/register"
                                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
                                >
                                    Register
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-6 py-10">
                <Outlet />
            </main>
        </div>
    );
}