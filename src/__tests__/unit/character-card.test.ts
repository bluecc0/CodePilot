import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CharacterCardError,
  extractCharacterCardFromPng,
  normalizeCharacterPatch,
  normalizeCharacterCard,
  normalizeManualCharacter,
  parseCharacterCard,
} from '@/lib/character-card';

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}

function pngCard(keyword: 'chara' | 'ccv3', card: unknown): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const encoded = Buffer.from(JSON.stringify(card), 'utf8').toString('base64');
  return Buffer.concat([
    signature,
    chunk('tEXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(encoded, 'latin1')])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('normalizes Character Card V1 flat JSON', () => {
  const card = normalizeCharacterCard({
    name: 'Alice', description: 'Explorer', personality: 'Curious', scenario: 'A station',
    first_mes: 'Hello', mes_example: '{{char}}: Ready?',
  });
  assert.equal(card.source_spec, 'v1');
  assert.equal(card.name, 'Alice');
  assert.equal(card.first_message, 'Hello');
  assert.equal(card.message_examples, '{{char}}: Ready?');
});

test('normalizes V2 and V3 data envelopes without executing extensions', () => {
  const v2 = normalizeCharacterCard({
    spec: 'chara_card_v2', spec_version: '2.0',
    data: { name: 'B', alternate_greetings: ['Hi'], tags: ['team'], extensions: { regex_scripts: ['ignored'] } },
  });
  assert.equal(v2.source_spec, 'v2');
  assert.deepEqual(v2.alternate_greetings, ['Hi']);
  assert.deepEqual(v2.source_metadata?.extensions, { regex_scripts: ['ignored'] });

  const v3 = normalizeCharacterCard({
    spec: 'chara_card_v3', spec_version: '3.0',
    data: { name: 'C', nickname: 'Captain', group_only_greetings: ['Team, report.'] },
  });
  assert.equal(v3.source_spec, 'v3');
  assert.equal(v3.source_metadata?.nickname, 'Captain');
});

test('PNG parser prefers ccv3 metadata over legacy chara', () => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const legacy = Buffer.from(JSON.stringify({ name: 'Legacy' })).toString('base64');
  const modern = Buffer.from(JSON.stringify({ spec: 'chara_card_v3', spec_version: '3.0', data: { name: 'Modern' } })).toString('base64');
  const png = Buffer.concat([
    signature,
    chunk('tEXt', Buffer.concat([Buffer.from('chara'), Buffer.from([0]), Buffer.from(legacy)])),
    chunk('tEXt', Buffer.concat([Buffer.from('ccv3'), Buffer.from([0]), Buffer.from(modern)])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  assert.equal(normalizeCharacterCard(extractCharacterCardFromPng(png)).name, 'Modern');
  assert.equal(parseCharacterCard(pngCard('chara', { name: 'PNG V1' }), 'card.png').name, 'PNG V1');
});

test('rejects malformed or nameless cards with stable codes', () => {
  assert.throws(() => parseCharacterCard(Buffer.from('{bad'), 'card.json'), (error: unknown) => {
    assert.ok(error instanceof CharacterCardError);
    assert.equal(error.code, 'INVALID_JSON');
    return true;
  });
  assert.throws(() => normalizeCharacterCard({ description: 'No name' }), (error: unknown) => {
    assert.ok(error instanceof CharacterCardError);
    assert.equal(error.code, 'MISSING_NAME');
    return true;
  });
});

test('bounds manual characters and whitelists editable patch fields', () => {
  const manual = normalizeManualCharacter({ name: '  Manual  ', tags: ['local'] });
  assert.equal(manual.name, 'Manual');
  assert.equal(manual.source_spec, 'manual');

  const patch = normalizeCharacterPatch({
    name: 'Renamed',
    avatar_path: '/etc/passwd',
    source_spec: 'v3',
    source_metadata: { injected: true },
  });
  assert.deepEqual(patch, { name: 'Renamed' });
  assert.throws(() => normalizeManualCharacter({ name: 'A'.repeat(64 * 1024 + 1) }), (error: unknown) => {
    assert.ok(error instanceof CharacterCardError);
    assert.equal(error.code, 'FIELD_TOO_LARGE');
    return true;
  });
});
