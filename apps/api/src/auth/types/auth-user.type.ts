import { User } from "../../generated/prisma/client";

export type AuthUser = Pick<User, 'id' | 'username'>;