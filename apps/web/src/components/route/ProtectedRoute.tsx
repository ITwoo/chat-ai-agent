import { Navigate, Outlet } from 'react-router-dom';
import { isLoggedIn } from '../../features/auth/utils/authStorage';

export function ProtectedRoute() {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}