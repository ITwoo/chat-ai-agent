export type RagDocumentExtractionInput = {
    filePath: string;
    storageKey: string;
    extension: string;
};

export type RagExtractedSection = {
    content: string;
    pageNumber: number | null;
};

export type RagDocumentExtractionResult = {
    sections: RagExtractedSection[];
};

export interface RagDocumentTextExtractor {
    supports(extension: string): boolean;
    extract(input: RagDocumentExtractionInput): Promise<RagDocumentExtractionResult>;
}