import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { boardApi } from '../api/boardApi';

export function BoardCreatePage() {
    const navigate = useNavigate();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!title.trim()) {
            setError('제목을 입력해 주세요.');
            return;
        }

        if (!description.trim()) {
            setError('내용을 입력해 주세요.');
            return;
        }

        try {
            setError(null);
            setIsSubmitting(true);

            await boardApi.create({
                title,
                description,
            });

            navigate('/boards', { replace: true });
        } catch (error) {
            setError(error instanceof Error ? error.message : '게시글 등록 실패');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className="mx-auto max-w-2xl space-y-8">
            <div>
                <p className="text-sm font-medium text-gray-500">Create Board</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
                    새 게시글 작성
                </h1>
                <p className="mt-2 text-sm text-gray-500">
                    제목과 내용을 입력해서 새 게시글을 등록하세요.
                </p>
            </div>

            <form
                onSubmit={handleSubmit}
                className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm"
            >
                <div className="space-y-6">
                    <div>
                        <label className="text-sm font-medium text-gray-700">제목</label>
                        <input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-900 focus:ring-4 focus:ring-gray-100"
                            placeholder="게시글 제목을 입력하세요"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">내용</label>
                        <textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            rows={8}
                            className="mt-2 w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-gray-400 focus:border-gray-900 focus:ring-4 focus:ring-gray-100"
                            placeholder="게시글 내용을 입력하세요"
                        />
                    </div>

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <Link
                            to="/boards"
                            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                        >
                            취소
                        </Link>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmitting ? '등록 중...' : '등록하기'}
                        </button>
                    </div>
                </div>
            </form>
        </section>
    );
}