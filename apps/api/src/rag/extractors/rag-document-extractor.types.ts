export type RagDocumentExtractionInput = {
    filePath: string;
    storageKey: string;
    extension: string;
};

export interface RagDocumentTextExtractor {
    supports(extension: string): boolean;
    extract(input: RagDocumentExtractionInput): Promise<string>;
}