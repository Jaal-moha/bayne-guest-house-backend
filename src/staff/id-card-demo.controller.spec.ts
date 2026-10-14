import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  IdCardDemoController,
  parseDemoQuery,
} from './id-card-demo.controller';
import { StaffService } from './staff.service';

describe('parseDemoQuery', () => {
  it('fills every option the query leaves out with the production default', () => {
    expect(parseDemoQuery({ ids: '3' })).toEqual({
      ids: [3],
      options: {
        photo: 'passport',
        back: 'white',
        wordmark: 'ALMIS HOTEL',
        perPage: 1,
      },
    });
  });

  it('reads every option', () => {
    expect(
      parseDemoQuery({
        ids: '1,2,3',
        photo: 'compact',
        back: 'tint',
        wordmark: '  Bayne House ',
        perPage: '3',
      }),
    ).toEqual({
      ids: [1, 2, 3],
      options: {
        photo: 'compact',
        back: 'tint',
        wordmark: 'Bayne House',
        perPage: 3,
      },
    });
  });

  it.each([
    ['an unknown photo', { ids: '1', photo: 'huge' }],
    ['an unknown back', { ids: '1', back: 'black' }],
    ['a perPage other than 1 or 3', { ids: '1', perPage: '2' }],
    ['a repeated option', { ids: '1', photo: ['compact', 'passport'] }],
    ['no ids', {}],
    ['an empty id', { ids: '1,,2' }],
    ['a non-integer id', { ids: '1,2.5' }],
    ['a zero id', { ids: '0' }],
    [
      'thirteen ids',
      { ids: Array.from({ length: 13 }, (_, i) => i + 1).join(',') },
    ],
    ['a 25-character wordmark', { ids: '1', wordmark: 'A'.repeat(25) }],
  ])('rejects %s with 400', (_why, query) => {
    expect(() => parseDemoQuery(query)).toThrow(BadRequestException);
  });

  it('accepts twelve ids and a 24-character wordmark', () => {
    const ids = Array.from({ length: 12 }, (_, i) => i + 1);
    const { options } = parseDemoQuery({
      ids: ids.join(','),
      wordmark: 'A'.repeat(24),
    });
    expect(options.wordmark).toHaveLength(24);
  });
});

describe('IdCardDemoController.render', () => {
  const staff = (id: number) => ({
    id,
    name: `Staff ${id}`,
    role: 'reception',
    barcode: `EMP-10000${id}`,
    phone: 'UNKNOWN',
    photo: null,
  });
  const findForIdCard = jest.fn((id: number) =>
    id === 99
      ? Promise.reject(new NotFoundException('Staff not found'))
      : Promise.resolve(staff(id)),
  );
  const controller = new IdCardDemoController({
    findForIdCard,
  } as unknown as StaffService);

  it('serves the sheet inline as id-card-demo.pdf', async () => {
    const file = await controller.render({ ids: '1,2', perPage: '3' });
    expect(findForIdCard.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    expect(file.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: 'inline; filename="id-card-demo.pdf"',
    });
  });

  it('answers 404 when one of the ids is not staff', async () => {
    await expect(controller.render({ ids: '1,99' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
