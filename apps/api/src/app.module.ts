import { Module } from '@nestjs/common';
import { BoardsModule } from './boards/boards.module';

import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),    
    PrismaModule,
    AuthModule,
    BoardsModule,
    ChatModule,
  ],
  controllers: [],
  providers: [],
}) 
export class AppModule {}
