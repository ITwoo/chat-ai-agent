import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthCredentialDto } from './dto/auth-credential.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
    constructor(private prisma: PrismaService, private jwtService: JwtService) {}

    async signUp(authCredentialDto: AuthCredentialDto): Promise<void> {
        const { username, password } = authCredentialDto;

        const user = await this.prisma.user.findUnique({
            where: {
                username
            }
        });

        if(user) {
            throw new UnauthorizedException('Username already exists');
        }
    
        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(password, salt);

        await this.prisma.user.create({
            data : {
                username,
                password: hashedPassword
            }
        });
    }

    async signIn(authCredentialDto: AuthCredentialDto): Promise<{ accessToken: string }> {

        const { username, password } = authCredentialDto;

        const user = await this.prisma.user.findUnique({
            where: {
                username
            }
        });

        if(user && await bcrypt.compare(password, user.password)) {
            const payload = { username: user.username };
            const accessToken = this.jwtService.sign(payload);

            return { accessToken };
        } else {
            throw new UnauthorizedException('Invalid credentials');
        }
    }
}
