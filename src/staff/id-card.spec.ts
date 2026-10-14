import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { inflateSync } from 'zlib';
import {
  DEFAULT_ID_CARD_OPTIONS,
  IdCard,
  IdCardOptions,
  renderIdCard,
  renderIdCards,
} from './id-card';

const JPEG = fs.readFileSync(
  path.join(__dirname, '__fixtures__', 'headshot.jpg'),
);

const pdfBytes = (card: IdCard) => docBytes(renderIdCard(card));
const sheetBytes = (cards: IdCard[], options: Partial<IdCardOptions> = {}) =>
  docBytes(renderIdCards(cards, { ...DEFAULT_ID_CARD_OPTIONS, ...options }));

function docBytes(doc: PDFKit.PDFDocument): Promise<Buffer> {
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

function pdfText(pdf: Buffer): string {
  const objects = pdfObjects(pdf);
  const ref = (dict: string, key: string) =>
    Number(new RegExp(`/${key} (\\d+) 0 R`).exec(dict)![1]);
  const page = [...objects.values()].find((o) =>
    /\/Type \/Page\b/.test(o.dict),
  )!;
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
  const content = objects
    .get(ref(page.dict, 'Contents'))!
    .stream!.toString('latin1');
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

const drawingStreams = (pdf: Buffer) =>
  [...pdfObjects(pdf).values()]
    .filter((o) => !/\/Subtype|\/Length1|\/Type \/XObject/.test(o.dict))
    .flatMap((o) => (o.stream ? [o.stream] : []));
const drawing = (pdf: Buffer) =>
  drawingStreams(pdf)
    .map((s) => s.toString('latin1'))
    .join('\n');
function contentDigest(pdf: Buffer): string {
  const hash = createHash('sha256');
  for (const stream of drawingStreams(pdf)) hash.update(stream);
  return hash.digest('hex');
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

  it('draws the production sheet exactly as before', async () => {
    expect(contentDigest(await pdfBytes(card))).toMatchInlineSnapshot(
      `"381fa25a086baf45a0bbcfeb7fcb8c4c9e3b0f1bf49726b37f40c789638d8419"`,
    );
    expect(
      contentDigest(await pdfBytes({ ...card, photo: JPEG })),
    ).toMatchInlineSnapshot(
      `"41be1381d8fa8c0c3ac13d1626d9bf848052313ac7cfd256b102f7e6adec04b8"`,
    );
  });

  it('draws the production sheet when the options are the defaults', async () => {
    const production = contentDigest(await pdfBytes(card));
    expect(contentDigest(await docBytes(renderIdCards([card])))).toBe(
      production,
    );
    expect(contentDigest(await sheetBytes([card]))).toBe(production);
  });
});

describe('renderIdCards options', () => {
  const card: IdCard = {
    name: 'Selam Tesfaye',
    role: 'Reception',
    code: 'EMP-482913',
    issued: new Date('2026-10-12T08:00:00Z'),
    phone: '+251 911 234 567',
  };
  const pt = (v: number) => String(Math.round(((v * 72) / 25.4) * 1e6) / 1e6);
  const photoRect = (wMm: number, hMm: number) => ` ${pt(wMm)} ${pt(hMm)} re\n`;
  const TINT = '0.9450980392156862 0.9411764705882353 0.9254901960784314 scn';

  it('draws a 35 x 45 mm passport photo and leaves the phone off', async () => {
    const pdf = await sheetBytes([card], { photo: 'passport' });
    expect(drawing(pdf)).toContain(photoRect(35, 45));
    expect(drawing(pdf)).not.toContain(photoRect(25, 32));
    expect(pdfText(pdf)).not.toContain('+251 911 234 567');
  });

  it('draws a 25 x 32 mm compact photo with the phone under the role', async () => {
    const pdf = await sheetBytes([card], { photo: 'compact' });
    expect(drawing(pdf)).toContain(photoRect(25, 32));
    expect(drawing(pdf)).not.toContain(photoRect(35, 45));
    expect(pdfText(pdf)).toMatch(/Reception\n\+251 911 234 567/);
  });

  it.each(['', 'UNKNOWN'])(
    'draws a compact card whose phone is %j as if it had no phone',
    async (phone) => {
      const compact = { photo: 'compact' } as const;
      const without = await sheetBytes(
        [{ ...card, phone: undefined }],
        compact,
      );
      const pdf = await sheetBytes([{ ...card, phone }], compact);
      expect(contentDigest(pdf)).toBe(contentDigest(without));
    },
  );

  it('fills the back with the warm tint only when asked', async () => {
    expect(drawing(await sheetBytes([card], { back: 'tint' }))).toContain(TINT);
    expect(drawing(await sheetBytes([card], { back: 'white' }))).not.toContain(
      TINT,
    );
  });

  it('prints a custom wordmark in capitals on both faces', async () => {
    const text = await sheetBytes([card], {
      wordmark: '  Bayne guest house ',
    }).then(pdfText);
    const lines = text.split('\n');
    expect(lines.filter((l) => l === 'BAYNE')).toHaveLength(2);
    expect(lines.filter((l) => l === 'GUEST HOUSE')).toHaveLength(2);
    expect(text).not.toContain('ALMIS');
  });

  it.each([
    [1, 4, 4],
    [3, 4, 2],
    [3, 3, 1],
    [3, 7, 3],
  ] as const)(
    'puts %i card pair(s) per page, so %i cards take %i page(s)',
    async (perPage, count, pages) => {
      const cards = Array.from({ length: count }, (_, i) => ({
        ...card,
        code: `EMP-00000${i}`,
      }));
      expect(pageCount(await sheetBytes(cards, { perPage }))).toBe(pages);
    },
  );
});
