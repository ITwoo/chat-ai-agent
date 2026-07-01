import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { BoardStatus } from '@repo/shared';
import { Board_Status } from '@repo/shared';
import { v1 as uuid } from 'uuid';
import { CreateBoardDto } from './dto/create-board.dto';
import { PrismaService } from '../prisma/prisma.service';
import { user, board } from '../generated/prisma/client';

@Injectable()
export class BoardsService {
    constructor (
         private readonly prisma: PrismaService,
    ) {}

    async createBoard(createBoardDto: CreateBoardDto, user: user): Promise<board> {
        const { title, description } = createBoardDto;
        const board = this.prisma.board.create({
            data : {
                title,
                description,
                status: Board_Status.PUBLIC,
                userId: user.id
            }
        });

        return board;
    }

    async getBoardById(id: number): Promise<board> {
        const found = await this.prisma.board.findUnique({ where: { id } });
    
        if(!found) {
            throw new NotFoundException(`Can't find Board with id ${id}`);
        }

        return found;
    }

    async deleteBoard(id: number, user: user): Promise<void> {
        const result = await this.prisma.board.delete({ where: { id, userId: user.id } });
        console.log('result:', result);
        // if(result.affected === 0) {
        //     throw new NotFoundException(`Can't find Board with id ${id}`);
        // }
    }

    async updateBoardStatus(id: number, status: BoardStatus): Promise<board> {

        const board = await this.prisma.board.update({ where: { id }, data: { status } });
        
        return board;
    }

    async getAllBoards(user: user): Promise<board[]> {
        return this.prisma.board.findMany({ where: { userId: user.id } });
    }
    
}