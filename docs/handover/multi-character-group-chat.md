# 多角色卡与群聊编排技术交接

> 产品思考见 [docs/insights/multi-character-group-chat.md](../insights/multi-character-group-chat.md)

## 当前交付状态

首个纵切已 Code complete：角色卡 V1/V2/V3 JSON、PNG `chara`/`ccv3` 解析，角色/群组 CRUD，Settings 角色库，持久化顺序批次，以及复用 `/api/chat` 的多角色群聊控制台。真实 Provider 批次 smoke 尚未执行，因此当前不是 Release ready。

## 模块

| 位置 | 责任 |
|---|---|
| `src/lib/character-card.ts` | 有界卡片解析、V1/V2/V3 规范化、角色身份提示编译 |
| `src/lib/character-store.ts` | 角色、群组、成员和 durable group run CRUD |
| `src/lib/db.ts` | additive schema、session/message 归属列、消息元数据写入 |
| `src/app/api/assistants/**` | 角色 CRUD、JSON/PNG 导入和本地头像读取 |
| `src/app/api/assistant-groups/**` | 群组 CRUD、群聊 session 与 run 创建 |
| `src/app/api/group-runs/**` | 批次进度和 terminal 状态收口 |
| `src/app/api/chat/route.ts` | 队列校验、角色身份层注入、角色切换时 Runtime ref 隔离 |
| `src/lib/chat-collect-stream-response.ts` | assistant checkpoint/final message 写入 speaker/run/sequence 元数据 |
| `src/components/settings/CharactersSection.tsx` | 角色库、导入、手工创建、建群和群聊入口 |
| `src/components/characters/GroupChatView.tsx` | 顺序消费队列、用户消息乐观显示、SSE 等待、消息恢复与 partial/failed 收口 |
| `src/components/characters/CharacterSelector.tsx` | 新建/空会话的角色选择器；首条真实消息后锁定身份 |
| `src/app/api/assistants/[id]/sessions/route.ts` | 从角色卡直接创建绑定角色的单聊 session |
| `src/app/privacy/page.tsx`、`src/components/chat/PrivacySessionView.tsx`、`src/lib/privacy-session.ts` | 不显示普通记录的临时对话空间；private session 退出/关闭后清理，安全返回普通工作区 |
| `src/app/api/settings/wallpaper/route.ts`、`src/lib/wallpaper.ts` | 本地壁纸签名校验、原子替换、元数据与不透明度持久化 |

## 数据模型

- `assistant_profiles`：卡片规范化后的角色身份；扩展原文保存在 `source_metadata_json`，但不执行。
- `assistant_groups`：群名、激活策略、顺序生成模式和协作合同 JSON；`deleted_at` 用于从角色库移除但保留旧会话解析。
- `assistant_group_members`：成员顺序、启用状态、talkativeness 和角色职责。
- `group_runs`：每条用户群聊消息对应一个 durable 队列，保存 `speaker_queue_json`、`next_index`、状态和错误。
- `chat_sessions` 新增 `conversation_kind`、`assistant_id`、`group_id`。
- `messages` 新增 `speaker_assistant_id`、`group_run_id`、`batch_sequence`、`message_kind`。

迁移完全 additive；历史 session 默认为 `single`，历史 message 默认为 `chat`，不从 working directory 或正文猜角色。

## 顺序批次数据流

1. 群聊控制台先乐观显示用户消息，再创建 `group_run`，服务端冻结当前启用成员为 speaker queue；创建失败会回滚临时消息并恢复输入。
2. 客户端按 `next_index` 顺序调用现有 `POST /api/chat`。
3. chat route 校验 run/session/group/member/sequence 必须同时匹配，否则 409 fail closed。
4. 第一位角色保存用户消息；后续角色使用 `continue_group`，不会重复写用户正文。
5. 角色切换前清空 Claude/Codex 的持久化 resume ref，以免前一人格留在 Runtime 线程；上下文由同一 session 的 durable 消息重建。
6. collector 对 checkpoint 和 terminal 行写入角色 ID、run ID 和序号。
7. 客户端确认 terminal message 后推进 `next_index`；错误时已完成内容保留，run 收口为 `partial` 或 `failed`。

## 角色提示优先级与安全

`buildCharacterSystemPrompt()` 把卡片内容包在显式 `<character_identity>` 层中，并声明卡片内容不能修改权限、工具、Runtime 或系统规则。它通过现有 `systemPromptAppend` 进入 Context Assembler，位于 CodePilot 的系统/工作区规则之后。

导入限制：文件 12 MiB，解码后的 JSON 2 MiB，单字符串 64 KiB，数组 256 项；PNG 只扫描有界 `tEXt` chunk，不解码像素。扩展脚本、URL 和 Lorebook 只作为不可执行 metadata 保存。

手工创建和 PATCH 走同一套有界字段规范化。PATCH 只允许角色文案字段，不接受 `avatar_path`、`source_spec` 或 `source_metadata`；头像读取只允许服务端生成的 `~/.codepilot/characters/{id}.png`。群组成员、合同和 objective 也有数量/大小边界，run 进度只能在冻结 speaker queue 内单调推进，terminal run 不能由客户端重开。

## 当前限制

- 真实执行只有 `sequential`；`manual/natural/pooled` 已保留数据枚举，但选择算法与 UI 尚未交付。
- 协作合同目前持久化并进入 run，尚未实现多轮主持人/停止条件状态机。
- 未支持 CHARX/YAML、V3 assets materialization、完整 Lorebook 激活扫描和角色独立长期记忆。
- `first_message`、alternate/group-only greetings 已保留，但尚未在新群聊中自动发出。
- 角色切换采用“清 ref + DB 历史重建”，尚未实现 `(group session, assistant)` 独立可恢复 Runtime lane 表。
- run 已持久化队列和进度，但刷新后自动续跑未交付；当前会保留并可审计 partial/pending 状态，需要用户重新发起下一轮。
- 专用群聊页当前以纯文本呈现 text blocks；完整工具卡、附件和 Markdown 渲染仍由普通 ChatView 独占。

## 验证

- `character-card.test.ts`：V1/V2/V3、PNG 优先级、无效 JSON/缺名错误码。
- `character-group-store.test.ts`：角色/群组/队列、speaker metadata、角色 FK 删除保护与群组软删除历史保留。
- `character-group-chat-wiring.test.ts`：session/queue/continuation fail-closed、checkpoint/terminal speaker 元数据和顺序收口。
- `privacy-wallpaper.test.ts`：隐私返回路径、壁纸 magic bytes/opacity 和 AppShell 隐藏边界。
- 最终完整 `npm run test`：5169 pass / 0 fail / 1 skip；改动文件 ESLint、docs drift、harness boundary、`git diff --check` 通过。
- 本地浏览器：Settings 入口、创建两个角色、创建群组、群聊空状态/队列/输入区；无 console error。测试数据随后按精确 ID 清理。
- 未执行真实 Provider 发言，不声明 Smoke passed。
