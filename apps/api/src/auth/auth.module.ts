import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasskeysService } from './passkeys.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasskeysService],
  exports: [AuthService, PasskeysService],
})
export class AuthModule {}
