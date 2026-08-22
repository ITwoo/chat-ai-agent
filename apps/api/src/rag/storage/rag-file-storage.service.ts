export abstract class RagFileStorageService {
    abstract write(storageKey: string, data: Buffer): Promise<void>;
    abstract read(storageKey: string): Promise<Buffer | null>;
    abstract exists(storageKey: string): Promise<boolean>;
    abstract delete(storageKey: string): Promise<void>;
}