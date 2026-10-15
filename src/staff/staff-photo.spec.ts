import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { MAX_PHOTO_BYTES, parseStaffPhoto } from './staff-photo';

const JPEG = fs.readFileSync(
  path.join(__dirname, '__fixtures__', 'headshot.jpg'),
);
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe('parseStaffPhoto', () => {
  it('accepts a JPEG and names its type from the bytes', () => {
    expect(parseStaffPhoto(JPEG)).toEqual({ data: JPEG, mime: 'image/jpeg' });
  });

  it('accepts a PNG', () => {
    expect(parseStaffPhoto(PNG_HEADER).mime).toBe('image/png');
  });

  it('rejects a text file', () => {
    expect(() => parseStaffPhoto(Buffer.from('just some notes\n'))).toThrow(
      BadRequestException,
    );
  });

  it('rejects a missing or empty upload', () => {
    expect(() => parseStaffPhoto(undefined)).toThrow(BadRequestException);
    expect(() => parseStaffPhoto(Buffer.alloc(0))).toThrow(BadRequestException);
  });

  it('rejects a JPEG over 2 MB and accepts one at exactly 2 MB', () => {
    const atLimit = Buffer.concat([
      JPEG,
      Buffer.alloc(MAX_PHOTO_BYTES - JPEG.length),
    ]);
    expect(parseStaffPhoto(atLimit).mime).toBe('image/jpeg');
    expect(() =>
      parseStaffPhoto(Buffer.concat([atLimit, Buffer.alloc(1)])),
    ).toThrow(BadRequestException);
  });
});
