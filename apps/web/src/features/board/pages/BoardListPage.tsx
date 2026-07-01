import { useEffect, useState } from 'react';
import { boardApi } from '../api/boardApi';
import type { BoardResponse } from '@repo/shared';

export function BoardListPage() {
  const [boards, setBoards] = useState<BoardResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    boardApi
      .findAll()
      .then(setBoards)
      .catch((error) => {
        setError(error instanceof Error ? error.message : '게시글 조회 실패');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <p>게시글 불러오는 중...</p>;
  }

  return (
    <section>
      <h1>게시글 목록</h1>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {boards.length === 0 ? (
        <p>게시글이 없습니다.</p>
      ) : (
        <ul>
          {boards.map((board) => (
            <li key={board.id}>
              <strong>{board.title}</strong>
              <p>{board.description}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}