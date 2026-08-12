import { createAssistantGroup, listAssistantGroups, normalizeAssistantGroupInput } from '@/lib/character-store';

export async function GET() {
  return Response.json({ groups: listAssistantGroups() });
}

export async function POST(request: Request) {
  try {
    return Response.json({ group: createAssistantGroup(normalizeAssistantGroupInput(await request.json())) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to create group' }, { status: 400 });
  }
}
