import type {
    DeleteRagDocumentResponse,
    RagDocumentsPageResponse,
    ReprocessRagDocumentResponse,
    UploadRagDocumentResponse,
} from '@repo/shared';
import { http } from '../../api/http';

type GetRagDocumentsParams = {
    cursor?: number | null;
    limit?: number;
};

export function getRagDocuments(params?: GetRagDocumentsParams) {
    const searchParams = new URLSearchParams();

    if (params?.cursor !== undefined && params.cursor !== null) {
        searchParams.set('cursor', String(params.cursor));
    }

    if (params?.limit !== undefined) {
        searchParams.set('limit', String(params.limit));
    }

    const queryString = searchParams.toString();

    return http<RagDocumentsPageResponse>(`/rag/documents${queryString ? `?${queryString}` : ''}`);
}

export function uploadRagDocument(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    return http<UploadRagDocumentResponse>('/rag/documents', {
        method: 'POST',
        body: formData,
    });
}

export function deleteRagDocument(documentId: number) {
    return http<DeleteRagDocumentResponse>(`/rag/documents/${documentId}`, {
        method: 'DELETE',
    });
}

export function reprocessRagDocument(documentId: number) {
    return http<ReprocessRagDocumentResponse>(`/rag/documents/${documentId}/reprocess`, {
        method: 'POST',
    });
}