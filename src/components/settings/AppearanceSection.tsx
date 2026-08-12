"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { codeToHtml, type BundledTheme } from "shiki";
import { useThemeFamily } from "@/lib/theme/context";
import {
  resolveShikiTheme,
  resolveShikiThemes,
} from "@/lib/theme/code-themes";
import { useTranslation } from "@/hooks/useTranslation";
import { CodePilotIcon, type CodePilotIconName } from "@/components/ui/semantic-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SettingsCard } from "@/components/patterns/SettingsCard";
import { FieldRow } from "@/components/patterns/FieldRow";
import { Input } from '@/components/ui/input';
import { WALLPAPER_UPDATED_EVENT, type WallpaperState } from '@/components/layout/AppWallpaper';

// ── Theme Mode Pill Selector ────────────────────────────────────────

const MODE_OPTIONS: ReadonlyArray<{ value: string; icon: CodePilotIconName; labelKey: "settings.modeLight" | "settings.modeDark" | "settings.modeSystem" }> = [
  { value: "light", icon: "theme_light", labelKey: "settings.modeLight" },
  { value: "dark", icon: "theme_dark", labelKey: "settings.modeDark" },
  { value: "system", icon: "desktop", labelKey: "settings.modeSystem" },
] as const;

function ThemeModePills({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center rounded-lg border border-border/50 p-1 gap-1" role="radiogroup">
      {MODE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <Button
            key={opt.value}
            variant="ghost"
            size="sm"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all h-auto",
              selected
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <CodePilotIcon name={opt.icon} size="sm" aria-hidden />
            {t(opt.labelKey)}
          </Button>
        );
      })}
    </div>
  );
}

// ── Shiki Code Preview ──────────────────────────────────────────────

const PREVIEW_CODE = `function greet(name: string) {
  const time = new Date().getHours();
  if (time < 12) return \`Good morning, \${name}\`;
  return \`Hello, \${name}\`;
}`;

function ShikiCodePreview({ isDark }: { isDark: boolean }) {
  const { family, families } = useThemeFamily();
  const shikiMapping = resolveShikiTheme(families, family);
  const { light, dark } = resolveShikiThemes(shikiMapping);
  const theme: BundledTheme = isDark ? dark : light;
  const [html, setHtml] = useState("");

  // Phase 5B — this preview stays on the main thread on purpose (it is NOT
  // routed through the shiki Web Worker). Rationale: it's a single tiny,
  // one-shot snippet rendered only while the Appearance settings page is open,
  // not the streaming chat hot path the worker offload targets; and it needs
  // an HTML string for dangerouslySetInnerHTML, whereas the worker returns
  // structured tokens (a different shape). Keeping codeToHtml here avoids
  // widening the worker's surface and leaves this file's single HTML-injection
  // path unchanged. If this ever becomes a hot path, migrate it to the
  // token-based CodeBlock renderer rather than adding an HTML RPC.
  useEffect(() => {
    let cancelled = false;
    codeToHtml(PREVIEW_CODE, {
      lang: "typescript",
      theme,
    }).then((result) => {
      if (!cancelled) setHtml(result);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [theme]);

  return (
    <div className="rounded-md border border-border/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs bg-muted text-muted-foreground">
        <span className="font-medium">preview.ts</span>
        <span className="rounded bg-accent px-1.5 py-0.5 text-accent-foreground">TypeScript</span>
      </div>
      {html ? (
        <div
          className="shiki-preview [&_pre]:!m-0 [&_pre]:!rounded-none [&_pre]:!text-xs [&_pre]:!leading-relaxed [&_pre]:!p-2 [&_code]:!text-xs"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      )}
    </div>
  );
}

// ── UI Token Preview ────────────────────────────────────────────────

function UIPreview() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="text-xs h-auto py-1">Primary</Button>
      <Button size="sm" variant="secondary" className="text-xs h-auto py-1">Secondary</Button>
      <Button size="sm" variant="destructive" className="text-xs h-auto py-1">Destructive</Button>
      <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-medium text-accent-foreground">
        Badge
      </span>
      <span className="inline-flex items-center rounded-full border border-border/50 bg-card px-2.5 py-0.5 text-[10px] text-card-foreground">
        Card
      </span>
      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[10px] text-muted-foreground">
        Muted
      </span>
    </div>
  );
}

// ── Main Appearance Section ─────────────────────────────────────────

/** Persist theme setting to DB so it survives across sessions */
function persistThemeSetting(key: string, value: string) {
  fetch('/api/settings/app', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: { [key]: value } }),
  }).catch(() => { /* best-effort */ });
}

