import { Body, Controller, Delete, Get, Logger, Param, ParseIntPipe, Patch, Post, Put, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { BoardsService } from './boards.service';
import type { BoardStatus } from '@repo/shared';
import { CreateBoardDto } from './dto/create-board.dto';
import { BoardStatusValidationPipe } from './pipes/board-status-validation.pipe';

import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/decorator/get-user.decorator';
import type { Board } from '../generated/prisma/client';
import { JwtGuard } from '../auth/guard/jwt.guard';
import { UpdateBoardDto } from './dto/update-board.dto';
import type { AuthUser } from '../auth/types/auth-user.type';

@Controller('boards')
@UseGuards(JwtGuard)
export class BoardsController {
    private logger = new Logger('BoardsController');
    constructor(private boardsService: BoardsService) {}

    @Post()
    createBoard(
        @Body() createBoardDto: CreateBoardDto,
        @GetUser() user: AuthUser,
    ): Promise<Board> {
        this.logger.verbose(`User "${user.username}" creating a new board. Data: ${JSON.stringify(createBoardDto)}`);
        
        return this.boardsService.createBoard(createBoardDto, user);
    }

    @Get('/:id' )
    getBoardById(@Param('id', ParseIntPipe) id: number, @GetUser() user: AuthUser) : Promise<Board> {
        this.logger.verbose(`User "${user.username}" getting board "${id}".`);
        return this.boardsService.getBoardById(id);
    }

    @Delete('/:id')
    deleteBoard(@Param('id', ParseIntPipe) id: number, @GetUser() user: AuthUser): Promise<void> {
        this.logger.verbose(`User "${user.username}" deleting board "${id}".`);
        return this.boardsService.deleteBoard(id, user);
    }

    @Patch('/:id')
    updateBoard(@Param('id', ParseIntPipe) id: number, @Body() updateBoardDto: UpdateBoardDto, @GetUser() user: AuthUser): Promise<Board> {
        this.logger.verbose(
            `User "${user.username}" updating board "${id}". Data: ${JSON.stringify(updateBoardDto)}`,
        );
        return this.boardsService.updateBoard(id, updateBoardDto);
    }

    @Patch('/:id/status')
    updateBoardStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body('status', BoardStatusValidationPipe) status: BoardStatus,
        @GetUser() user: AuthUser
    ): Promise<Board> {
        this.logger.verbose(
            `User "${user.username}" updating board "${id}" status to "${status}".`,
        );
        return this.boardsService.updateBoardStatus(id, status);
    }

    @Get()
    getAllBoards(@GetUser() user: AuthUser): Promise<Board[]> {
        this.logger.verbose(`User "${user.username}" getting all boards`);
        return this.boardsService.getAllBoards(user);
    }
}
