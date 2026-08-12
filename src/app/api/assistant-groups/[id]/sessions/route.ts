import path from 'node:path';
import { createSession, getSetting, updateSessionConversationBinding } from '@/lib/db';
import { getAssistantGroup } from '@/lib/character-store';
import { isExistingDirectory } from '@/lib/working-directory';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = getAssistantGroup(id);
  if (!group) return Response.json({ error: 'Group not found' }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { working_directory?: string; model?: string; provider_id?: string };
  const candidate = (body.working_directory || getSetting('assistant_workspace_path') || '').trim();
  if (!path.isAbsolute(candidate) || !isExistingDirectory(candidate)) {
    return Response.json({ error: 'Choose an existing working directory first', code: 'INVALID_DIRECTORY' }, { status: 400 });
  }
  const session = createSession(group.name, body.model, '', path.normalize(candidate), 'ask', body.provider_id, undefined, 'user', 'manual');
  updateSessionConversationBinding(session.id, { kind: 'group', groupId: group.id });
  return Response.json({ session: { ...session, conversation_kind: 'group', group_id: group.id } }, { status: 201 });
}
