import { createParamDecorator } from "@nestjs/common";

interface User {
    id: number;
    username: string;
}

export const GetUser = createParamDecorator((data, ctx): User => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
})