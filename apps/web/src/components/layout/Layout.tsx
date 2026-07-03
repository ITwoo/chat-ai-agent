import { useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../features/auth/store/authStore';

export function Layout() {
  const navigate = useNavigate();

  const authStatus = useAuthStore((state) => state.authStatus);
  const initAuth = useAuthStore((state) => state.initAuth);
  const logout = useAuthStore((state) => state.logout);

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

  return (
    <div>
      <header style={{ display: 'flex', gap: 12 }}>
        <Link to="/">Home</Link>
        <Link to="/boards">Boards</Link>

        {authStatus === 'loading' ? null : isAuthenticated ? (
          <button type="button" onClick={handleLogout}>
            Logout
          </button>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </header>

      <main style={{ paddingTop: 20 }}>
        <Outlet />
      </main>
    </div>
  );
}