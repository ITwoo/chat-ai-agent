import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import { AuthUser } from "../types/auth-user.type";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') { // default strategy name is 'jwt'
    constructor(
        private prisma : PrismaService,
        configService: ConfigService
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
        });
    }

    async validate(payload: any): Promise<AuthUser> {
        const { sub, username } = payload;
        
        const user = await this.prisma.user.findUnique({
            where: {
                id: sub
            },
            select: {
                id: true,
                username: true,
            }
        });

        if(!user) {
            throw new UnauthorizedException();
        }

        return user;
    }
}