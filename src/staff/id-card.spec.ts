import * as fs from 'fs';
import * as path from 'path';
import { inflateSync } from 'zlib';
import { IdCard, renderIdCards } from './id-card';

const JPEG = fs.readFileSync(
  path.join(__dirname, '__fixtures__', 'headshot.jpg'),
);

const pdfBytes = (card: IdCard) => sheetBytes([card]);

function sheetBytes(cards: IdCard[]): Promise<Buffer> {
  const doc = renderIdCards(cards);
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

type PdfObject = { dict: string; stream?: Buffer };

function pdfObjects(pdf: Buffer): Map<number, PdfObject> {
  const raw = pdf.toString('latin1');
  const objects = new Map<number, PdfObject>();
  const header = /(\d+) 0 obj\s*/g;
  for (let m = header.exec(raw); m; m = header.exec(raw)) {
    const start = header.lastIndex;
    const streamAt = raw.indexOf('stream', start);
    const endAt = raw.indexOf('endobj', start);
    if (streamAt < 0 || streamAt > endAt) {
      objects.set(Number(m[1]), { dict: raw.slice(start, endAt) });
      continue;
    }
    const dict = raw.slice(start, streamAt);
    const length = Number(/\/Length (\d+)/.exec(dict)![1]);
    const dataAt = streamAt + 'stream\n'.length;
    let stream = pdf.subarray(dataAt, dataAt + length);
    if (dict.includes('/FlateDecode')) stream = inflateSync(stream);
    objects.set(Number(m[1]), { dict, stream });
    header.lastIndex = dataAt + length;
  }
  return objects;
}

function toUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  const decode = (hex: string) =>
    Buffer.from(hex, 'hex').swap16().toString('utf16le');
  for (const [, from, values] of cmap.matchAll(
    /<([0-9a-f]+)> <[0-9a-f]+> \[([^\]]*)\]/gi,
  )) {
    [...values.matchAll(/<([0-9a-f]+)>/gi)].forEach(([, hex], i) =>
      map.set(parseInt(from, 16) + i, decode(hex)),
    );
  }
  return map;
}

const ref = (dict: string, key: string) =>
  Number(new RegExp(`/${key} (\\d+) 0 R`).exec(dict)![1]);

function pages(pdf: Buffer) {
  const objects = pdfObjects(pdf);
  return [...objects.values()]
    .filter((o) => /\/Type \/Page\b/.test(o.dict))
    .map((page) => ({
      page,
      objects,
      content: objects
        .get(ref(page.dict, 'Contents'))!
        .stream!.toString('latin1'),
    }));
}

function pdfText(pdf: Buffer): string {
  return pages(pdf).map(pageText).join('\n');
}

function pageText({ page, objects, content }: ReturnType<typeof pages>[0]) {
  const resources = objects.get(ref(page.dict, 'Resources'))!.dict;
  const fonts = new Map<string, Map<number, string>>();
  for (const [, name, id] of resources.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    const font = objects.get(Number(id))!;
    fonts.set(
      name,
      toUnicode(
        objects.get(ref(font.dict, 'ToUnicode'))!.stream!.toString('latin1'),
      ),
    );
  }
  const lines: string[] = [];
  let font = new Map<number, string>();
  for (const [, fontName, shown] of content.matchAll(
    /\/(F\d+) [\d.]+ Tf|\[([^\]]*)\] TJ/g,
  )) {
    if (fontName) font = fonts.get(fontName)!;
    else
      lines.push(
        [...shown.matchAll(/<([0-9a-f]+)>/gi)]
          .flatMap(([, hex]) =>
            hex
              .match(/.{4}/g)!
              .map((cid) => font.get(parseInt(cid, 16)) ?? '?'),
          )
          .join(''),
      );
  }
  return lines.join('\n');
}

const PT_PER_MM = 72 / 25.4;
const A4_HEIGHT = 841.89;

function inkExtentMm({ content }: ReturnType<typeof pages>[0]) {
  const ys: number[] = [];
  const xs: number[] = [];
  const points = (nums: number[]) =>
    nums.forEach((v, i) => (i % 2 ? ys : xs).push(v));
  let baseline: [number, number] | undefined;
  for (const line of content.split('\n')) {
    const nums = line.split(' ').slice(0, -1).map(Number);
    const op = line.split(' ').at(-1);
    if (op === 'm' || op === 'l' || op === 'c') points(nums);
    else if (op === 're') {
      const [x, y, w, h] = nums;
      points([x, y, x + w, y + h]);
    } else if (op === 'Tm') baseline = [nums[4], A4_HEIGHT - nums[5]];
    else if (op === 'Tf' && baseline) {
      const size = nums[1];
      xs.push(baseline[0]);
      ys.push(baseline[1] - size, baseline[1] + 0.3 * size);
      baseline = undefined;
    }
  }
  const mm = (v: number) => v / PT_PER_MM;
  return {
    top: mm(Math.min(...ys)),
    bottom: mm(A4_HEIGHT - Math.max(...ys)),
    left: mm(Math.min(...xs)),
    right: mm(595.28 - Math.max(...xs)),
  };
}

