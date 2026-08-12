import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAX_WALLPAPER_BYTES = 15 * 1024 * 1024;
export const DEFAULT_WALLPAPER_OPACITY = 0.18;

export type WallpaperFormat = 'png' | 'jpg' | 'webp';

export function getWallpaperDirectory(): string {
  const dataDir = process.env.CLAUDE_GUI_DATA_DIR || path.join(os.homedir(), '.codepilot');
  return path.resolve(dataDir, 'appearance');
}

export function detectWallpaperFormat(buffer: Buffer): WallpaperFormat | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

export function normalizeWallpaperOpacity(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
  return Math.round(parsed * 100) / 100;
}

export function findWallpaperFile(): { path: string; format: WallpaperFormat } | null {
  const directory = getWallpaperDirectory();
  for (const format of ['png', 'jpg', 'webp'] as const) {
    const candidate = path.join(directory, `wallpaper.${format}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return { path: candidate, format };
  }
  return null;
}

export function removeWallpaperFiles(): void {
  const directory = getWallpaperDirectory();
  for (const format of ['png', 'jpg', 'webp'] as const) {
    const candidate = path.join(directory, `wallpaper.${format}`);
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }
}
