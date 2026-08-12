import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { safePrivacyReturnPath } from '@/lib/privacy-route';
import { detectWallpaperFormat, normalizeWallpaperOpacity } from '@/lib/wallpaper';

test('privacy return path accepts internal routes and rejects loops or protocol-relative paths', () => {
  assert.equal(safePrivacyReturnPath('/chat/abc?panel=files'), '/chat/abc?panel=files');
  assert.equal(safePrivacyReturnPath('/privacy'), '/chat');
  assert.equal(safePrivacyReturnPath('//example.com'), '/chat');
  assert.equal(safePrivacyReturnPath('https://example.com'), '/chat');
});

test('wallpaper validation uses file signatures and bounded opacity', () => {
  assert.equal(detectWallpaperFormat(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'png');
  assert.equal(detectWallpaperFormat(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'jpg');
  assert.equal(detectWallpaperFormat(Buffer.from('RIFF0000WEBP')), 'webp');
  assert.equal(detectWallpaperFormat(Buffer.from('<svg></svg>')), null);
  assert.equal(normalizeWallpaperOpacity(0.376), 0.38);
  assert.equal(normalizeWallpaperOpacity(-1), null);
  assert.equal(normalizeWallpaperOpacity(1.01), null);
});

test('privacy shell suppresses conversation surfaces and wallpaper API is local-only', () => {
  const root = process.cwd();
  const shell = fs.readFileSync(path.join(root, 'src/components/layout/AppShell.tsx'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'src/app/api/settings/wallpaper/route.ts'), 'utf8');
  const privacyPage = fs.readFileSync(path.join(root, 'src/app/privacy/page.tsx'), 'utf8');
  const newChatPage = fs.readFileSync(path.join(root, 'src/app/chat/page.tsx'), 'utf8');
  const sessionApi = fs.readFileSync(path.join(root, 'src/app/api/chat/sessions/route.ts'), 'utf8');
  const privacyApi = fs.readFileSync(path.join(root, 'src/app/api/privacy/sessions/route.ts'), 'utf8');
  const db = fs.readFileSync(path.join(root, 'src/lib/db.ts'), 'utf8');
  assert.match(shell, /chatListOpen && !isPrivacyRoute/);
  assert.match(shell, /!isPrivacyRoute && isSplitActive/);
  assert.match(shell, /!isPrivacyRoute && <GlobalSearchDialog/);
  assert.match(privacyPage, /<NewChatPageContent ephemeral \/>/);
  assert.match(privacyPage, /<PrivacySessionView sessionId=\{sessionId\} \/>/);
  assert.match(newChatPage, /if \(ephemeral\) createBody\.ephemeral = 'true'/);
  assert.match(newChatPage, /router\.replace\(`\/privacy\?session=/);
  assert.match(sessionApi, /body\.ephemeral \? 'private'/);
  assert.match(privacyApi, /purgePrivateSessions/);
  assert.match(db, /source != 'private'/);
  assert.match(db, /purgePrivateSessions/);
  assert.match(route, /MAX_WALLPAPER_BYTES/);
  assert.match(route, /detectWallpaperFormat/);
  assert.doesNotMatch(route, /https?:\/\//);
});