export function AppearanceSection() {
  const { theme, setTheme: setThemeRaw, resolvedTheme } = useTheme();
  const { family, setFamily: setFamilyRaw, families } = useThemeFamily();
  const { t } = useTranslation();
  const isDark = resolvedTheme === "dark";
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [wallpaper, setWallpaper] = useState<WallpaperState>({ exists: false, opacity: 0.18, revision: '0', imageUrl: '' });
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperError, setWallpaperError] = useState('');

  const publishWallpaper = useCallback((next: WallpaperState) => {
    setWallpaper(next);
    window.dispatchEvent(new CustomEvent(WALLPAPER_UPDATED_EVENT, { detail: next }));
  }, []);

  useEffect(() => {
    fetch('/api/settings/wallpaper?meta=1', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data) setWallpaper(data); })
      .catch(() => {});
  }, []);

  const uploadWallpaper = useCallback(async (file: File) => {
    setWallpaperBusy(true);
    setWallpaperError('');
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/settings/wallpaper', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('settings.wallpaperUploadFailed'));
      publishWallpaper(data);
    } catch (error) {
      setWallpaperError(error instanceof Error ? error.message : t('settings.wallpaperUploadFailed'));
    } finally {
      setWallpaperBusy(false);
      if (wallpaperInputRef.current) wallpaperInputRef.current.value = '';
    }
  }, [publishWallpaper, t]);

  const persistWallpaperOpacity = useCallback(async (opacity: number) => {
    const response = await fetch('/api/settings/wallpaper', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opacity }),
    });
    if (response.ok) publishWallpaper(await response.json());
  }, [publishWallpaper]);

  const removeWallpaper = useCallback(async () => {
    setWallpaperBusy(true);
    setWallpaperError('');
    try {
      const response = await fetch('/api/settings/wallpaper', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('settings.wallpaperRemoveFailed'));
      publishWallpaper(data);
    } catch (error) {
      setWallpaperError(error instanceof Error ? error.message : t('settings.wallpaperRemoveFailed'));
    } finally {
      setWallpaperBusy(false);
    }
  }, [publishWallpaper, t]);

  const setTheme = useCallback((mode: string) => {
    setThemeRaw(mode);
    persistThemeSetting('theme_mode', mode);
  }, [setThemeRaw]);

  const setFamily = useCallback((id: string) => {
    setFamilyRaw(id);
    persistThemeSetting('theme_family', id);
  }, [setFamilyRaw]);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!mounted) return null;

  return (
    // Top-level Settings page wrapper — matches RuntimePanel / ModelsSection
    // / GeneralSection. AppearanceSection used to render inline at the
    // bottom of GeneralSection; promotion to a sibling sidebar entry needs
    // its own page-shell width + spacing so it doesn't read as half-width.
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Section header — outside card */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("settings.appearance")}</h2>
        <p className="text-xs text-muted-foreground">{t("settings.appearanceDesc")}</p>
      </div>

      <SettingsCard>
      {/* Mode */}
      <FieldRow
        label={t("settings.themeMode")}
        description={t("settings.themeModeDesc")}
      >
        <ThemeModePills value={theme || "system"} onChange={setTheme} />
      </FieldRow>

      {theme === "system" && resolvedTheme && (
        <p className="text-[11px] text-muted-foreground pl-1">
          {resolvedTheme === "dark" ? t("settings.modeDark") : t("settings.modeLight")}
        </p>
      )}

      {/* Family */}
      <FieldRow
        label={t("settings.themeFamily")}
        description={t("settings.themeFamilyDesc")}
        separator
      >
        <Select value={family} onValueChange={setFamily}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {families.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                <span className="flex items-center gap-2">
                  {f.previewColors && (
                    <span className="flex gap-0.5">
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-border/30"
                        style={{ background: f.previewColors.primaryLight }}
                      />
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-border/30"
                        style={{ background: f.previewColors.primaryDark }}
                      />
                    </span>
                  )}
                  <span className="text-xs">{f.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {/* Preview */}
      <div className="mt-6 space-y-3">
        <h3 className="text-xs font-medium text-muted-foreground">Preview</h3>
        <UIPreview />
        <ShikiCodePreview isDark={isDark} />
      </div>
      </SettingsCard>

      <SettingsCard>
        <FieldRow
          label={t('settings.wallpaper')}
          description={t('settings.wallpaperDesc')}
        >
          <div className="flex flex-wrap justify-end gap-2">
            <Input
              ref={wallpaperInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={event => { const file = event.target.files?.[0]; if (file) void uploadWallpaper(file); }}
            />
            <Button variant="outline" size="sm" disabled={wallpaperBusy} onClick={() => wallpaperInputRef.current?.click()}>
              <CodePilotIcon name="upload" size="sm" aria-hidden />
              {wallpaperBusy ? t('settings.wallpaperWorking') : t('settings.wallpaperUpload')}
            </Button>
            {wallpaper.exists && <Button variant="ghost" size="sm" disabled={wallpaperBusy} onClick={() => void removeWallpaper()}>{t('settings.wallpaperRemove')}</Button>}
          </div>
        </FieldRow>

        {wallpaper.exists && (
          <FieldRow
            label={t('settings.wallpaperOpacity')}
            description={t('settings.wallpaperOpacityDesc')}
            separator
          >
            <div className="flex w-full max-w-xs items-center gap-3">
              <Input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(wallpaper.opacity * 100)}
                aria-label={t('settings.wallpaperOpacity')}
                onInput={event => publishWallpaper({ ...wallpaper, opacity: Number(event.currentTarget.value) / 100 })}
                onPointerUp={event => void persistWallpaperOpacity(Number(event.currentTarget.value) / 100)}
                onKeyUp={event => void persistWallpaperOpacity(Number(event.currentTarget.value) / 100)}
                onBlur={event => void persistWallpaperOpacity(Number(event.currentTarget.value) / 100)}
                className="h-2 cursor-pointer border-0 p-0"
              />
              <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">{Math.round(wallpaper.opacity * 100)}%</span>
            </div>
          </FieldRow>
        )}

        {wallpaper.exists && (
          <div className="mt-5 aspect-[16/5] overflow-hidden rounded-xl border border-border/60 bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated local settings endpoint */}
            <img src={wallpaper.imageUrl} alt={t('settings.wallpaperPreview')} className="h-full w-full object-cover" style={{ opacity: wallpaper.opacity }} />
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">{t('settings.wallpaperFormats')}</p>
        {wallpaperError && <p role="alert" className="mt-2 text-xs text-destructive">{wallpaperError}</p>}
      </SettingsCard>
    </div>
  );
}
