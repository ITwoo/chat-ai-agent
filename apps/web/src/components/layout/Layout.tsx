import { Link, Outlet, useNavigate } from 'react-router-dom';
import {
  isLoggedIn,
  removeAccessToken,
} from '../../features/auth/utils/authStorage';

export function Layout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    removeAccessToken();
    navigate('/login');
  };

  return (
    <div>
      <header style={{ display: 'flex', gap: 12 }}>
        <Link to="/">Home</Link>
        <Link to="/boards">Boards</Link>

        {isLoggedIn() ? (
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