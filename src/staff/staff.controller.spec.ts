import { ForbiddenException } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

describe('StaffController.getIdCard', () => {
  const staff7 = {
    id: 7,
    name: 'Hanna',
    role: 'reception',
    barcode: 'EMP-100007',
    user: { id: 9 },
    photo: null,
  };
  const staffService = { findForIdCard: jest.fn().mockResolvedValue(staff7) };
  const controller = new StaffController(
    staffService as unknown as StaffService,
  );

  it('refuses a user whose User.id equals the Staff.id but who is linked to other staff', async () => {
    const req = { user: { userId: 7, role: 'reception' } };
    await expect(controller.getIdCard(7, req)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it.each([
    ['the user linked to that staff row', { userId: 9, role: 'reception' }],
    ['a manager', { userId: 2, role: 'manager' }],
    ['an admin', { userId: 1, role: 'admin' }],
  ])('serves the card inline to %s', async (_who, user) => {
    const file = await controller.getIdCard(7, { user });
    expect(file.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: 'inline; filename="staff-EMP-100007.pdf"',
    });
  });
});
