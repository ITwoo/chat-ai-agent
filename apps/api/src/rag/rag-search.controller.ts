import {
    Body,
    Controller,
    Post,
    UseGuards,
} from '@nestjs/common';
import { GetUser } from '../auth/decorator/get-user.decorator';
import { JwtGuard } from '../auth/guard/jwt.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { RagSearchService } from './rag-search.service';

type RagSearchRequest = {
    query: string;
    limit?: number;
};

@Controller('rag/search')
@UseGuards(JwtGuard)
export class RagSearchController {
    constructor(
        private readonly ragSearchService: RagSearchService,
    ) {}

    @Post()
    search(
        @GetUser() user: AuthUser,
        @Body() body: RagSearchRequest,
    ) {
        return this.ragSearchService.search(
            user.id,
            body.query,
            body.limit,
        );
    }
}