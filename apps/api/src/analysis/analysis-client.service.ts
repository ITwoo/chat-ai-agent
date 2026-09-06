import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SpendingSummaryRequest = {
    userId: number;
    startDate: string;
    endDate: string;
    category?: string;
};

type CategorySummary = {
    category: string;
    amount: number;
    count: number;
    percentage: number;
};

export type SpendingSummaryResponse = {
    totalAmount: number;
    count: number;
    averageAmount: number;
    topCategory: string | null;
    categories: CategorySummary[];
};

type SpendingComparisonRequest = {
    userId: number;
    currentStartDate: string;
    currentEndDate: string;
    previousStartDate: string;
    previousEndDate: string;
};

export type SpendingComparisonResponse = {
    currentTotalAmount: number;
    previousTotalAmount: number;
    difference: number;
    changeRate: number | null;
    categories: {
        category: string;
        currentAmount: number;
        previousAmount: number;
        difference: number;
        changeRate: number | null;
    }[];
};

type SpendingTrendRequest = {
    userId: number;
    startDate: string;
    endDate: string;
    category?: string;
    granularity: 'day' | 'month';
};

export type SpendingTrendResponse = {
    granularity: 'day' | 'month';
    points: {
        period: string;
        amount: number;
        count: number;
        changeRate: number | null;
        movingAverage: number;
    }[];
};

type SpendingAnomalyRequest = {
    userId: number;
    startDate: string;
    endDate: string;
    category?: string;
    threshold?: number;
};

export type SpendingAnomalyResponse = {
    threshold: number;
    anomalies: {
        id: number;
        title: string;
        category: string;
        amount: number;
        spentAt: string;
        categoryAverage: number;
        zScore: number | null;
    }[];
};

type SpendingForecastRequest = {
    userId: number;
    asOfDate: string;
    category?: string;
};

export type SpendingForecastResponse = {
    currentAmount: number;
    forecastAmount: number;
    dailyAverage: number;
    daysInMonth: number;
    elapsedDays: number;
    remainingDays: number;
    method: 'daily_average';
};

@Injectable()
export class AnalysisClientService {
    private readonly baseUrl: string;

    constructor(configService: ConfigService) {
        this.baseUrl = configService
            .getOrThrow<string>('ANALYSIS_SERVICE_URL')
            .replace(/\/$/, '');
    }

    private async post<TRequest, TResponse>(
        path: string,
        request: TRequest,
    ): Promise<TResponse> {
        const response = await fetch(
            `${this.baseUrl}${path}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(5_000),
            },
        );

        if (!response.ok) {
            const body = await response.text();

            throw new Error(
                `Analysis Service 요청 실패: ${response.status} ${body}`,
            );
        }

        return response.json() as Promise<TResponse>;
    }

    async getSpendingSummary(
        request: SpendingSummaryRequest,
    ): Promise<SpendingSummaryResponse> {
        return this.post<
            SpendingSummaryRequest,
            SpendingSummaryResponse
        >(
            '/analysis/spending/summary',
            request,
        );
    }

    async getSpendingComparison(
        request: SpendingComparisonRequest,
    ): Promise<SpendingComparisonResponse> {
        return this.post<
            SpendingComparisonRequest,
            SpendingComparisonResponse
        >(
            '/analysis/spending/comparison',
            request,
        );
    }

    async getSpendingTrend(
        request: SpendingTrendRequest,
    ): Promise<SpendingTrendResponse> {
        return this.post<
            SpendingTrendRequest,
            SpendingTrendResponse
        >(
            '/analysis/spending/trend',
            request,
        );
    }

    async getSpendingAnomalies(
        request: SpendingAnomalyRequest,
    ): Promise<SpendingAnomalyResponse> {
        return this.post<
            SpendingAnomalyRequest,
            SpendingAnomalyResponse
        >(
            '/analysis/spending/anomalies',
            request,
        );
    }

    async getSpendingForecast(
        request: SpendingForecastRequest,
    ): Promise<SpendingForecastResponse> {
        return this.post<
            SpendingForecastRequest,
            SpendingForecastResponse
        >(
            '/analysis/spending/forecast',
            request,
        );
    }
}