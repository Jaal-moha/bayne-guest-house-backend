import { ForbiddenException } from '@nestjs/common';
import { PassThrough } from 'stream';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

function pdfResponse() {
  const res = new PassThrough() as PassThrough & { setHeader: jest.Mock };
  res.setHeader = jest.fn();
  res.resume();
  return res;
}

describe('StaffController.getIdCard', () => {
  const staff7 = {
    id: 7,
    name: 'Hanna',
    barcode: 'EMP-100007',
    user: { id: 9 },
  };
  const staffService = { findOne: jest.fn().mockResolvedValue(staff7) };
  const controller = new StaffController(
    staffService as unknown as StaffService,
  );

  it('refuses a user whose User.id equals the Staff.id but who is linked to other staff', async () => {
    const req = { user: { userId: 7, role: 'reception' } };
    await expect(
      controller.getIdCard(7, req, pdfResponse() as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('serves the card to the user linked to that staff row', async () => {
    const req = { user: { userId: 9, role: 'reception' } };
    const res = pdfResponse();
    await controller.getIdCard(7, req, res as any);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
  });
});
