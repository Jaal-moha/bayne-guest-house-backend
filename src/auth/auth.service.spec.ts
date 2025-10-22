import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock; };
  let jwtService: { signAsync: jest.Mock; };

  beforeEach(async () => {
    usersService = { findByEmail: jest.fn() };
    jwtService = { signAsync: jest.fn().mockResolvedValue('token') } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should login with valid credentials', async () => {
    const password = 'secret';
    const hash = await bcrypt.hash(password, 8);
    usersService.findByEmail.mockResolvedValue({
      id: 1,
      email: 'a@b.com',
      name: 'A',
      role: 'admin',
      password: hash,
    });

    const res = await service.login('a@b.com', password);
    expect(res).toEqual({ access_token: 'token' });
    expect(jwtService.signAsync).toHaveBeenCalled();
  });

  it('should reject invalid password', async () => {
    const hash = await bcrypt.hash('secret', 8);
    usersService.findByEmail.mockResolvedValue({
      id: 1,
      email: 'a@b.com',
      name: 'A',
      role: 'admin',
      password: hash,
    });

    await expect(service.login('a@b.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
