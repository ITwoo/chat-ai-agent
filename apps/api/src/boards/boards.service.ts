import { Injectable, NotFoundException } from '@nestjs/common';
import { BoardStatus } from '@repo/shared';
import { CreateBoardDto } from './dto/create-board.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Board } from '../generated/prisma/client';
import { UpdateBoardDto } from './dto/update-board.dto';
import type{ AuthUser } from '../auth/types/auth-user.type';

@Injectable()
export class BoardsService {
    constructor (
         private readonly prisma: PrismaService,
    ) {}

    async createBoard(createBoardDto: CreateBoardDto, user: AuthUser): Promise<Board> {
        const { title, description } = createBoardDto;
        const board = this.prisma.board.create({
            data : {
                title,
                description,
                status: BoardStatus.PUBLIC,
                userId: user.id
            }
        });

        return board;
    }

    async getBoardById(id: number): Promise<Board> {
        const found = await this.prisma.board.findUnique({ where: { id } });
    
        if(!found) {
            throw new NotFoundException(`Can't find Board with id ${id}`);
        }

        return found;
    }

    async deleteBoard(id: number, user: AuthUser): Promise<void> {
        const result = await this.prisma.board.delete({ where: { id, userId: user.id } });
        console.log('result:', result);
        // if(result.affected === 0) {
        //     throw new NotFoundException(`Can't find Board with id ${id}`);
        // }
    }

    async updateBoard(id: number, updateBoardDto: UpdateBoardDto): Promise<Board> {
        const { title, description, status } = updateBoardDto;
        const board = await this.prisma.board.update({ where: { id }, data: { title, description, status } });
        
        return board;
    }

    async updateBoardStatus(id: number, status: BoardStatus): Promise<Board> {

        const board = await this.prisma.board.update({ where: { id }, data: { status } });
        
        return board;
    }

    async getAllBoards(user: AuthUser): Promise<Board[]> {
        return this.prisma.board.findMany({ where: { userId: user.id } });
    }
    
}