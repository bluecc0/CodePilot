/**
 * Phase 2 (2026-06-03) — clearer "new chat" entry points in the sidebar.
 *
 * User ask: the bare "+" on project rows read ambiguously, and the assistant
 * (which has no folder, so it sits at the top level) had no way to start a new
 * chat. Fix: use the "写新对话" pencil/compose icon (CodePilotIcon `edit`) on
 * project rows, and add an identity picker to the top-level 助理 header.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const groupHeader = readFileSync(path.join(root, 'components/layout/ProjectGroupHeader.tsx'), 'utf8');
const chatList = readFileSync(path.join(root, 'components/layout/ChatListPanel.tsx'), 'utf8');
const assistantPicker = readFileSync(path.join(root, 'components/layout/AssistantChatPicker.tsx'), 'utf8');

describe('project row new-chat affordance uses the compose (edit) icon, not a bare +', () => {
  it('the onCreateSession button renders the edit/pencil icon', () => {
    assert.match(
      groupHeader,
      /onClick=\{onCreateSession\}[\s\S]{0,160}name="edit"/,
      'the project/assistant new-chat button must use the compose (edit) icon',
    );
  });
  it('no longer uses name="plus" for that button', () => {
    // The only plus in this file would have been the new-chat button.
    assert.doesNotMatch(groupHeader, /name="plus"/);
  });
});

describe('assistant top-level header has a compose new-chat entry', () => {
  it('opens the assistant identity picker for the assistant workspace', () => {
    assert.match(
      chatList,
      /<AssistantChatPicker[\s\S]{0,240}workingDirectory=\{aGroup\.workingDirectory\}/,
      'assistant header must pass its workspace to the identity picker',
    );
    assert.match(
      assistantPicker,
      /PopoverTrigger[\s\S]{0,500}name="edit"/,
      'assistant new-chat entry must use the compose (edit) icon',
    );
  });

  it('offers both the default assistant and persisted custom characters', () => {
    assert.match(assistantPicker, /fetch\('\/api\/assistants'\)/);
    assert.match(assistantPicker, /: '\/api\/chat\/sessions'/, 'default assistant must use normal session creation');
    assert.match(assistantPicker, /\/api\/assistants\/\$\{encodeURIComponent\(character\.id\)\}\/sessions/);
    assert.match(assistantPicker, /characters\.map\(character/);
  });
});
