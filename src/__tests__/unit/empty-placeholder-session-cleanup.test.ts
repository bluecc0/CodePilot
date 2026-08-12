import '../db-isolation.setup';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
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

test('bulk cleanup only removes idle, unbound user placeholders with no messages', async () => {
  const wd = process.cwd();
  const emptyA = createSession(undefined, undefined, undefined, wd, 'code');
  const emptyB = createSession(undefined, undefined, undefined, wd, 'code');

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
    new Set(listEmptyPlaceholderSessionIds()),
    new Set([emptyA.id, emptyB.id]),
  );

  const preview = await previewEmptySessionsRoute();
  assert.equal(preview.status, 200);
  const previewBody = await preview.json() as { count: number; sessionIds: string[] };
  assert.equal(previewBody.count, 2);
  assert.deepEqual(new Set(previewBody.sessionIds), new Set([emptyA.id, emptyB.id]));

  const deletion = await deleteEmptySessionsRoute();
  assert.equal(deletion.status, 200);
  const deletionBody = await deletion.json() as { deletedCount: number; sessionIds: string[] };
  assert.equal(deletionBody.deletedCount, 2);
  assert.deepEqual(new Set(deletionBody.sessionIds), new Set([emptyA.id, emptyB.id]));
  assert.equal(getSession(emptyA.id), undefined);
  assert.equal(getSession(emptyB.id), undefined);
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

  assert.deepEqual(deleteEmptyPlaceholderSessions(), [], 'a second cleanup is idempotent');
});

test('DELETE rechecks eligibility after the preview-confirmation gap', async () => {
  const session = createSession(undefined, undefined, undefined, process.cwd(), 'code');
  const preview = await previewEmptySessionsRoute();
  const previewBody = await preview.json() as { sessionIds: string[] };
  assert.ok(previewBody.sessionIds.includes(session.id));

  addMessage(session.id, 'user', 'arrived while the confirmation dialog was open');

  const deletion = await deleteEmptySessionsRoute();
  const deletionBody = await deletion.json() as { sessionIds: string[] };
  assert.equal(deletionBody.sessionIds.includes(session.id), false);
  assert.ok(getSession(session.id), 'a conversation that became active must remain');
});
