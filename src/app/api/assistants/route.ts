import type { CharacterProfileInput } from '@/types';
import { createCharacterProfile, listCharacterProfiles } from '@/lib/character-store';
import { normalizeCharacterCard, normalizeManualCharacter, CharacterCardError } from '@/lib/character-card';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ assistants: listCharacterProfiles() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input: CharacterProfileInput = body?.source_spec && body.source_spec !== 'manual'
      ? normalizeCharacterCard({ ...body, spec: `chara_card_${body.source_spec}` })
      : normalizeManualCharacter(body);
    return Response.json({ assistant: createCharacterProfile(input) }, { status: 201 });
  } catch (error) {
    const status = error instanceof CharacterCardError ? 400 : 500;
    return Response.json({
      error: error instanceof Error ? error.message : 'Failed to create character',
      code: error instanceof CharacterCardError ? error.code : 'CREATE_FAILED',
    }, { status });
  }
}
