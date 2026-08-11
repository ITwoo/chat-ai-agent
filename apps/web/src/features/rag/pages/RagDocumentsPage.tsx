import { RagDocumentStatus, type RagDocumentListItemResponse } from '@repo/shared';
import { useEffect, useRef, useState } from 'react';
import { deleteRagDocument, getRagDocuments, reprocessRagDocument, uploadRagDocument } from '../ragApi';

const DOCUMENT_PAGE_SIZE = 20;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const DOCUMENT_POLL_INTERVAL_MS = 3000;
const MAX_DOCUMENT_POLL_LIMIT = 50;

type DocumentAction = {
    documentId: number;
    type: 'delete' | 'reprocess';
};

type DocumentItemProps = {
    document: RagDocumentListItemResponse;
    action: DocumentAction | null;
    onDelete: (document: RagDocumentListItemResponse) => Promise<void>;
    onReprocess: (document: RagDocumentListItemResponse) => Promise<void>;
};

const STATUS_LABEL: Record<RagDocumentStatus, string> = {
    PENDING: '처리 대기',
    PROCESSING: '처리 중',
    READY: '사용 가능',
    FAILED: '처리 실패',
};

const STATUS_CLASS: Record<RagDocumentStatus, string> = {
    PENDING: 'bg-amber-50 text-amber-700',
    PROCESSING: 'bg-blue-50 text-blue-700',
    READY: 'bg-emerald-50 text-emerald-700',
    FAILED: 'bg-red-50 text-red-700',
};

function formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

