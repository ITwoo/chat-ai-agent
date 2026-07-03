import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../features/auth/store/authStore';

export function ProtectedRoute() {
  const authStatus = useAuthStore((state) => state.authStatus);

  if (authStatus === 'loading') {
    return <div>로딩 중...</div>;
  }

  if (authStatus === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}