import { extname } from 'node:path';
import mammoth from 'mammoth';

export interface ExtractedResume {
  text: string;
  format: 'pdf' | 'docx' | 'markdown' | 'text';
}

export async function extractResumeText(
  buffer: Buffer,
  mimeType: string | undefined,
  filename: string,
): Promise<ExtractedResume> {
  const ext = extname(filename).toLowerCase();
  const isPdf = mimeType === 'application/pdf' || ext === '.pdf';
  const isDocx =
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx';
  const isMarkdown = ext === '.md' || ext === '.markdown' || mimeType === 'text/markdown';

  if (isPdf) {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs' as string);
    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: { str?: string; hasEOL?: boolean }) => `${item.str ?? ''}${item.hasEOL ? '\n' : ' '}`)
        .join('');
      pages.push(pageText);
    }
    return { text: pages.join('\n\n').replace(/[ \t]+/g, ' ').trim(), format: 'pdf' };
  }

  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value.trim(), format: 'docx' };
  }

  if (ext === '.doc') {
    throw new Error('Legacy .doc files are not supported. Save the resume as .docx or PDF.');
  }

  const text = buffer.toString('utf8').trim();
  if (!text) throw new Error('The uploaded file is empty or could not be read as text');
  return { text, format: isMarkdown ? 'markdown' : 'text' };
}
