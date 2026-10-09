import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PASSWORD_CHANGE_JWT } from './jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @UseGuards(AuthGuard(PASSWORD_CHANGE_JWT))
  @Get('me')
  me(@Req() req: any) {
    return { user: req.user };
  }

  @UseGuards(AuthGuard(PASSWORD_CHANGE_JWT))
  @Post('change-password')
  @HttpCode(204)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(req.user.userId, dto);
  }
}
