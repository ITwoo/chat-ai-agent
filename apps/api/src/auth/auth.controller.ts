import { Body, Controller, Get, HttpException, HttpStatus, Logger, Post, Req, Res, UnauthorizedException, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthCredentialDto } from './dto/auth-credential.dto';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from './decorator/get-user.decorator';
import type { LoginResponse, UserResponse } from '@repo/shared';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from './types/auth-user.type';
import { RedisRateLimitService } from '../redis/redis-rate-limit.service';

type RequestWithCookies = Request & {
    cookies?: {
        refreshToken?: string;
    };
};

const SIGNIN_RATE_LIMIT = 10;
const SIGNIN_RATE_LIMIT_WINDOW_MS = 60_000;

@Controller('auth')
export class AuthController {
    private logger = new Logger('AuthController');

    constructor(
        private authService: AuthService,
        private configService: ConfigService,
        private readonly redisRateLimitService: RedisRateLimitService,
    ) { }

    @Post('/signup')
    signUp(@Body(ValidationPipe) authCredentialDto: AuthCredentialDto): Promise<void> {
        return this.authService.signUp(authCredentialDto);
    }

    @Post('/signin')
    async signIn(
        @Body(ValidationPipe) authCredentialDto: AuthCredentialDto,
        @Res({ passthrough: true }) response: Response,
    ): Promise<LoginResponse> {
        const rateLimit = await this.redisRateLimitService.consume(
            `rate-limit:signin:${authCredentialDto.username}`,
            SIGNIN_RATE_LIMIT,
            SIGNIN_RATE_LIMIT_WINDOW_MS,
        );

        if (!rateLimit.allowed) {
            throw new HttpException(
                '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const { accessToken, refreshToken } = await this.authService.signIn(authCredentialDto);

        const refreshTokenExpiresInSeconds = Number(
            this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? 60 * 60 * 24 * 7,
        );
        this.logger.log(refreshTokenExpiresInSeconds)
        const sameSite = this.configService.get<string>('NODE_ENV') === 'production' ? 'lax' : 'none';

        response.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true, //this.configService.get<string>('NODE_ENV') === 'production',
            sameSite: sameSite,
            path: '/api/auth',
            maxAge: refreshTokenExpiresInSeconds * 1000,
        });

        return { accessToken }
    }

    @Post('/logout')
    async logout(
        @Req() request: RequestWithCookies,
        @Res({ passthrough: true }) response: Response,
    ): Promise<void> {
        const refreshToken = request.cookies?.refreshToken;

        if (refreshToken) {
            await this.authService.logout(refreshToken);
        }

        const sameSite = this.configService.get<string>('NODE_ENV') === 'production' ? 'lax' : 'none';
        this.logger.log(sameSite)
        response.clearCookie('refreshToken', {
            httpOnly: true,
            secure: true,
            sameSite: sameSite,
            path: '/api/auth',
        });
    }

    @Post('/refresh')
    refresh(
        @Req() request: RequestWithCookies,
    ): Promise<LoginResponse> {
        const refreshToken = request.cookies?.refreshToken;

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token not found');
        }

        return this.authService.refreshAccessToken(refreshToken);
    }

    @Get('/me')
    @UseGuards(AuthGuard('jwt'))
    getMe(@GetUser() user: AuthUser): UserResponse {
        return { id: user.id, username: user.username };
    }


}
