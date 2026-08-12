import { deleteAssistantGroup, getAssistantGroup, normalizeAssistantGroupInput, updateAssistantGroup } from '@/lib/character-store';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = getAssistantGroup(id);
  return group ? Response.json({ group }) : Response.json({ error: 'Group not found' }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const group = updateAssistantGroup(id, normalizeAssistantGroupInput(await request.json()));
    return group ? Response.json({ group }) : Response.json({ error: 'Group not found' }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to update group' }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteAssistantGroup(id)
    ? new Response(null, { status: 204 })
    : Response.json({ error: 'Group not found' }, { status: 404 });
}
