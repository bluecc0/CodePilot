import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promptNeedsMediaMcp } from '../../lib/media-intent';

describe('promptNeedsMediaMcp', () => {
  it('recognizes common Chinese image-generation phrasing', () => {
    assert.equal(promptNeedsMediaMcp('请生成一张人物头像'), true);
    assert.equal(promptNeedsMediaMcp('帮我做一张赛博朋克海报'), true);
    assert.equal(promptNeedsMediaMcp('画一个可爱的猫咪'), true);
    assert.equal(promptNeedsMediaMcp('帮我保存这张图片到素材库'), true);
  });

  it('recognizes common English image-generation phrasing', () => {
    assert.equal(promptNeedsMediaMcp('Generate an image of a cinematic city at night'), true);
    assert.equal(promptNeedsMediaMcp('Draw a portrait in an editorial style'), true);
  });

  it('also checks the existing conversation', () => {
    assert.equal(promptNeedsMediaMcp('继续', [{ content: '生成一张产品海报' }]), true);
    assert.equal(promptNeedsMediaMcp('继续', [{ content: '解释这段代码' }]), false);
  });

  it('does not enable media tools for unrelated prompts', () => {
    assert.equal(promptNeedsMediaMcp('解释一下缓存策略的原理'), false);
    assert.equal(promptNeedsMediaMcp('帮我重构这个 TypeScript 函数'), false);
  });
});
