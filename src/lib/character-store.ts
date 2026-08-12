import crypto from 'node:crypto';
import type {
  AssistantGroup,
  AssistantGroupInput,
  AssistantGroupMember,
  CharacterProfile,
  CharacterProfileInput,
  GroupRun,
  GroupRunStatus,
} from '@/types';
import { getDb } from '@/lib/db';

const GROUP_NAME_LIMIT = 200;
const GROUP_TEXT_LIMIT = 64 * 1024;
const GROUP_CONTRACT_LIMIT = 256 * 1024;
const GROUP_MEMBER_LIMIT = 256;
const IDENTIFIER_LIMIT = 128;

function id(): string {
  return crypto.randomBytes(16).toString('hex');
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').split('.')[0];
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function groupString(value: unknown, field: string, limit: number, required = false): string {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const normalized = value.replace(/\u0000/g, '').trim();
  if (required && !normalized) throw new Error(`${field} is required`);
  if (normalized.length > limit) throw new Error(`${field} is too long`);
  return normalized;
}

export function normalizeAssistantGroupInput(raw: unknown): AssistantGroupInput {
  if (!plainObject(raw)) throw new Error('Group must be an object');
  const strategies = new Set(['list', 'manual', 'natural', 'pooled']);
  const strategy = raw.activation_strategy ?? 'list';
  if (typeof strategy !== 'string' || !strategies.has(strategy)) throw new Error('Invalid activation strategy');
  if (raw.generation_mode !== undefined && raw.generation_mode !== 'sequential') {
    throw new Error('Only sequential generation is supported');
  }
  if (!Array.isArray(raw.members) || raw.members.length === 0) throw new Error('Choose at least one character');
  if (raw.members.length > GROUP_MEMBER_LIMIT) throw new Error('Group has too many members');
  const seen = new Set<string>();
  const members = raw.members.map((member, index) => {
    if (!plainObject(member)) throw new Error(`members[${index}] must be an object`);
    const assistantId = groupString(member.assistant_id, `members[${index}].assistant_id`, IDENTIFIER_LIMIT, true);
    if (seen.has(assistantId)) throw new Error(`Duplicate character: ${assistantId}`);
    seen.add(assistantId);
    if (member.enabled !== undefined && typeof member.enabled !== 'boolean') {
      throw new Error(`members[${index}].enabled must be a boolean`);
    }
    if (member.talkativeness !== undefined
      && (typeof member.talkativeness !== 'number' || !Number.isFinite(member.talkativeness))) {
      throw new Error(`members[${index}].talkativeness must be a number`);
    }
    return {
      assistant_id: assistantId,
      enabled: member.enabled as boolean | undefined,
      talkativeness: member.talkativeness === undefined
        ? undefined
        : Math.max(0, Math.min(1, member.talkativeness as number)),
      role_label: groupString(member.role_label, `members[${index}].role_label`, 4096),
    };
  });
  const contract = raw.collaboration_contract ?? {};
  if (!plainObject(contract)) throw new Error('collaboration_contract must be an object');
  if (Buffer.byteLength(JSON.stringify(contract), 'utf8') > GROUP_CONTRACT_LIMIT) {
    throw new Error('collaboration_contract is too large');
  }
  if (raw.allow_self_responses !== undefined && typeof raw.allow_self_responses !== 'boolean') {
    throw new Error('allow_self_responses must be a boolean');
  }
  return {
    name: groupString(raw.name, 'Group name', GROUP_NAME_LIMIT, true),
    description: groupString(raw.description, 'description', GROUP_TEXT_LIMIT),
    activation_strategy: strategy as AssistantGroupInput['activation_strategy'],
    generation_mode: 'sequential',
    allow_self_responses: raw.allow_self_responses === true,
    collaboration_contract: contract,
    members,
  };
}

export function listCharacterProfiles(): CharacterProfile[] {
  return getDb().prepare('SELECT * FROM assistant_profiles ORDER BY updated_at DESC').all() as CharacterProfile[];
}

export function getCharacterProfile(profileId: string): CharacterProfile | undefined {
  return getDb().prepare('SELECT * FROM assistant_profiles WHERE id = ?').get(profileId) as CharacterProfile | undefined;
}

export function createCharacterProfile(input: CharacterProfileInput): CharacterProfile {
  const db = getDb();
  const profileId = id();
  const timestamp = now();
  db.prepare(`
    INSERT INTO assistant_profiles (
      id, name, avatar_path, description, personality, scenario, first_message,
      message_examples, system_prompt, post_history_instructions,
      alternate_greetings_json, tags_json, creator, character_version,
      source_spec, source_metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    profileId, input.name, input.avatar_path || '', input.description || '', input.personality || '',
    input.scenario || '', input.first_message || '', input.message_examples || '', input.system_prompt || '',
    input.post_history_instructions || '', JSON.stringify(input.alternate_greetings || []),
    JSON.stringify(input.tags || []), input.creator || '', input.character_version || '',
    input.source_spec || 'manual', JSON.stringify(input.source_metadata || {}), timestamp, timestamp,
  );
  return getCharacterProfile(profileId)!;
}

export function updateCharacterProfile(profileId: string, input: Partial<CharacterProfileInput>): CharacterProfile | undefined {
  const existing = getCharacterProfile(profileId);
  if (!existing) return undefined;
  const merged: CharacterProfileInput = {
    name: input.name ?? existing.name,
    avatar_path: input.avatar_path ?? existing.avatar_path,
    description: input.description ?? existing.description,
    personality: input.personality ?? existing.personality,
    scenario: input.scenario ?? existing.scenario,
    first_message: input.first_message ?? existing.first_message,
    message_examples: input.message_examples ?? existing.message_examples,
    system_prompt: input.system_prompt ?? existing.system_prompt,
    post_history_instructions: input.post_history_instructions ?? existing.post_history_instructions,
    alternate_greetings: input.alternate_greetings ?? JSON.parse(existing.alternate_greetings_json),
    tags: input.tags ?? JSON.parse(existing.tags_json),
    creator: input.creator ?? existing.creator,
    character_version: input.character_version ?? existing.character_version,
    source_spec: input.source_spec ?? existing.source_spec,
    source_metadata: input.source_metadata ?? JSON.parse(existing.source_metadata_json),
  };
  getDb().prepare(`
    UPDATE assistant_profiles SET name = ?, avatar_path = ?, description = ?, personality = ?, scenario = ?,
      first_message = ?, message_examples = ?, system_prompt = ?, post_history_instructions = ?,
      alternate_greetings_json = ?, tags_json = ?, creator = ?, character_version = ?, source_spec = ?,
      source_metadata_json = ?, updated_at = ? WHERE id = ?
  `).run(
    merged.name, merged.avatar_path, merged.description, merged.personality, merged.scenario,
    merged.first_message, merged.message_examples, merged.system_prompt, merged.post_history_instructions,
    JSON.stringify(merged.alternate_greetings), JSON.stringify(merged.tags), merged.creator,
    merged.character_version, merged.source_spec, JSON.stringify(merged.source_metadata), now(), profileId,
  );
  return getCharacterProfile(profileId);
}

export function deleteCharacterProfile(profileId: string): boolean {
  return getDb().prepare('DELETE FROM assistant_profiles WHERE id = ?').run(profileId).changes > 0;
}

export function listAssistantGroups(): AssistantGroup[] {
  return (getDb().prepare('SELECT * FROM assistant_groups WHERE deleted_at IS NULL ORDER BY updated_at DESC').all() as AssistantGroup[])
    .map(group => ({ ...group, members: getAssistantGroupMembers(group.id) }));
}

export function getAssistantGroupMembers(groupId: string): AssistantGroupMember[] {
  const rows = getDb().prepare(`
    SELECT gm.*, ap.id AS ap_id, ap.name AS ap_name, ap.avatar_path AS ap_avatar_path,
      ap.description AS ap_description, ap.personality AS ap_personality, ap.scenario AS ap_scenario,
      ap.first_message AS ap_first_message, ap.message_examples AS ap_message_examples,
      ap.system_prompt AS ap_system_prompt, ap.post_history_instructions AS ap_post_history_instructions,
      ap.alternate_greetings_json AS ap_alternate_greetings_json, ap.tags_json AS ap_tags_json,
      ap.creator AS ap_creator, ap.character_version AS ap_character_version, ap.source_spec AS ap_source_spec,
      ap.source_metadata_json AS ap_source_metadata_json, ap.created_at AS ap_created_at, ap.updated_at AS ap_updated_at
    FROM assistant_group_members gm
    JOIN assistant_profiles ap ON ap.id = gm.assistant_id
    WHERE gm.group_id = ? ORDER BY gm.sort_order ASC
  `).all(groupId) as Record<string, unknown>[];
  return rows.map((row) => ({
    group_id: row.group_id,
    assistant_id: row.assistant_id,
    sort_order: row.sort_order,
    enabled: row.enabled,
    talkativeness: row.talkativeness,
    role_label: row.role_label,
    assistant: {
      id: row.ap_id, name: row.ap_name, avatar_path: row.ap_avatar_path, description: row.ap_description,
      personality: row.ap_personality, scenario: row.ap_scenario, first_message: row.ap_first_message,
      message_examples: row.ap_message_examples, system_prompt: row.ap_system_prompt,
      post_history_instructions: row.ap_post_history_instructions,
      alternate_greetings_json: row.ap_alternate_greetings_json, tags_json: row.ap_tags_json,
      creator: row.ap_creator, character_version: row.ap_character_version, source_spec: row.ap_source_spec,
      source_metadata_json: row.ap_source_metadata_json, created_at: row.ap_created_at, updated_at: row.ap_updated_at,
    } as CharacterProfile,
  })) as AssistantGroupMember[];
}

export function getAssistantGroup(groupId: string): AssistantGroup | undefined {
  const group = getDb().prepare('SELECT * FROM assistant_groups WHERE id = ?').get(groupId) as AssistantGroup | undefined;
  return group ? { ...group, members: getAssistantGroupMembers(group.id) } : undefined;
}

function replaceMembers(groupId: string, members: AssistantGroupInput['members']): void {
  const db = getDb();
  const unique = new Set<string>();
  const insert = db.prepare(`
    INSERT INTO assistant_group_members (group_id, assistant_id, sort_order, enabled, talkativeness, role_label)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  db.prepare('DELETE FROM assistant_group_members WHERE group_id = ?').run(groupId);
  members.forEach((member, index) => {
    if (unique.has(member.assistant_id)) return;
    unique.add(member.assistant_id);
    if (!getCharacterProfile(member.assistant_id)) throw new Error(`Unknown character: ${member.assistant_id}`);
    insert.run(
      groupId, member.assistant_id, index, member.enabled === false ? 0 : 1,
      Math.max(0, Math.min(1, member.talkativeness ?? 0.5)), member.role_label || '',
    );
  });
}

export function createAssistantGroup(input: AssistantGroupInput): AssistantGroup {
  const db = getDb();
  const groupId = id();
  const timestamp = now();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO assistant_groups (id, name, description, avatar_path, activation_strategy, generation_mode,
        allow_self_responses, collaboration_contract_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'sequential', ?, ?, ?, ?)
    `).run(
      groupId, input.name, input.description || '', input.avatar_path || '', input.activation_strategy || 'list',
      input.allow_self_responses ? 1 : 0, JSON.stringify(input.collaboration_contract || {}), timestamp, timestamp,
    );
    replaceMembers(groupId, input.members);
  })();
  return getAssistantGroup(groupId)!;
}

export function updateAssistantGroup(groupId: string, input: AssistantGroupInput): AssistantGroup | undefined {
  if (!getAssistantGroup(groupId)) return undefined;
  const db = getDb();
  db.transaction(() => {
    db.prepare(`UPDATE assistant_groups SET name = ?, description = ?, avatar_path = ?, activation_strategy = ?,
      generation_mode = 'sequential', allow_self_responses = ?, collaboration_contract_json = ?, updated_at = ? WHERE id = ?`
    ).run(
      input.name, input.description || '', input.avatar_path || '', input.activation_strategy || 'list',
      input.allow_self_responses ? 1 : 0, JSON.stringify(input.collaboration_contract || {}), now(), groupId,
    );
    replaceMembers(groupId, input.members);
  })();
  return getAssistantGroup(groupId);
}

export function deleteAssistantGroup(groupId: string): boolean {
  // Preserve old sessions and durable runs: deletion removes the group from
  // the library while historical chats can still resolve their speakers.
  const timestamp = now();
  return getDb().prepare('UPDATE assistant_groups SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(timestamp, timestamp, groupId).changes > 0;
}

export function createGroupRun(input: {
  sessionId: string;
  groupId: string;
  objective: string;
  selectedAssistantIds?: string[];
}): GroupRun {
  const group = getAssistantGroup(input.groupId);
  if (!group) throw new Error('Group not found');
  const enabled = (group.members || []).filter(member => member.enabled === 1);
  if (!input.objective.trim()) throw new Error('Message is required');
  if (input.objective.length > GROUP_TEXT_LIMIT) throw new Error('Message is too long');
  if (input.selectedAssistantIds && input.selectedAssistantIds.length > GROUP_MEMBER_LIMIT) {
    throw new Error('Too many selected speakers');
  }
  const requested = input.selectedAssistantIds ? new Set(input.selectedAssistantIds) : undefined;
  if (requested && requested.size !== input.selectedAssistantIds!.length) {
    throw new Error('Selected speakers contain duplicates');
  }
  const selected = input.selectedAssistantIds?.length
    ? enabled.filter(member => input.selectedAssistantIds!.includes(member.assistant_id))
    : enabled;
  if (requested && selected.length !== requested.size) throw new Error('Selected speaker is not enabled in this group');
  if (selected.length === 0) throw new Error('Group has no enabled speakers');
  const runId = id();
  const timestamp = now();
  const queue = selected.map((member, sequence) => ({ assistantId: member.assistant_id, sequence }));
  getDb().prepare(`
    INSERT INTO group_runs (id, session_id, group_id, mode, status, speaker_queue_json, next_index,
      objective, contract_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?)
  `).run(runId, input.sessionId, input.groupId, group.activation_strategy, JSON.stringify(queue), input.objective,
    group.collaboration_contract_json || '{}', timestamp, timestamp);
  return getGroupRun(runId)!;
}

export function getGroupRun(runId: string): GroupRun | undefined {
  return getDb().prepare('SELECT * FROM group_runs WHERE id = ?').get(runId) as GroupRun | undefined;
}

export function updateGroupRun(
  runId: string,
  patch: { status?: GroupRunStatus; nextIndex?: number; userMessageId?: string; error?: string },
): GroupRun | undefined {
  const run = getGroupRun(runId);
  if (!run) return undefined;
  const status = patch.status ?? run.status;
  const completedAt = ['completed', 'partial', 'failed', 'cancelled'].includes(status) ? now() : run.completed_at;
  getDb().prepare(`UPDATE group_runs SET status = ?, next_index = ?, user_message_id = ?, error = ?,
    updated_at = ?, completed_at = ? WHERE id = ?`).run(
      status, patch.nextIndex ?? run.next_index, patch.userMessageId ?? run.user_message_id,
      patch.error ?? run.error, now(), completedAt, runId,
    );
  return getGroupRun(runId);
}
