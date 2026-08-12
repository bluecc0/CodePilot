import { NextResponse } from 'next/server';
import { deletePrivateSession, getSession } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Delete a single temporary privacy conversation, refusing ordinary chats. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = getSession(id);
    if (!session) return NextResponse.json({ deleted: false }, { status: 404 });
    if (session.source !== 'private') {
      return NextResponse.json({ error: 'Only temporary privacy conversations can be deleted here' }, { status: 403 });
    }
    return NextResponse.json({ deleted: deletePrivateSession(id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete temporary conversation' },
      { status: 500 },
    );
  }
}
