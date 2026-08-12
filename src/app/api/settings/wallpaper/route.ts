import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_WALLPAPER_OPACITY,
  MAX_WALLPAPER_BYTES,
  detectWallpaperFormat,
  findWallpaperFile,
  getWallpaperDirectory,
  normalizeWallpaperOpacity,
  removeWallpaperFiles,
} from '@/lib/wallpaper';
import { getSetting, setSetting } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function metadata() {
  const file = findWallpaperFile();
  const opacity = normalizeWallpaperOpacity(getSetting('wallpaper_opacity')) ?? DEFAULT_WALLPAPER_OPACITY;
  const revision = getSetting('wallpaper_revision') || '0';
  return { exists: !!file, opacity, revision, imageUrl: file ? `/api/settings/wallpaper?rev=${encodeURIComponent(revision)}` : '' };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('meta') === '1') {
    return Response.json(metadata(), { headers: { 'Cache-Control': 'no-store' } });
  }
  const file = findWallpaperFile();
  if (!file) return Response.json({ error: 'Wallpaper not found' }, { status: 404 });
  const contentType = file.format === 'jpg' ? 'image/jpeg' : `image/${file.format}`;
  return new Response(fs.readFileSync(file.path), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ error: 'Wallpaper file is required' }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_WALLPAPER_BYTES) {
      return Response.json({ error: 'Wallpaper must be between 1 byte and 15 MB' }, { status: 413 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const format = detectWallpaperFormat(buffer);
    if (!format) return Response.json({ error: 'Only PNG, JPEG, and WebP wallpapers are supported' }, { status: 415 });

    const directory = getWallpaperDirectory();
    fs.mkdirSync(directory, { recursive: true });
    const target = path.join(directory, `wallpaper.${format}`);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, buffer, { mode: 0o600 });
    removeWallpaperFiles();
    fs.renameSync(temporary, target);
    const revision = String(Date.now());
    setSetting('wallpaper_revision', revision);
    if (!getSetting('wallpaper_opacity')) setSetting('wallpaper_opacity', String(DEFAULT_WALLPAPER_OPACITY));
    return Response.json(metadata(), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to save wallpaper' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { opacity?: unknown } | null;
  const opacity = normalizeWallpaperOpacity(body?.opacity);
  if (opacity === null) return Response.json({ error: 'opacity must be a number from 0 to 1' }, { status: 400 });
  setSetting('wallpaper_opacity', String(opacity));
  return Response.json(metadata());
}

export async function DELETE() {
  removeWallpaperFiles();
  setSetting('wallpaper_revision', String(Date.now()));
  return Response.json(metadata());
}
