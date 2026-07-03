import { Body, Controller, Get, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthCredentialDto } from './dto/auth-credential.dto';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from './decorator/get-user.decorator';
import type{ UserResponse } from '@repo/shared';
import type { User } from '../generated/prisma/client';
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('/signup')
    signUp(@Body(ValidationPipe) authCredentialDto: AuthCredentialDto): Promise<void> {
        return this.authService.signUp(authCredentialDto);
    }

    @Post('/signin')
    signIn(@Body(ValidationPipe) authCredentialDto: AuthCredentialDto): Promise<{ accessToken: string}> {
        return this.authService.signIn(authCredentialDto);
    }

    @Get('/me')
    @UseGuards(AuthGuard('jwt'))    
    getMe(@GetUser() user: User): UserResponse {
        return { id: user.id, username: user.username };
    }
        
}
