'use client';

import { useEffect, useState } from 'react';

export interface WallpaperState {
  exists: boolean;
  opacity: number;
  revision: string;
  imageUrl: string;
}

export const WALLPAPER_UPDATED_EVENT = 'codepilot-wallpaper-updated';

export function AppWallpaper() {
  const [wallpaper, setWallpaper] = useState<WallpaperState | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/wallpaper?meta=1', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!cancelled && data) setWallpaper(data); })
      .catch(() => {});
    const update = (event: Event) => setWallpaper((event as CustomEvent<WallpaperState>).detail);
    window.addEventListener(WALLPAPER_UPDATED_EVENT, update);
    return () => { cancelled = true; window.removeEventListener(WALLPAPER_UPDATED_EVENT, update); };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.wallpaper = wallpaper?.exists ? 'active' : 'none';
    return () => { delete document.documentElement.dataset.wallpaper; };
  }, [wallpaper?.exists]);

  if (!wallpaper?.exists) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 scale-[1.015] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${wallpaper.imageUrl}")`, opacity: wallpaper.opacity }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-background/35 via-background/15 to-background/45" />
    </div>
  );
}
