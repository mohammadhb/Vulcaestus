import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_WIDTH = A4.width - MARGIN * 2;

function sanitizePdfText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/•/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF€]/g, '?');
}

function wrapLine(
  text: string,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = sanitizePdfText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Renders a small, safe markdown subset to a professional PDF.
 * No external fonts or binaries are required at runtime.
 */
export async function markdownToPdf(markdown: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const addPage = () => {
    page = pdf.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
  };

  const draw = (text: string, options: { size: number; bold?: boolean; indent?: number; color?: [number, number, number] }) => {
    const font = options.bold ? bold : regular;
    const size = options.size;
    const indent = options.indent ?? 0;
    const maxWidth = CONTENT_WIDTH - indent;
    const lines = wrapLine(text, font, size, maxWidth);
    for (const line of lines) {
      if (y < MARGIN + size * 2) addPage();
      page.drawText(line, {
        x: MARGIN + indent,
        y,
        size,
        font,
        color: options.color ? rgb(...options.color) : rgb(0.1, 0.1, 0.12),
      });
      y -= size * 1.45;
    }
  };

  for (const rawLine of markdown.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      y -= 7;
      continue;
    }
    if (line.startsWith('# ')) {
      draw(line.slice(2), { size: 19, bold: true });
      y -= 2;
    } else if (line.startsWith('## ')) {
      y -= 4;
      draw(line.slice(3).toUpperCase(), { size: 10.5, bold: true, color: [0.24, 0.29, 0.38] });
      y -= 2;
    } else if (line.startsWith('### ')) {
      draw(line.slice(4), { size: 11, bold: true });
    } else if (line.startsWith('- ')) {
      draw(`• ${line.slice(2)}`, { size: 9.8, indent: 12 });
    } else {
      draw(line.replace(/^_|_$/g, ''), { size: 9.8 });
    }
  }

  return Buffer.from(await pdf.save());
}

export async function markdownToDocx(markdown: string): Promise<Buffer> {
  const children: Paragraph[] = [];
  for (const rawLine of markdown.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      children.push(new Paragraph({ spacing: { after: 80 } }));
      continue;
    }
    if (line.startsWith('# ')) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: [new TextRun({ text: line.slice(2), bold: true })],
        }),
      );
    } else if (line.startsWith('## ')) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: line.slice(3), bold: true })],
        }),
      );
    } else if (line.startsWith('### ')) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: line.slice(4), bold: true })],
        }),
      );
    } else if (line.startsWith('- ')) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: line.slice(2), size: 21 })],
        }),
      );
    } else {
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new TextRun({ text: line.replace(/^_|_$/g, ''), size: 21 })],
          spacing: { after: 60 },
        }),
      );
    }
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 21 },
        },
      },
    },
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(document);
}

export function coverLetterToMarkdown(text: string): string {
  return `# Cover Letter\n\n${text.trim()}`;
}
