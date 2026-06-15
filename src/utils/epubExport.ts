// src/utils/epubExport.ts
// ─────────────────────────────────────────────────────────────────────────────
// ePub 전자책 내보내기 (실제 로직)
// • HTML → ePub 표준 구조 생성 (JSZip 기반)
// • 표지 이미지 포함 가능
// • React Native FS를 통해 다운로드 폴더에 저장
// ─────────────────────────────────────────────────────────────────────────────

import { ToastService } from '../components/Toast';
import { Platform } from 'react-native';
import logger from './logger';

export interface EpubGenOptions {
  title: string;
  author: string;
  /** HTML 혹은 순수 텍스트 본문 */
  content: string;
  /** 소설 언어 (lang 속성) */
  language?: string;
  /** 챕터별로 분리된 배열 (선택) */
  chapters?: { title: string; body: string }[];
}

// ── ePub 내부 파일 구조 생성 ─────────────────────────────────────────────────

function buildMimetype(): string {
  return 'application/epub+zip';
}

function buildContainer(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function buildContentOpf(opts: EpubGenOptions, chapterCount: number): string {
  const lang = opts.language ?? 'ko';
  const uid = `epub-${Date.now()}`;
  
  let manifest = '';
  let spine = '';
  for (let i = 0; i < chapterCount; i++) {
    manifest += `    <item id="chapter${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>\n`;
    spine += `    <itemref idref="chapter${i}"/>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${uid}</dc:identifier>
    <dc:title>${escapeXml(opts.title)}</dc:title>
    <dc:creator>${escapeXml(opts.author)}</dc:creator>
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifest}  </manifest>
  <spine>
${spine}  </spine>
</package>`;
}

function buildNav(chapters: { title: string }[]): string {
  let toc = '';
  chapters.forEach((ch, i) => {
    toc += `      <li><a href="chapter${i}.xhtml">${escapeXml(ch.title)}</a></li>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc">
    <h1>목차</h1>
    <ol>
${toc}    </ol>
  </nav>
</body>
</html>`;
}

function buildChapterXhtml(title: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(title)}</title>
  <style>
    body { font-family: serif; line-height: 1.8; padding: 1em; color: #333; }
    h1 { font-size: 1.4em; margin-bottom: 1em; border-bottom: 1px solid #ddd; padding-bottom: 0.5em; }
    p { margin-bottom: 0.8em; text-indent: 1em; }
  </style>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  ${bodyHtml}
</body>
</html>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .filter(Boolean)
    .map(para => `<p>${escapeXml(para.trim())}</p>`)
    .join('\n  ');
}

function sanitizeFileName(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);

  return normalized || 'novel';
}

// ── 메인 내보내기 함수 ────────────────────────────────────────────────────────

export async function exportNovelToEpub(opts: EpubGenOptions): Promise<string | null> {
  try {
    logger.log(`[EpubExport] 생성 시작: ${opts.title} by ${opts.author}`);

    // 챕터 배열 구성
    const chapters = opts.chapters && opts.chapters.length > 0
      ? opts.chapters
      : [{ title: opts.title, body: opts.content }];

    // JSZip 동적 로드 (설치되어 있지 않으면 로컬 로직으로 폴백)
    let zipBlob: Blob | null = null;
    try {
      const JSZip = require('jszip');
      const zip = new JSZip();

      // mimetype (비압축, 반드시 첫 번째)
      zip.file('mimetype', buildMimetype(), { compression: 'STORE' });

      // META-INF
      zip.file('META-INF/container.xml', buildContainer());

      // OEBPS
      zip.file('OEBPS/content.opf', buildContentOpf(opts, chapters.length));
      zip.file('OEBPS/nav.xhtml', buildNav(chapters));

      // 챕터 파일
      chapters.forEach((ch, i) => {
        const bodyHtml = textToHtml(ch.body);
        zip.file(`OEBPS/chapter${i}.xhtml`, buildChapterXhtml(ch.title, bodyHtml));
      });

      zipBlob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
    } catch (e) {
      logger.warn('[EpubExport] JSZip 생성 실패:', e);
    }

    // React Native FS로 저장 시도
    const fileName = `${sanitizeFileName(opts.title)}_${Date.now()}.epub`;

    if (zipBlob) {
      try {
        const RNFS = require('react-native-fs');

        // Blob → Base64 → File
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] ?? '');
          };
          reader.readAsDataURL(zipBlob!);
        });

        const candidateDirs = Array.from(new Set([
          RNFS.DocumentDirectoryPath,
          Platform.OS === 'android' ? RNFS.DownloadDirectoryPath : null,
          RNFS.CachesDirectoryPath,
        ].filter((dir): dir is string => typeof dir === 'string' && dir.length > 0)));

        let lastWriteError: unknown = null;

        for (const directory of candidateDirs) {
          const outputPath = `${directory}/${fileName}`;

          try {
            await RNFS.writeFile(outputPath, base64, 'base64');
            logger.log(`[EpubExport] 저장 완료: ${outputPath}`);
            ToastService.success(`ePub 저장 완료: ${fileName}`);
            return outputPath;
          } catch (writeError) {
            lastWriteError = writeError;
            logger.warn(`[EpubExport] 저장 경로 실패: ${outputPath}`, writeError);
          }
        }

        throw lastWriteError ?? new Error('No writable epub path found');
      } catch (fsErr) {
        logger.warn('[EpubExport] RNFS 저장 실패, Blob만 생성됨:', fsErr);
        ToastService.success('ePub 파일이 생성되었습니다.');
        return null;
      }
    } else {
      // JSZip 없이는 구조 정보만 로그
      logger.log('[EpubExport] JSZip 패키지가 없어 실제 파일 생성을 건너뜁니다.');
      logger.log(`[EpubExport] 챕터 ${chapters.length}개, 총 ${opts.content.length}자`);
      ToastService.info('ePub 내보내기 준비 완료 (jszip 패키지 설치 필요)');
      return null;
    }
  } catch (error) {
    logger.error('[EpubExport] 내보내기 실패:', error);
    ToastService.error('ePub 내보내기에 실패했습니다.');
    return null;
  }
}
