-- AlterTable
ALTER TABLE "UserMemory"
ADD COLUMN "embedding" vector(1536);

CREATE INDEX "UserMemory_embedding_hnsw_cosine_idx"
ON "UserMemory"
USING hnsw ("embedding" vector_cosine_ops)
WHERE "embedding" IS NOT NULL;