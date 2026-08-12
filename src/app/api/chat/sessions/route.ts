import { NextRequest } from 'next/server';
import path from 'node:path';
import { getAllSessions, createSession, updateSessionConversationBinding } from '@/lib/db';
import { getCharacterProfile } from '@/lib/character-store';
import { sanitizeManualTitle, type TitleOrigin } from '@/lib/conversation-title';
import type { CreateSessionRequest, SessionsResponse, SessionResponse } from '@/types';
import { serverErrorResponse } from '@/lib/api-error';
import { isPermissionProfile, PERMISSION_PROFILES } from '@/lib/permission/profile';
import { isExistingDirectory } from '@/lib/working-directory';

export async function GET(request: NextRequest) {
  try {
    // Phase 3 Step 4 — task-bound sessions (`source='task'`) are the
    // execution sessions created by the agent task runner; they
    // shouldn't pollute the main ChatListPanel. The `source` query
    // param controls visibility:
    //   - omitted / 'user' → only user-created sessions (the default
    //     for ChatListPanel and most consumers).
    //   - 'task' → only task-bound sessions (used by Tasks page when
    //     listing all execution sessions).
    //   - 'all' → both (no filter).
    // This keeps the original "main list shows user conversations"
    // contract while still letting the Tasks page surface execution
    // sessions for users who want to browse them directly.
    const sourceParam = request.nextUrl.searchParams.get('source');
    const includeSources: ReadonlyArray<'user' | 'task' | 'private'> | undefined =
      sourceParam === 'task'
        ? ['task']
        : sourceParam === 'private'
          ? ['private']
        : sourceParam === 'all'
          ? undefined
          : ['user'];
    const sessions = getAllSessions(includeSources ? { includeSources } : undefined);
    const response: SessionsResponse = { sessions };
    return Response.json(response);
  } catch (error) {
    return serverErrorResponse('GET /api/chat/sessions', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateSessionRequest = await request.json();

    // Validate working_directory is provided
    if (!body.working_directory) {
      return Response.json(
        { error: 'Working directory is required', code: 'MISSING_DIRECTORY' },
        { status: 400 },
      );
    }

    // Validate directory actually exists on disk
    const workingDirectory = body.working_directory.trim();
    if (!path.isAbsolute(workingDirectory) || !isExistingDirectory(workingDirectory)) {
      return Response.json(
        { error: 'Working directory must be an existing absolute directory', code: 'INVALID_DIRECTORY' },
        { status: 400 },
      );
    }

    // A session is created with the profile the composer was showing. An
    // unrecognised value is rejected rather than coerced — silently
    // downgrading a caller that asked for 'full_access' would be as much a
    // lie as silently honouring a typo'd elevation.
    if (body.permission_profile !== undefined && !isPermissionProfile(body.permission_profile)) {
      return Response.json(
        { error: `permission_profile must be one of: ${PERMISSION_PROFILES.join(', ')}` },
        { status: 400 },
      );
    }

    if (body.assistant_id !== undefined
      && (typeof body.assistant_id !== 'string' || !body.assistant_id || !getCharacterProfile(body.assistant_id))) {
      return Response.json({ error: 'Character not found', code: 'INVALID_CHARACTER' }, { status: 404 });
    }

    // Title is optional and, since the composer stopped sending one, normally
    // absent — the session is created as a placeholder and POST /api/chat
    // derives the fallback from the first real message. A caller that DOES
    // name the session is stating explicit intent, so it's validated through
    // the shared rules and recorded as 'manual' (never auto-overwritten).
    let title: string | undefined;
    let titleOrigin: TitleOrigin | undefined;
    if (body.title !== undefined) {
      const result = sanitizeManualTitle(body.title);
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: 400 });
      }
      title = result.title;
      titleOrigin = 'manual';
    }

    const session = createSession(
      title,
      body.model,
      body.system_prompt,
      path.normalize(workingDirectory),
      body.mode,
      body.provider_id,
      body.permission_profile,
      body.ephemeral ? 'private' : undefined,
      titleOrigin,
    );
    if (body.assistant_id) {
      updateSessionConversationBinding(session.id, { kind: 'character', assistantId: body.assistant_id });
    }
    const response: SessionResponse = {
      session: body.assistant_id
        ? { ...session, conversation_kind: 'character', assistant_id: body.assistant_id }
        : session,
    };
    return Response.json(response, { status: 201 });
  } catch (error) {
    return serverErrorResponse('POST /api/chat/sessions', error);
  }
}
