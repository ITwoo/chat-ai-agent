import { createBrowserRouter } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProtectedRoute } from '../components/route/ProtectedRoute';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { BoardListPage } from '../features/board/pages/BoardListPage';
import { BoardEditPage } from '../features/board/pages/BoardEditPage';
import { BoardCreatePage } from '../features/board/pages/BoardCreatePage';
import { ChatTestPage } from '../pages/ChatTestPage';

function HomePage() {
  return <h1>Home</h1>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'register',
        element: <RegisterPage />,
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: 'boards',
            element: <BoardListPage />,
          },
          {
            path: 'boards/new',
            element: <BoardCreatePage />,
          },
          {
            path: 'boards/:id/edit',
            element: <BoardEditPage />,
          },
          {
            path: 'chat-test',
            element: <ChatTestPage />,
          },
        ],
      },
    ],
  },
]);