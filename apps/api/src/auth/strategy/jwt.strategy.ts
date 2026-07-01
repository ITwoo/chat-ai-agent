import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') { // default strategy name is 'jwt'
    constructor(
        private prisma : PrismaService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: 'Secret1234',
        });
    }

    async validate(payload: any) {
        const { username } = payload;
        const user = await this.prisma.user.findUnique({
            where: {
                username: username
            }
        });

        if(!user) {
            throw new UnauthorizedException();
        }

        return user;
    }
}