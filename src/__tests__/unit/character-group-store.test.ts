import '../db-isolation.setup';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMessage,
  closeDb,
  createSession,
  getMessages,
  updateSessionConversationBinding,
} from '@/lib/db';
import {
  createAssistantGroup,
  createCharacterProfile,
  createGroupRun,
  deleteAssistantGroup,
  deleteCharacterProfile,
  getAssistantGroup,
  getGroupRun,
  listAssistantGroups,
  normalizeAssistantGroupInput,
  updateGroupRun,
} from '@/lib/character-store';

after(() => closeDb());

test('persists characters, ordered group members, durable run, and speaker metadata', () => {
  const analyst = createCharacterProfile({ name: 'Analyst', personality: 'Evidence first', source_spec: 'manual' });
  const critic = createCharacterProfile({ name: 'Critic', personality: 'Find weak assumptions', source_spec: 'manual' });
  const group = createAssistantGroup({
    name: 'Review board',
    members: [
      { assistant_id: analyst.id, role_label: 'Lead' },
      { assistant_id: critic.id, role_label: 'Reviewer', talkativeness: 0.8 },
    ],
  });
  assert.deepEqual(getAssistantGroup(group.id)?.members?.map(member => member.assistant?.name), ['Analyst', 'Critic']);

  const session = createSession('Review board', '', '', process.cwd(), 'ask');
  updateSessionConversationBinding(session.id, { kind: 'group', groupId: group.id });
  const run = createGroupRun({ sessionId: session.id, groupId: group.id, objective: 'Review this plan' });
  assert.deepEqual(JSON.parse(run.speaker_queue_json), [
    { assistantId: analyst.id, sequence: 0 },
    { assistantId: critic.id, sequence: 1 },
  ]);

  const user = addMessage(session.id, 'user', 'Review this plan', undefined, { group_run_id: run.id });
  addMessage(session.id, 'assistant', 'Initial analysis', undefined, {
    speaker_assistant_id: analyst.id,
    group_run_id: run.id,
    batch_sequence: 0,
  });
  updateGroupRun(run.id, { status: 'running', nextIndex: 1, userMessageId: user.id });
  const rows = getMessages(session.id, { limit: 10 }).messages;
  assert.equal(rows[1].speaker_assistant_id, analyst.id);
  assert.equal(rows[1].batch_sequence, 0);
  assert.equal(getGroupRun(run.id)?.next_index, 1);

  assert.throws(() => deleteCharacterProfile(analyst.id));
  assert.throws(() => createGroupRun({
    sessionId: session.id,
    groupId: group.id,
    objective: 'Invalid selection',
    selectedAssistantIds: ['missing-character'],
  }), /not enabled/);

  assert.equal(deleteAssistantGroup(group.id), true);
  assert.equal(listAssistantGroups().some(item => item.id === group.id), false);
  assert.equal(getAssistantGroup(group.id)?.name, 'Review board', 'soft deletion must preserve historical group resolution');
  assert.equal(deleteCharacterProfile(analyst.id), true, 'deleted groups must not block character cleanup');
  assert.deepEqual(getAssistantGroup(group.id)?.members?.map(member => member.assistant?.name), ['Critic']);
});

test('validates group members and rejects client-owned storage fields', () => {
  const normalized = normalizeAssistantGroupInput({
    name: '  Safe group  ',
    avatar_path: '/tmp/not-owned.png',
    members: [{ assistant_id: 'one', talkativeness: 2 }],
  });
  assert.equal(normalized.name, 'Safe group');
  assert.equal(normalized.avatar_path, undefined);
  assert.equal(normalized.members[0].talkativeness, 1);
  assert.throws(() => normalizeAssistantGroupInput({
    name: 'Duplicates',
    members: [{ assistant_id: 'one' }, { assistant_id: 'one' }],
  }), /Duplicate character/);
});
