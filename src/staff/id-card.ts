import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import type { Role } from '@prisma/client';

export type IdCard = {
  name: string;
  role: string;
  code: string;
  issued: Date;
  photo?: Buffer;
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  reception: 'Reception',
  housekeeping: 'Housekeeping',
  barista: 'Barista',
  security: 'Security',
  finance: 'Finance',
  store: 'Store',
};

const mm = (v: number) => (v * 72) / 25.4;

const COLOR = {
  red: '#c62e2e',
  graphite: '#16171b',
  muted: '#5d6068',
  grey: '#a6a8ae',
  line: '#9a9ca2',
  placeholder: '#e6e7e9',
  photoEdge: '#d4d5d8',
  backTint: '#f1f0ec',
};
const CARD_W = mm(54);
const CARD_H = mm(85.6);
const PAD = mm(4);
const BLEED = mm(1.5);
const BAND_H = mm(11);
const PHOTO_W = mm(35);
const PHOTO_H = mm(45);
const QR_SIDE = mm(34);
const NAME_MAX = mm(4.2);
const NAME_MIN = mm(3);
const TWO_LINES = 'A\nA';
const MARK_GAP = mm(1);
const MARK_LEN = mm(2);
const NOTE_TOP = mm(8);
const NOTE_SIZE = 7.5;
const NOTE_WIDTH = mm(180);
const NOTE =
  'Print at 100% (actual size). Cut on the corner marks, fold on the dashed line so the photo and QR face out, then laminate.';
// Three 85.6 mm cards leave 40 mm of A4. With the note in the top margin these rows keep every mark and line of text 8 mm inside the page edge, the margin most printers cannot print into.
const SLOT_TOPS = [0, 1, 2].map((i) => mm(15) + i * (CARD_H + mm(7)));

const ISSUED_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Addis_Ababa',
});
const ETHIOPIC = /[ሀ-᎟]/;

const FONT_FILES = {
  sans: 'Geist-Regular.ttf',
  'sans-md': 'Geist-Medium.ttf',
  'sans-sb': 'Geist-SemiBold.ttf',
  mono: 'GeistMono-Regular.ttf',
  eth: 'NotoSansEthiopic-Regular.ttf',
  'eth-md': 'NotoSansEthiopic-Medium.ttf',
} as const;

// This file runs from src/staff under jest and from dist/src/staff once built, so the depth to the repo root differs.
function findFontDir(from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'assets', 'fonts');
    if (fs.existsSync(candidate)) return candidate;
    if (path.dirname(dir) === dir)
      throw new Error(`assets/fonts not found above ${from}`);
  }
}

const FONT_DIR = findFontDir(__dirname);
const FONTS = Object.entries(FONT_FILES).map(
  ([name, file]) => [name, fs.readFileSync(path.join(FONT_DIR, file))] as const,
);

type Doc = PDFKit.PDFDocument;

export function renderIdCards(cards: IdCard[]): Doc {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: cards.length === 1 ? `Staff card ${cards[0].code}` : 'Staff cards',
    },
  });
  for (const [name, data] of FONTS) doc.registerFont(name, data);

  const x = (doc.page.width - 2 * CARD_W) / 2;
  for (let first = 0; first < cards.length; first += SLOT_TOPS.length) {
    if (first > 0) doc.addPage();
    doc
      .font('sans')
      .fontSize(NOTE_SIZE)
      .fillColor(COLOR.muted)
      .text(NOTE, (doc.page.width - NOTE_WIDTH) / 2, NOTE_TOP, {
        width: NOTE_WIDTH,
        align: 'center',
      });
    cards.slice(first, first + SLOT_TOPS.length).forEach((card, slot) => {
      const y = SLOT_TOPS[slot];
      doc
        .save()
        .rect(x - BLEED, y - BLEED, 2 * CARD_W + 2 * BLEED, CARD_H + 2 * BLEED)
        .clip();
      front(doc, x, y, card);
      back(doc, x + CARD_W, y, card);
      doc.restore();
      marks(doc, x, y);
    });
  }
  doc.end();
  return doc;
}

function wordmark(doc: Doc, x: number, yMid: number, color: string) {
  const spacing = mm(0.85);
  const top = yMid - mm(1.3);
  doc
    .font('sans-sb')
    .fontSize(mm(2.6))
    .fillColor(color)
    .text('ALMIS', x, top, { characterSpacing: spacing, lineBreak: false });
  const dotX = x + doc.widthOfString('ALMIS') + 5 * spacing + mm(0.6);
  doc.circle(dotX, yMid, mm(0.8)).fill(COLOR.red);
  doc.fillColor(color).text('HOTEL', dotX + mm(2.2), top, {
    characterSpacing: spacing,
    lineBreak: false,
  });
}

