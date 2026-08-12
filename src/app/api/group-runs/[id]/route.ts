import type { GroupRunStatus } from '@/types';
import { getGroupRun, updateGroupRun } from '@/lib/character-store';

const TERMINAL = new Set<GroupRunStatus>(['completed', 'partial', 'failed', 'cancelled']);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getGroupRun(id);
  return run ? Response.json({ run }) : Response.json({ error: 'Group run not found' }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = getGroupRun(id);
  if (!current) return Response.json({ error: 'Group run not found' }, { status: 404 });
  if (TERMINAL.has(current.status)) {
    return Response.json({ error: 'Group run is already terminal', code: 'RUN_TERMINAL' }, { status: 409 });
  }
  const body = await request.json() as { status?: GroupRunStatus; next_index?: number; error?: string };
  if (body.status && body.status !== 'running' && !TERMINAL.has(body.status)) {
    return Response.json({ error: 'Invalid run status' }, { status: 400 });
  }
  const queueLength = (JSON.parse(current.speaker_queue_json) as unknown[]).length;
  const nextIndex = body.next_index === undefined ? current.next_index : body.next_index;
  if (!Number.isInteger(nextIndex) || nextIndex < current.next_index || nextIndex > queueLength) {
    return Response.json({ error: 'next_index must advance monotonically within the speaker queue' }, { status: 409 });
  }
  if (body.status === 'completed' && nextIndex !== queueLength) {
    return Response.json({ error: 'A run can complete only after every queued speaker finishes' }, { status: 409 });
  }
  const run = updateGroupRun(id, {
    status: body.status,
    nextIndex,
    error: typeof body.error === 'string' ? body.error.slice(0, 2000) : undefined,
  });
  return Response.json({ run });
}
