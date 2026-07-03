import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { boardApi } from '../api/boardApi';
import type { BoardResponse } from '@repo/shared';

export function BoardListPage() {
  const [boards, setBoards] = useState<BoardResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadBoards = async () => {
    try {
      setError(null);
      setIsLoading(true);

      const result = await boardApi.findAll();
      setBoards(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : '게시글 조회 실패');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBoards();
  }, []);

  const handleDelete = async (id: number) => {
    const confirmed = window.confirm('정말 이 게시글을 삭제할까요?');

    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      setDeletingId(id);

      await boardApi.remove(id);

      setBoards((prevBoards) =>
        prevBoards.filter((board) => board.id !== id),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : '게시글 삭제 실패');
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <section className="space-y-6">
        <div>
          <p className="text-sm font-medium text-gray-500">Boards</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            게시글 목록
          </h1>
        </div>

        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="h-5 w-1/3 rounded bg-gray-200" />
              <div className="mt-4 h-4 w-2/3 rounded bg-gray-100" />
              <div className="mt-2 h-4 w-1/2 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-gray-500">Boards</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            게시글 목록
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            작성된 게시글을 확인하고 관리할 수 있습니다.
          </p>
        </div>

        <Link
          to="/boards/new"
          className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700"
        >
          새 게시글 작성
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {boards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">
            📝
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">
            아직 게시글이 없습니다
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            첫 게시글을 작성해서 목록을 채워보세요.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {boards.map((board) => (
            <article
              key={board.id}
              className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 group-hover:text-gray-700">
                    {board.title}
                  </h2>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-600">
                    {board.description}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Link
                    to={`/boards/${board.id}/edit`}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                  >
                    수정
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleDelete(board.id)}
                    disabled={deletingId === board.id}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingId === board.id ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}