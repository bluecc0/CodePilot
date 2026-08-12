import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const chatRoute = fs.readFileSync(path.join(root, 'src/app/api/chat/route.ts'), 'utf8');
const collector = fs.readFileSync(path.join(root, 'src/lib/chat-collect-stream-response.ts'), 'utf8');
const groupView = fs.readFileSync(path.join(root, 'src/components/characters/GroupChatView.tsx'), 'utf8');
const sessionRoute = fs.readFileSync(path.join(root, 'src/app/api/chat/sessions/route.ts'), 'utf8');
const streamManager = fs.readFileSync(path.join(root, 'src/lib/stream-session-manager.ts'), 'utf8');
const chatView = fs.readFileSync(path.join(root, 'src/components/chat/ChatView.tsx'), 'utf8');

test('group turns fail closed against session, queue, and continuation position', () => {
  assert.match(chatRoute, /session\.conversation_kind !== 'group'/);
  assert.match(chatRoute, /run\.next_index !== batch_sequence/);
  assert.match(chatRoute, /continue_group !== \(batch_sequence! > 0\)/);
  assert.match(chatRoute, /expected\?\.assistantId !== assistant_id/);
});

test('speaker metadata reaches both streaming checkpoints and terminal message rows', () => {
  const spreads = collector.match(/\.\.\.opts\?\.messageMetadata/g) || [];
  assert.equal(spreads.length, 2);
  assert.match(chatRoute, /speaker_assistant_id: groupTurn\.assistantId/);
  assert.match(chatRoute, /group_run_id: groupTurn\.runId/);
  assert.match(chatRoute, /batch_sequence: groupTurn\.sequence/);
});

test('group console consumes the frozen queue sequentially and closes durable runs', () => {
  assert.match(groupView, /for \(const item of queue\)/);
  assert.match(groupView, /await runSpeaker\(/);
  assert.match(groupView, /status: 'completed', next_index: completed/);
  assert.match(groupView, /status: completed > 0 \? 'partial' : 'failed'/);
  assert.match(groupView, /optimistic-user-/);
  assert.match(groupView, /setMessages\(current => \[\.\.\.current/);
});

test('single-character selection is persisted and sent on every turn', () => {
  assert.match(sessionRoute, /updateSessionConversationBinding\(session\.id, \{ kind: 'character'/);
  assert.match(chatRoute, /session\.conversation_kind !== 'character'/);
  assert.match(chatRoute, /buildCharacterSystemPrompt\(profile\)/);
  assert.match(streamManager, /assistant_id: params\.assistantId/);
  assert.match(chatView, /<CharacterSelector/);
});
