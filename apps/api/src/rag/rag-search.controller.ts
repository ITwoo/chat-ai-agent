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
import { RagSearchRequestDto } from './dto/rag-search-request.dto';

@Controller('rag/search')
@UseGuards(JwtGuard)
export class RagSearchController {
    constructor(
        private readonly ragSearchService: RagSearchService,
    ) {}

    @Post()
    search(
        @GetUser() user: AuthUser,
        @Body() body: RagSearchRequestDto,
    ) {
        return this.ragSearchService.search(
            user.id,
            body.query,
            body.limit,
        );
    }
}