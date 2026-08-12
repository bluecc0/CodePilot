import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getCharacterProfile } from '@/lib/character-store';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assistant = getCharacterProfile(id);
  if (!assistant?.avatar_path) {
    return new Response(null, { status: 404 });
  }
  const root = process.env.CLAUDE_GUI_DATA_DIR || path.join(os.homedir(), '.codepilot');
  const expected = path.join(root, 'characters', `${assistant.id}.png`);
  if (path.resolve(assistant.avatar_path) !== path.resolve(expected)) return new Response(null, { status: 404 });
  try {
    const body = fs.readFileSync(expected);
    return new Response(body, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
