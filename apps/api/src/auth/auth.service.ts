import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthCredentialDto } from './dto/auth-credential.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './types/jwt-payload.type';

type SignInResult = {
    accessToken: string;
    refreshToken: string;
}

type RefreshTokenSessionSummary = {
    id: number;
    tokenHash: string;
};

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private configService: ConfigService
    ) { }

    async signUp(authCredentialDto: AuthCredentialDto): Promise<void> {
        const { username, password } = authCredentialDto;

        const user = await this.prisma.user.findUnique({
            where: {
                username
            }
        });

        if (user) {
            throw new UnauthorizedException('Username already exists');
        }

        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(password, salt);

        await this.prisma.user.create({
            data: {
                username,
                password: hashedPassword
            }
        });
    }

    async signIn(authCredentialDto: AuthCredentialDto): Promise<SignInResult> {
        const { username, password } = authCredentialDto;

        const user = await this.prisma.user.findUnique({
            where: {
                username,
            },
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const payload = { sub: user.id, username: user.username };

        const accessToken = this.createAccessToken(payload);
        const refreshToken = this.createRefreshToken(payload);

        await this.saveRefreshTokenSession(user.id, refreshToken);

        return {
            accessToken,
            refreshToken,
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
        let payload: JwtPayload;

        try {
            payload = this.jwtService.verify<JwtPayload>(refreshToken, {
                secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
            });
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const user = await this.prisma.user.findUnique({
            where: {
                id: payload.sub,
            },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const activeSessions = await this.prisma.refreshTokenSession.findMany({
            where: {
                userId: user.id,
                revokedAt: null,
                expiresAt: {
                    gt: new Date(),
                },
            },
            select: {
                id: true,
                tokenHash: true,
            },
        });

        const matchedSession = await this.findMatchedRefreshTokenSession(
            refreshToken,
            activeSessions,
        );

        if(!matchedSession) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const accessToken = this.createAccessToken({
            sub: user.id,
            username: user.username,
        });

        return {
            accessToken,
        };
    }

    async logout(refreshToken: string): Promise<void> {
        let payload: JwtPayload;

        try {
            payload = this.jwtService.verify<JwtPayload>(refreshToken, {
                secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
            });
        } catch {
            return;
        }

        const activeSessions = await this.prisma.refreshTokenSession.findMany({
            where: {
                userId: payload.sub,
                revokedAt: null,
                expiresAt: {
                    gt: new Date(),
                },
            },
            select: {
                id: true,
                tokenHash: true,
            },
        });

        const matchedSession = await this.findMatchedRefreshTokenSession(
            refreshToken,
            activeSessions,
        );

        if (!matchedSession) {
            return;
        }

        await this.prisma.refreshTokenSession.update({
            where: {
                id: matchedSession.id,
            },
            data: {
                revokedAt: new Date(),
            },
        });
    }

    private createAccessToken(payload: JwtPayload): string {
        return this.jwtService.sign(payload);
    }

    private createRefreshToken(payload: JwtPayload): string {
        return this.jwtService.sign(payload, {
            secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
            expiresIn: Number(
                this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? 60 * 60 * 24 * 7,
            ),
        });
    }

    private async hashRefreshToken(refreshToken: string): Promise<string> {
        return bcrypt.hash(refreshToken, 10);
    }

    private getRefreshTokenExpiresAt(): Date {
        const expiresInSeconds = Number(
            this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? 60 * 60 * 24 * 7,
        );

        return new Date(Date.now() + expiresInSeconds * 1000);
    }

    private async saveRefreshTokenSession(
        userId: number,
        refreshToken: string,
    ): Promise<void> {
        const tokenHash = await this.hashRefreshToken(refreshToken);

        await this.prisma.refreshTokenSession.create({
            data: {
                userId,
                tokenHash,
                expiresAt: this.getRefreshTokenExpiresAt(),
            },
        });
    }

    private async findMatchedRefreshTokenSession(
        refreshToken: string,
        sessions: RefreshTokenSessionSummary[],
    ): Promise<RefreshTokenSessionSummary | null> {
        for (const session of sessions) {
            const isMatched = await bcrypt.compare(refreshToken, session.tokenHash);

            if (isMatched) {
                return session;
            }
        }

        return null;
    }

}
