import type {
    RagCitation,
} from '../schemas/rag-citation.schema';
import type { RagSearchResult } from '../rag.types';

export function createRagCitations(
    results: RagSearchResult[],
): RagCitation[] {
    return results.map((result) => ({
        documentId: result.documentId,
        chunkId: result.chunkId,
        chunkIndex: result.chunkIndex,
        fileName: result.fileName,
        similarity: result.similarity,
    }));
}