import { NextResponse } from 'next/server';
import { purgePrivateSessions } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Remove temporary privacy conversations left by a previous renderer or
 * process. The normal chat-session list never returns these rows, but the
 * explicit cleanup route makes entering/exiting privacy mode idempotent.
 */
export async function DELETE() {
  try {
    return NextResponse.json({ deleted: purgePrivateSessions() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clean temporary conversations' },
      { status: 500 },
    );
  }
}
