-- This is an empty migration.
CREATE INDEX "RagDocumentChunk_content_fts_idx"
ON "RagDocumentChunk"
USING GIN (
    to_tsvector('simple'::regconfig, "content")
);