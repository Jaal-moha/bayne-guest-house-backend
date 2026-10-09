import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  // checks credentials and returns the user (or throws)
  private async validateUser(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return user;
  }

  // ← this is the method your controller is calling
  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,   // 'admin' | 'manager' | ...
      name: user.name,
    };
    const access_token = await this.jwt.signAsync(payload);
    return { access_token, forceChangePassword: user.forceChangePassword };
  }

  // Tokens issued before the change stay valid.
  async changePassword(userId: number, { currentPassword, newPassword }: ChangePasswordDto) {
    const user = await this.users.findById(userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      throw new BadRequestException('New password must differ from the current password');
    }
    if (!(await this.users.setPassword(userId, user.password, await bcrypt.hash(newPassword, 10)))) {
      throw new ConflictException('Password was changed by another request. Try again');
    }
  }
}
