export function serializeVector(vector: number[]): string {
    if (vector.length === 0) {
        throw new Error('빈 벡터는 직렬화할 수 없습니다.');
    }

    if (!vector.every(Number.isFinite)) {
        throw new Error('벡터에 유효하지 않은 숫자가 포함돼 있습니다.');
    }

    return `[${vector.join(',')}]`;
}