// src/utils/fileSystemCompat.ts
// ── expo-file-system 기반 파일 시스템 유틸리티 ──────────────────
// deprecated 경고(getInfoAsync, makeDirectoryAsync)는 기능상 무해한 콘솔 경고이며
// expo-file-system SDK 54에서 발생합니다. 앱 동작에 영향 없음.
// Keep legacy API surface in SDK 54 while avoiding deprecation spam in dev logs.
let FileSystem: any;
try {
  FileSystem = require('expo-file-system/legacy');
} catch {
  FileSystem = require('expo-file-system');
}

export type RNFSStatResult = {
  ctime: Date;
  isDirectory: () => boolean;
  isFile: () => boolean;
  mtime: Date;
  name: string;
  originalFilepath: string;
  path: string;
  size: number;
};

const encodeFilePath = (p: string) =>
  encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');

const toUri = (p: string) => {
  const rawPath = p.startsWith('file://') ? p.replace(/^file:\/\//, '') : p;
  return `file://${encodeFilePath(rawPath)}`;
};

const fromUri  = (p: string) => decodeURI(p.replace(/^file:\/\//, ''));
const basename = (p: string) => fromUri(p).replace(/\/+$/, '').split('/').pop() ?? '';
const dirOf    = (p: string) => {
  const s = fromUri(p).replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i > 0 ? s.slice(0, i) : '.';
};
const tsOf = (n?: number) =>
  new Date(typeof n === 'number' && n > 0 ? (n < 1e12 ? n * 1000 : n) : 0);

async function ensureParent(p: string): Promise<void> {
  const d = dirOf(p);
  if (d !== '.') await FileSystem.makeDirectoryAsync(`file://${d}`, { intermediates: true }).catch(() => {});
}

async function exists(path: string): Promise<boolean> {
  return ((await FileSystem.getInfoAsync(toUri(path))) as { exists: boolean }).exists;
}

async function stat(path: string): Promise<RNFSStatResult | null> {
  const info = (await FileSystem.getInfoAsync(toUri(path), { size: true })) as {
    exists: boolean; isDirectory?: boolean; size?: number; modificationTime?: number; creationTime?: number;
  };
  if (!info.exists) {
    // ✅ [FIX] 앱 터짐 방지 - 에러 대신 null 반환
    console.warn(`[fileSystemCompat] ENOENT: stat '${path}'`);
    return null;
  }
  const p = fromUri(path);
  return {
    ctime: tsOf(info.creationTime), mtime: tsOf(info.modificationTime),
    isDirectory: () => !!info.isDirectory, isFile: () => !info.isDirectory,
    name: basename(p), originalFilepath: p, path: p, size: info.size ?? 0 };
}

async function mkdir(path: string): Promise<void> {
  await FileSystem.makeDirectoryAsync(toUri(path), { intermediates: true });
}

async function unlink(path: string): Promise<void> {
  await FileSystem.deleteAsync(toUri(path), { idempotent: true });
}

async function readFile(path: string, _enc = 'utf8'): Promise<string> {
  return FileSystem.readAsStringAsync(toUri(path));
}

async function writeFile(path: string, content: string, _enc = 'utf8'): Promise<void> {
  await ensureParent(path);
  await FileSystem.writeAsStringAsync(toUri(path), content);
}

// [BUG-14 FIX] appendFile: read-modify-write 경쟁 조건 방지
// 동일 경로에 대한 appendFile 호출을 직렬화하는 큐 맵
const _appendQueues = new Map<string, Promise<void>>();

async function appendFile(path: string, content: string, enc = 'utf8'): Promise<void> {
  // 이전 작업이 완료된 후 직렬 실행되도록 큐에 연결
  const prev = _appendQueues.get(path) ?? Promise.resolve();
  const next = prev.then(async () => {
    const cur = await readFile(path, enc).catch(() => '');
    await writeFile(path, cur + content, enc);
  });
  // 완료 후 큐에서 제거 (메모리 누수 방지)
  _appendQueues.set(path, next.catch(() => {}).then(() => {
    if (_appendQueues.get(path) === next) _appendQueues.delete(path);
  }));
  await next;
}

async function readDir(path: string): Promise<RNFSStatResult[]> {
  const names = await FileSystem.readDirectoryAsync(toUri(path));
  const base  = fromUri(path).replace(/\/+$/, '');
  return Promise.all(names.map(async (name: string) => {
    const p    = `${base}/${name}`;
    const info = (await FileSystem.getInfoAsync(toUri(p), { size: true })) as {
      exists: boolean; isDirectory?: boolean; size?: number; modificationTime?: number; creationTime?: number;
    };
    return {
      ctime: tsOf(info.creationTime), mtime: tsOf(info.modificationTime),
      isDirectory: () => !!info.isDirectory, isFile: () => !info.isDirectory,
      name, originalFilepath: p, path: p, size: info.size ?? 0 };
  }));
}

async function moveFile(src: string, dest: string): Promise<void> {
  await ensureParent(dest);
  try {
    await FileSystem.moveAsync({ from: toUri(src), to: toUri(dest) });
  } catch {
    await FileSystem.copyAsync({ from: toUri(src), to: toUri(dest) });
    await FileSystem.deleteAsync(toUri(src), { idempotent: true }).catch(() => {});
  }
}

async function copyFile(src: string, dest: string): Promise<void> {
  await ensureParent(dest);
  await FileSystem.copyAsync({ from: toUri(src), to: toUri(dest) });
}

let _jobId = 1;
const _dl  = new Map<number, { cancel: () => void }>();

export interface DownloadOptions {
  fromUrl: string;
  toFile: string;
  headers?: Record<string, string>;
  background?: boolean;
  progressDivider?: number;
  begin?: (_res: { contentLength: number; jobId: number }) => void;
  progress?: (_p: { bytesWritten: number; contentLength: number; jobId: number }) => void;
}

function downloadFile(opts: DownloadOptions): {
  jobId: number;
  promise: Promise<{ jobId: number; statusCode: number; bytesWritten: number }>;
} {
  const jobId   = _jobId++;
  const promise = (async () => {
    try {
      await ensureParent(opts.toFile);
      const task = FileSystem.createDownloadResumable(
        opts.fromUrl, toUri(opts.toFile),
        { headers: opts.headers ?? {} },
        (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
          if (p.totalBytesExpectedToWrite > 0) {
            if (opts.begin) {
               // Notify once
               opts.begin({ contentLength: p.totalBytesExpectedToWrite, jobId });
               opts.begin = undefined; // Ensure only called once
            }
            if (opts.progress) {
               opts.progress({ bytesWritten: p.totalBytesWritten, contentLength: p.totalBytesExpectedToWrite, jobId });
            }
          }
        }
      );
      _dl.set(jobId, { cancel: () => { task.cancelAsync().catch(() => {}); } });
      const res = await task.downloadAsync();
      // content-length 헤더가 없으면 stat으로 실제 저장 크기 조회
      const written = res?.headers?.["content-length"]
        ? Number(res.headers["content-length"])
        : await stat(opts.toFile).then(s => s?.size ?? 0).catch(() => 0);
      return { jobId, statusCode: res?.status ?? 200, bytesWritten: written };
    } finally { _dl.delete(jobId); }
  })();
  return { jobId, promise };
}

function stopDownload(jobId: number): void {
  _dl.get(jobId)?.cancel();
  _dl.delete(jobId);
}

// ✅ [FIX] 빈 문자열 fallback 추가
const docDir   = fromUri(FileSystem.documentDirectory ?? '').replace(/\/+$/, '') || '';
const cacheDir = fromUri(FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '').replace(/\/+$/, '') || '';

const RNFS = {
  DocumentDirectoryPath:        docDir,
  CachesDirectoryPath:          cacheDir,
  TemporaryDirectoryPath:       cacheDir,
  ExternalDirectoryPath:        docDir,
  ExternalStorageDirectoryPath: docDir,
  appendFile, copyFile, downloadFile, exists,
  mkdir, moveFile, readDir, readFile,
  stat, stopDownload, unlink, writeFile };

export default RNFS;
