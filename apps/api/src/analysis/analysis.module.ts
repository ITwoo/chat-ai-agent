import { Module } from '@nestjs/common';
import { AnalysisClientService } from './analysis-client.service';

@Module({
    providers: [AnalysisClientService],
    exports: [AnalysisClientService],
})
export class AnalysisModule {}