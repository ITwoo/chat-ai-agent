import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from '@jest/globals';

import { AnalysisClientService } from './analysis-client.service';

const integrationDescribe =
    process.env.RUN_ANALYSIS_INTEGRATION === 'true'
        ? describe
        : describe.skip;

integrationDescribe(
    'AnalysisClientService Integration',
    () => {
        const configService = {
            getOrThrow: () => 'http://localhost:8001',
        };

        const service = new AnalysisClientService(
            configService as unknown as ConfigService,
        );

        it('실제 FastAPI 지출 요약 API를 호출한다', async () => {
            const result = await service.getSpendingSummary({
                userId: 1,
                startDate: '2026-08-01T00:00:00.000Z',
                endDate: '2026-09-01T00:00:00.000Z',
            });

            expect(result).toEqual(
                expect.objectContaining({
                    totalAmount: expect.any(Number),
                    count: expect.any(Number),
                    averageAmount: expect.any(Number),
                    categories: expect.any(Array),
                }),
            );
        });
    },
);