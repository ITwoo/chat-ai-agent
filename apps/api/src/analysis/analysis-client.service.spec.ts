import { ConfigService } from '@nestjs/config';

import { AnalysisClientService } from './analysis-client.service';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('AnalysisClientService', () => {
    let service: AnalysisClientService;
    const fetchMock = jest.fn<typeof fetch>();
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        const configService = {
            getOrThrow: jest
                .fn()
                .mockReturnValue('http://localhost:8001/'),
        };

        service = new AnalysisClientService(
            configService as unknown as ConfigService,
        );

        fetchMock.mockReset();
        globalThis.fetch = fetchMock;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('지출 요약 요청을 Analysis Service로 전달한다', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                totalAmount: 80000,
                count: 3,
                averageAmount: 26666.67,
                topCategory: '식비',
                categories: [
                    {
                        category: '식비',
                        amount: 80000,
                        count: 3,
                        percentage: 100,
                    },
                ],
            }),
        } as Response);

        const result = await service.getSpendingSummary({
            userId: 1,
            startDate: '2026-08-01T00:00:00.000Z',
            endDate: '2026-09-01T00:00:00.000Z',
            category: '식비',
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, options] = fetchMock.mock.calls[0];

        expect(url).toBe(
            'http://localhost:8001/analysis/spending/summary',
        );

        expect(options).toEqual(
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: 1,
                    startDate: '2026-08-01T00:00:00.000Z',
                    endDate: '2026-09-01T00:00:00.000Z',
                    category: '식비',
                }),
            }),
        );

        expect(options?.signal).toBeDefined();

        expect(result).toEqual({
            totalAmount: 80000,
            count: 3,
            averageAmount: 26666.67,
            topCategory: '식비',
            categories: [
                {
                    category: '식비',
                    amount: 80000,
                    count: 3,
                    percentage: 100,
                },
            ],
        });
    });

    it('Analysis Service 오류 응답을 예외로 변환한다', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 503,
            text: async () => 'Service Unavailable',
        } as Response);

        await expect(
            service.getSpendingSummary({
                userId: 1,
                startDate: '2026-08-01T00:00:00.000Z',
                endDate: '2026-09-01T00:00:00.000Z',
            }),
        ).rejects.toThrow(
            'Analysis Service 요청 실패: 503 Service Unavailable',
        );
    });
});