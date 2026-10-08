import { nights } from './nights';

describe('nights', () => {
  const at = (iso: string) => new Date(iso);

  it.each([
    ['2026-11-01T12:00:00Z', '2026-11-03T10:00:00Z', 1],
    ['2026-11-01T12:00:00Z', '2026-11-03T12:00:00Z', 2],
    ['2026-11-01T12:00:00Z', '2026-11-03T14:00:00Z', 2],
    ['2026-11-01T12:00:00Z', '2026-11-01T18:00:00Z', 1],
  ])('bills %s to %s as %i nights', (checkIn, checkOut, expected) => {
    expect(nights(at(checkIn), at(checkOut))).toBe(expected);
  });
});
