import '../db-isolation.setup';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  addMessage,
  closeDb,
  createSession,
  deleteEmptyPlaceholderSessions,
  getDb,
  getSession,
  listEmptyPlaceholderSessionIds,
  updateSessionConversationBinding,
} from '@/lib/db';
import {
  DELETE as deleteEmptySessionsRoute,
  GET as previewEmptySessionsRoute,
} from '@/app/api/chat/sessions/empty/route';

after(() => closeDb());

function cleanupRequest(workingDirectory?: string, method = 'GET') {
  const url = new URL('http://localhost/api/chat/sessions/empty');
  if (workingDirectory !== undefined) {
    url.searchParams.set('workingDirectory', workingDirectory);
  }
  return new NextRequest(url, { method });
}

test('project cleanup only removes idle, unbound user placeholders with no messages in that project', async () => {
  const wd = process.cwd();
  const otherWd = path.join(wd, 'another-project');
  const emptyA = createSession(undefined, undefined, undefined, wd, 'code');
  const emptyB = createSession(undefined, undefined, undefined, wd, 'code');
  const otherProjectEmpty = createSession(undefined, undefined, undefined, otherWd, 'code');

  const withMessage = createSession(undefined, undefined, undefined, wd, 'code');
  addMessage(withMessage.id, 'user', 'This conversation is real');

  const manuallyNamedNewChat = createSession('New Chat', undefined, undefined, wd, 'code');
  const taskPlaceholder = createSession(undefined, undefined, undefined, wd, 'code', undefined, undefined, 'task');
  const privatePlaceholder = createSession(undefined, undefined, undefined, wd, 'code', undefined, undefined, 'private');

  const characterPlaceholder = createSession(undefined, undefined, undefined, wd, 'code');
  updateSessionConversationBinding(characterPlaceholder.id, { kind: 'character', assistantId: 'test-character' });

  const runningPlaceholder = createSession(undefined, undefined, undefined, wd, 'code');
  getDb().prepare("UPDATE chat_sessions SET runtime_status = 'running' WHERE id = ?").run(runningPlaceholder.id);

  const scheduledPlaceholder = createSession(undefined, undefined, undefined, wd, 'code');
  getDb().prepare(`
    INSERT INTO scheduled_tasks (
      id, name, prompt, schedule_type, schedule_value, kind, next_run,
      status, origin_session_id
    ) VALUES (
      'scheduled-placeholder', 'Reminder', 'keep this context', 'once',
      '2099-01-01 00:00:00', 'reminder', '2099-01-01 00:00:00',
      'active', ?
    )
  `).run(scheduledPlaceholder.id);

  const generatedPlaceholder = createSession(undefined, undefined, undefined, wd, 'code');
  getDb().prepare("UPDATE chat_sessions SET codex_thread_id = 'thread-without-local-messages' WHERE id = ?")
    .run(generatedPlaceholder.id);

  const remotelyBoundPlaceholder = createSession(undefined, undefined, undefined, wd, 'code');
  getDb().prepare(`
    INSERT INTO channel_outbound_refs (
      id, channel_type, chat_id, codepilot_session_id, platform_message_id, purpose
    ) VALUES (?, 'telegram', 'chat-1', ?, 'message-1', 'response')
  `).run('outbound-placeholder', remotelyBoundPlaceholder.id);

  assert.deepEqual(
    new Set(listEmptyPlaceholderSessionIds(wd)),
    new Set([emptyA.id, emptyB.id]),
  );
  assert.deepEqual(listEmptyPlaceholderSessionIds(otherWd), [otherProjectEmpty.id]);

  const preview = await previewEmptySessionsRoute(cleanupRequest(wd));
  assert.equal(preview.status, 200);
  const previewBody = await preview.json() as { count: number; sessionIds: string[] };
  assert.equal(previewBody.count, 2);
  assert.deepEqual(new Set(previewBody.sessionIds), new Set([emptyA.id, emptyB.id]));

  const deletion = await deleteEmptySessionsRoute(cleanupRequest(wd, 'DELETE'));
  assert.equal(deletion.status, 200);
  const deletionBody = await deletion.json() as { deletedCount: number; sessionIds: string[] };
  assert.equal(deletionBody.deletedCount, 2);
  assert.deepEqual(new Set(deletionBody.sessionIds), new Set([emptyA.id, emptyB.id]));
  assert.equal(getSession(emptyA.id), undefined);
  assert.equal(getSession(emptyB.id), undefined);
  assert.ok(getSession(otherProjectEmpty.id), 'an empty conversation from another project must be preserved');
  for (const protectedSession of [
    withMessage,
    manuallyNamedNewChat,
    taskPlaceholder,
    privatePlaceholder,
    characterPlaceholder,
    runningPlaceholder,
    scheduledPlaceholder,
    generatedPlaceholder,
    remotelyBoundPlaceholder,
  ]) {
    assert.ok(getSession(protectedSession.id), `${protectedSession.id} must be preserved`);
  }

  assert.deepEqual(deleteEmptyPlaceholderSessions(wd), [], 'a second cleanup is idempotent');
});

test('DELETE rechecks eligibility after the preview-confirmation gap', async () => {
  const wd = process.cwd();
  const session = createSession(undefined, undefined, undefined, wd, 'code');
  const preview = await previewEmptySessionsRoute(cleanupRequest(wd));
  const previewBody = await preview.json() as { sessionIds: string[] };
  assert.ok(previewBody.sessionIds.includes(session.id));

  addMessage(session.id, 'user', 'arrived while the confirmation dialog was open');

  const deletion = await deleteEmptySessionsRoute(cleanupRequest(wd, 'DELETE'));
  const deletionBody = await deletion.json() as { sessionIds: string[] };
  assert.equal(deletionBody.sessionIds.includes(session.id), false);
  assert.ok(getSession(session.id), 'a conversation that became active must remain');
});

test('cleanup API rejects requests without an absolute project path', async () => {
  const missing = await previewEmptySessionsRoute(cleanupRequest());
  assert.equal(missing.status, 400);

  const relative = await deleteEmptySessionsRoute(cleanupRequest('relative/project', 'DELETE'));
  assert.equal(relative.status, 400);
});
