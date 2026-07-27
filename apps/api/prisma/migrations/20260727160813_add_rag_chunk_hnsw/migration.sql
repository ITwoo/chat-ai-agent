CREATE INDEX "RagDocumentChunk_embedding_hnsw_cosine_idx"
ON "RagDocumentChunk"
USING hnsw ("embedding" vector_cosine_ops)
WHERE "embedding" IS NOT NULL;