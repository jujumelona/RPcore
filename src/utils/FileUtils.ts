import RNFS from './fileSystemCompat';
export class FileUtils {
  static async exists(path: string): Promise<boolean> {
    try { return await RNFS.exists(path); } catch { return false; }
  }
  static async readFile(path: string): Promise<string> {
    return await RNFS.readFile(path, 'utf8');
  }
  static async writeFile(path: string, content: string): Promise<void> {
    await RNFS.writeFile(path, content, 'utf8');
  }
}
