import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createCharacterProfile, updateCharacterProfile } from '@/lib/character-store';
import { CharacterCardError, MAX_CHARACTER_CARD_BYTES, parseCharacterCard } from '@/lib/character-card';

export const runtime = 'nodejs';

function persistAvatar(profileId: string, buffer: Buffer): string {
  const root = process.env.CLAUDE_GUI_DATA_DIR || path.join(os.homedir(), '.codepilot');
  const dir = path.join(root, 'characters');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${profileId}.png`);
  const temporary = `${target}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, buffer, { mode: 0o600 });
  fs.renameSync(temporary, target);
  return target;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return Response.json({ error: 'Character card file is required', code: 'MISSING_FILE' }, { status: 400 });
    }
    if (file.size > MAX_CHARACTER_CARD_BYTES) {
      return Response.json({ error: 'Character card file is too large', code: 'CARD_TOO_LARGE' }, { status: 413 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const input = parseCharacterCard(buffer, file.name);
    let assistant = createCharacterProfile(input);
    if (file.name.toLowerCase().endsWith('.png')) {
      const avatarPath = persistAvatar(assistant.id, buffer);
      assistant = updateCharacterProfile(assistant.id, { avatar_path: avatarPath })!;
    }
    return Response.json({ assistant }, { status: 201 });
  } catch (error) {
    const status = error instanceof CharacterCardError
      ? (error.code === 'CARD_TOO_LARGE' ? 413 : 400)
      : 500;
    return Response.json({
      error: error instanceof Error ? error.message : 'Failed to import character card',
      code: error instanceof CharacterCardError ? error.code : 'IMPORT_FAILED',
    }, { status });
  }
}
