from pydantic import BaseModel, Field


class RagCitation(BaseModel):
    document_id: int = Field(alias="documentId", gt=0)
    chunk_id: int = Field(alias="chunkId", gt=0)
    chunk_index: int = Field(alias="chunkIndex", ge=0)
    page_number: int | None = Field(alias="pageNumber", gt=0)
    file_name: str = Field(alias="fileName", min_length=1)
    similarity: float = Field(ge=-1, le=1)

    model_config = {
        "populate_by_name": True,
    }