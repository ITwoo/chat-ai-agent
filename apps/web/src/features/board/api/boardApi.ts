import type { UpdateBoardRequest } from '@repo/shared';
import { http } from '../../../api/http';
import type {
    BoardResponse,
    CreateBoardRequest,
} from '@repo/shared/src/board';

export const boardApi = {
    findAll(): Promise<BoardResponse[]> {
        return http<BoardResponse[]>('/boards');
    },

    findOne(id: number): Promise<BoardResponse> {
        return http<BoardResponse>(`/boards/${id}`);
    },

    create(data: CreateBoardRequest): Promise<BoardResponse> {
        return http<BoardResponse>('/boards', {
            method: 'POST',
            body: data,
        });
    },

    update(id: number, data: UpdateBoardRequest): Promise<BoardResponse> {
        return http<BoardResponse>(`/boards/${id}`, {
            method: 'PATCH',
            body: data,
        });
    },

    remove(id: number): Promise<void> {
        return http<void>(`/boards/${id}`, {
            method: 'DELETE',
        });
    },
};