export function RagDocumentsPage() {
    const [documents, setDocuments] = useState<RagDocumentListItemResponse[]>([]);
    const [nextCursor, setNextCursor] = useState<number | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [documentAction, setDocumentAction] = useState<DocumentAction | null>(null);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const isPollingRef = useRef(false);

    const hasProcessingDocument = documents.some(
        (document) =>
            document.status === RagDocumentStatus.PENDING ||
            document.status === RagDocumentStatus.PROCESSING,
    );

    useEffect(() => {
        void loadDocuments();
    }, []);

    useEffect(() => {
        if (!hasProcessingDocument) return;

        const intervalId = window.setInterval(() => {
            void refreshProcessingDocuments();
        }, DOCUMENT_POLL_INTERVAL_MS);

        return () => window.clearInterval(intervalId);
    }, [hasProcessingDocument, documents.length]);

    const loadDocuments = async (append = false) => {
        if (append && nextCursor === null) return;

        if (append) setIsLoadingMore(true);
        else setIsLoading(true);

        try {
            setErrorMessage('');

            const page = await getRagDocuments({
                cursor: append ? nextCursor : undefined,
                limit: DOCUMENT_PAGE_SIZE,
            });

            setDocuments((previousDocuments) => {
                if (!append) return page.documents;

                const existingIds = new Set(previousDocuments.map((document) => document.id));
                const newDocuments = page.documents.filter((document) => !existingIds.has(document.id));

                return [...previousDocuments, ...newDocuments];
            });

            setNextCursor(page.nextCursor);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'RAG 문서 목록을 불러오지 못했습니다.');
        } finally {
            if (append) setIsLoadingMore(false);
            else setIsLoading(false);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            setErrorMessage('업로드할 TXT 또는 PDF 파일을 선택해주세요.');
            return;
        }

        const fileName = selectedFile.name.toLowerCase();

        if (!fileName.endsWith('.txt') && !fileName.endsWith('.pdf')) {
            setErrorMessage('현재는 TXT 또는 PDF 파일만 업로드할 수 있습니다.');
            return;
        }

        if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
            setErrorMessage('파일 크기는 최대 5MB까지 가능합니다.');
            return;
        }

        setIsUploading(true);
        setErrorMessage('');

        try {
            await uploadRagDocument(selectedFile);

            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';

            await loadDocuments();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'RAG 문서를 업로드하지 못했습니다.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (document: RagDocumentListItemResponse) => {
        const confirmed = window.confirm(`"${document.fileName}" 문서를 삭제하시겠습니까?`);
        if (!confirmed) return;

        setDocumentAction({ documentId: document.id, type: 'delete' });
        setErrorMessage('');

        try {
            await deleteRagDocument(document.id);
            setDocuments((previousDocuments) => previousDocuments.filter((item) => item.id !== document.id));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'RAG 문서를 삭제하지 못했습니다.');
        } finally {
            setDocumentAction(null);
        }
    };

    const handleReprocess = async (document: RagDocumentListItemResponse) => {
        setDocumentAction({ documentId: document.id, type: 'reprocess' });
        setErrorMessage('');

        try {
            const result = await reprocessRagDocument(document.id);

            setDocuments((previousDocuments) =>
                previousDocuments.map((item) =>
                    item.id === result.documentId
                        ? { ...item, status: result.status, error: null, updatedAt: new Date().toISOString() }
                        : item,
                ),
            );
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'RAG 문서를 재처리하지 못했습니다.');
        } finally {
            setDocumentAction(null);
        }
    };

    const refreshProcessingDocuments = async () => {
        if (isPollingRef.current) return;

        isPollingRef.current = true;

        try {
            const pollLimit = Math.min(Math.max(documents.length, DOCUMENT_PAGE_SIZE), MAX_DOCUMENT_POLL_LIMIT);
            const page = await getRagDocuments({ limit: pollLimit });
            const updatedDocuments = new Map(page.documents.map((document) => [document.id, document]));

            setDocuments((previousDocuments) =>
                previousDocuments.map((document) => updatedDocuments.get(document.id) ?? document),
            );
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'RAG 문서 상태를 갱신하지 못했습니다.');
        } finally {
            isPollingRef.current = false;
        }
    };

    return (
        <section className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">RAG 문서 관리</h1>
                <p className="mt-2 text-sm text-slate-500">
                    AI Agent가 답변 근거로 사용할 문서를 업로드하고 처리 상태를 확인합니다.
                </p>
            </div>

            {errorMessage && (
                <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <p>{errorMessage}</p>
                    <button type="button" onClick={() => setErrorMessage('')} className="shrink-0 font-semibold">
                        닫기
                    </button>
                </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">문서 업로드</h2>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.pdf,text/plain,application/pdf"
                        disabled={isUploading}
                        onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700"
                    />

                    <button
                        type="button"
                        disabled={!selectedFile || isUploading}
                        onClick={() => void handleUpload()}
                        className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        {isUploading ? '업로드 중...' : '업로드'}
                    </button>
                </div>

                <p className="mt-3 text-xs text-slate-400">
                    TXT 또는 PDF 파일을 지원하며 최대 크기는 5MB입니다.
                </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <h2 className="text-lg font-bold text-slate-900">업로드한 문서</h2>

                    <button
                        type="button"
                        disabled={isLoading || isUploading}
                        onClick={() => void loadDocuments()}
                        className="text-sm font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-50"
                    >
                        새로고침
                    </button>
                </div>

                {isLoading ? (
                    <div className="space-y-3 p-5">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100" />
                        ))}
                    </div>
                ) : documents.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500">
                        아직 업로드한 문서가 없습니다.
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {documents.map((document) => (
                            <DocumentItem
                                key={document.id}
                                document={document}
                                action={documentAction}
                                onDelete={handleDelete}
                                onReprocess={handleReprocess}
                            />
                        ))}
                    </div>
                )}

                {nextCursor !== null && (
                    <div className="border-t border-slate-200 p-4 text-center">
                        <button
                            type="button"
                            disabled={isLoadingMore}
                            onClick={() => void loadDocuments(true)}
                            className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                            {isLoadingMore ? '불러오는 중...' : '문서 더 보기'}
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}

function DocumentItem({ document, action, onDelete, onReprocess }: DocumentItemProps) {
    const isProcessing = document.status === RagDocumentStatus.PROCESSING;
    const isDeleting = action?.documentId === document.id && action.type === 'delete';
    const isReprocessing = action?.documentId === document.id && action.type === 'reprocess';
    const hasRunningAction = action !== null;
    const canReprocess = document.status === RagDocumentStatus.READY || document.status === RagDocumentStatus.FAILED;

    return (
        <article className="px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <p className="break-all text-sm font-semibold text-slate-900">{document.fileName}</p>

                    <p className="mt-1 text-xs text-slate-400">
                        {formatFileSize(document.sizeBytes)} · 청크 {document.chunkCount}개 · {formatDate(document.createdAt)}
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[document.status]}`}>
                        {STATUS_LABEL[document.status]}
                    </span>

                    <button
                        type="button"
                        disabled={!canReprocess || isProcessing || hasRunningAction}
                        onClick={() => void onReprocess(document)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isReprocessing ? '재처리 요청 중...' : '재처리'}
                    </button>

                    <button
                        type="button"
                        disabled={isProcessing || hasRunningAction}
                        onClick={() => void onDelete(document)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isDeleting ? '삭제 중...' : '삭제'}
                    </button>
                </div>
            </div>

            {document.status === RagDocumentStatus.FAILED && document.error && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                    {document.error}
                </p>
            )}
        </article>
    );
}