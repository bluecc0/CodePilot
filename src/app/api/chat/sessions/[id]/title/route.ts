import { NextRequest } from 'next/server';
import { getFirstUserMessage, getSession } from '@/lib/db';
import { resolveRuntimeForSession } from '@/lib/chat-runtime';
import { generateSessionTitle } from '@/lib/title-generation';

/**
 * Explicitly regenerate a conversation title with the provider already bound
 * to that session. This is intentionally a separate endpoint from PATCH:
 * manual renaming remains deterministic, while this action is a deliberate
 * model call with its own retry and timeout semantics.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = getSession(id);
    if (!session) {
      return Response.json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' }, { status: 404 });
    }

    if (!session.provider_id) {
      return Response.json(
        {
          error: 'This conversation has no saved provider. Select a provider and try again.',
          code: 'SESSION_PROVIDER_MISSING',
        },
        { status: 409 },
      );
    }

    const firstUserMessage = getFirstUserMessage(id);
    if (!firstUserMessage?.content) {
      return Response.json(
        { error: 'Send a message before generating a title.', code: 'SESSION_HAS_NO_USER_MESSAGE' },
        { status: 400 },
      );
    }

    const result = await generateSessionTitle({
      sessionId: id,
      userText: firstUserMessage.content,
      runtime: resolveRuntimeForSession(session),
      providerId: session.provider_id,
      model: session.model || undefined,
      mode: 'manual',
    });

    if (result.outcome !== 'generated') {
      const status = result.outcome === 'skipped-busy' ? 409 : 502;
      return Response.json(
        {
          error: result.outcome === 'skipped-busy'
            ? 'A title is already being generated for this conversation.'
            : 'The provider could not generate a title. Check the provider configuration and try again.',
          code: `TITLE_GENERATION_${result.outcome.toUpperCase().replaceAll('-', '_')}`,
        },
        { status },
      );
    }

    const updated = getSession(id);
    if (!updated) {
      return Response.json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' }, { status: 404 });
    }
    return Response.json({ session: updated });
  } catch (error) {
    console.error('[session-title-api] Failed to regenerate title:', error);
    return Response.json(
      { error: 'Failed to regenerate the conversation title', code: 'TITLE_GENERATION_FAILED' },
      { status: 500 },
    );
  }
}
