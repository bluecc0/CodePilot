import {
  deleteEmptyPlaceholderSessions,
  listEmptyPlaceholderSessionIds,
} from '@/lib/db';
import { serverErrorResponse } from '@/lib/api-error';

export const runtime = 'nodejs';

/** Preview the exact set that a subsequent DELETE is allowed to remove. */
export async function GET() {
  try {
    const sessionIds = listEmptyPlaceholderSessionIds();
    return Response.json({ count: sessionIds.length, sessionIds });
  } catch (error) {
    return serverErrorResponse('GET /api/chat/sessions/empty', error);
  }
}

/** Recheck the predicate in one DB transaction and delete only safe rows. */
export async function DELETE() {
  try {
    const sessionIds = deleteEmptyPlaceholderSessions();
    return Response.json({ deletedCount: sessionIds.length, sessionIds });
  } catch (error) {
    return serverErrorResponse('DELETE /api/chat/sessions/empty', error);
  }
}
