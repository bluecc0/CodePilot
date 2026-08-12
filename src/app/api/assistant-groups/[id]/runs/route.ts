import { createGroupRun, getAssistantGroup } from '@/lib/character-store';
import { getSession } from '@/lib/db';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = getAssistantGroup(id);
  if (!group) return Response.json({ error: 'Group not found' }, { status: 404 });
  const body = await request.json() as { session_id?: string; objective?: string; selected_assistant_ids?: unknown };
  const session = body.session_id ? getSession(body.session_id) : undefined;
  if (!session || session.group_id !== id || session.conversation_kind !== 'group') {
    return Response.json({ error: 'Session is not bound to this group' }, { status: 409 });
  }
  if (typeof body.objective !== 'string' || !body.objective.trim()) {
    return Response.json({ error: 'Message is required' }, { status: 400 });
  }
  if (body.selected_assistant_ids !== undefined
    && (!Array.isArray(body.selected_assistant_ids)
      || body.selected_assistant_ids.some(id => typeof id !== 'string' || !id || id.length > 128))) {
    return Response.json({ error: 'selected_assistant_ids must be an array of character IDs' }, { status: 400 });
  }
  try {
    const run = createGroupRun({
      sessionId: session.id,
      groupId: id,
      objective: body.objective.trim(),
      selectedAssistantIds: body.selected_assistant_ids as string[] | undefined,
    });
    return Response.json({ run, queue: JSON.parse(run.speaker_queue_json) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to start group run' }, { status: 400 });
  }
}
