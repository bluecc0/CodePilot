import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  deleteEmptyPlaceholderSessions,
  listEmptyPlaceholderSessionIds,
} from '@/lib/db';
import { serverErrorResponse } from '@/lib/api-error';

export const runtime = 'nodejs';

function readWorkingDirectory(request: NextRequest): string | null {
  const workingDirectory = request.nextUrl.searchParams.get('workingDirectory');
  if (!workingDirectory || !path.isAbsolute(workingDirectory)) return null;
  return workingDirectory;
}

/** Preview the exact set that a subsequent DELETE is allowed to remove. */
export async function GET(request: NextRequest) {
  try {
    const workingDirectory = readWorkingDirectory(request);
    if (!workingDirectory) {
      return Response.json(
        { error: 'An absolute workingDirectory is required', code: 'INVALID_DIRECTORY' },
        { status: 400 },
      );
    }
    const sessionIds = listEmptyPlaceholderSessionIds(workingDirectory);
    return Response.json({ count: sessionIds.length, sessionIds });
  } catch (error) {
    return serverErrorResponse('GET /api/chat/sessions/empty', error);
  }
}

/** Recheck the predicate in one DB transaction and delete only safe rows. */
export async function DELETE(request: NextRequest) {
  try {
    const workingDirectory = readWorkingDirectory(request);
    if (!workingDirectory) {
      return Response.json(
        { error: 'An absolute workingDirectory is required', code: 'INVALID_DIRECTORY' },
        { status: 400 },
      );
    }
    const sessionIds = deleteEmptyPlaceholderSessions(workingDirectory);
    return Response.json({ deletedCount: sessionIds.length, sessionIds });
  } catch (error) {
    return serverErrorResponse('DELETE /api/chat/sessions/empty', error);
  }
}
