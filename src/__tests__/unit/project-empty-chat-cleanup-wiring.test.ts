import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const chatList = readFileSync(path.join(root, 'components/layout/ChatListPanel.tsx'), 'utf8');
const groupHeader = readFileSync(path.join(root, 'components/layout/ProjectGroupHeader.tsx'), 'utf8');
const cleanupAction = readFileSync(path.join(root, 'components/layout/EmptyChatCleanupAction.tsx'), 'utf8');

describe('empty chat cleanup lives in each project menu', () => {
  it('wires the project path and name from the project ellipsis menu', () => {
    assert.match(
      groupHeader,
      /DropdownMenuItem[\s\S]{0,180}onCleanupEmptyChats\(workingDirectory, displayName\)[\s\S]{0,180}chatList\.cleanupEmpty/,
    );
    assert.match(
      chatList,
      /<ProjectGroupHeader[\s\S]{0,800}onCleanupEmptyChats=/,
    );
  });

  it('does not render cleanup as a top-level quick action', () => {
    const quickActions = chatList.slice(
      chatList.indexOf('{/* Quick actions + feature nav'),
      chatList.indexOf('{/* Sectioned list:'),
    );
    assert.doesNotMatch(quickActions, /<EmptyChatCleanupAction/);
  });

  it('scopes both preview and deletion requests to the selected project', () => {
    assert.match(cleanupAction, /URLSearchParams\(\{ workingDirectory: target\.workingDirectory \}\)/);
    assert.match(cleanupAction, /method: 'DELETE'/);
  });
});