const pageCount = (pdf: Buffer) =>
  pdf.toString('latin1').match(/\/Type \/Page\b/g)!.length;
const mediaBox = (pdf: Buffer) =>
  /\/MediaBox \[([^\]]+)\]/.exec(pdf.toString('latin1'))![1];

describe('renderIdCard', () => {
  const card: IdCard = {
    name: 'Selam Tesfaye',
    role: 'Reception',
    code: 'EMP-482913',
    issued: new Date('2026-10-12T08:00:00Z'),
  };

  it('lays the card pair out on a single A4 page', async () => {
    const pdf = await pdfBytes(card);
    expect(pageCount(pdf)).toBe(1);
    expect(mediaBox(pdf)).toBe('0 0 595.28 841.89');
  });

  it('prints the name, role, barcode and issue month', async () => {
    const text = await pdfBytes(card).then(pdfText);
    expect(text).toContain('Selam Tesfaye');
    expect(text).toContain('Reception');
    expect(text).toContain('EMP-482913');
    expect(text).toContain('Issued Oct 2026');
  });

  it('dates the card in Addis Ababa time, where the month turns three hours before UTC', async () => {
    const text = await pdfBytes({
      ...card,
      issued: new Date('2026-10-31T22:00:00Z'),
    }).then(pdfText);
    expect(text).toContain('Issued Nov 2026');
  });

  it('shows the photo placeholder when there is no photo', async () => {
    const pdf = await pdfBytes(card);
    expect(pdfText(pdf)).toContain('Photo');
    expect(pdf.toString('latin1')).not.toContain('/Subtype /Image');
  });

  it('embeds a JPEG photo in place of the placeholder', async () => {
    const pdf = await pdfBytes({ ...card, photo: JPEG });
    expect(pdf.toString('latin1')).toContain('/Filter /DCTDecode');
    expect(pdfText(pdf).split('\n')).not.toContain('Photo');
  });

  it('prints an Ethiopic name', async () => {
    const text = await pdfBytes({ ...card, name: 'አበበ ከበደ' }).then(pdfText);
    expect(text).toContain('አበበ ከበደ');
  });
});

describe('renderIdCards', () => {
  const cards: IdCard[] = Array.from({ length: 7 }, (_, i) => ({
    name: `Hanna Girma ${i + 1}`,
    role: 'Barista',
    code: `EMP-00000${i + 1}`,
    issued: new Date('2026-10-12T08:00:00Z'),
  }));
  const pt = (v: number) => String(Math.round(v * PT_PER_MM * 1e6) / 1e6);
  const TINT = '0.9450980392156862 0.9411764705882353 0.9254901960784314 scn';

  it.each([
    [1, 1],
    [3, 1],
    [4, 2],
    [7, 3],
  ])(
    'puts three card pairs on each page, so %i cards take %i page(s)',
    async (count, expected) => {
      const pdf = await sheetBytes(cards.slice(0, count));
      expect(pageCount(pdf)).toBe(expected);
      expect(mediaBox(pdf)).toBe('0 0 595.28 841.89');
    },
  );

  it('keeps the card order, filling each page top to bottom', async () => {
    const pdf = await sheetBytes(cards.slice(0, 4));
    const codes = pages(pdf).map((page) =>
      pageText(page)
        .split('\n')
        .filter((line) => line.startsWith('EMP-')),
    );
    expect(codes).toEqual([
      ['EMP-000001', 'EMP-000002', 'EMP-000003'],
      ['EMP-000004'],
    ]);
  });

  it('prints exactly the agreed lines on a card, with the ALMIS HOTEL wordmark on both faces', async () => {
    const lines = await sheetBytes(cards.slice(0, 1))
      .then(pdfText)
      .then((t) => t.split('\n'));
    expect(lines).toEqual([
      'Print at 100% (actual size). Cut on the corner marks, fold on the dashed line so the photo and QR face out, then laminate.',
      'ALMIS',
      'HOTEL',
      'STAFF',
      'Photo',
      'Hanna Girma 1',
      'Barista',
      'ALMIS',
      'HOTEL',
      'EMP-000001',
      'Scan at the door to clock in and out. If found, ',
      'please return to reception.',
      'ካገኙት እባክዎ ለእንግዳ መቀበያ ይመልሱ።',
      'Issued Oct 2026',
    ]);
  });

  it('draws a 35 x 45 mm passport photo box on a tinted back', async () => {
    const pdf = await sheetBytes(cards.slice(0, 3));
    const content = pages(pdf)[0].content;
    expect(
      content.split(` ${pt(35)} ${pt(45)} re\n`).length - 1,
    ).toBeGreaterThanOrEqual(3);
    expect(content.split(TINT).length - 1).toBe(3);
  });

  it('keeps every mark and line of text at least 8 mm inside each page edge', async () => {
    for (const page of pages(await sheetBytes(cards))) {
      const ink = inkExtentMm(page);
      expect(ink.top).toBeGreaterThanOrEqual(8);
      expect(ink.bottom).toBeGreaterThanOrEqual(8);
      expect(ink.left).toBeGreaterThanOrEqual(8);
      expect(ink.right).toBeGreaterThanOrEqual(8);
    }
  });
});
