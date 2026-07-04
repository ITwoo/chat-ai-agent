import type { User } from '../../generated/prisma/client';

export type SocketUser = Pick<User, 'id' | 'username'>;