function front(doc: Doc, ox: number, oy: number, card: IdCard) {
  doc
    .rect(ox - BLEED, oy - BLEED, CARD_W + BLEED, BAND_H + BLEED)
    .fill(COLOR.graphite);
  wordmark(doc, ox + PAD, oy + BAND_H / 2, '#fff');
  doc
    .font('sans')
    .fontSize(mm(2))
    .fillColor(COLOR.grey)
    .text('STAFF', ox + PAD, oy + BAND_H / 2 - mm(1), {
      width: CARD_W - 2 * PAD,
      align: 'right',
      characterSpacing: mm(0.3),
      lineBreak: false,
    });

  const px = ox + (CARD_W - PHOTO_W) / 2;
  const py = oy + BAND_H + mm(3.5);
  doc.save().rect(px, py, PHOTO_W, PHOTO_H).clip();
  if (card.photo) {
    doc.image(card.photo, px, py, {
      cover: [PHOTO_W, PHOTO_H],
      align: 'center',
      valign: 'center',
    });
  } else {
    doc.rect(px, py, PHOTO_W, PHOTO_H).fill(COLOR.placeholder);
    doc
      .font('sans')
      .fontSize(mm(2.2))
      .fillColor(COLOR.muted)
      .text('Photo', px, py + PHOTO_H / 2 - mm(1.2), {
        width: PHOTO_W,
        align: 'center',
      });
  }
  doc
    .restore()
    .lineWidth(0.4)
    .strokeColor(COLOR.photoEdge)
    .rect(px, py, PHOTO_W, PHOTO_H)
    .stroke();

  const width = CARD_W - 2 * PAD;
  doc.font(ETHIOPIC.test(card.name) ? 'eth-md' : 'sans-sb');
  const nameOptions = (size: number): PDFKit.Mixins.TextOptions => ({
    width,
    align: 'center',
    lineGap: -size * 0.05,
  });
  const maxNameHeight = (size: number) =>
    doc.fontSize(size).heightOfString(TWO_LINES, nameOptions(size));
  let size = NAME_MAX;
  while (
    size > NAME_MIN &&
    doc.fontSize(size).heightOfString(card.name, nameOptions(size)) >
      maxNameHeight(size)
  )
    size -= 0.5;
  // pdfkit ellipsizes a line when a further full line would not fit, so exactly two lines of height would cut the name to one.
  const height = maxNameHeight(size) + size / 2;
  doc
    .fillColor(COLOR.graphite)
    .fontSize(size)
    .text(card.name, ox + PAD, py + PHOTO_H + mm(3), {
      ...nameOptions(size),
      height,
      ellipsis: true,
    });
  doc
    .moveDown(0.25)
    .font('sans-md')
    .fontSize(mm(2.7))
    .fillColor(COLOR.red)
    .text(card.role, ox + PAD, doc.y, { width, align: 'center' });
}

function back(doc: Doc, ox: number, oy: number, card: IdCard) {
  const qx = ox + (CARD_W - QR_SIDE) / 2;
  const qy = oy + mm(15);
  doc
    .rect(ox, oy - BLEED, CARD_W + BLEED, CARD_H + 2 * BLEED)
    .fill(COLOR.backTint);
  doc
    .rect(qx - mm(2), qy - mm(2), QR_SIDE + mm(4), QR_SIDE + mm(4))
    .fill('#fff');
  wordmark(doc, ox + PAD, oy + mm(7), COLOR.graphite);

  const qr = QRCode.create(card.code, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const cell = QR_SIDE / n;
  doc.fillColor(COLOR.graphite);
  // The overlap closes hairline gaps between adjacent modules that some PDF rasterizers leave.
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c))
        doc.rect(qx + c * cell, qy + r * cell, cell + 0.05, cell + 0.05);
  doc.fill();

  doc
    .font('mono')
    .fontSize(mm(3))
    .fillColor(COLOR.graphite)
    .text(card.code, ox, qy + QR_SIDE + mm(3.5), {
      width: CARD_W,
      align: 'center',
      characterSpacing: mm(0.15),
    });

  const width = CARD_W - 2 * PAD;
  doc
    .font('sans')
    .fontSize(mm(2.2))
    .fillColor(COLOR.graphite)
    .text(
      'Scan at the door to clock in and out. If found, please return to reception.',
      ox + PAD,
      oy + mm(62),
      { width, align: 'center', lineGap: 1 },
    );
  doc
    .moveDown(0.3)
    .font('eth')
    .fontSize(mm(2.2))
    .fillColor(COLOR.muted)
    .text('ካገኙት እባክዎ ለእንግዳ መቀበያ ይመልሱ።', ox + PAD, doc.y, {
      width,
      align: 'center',
    });
  doc
    .font('sans')
    .fontSize(mm(2))
    .fillColor(COLOR.muted)
    .text(
      `Issued ${ISSUED_FORMAT.format(card.issued)}`,
      ox,
      oy + CARD_H - mm(6),
      { width: CARD_W, align: 'center' },
    );
}

function marks(doc: Doc, x: number, y: number) {
  const w = 2 * CARD_W;
  doc.lineWidth(0.3).strokeColor(COLOR.line);
  for (const [cx, sx] of [
    [x, -1],
    [x + w, 1],
  ]) {
    for (const [cy, sy] of [
      [y, -1],
      [y + CARD_H, 1],
    ]) {
      doc
        .moveTo(cx + sx * MARK_GAP, cy)
        .lineTo(cx + sx * (MARK_GAP + MARK_LEN), cy)
        .stroke();
      doc
        .moveTo(cx, cy + sy * MARK_GAP)
        .lineTo(cx, cy + sy * (MARK_GAP + MARK_LEN))
        .stroke();
    }
  }
  const fold = x + CARD_W;
  doc.dash(mm(0.8), { space: mm(0.8) });
  doc
    .moveTo(fold, y - MARK_GAP)
    .lineTo(fold, y - MARK_GAP - MARK_LEN)
    .stroke();
  doc
    .moveTo(fold, y + CARD_H + MARK_GAP)
    .lineTo(fold, y + CARD_H + MARK_GAP + MARK_LEN)
    .stroke();
  doc.undash();
}
