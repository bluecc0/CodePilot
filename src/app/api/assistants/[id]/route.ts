import { deleteCharacterProfile, getCharacterProfile, updateCharacterProfile } from '@/lib/character-store';
import { CharacterCardError, normalizeCharacterPatch } from '@/lib/character-card';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assistant = getCharacterProfile(id);
  return assistant
    ? Response.json({ assistant })
    : Response.json({ error: 'Character not found' }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const assistant = updateCharacterProfile(id, normalizeCharacterPatch(await request.json()));
    return assistant
      ? Response.json({ assistant })
      : Response.json({ error: 'Character not found' }, { status: 404 });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Invalid character update',
      code: error instanceof CharacterCardError ? error.code : 'INVALID_UPDATE',
    }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return deleteCharacterProfile(id)
      ? new Response(null, { status: 204 })
      : Response.json({ error: 'Character not found' }, { status: 404 });
  } catch {
    return Response.json({ error: 'Character is still used by a group', code: 'CHARACTER_IN_USE' }, { status: 409 });
  }
}
