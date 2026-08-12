"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { AssistantGroup, ChatSession, Message } from '@/types';
import { AssistantAvatar } from '@/components/ui/AssistantAvatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/useTranslation';

function messageText(content: string, structuredFallback: string): string {
  const withoutFiles = content.replace(/^<!--files:[\s\S]*?-->/, '');
  try {
    const blocks = JSON.parse(withoutFiles) as Array<Record<string, unknown>>;
    if (!Array.isArray(blocks)) return withoutFiles;
    return blocks.filter(block => block.type === 'text').map(block => String(block.text || '')).join('\n').trim()
      || structuredFallback;
  } catch {
    return withoutFiles;
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function GroupChatView({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { locale } = useTranslation();
  const l = useCallback((zh: string, en: string) => locale === 'zh' ? zh : en, [locale]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [group, setGroup] = useState<AssistantGroup | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState('');
  const [error, setError] = useState('');
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: running ? 'smooth' : 'auto', block: 'end' });
  }, [messages, running, activeSpeaker]);

  const assistantMap = useMemo(() => new Map(
    (group?.members || []).map(member => [member.assistant_id, member.assistant]),
  ), [group]);

  const refreshMessages = useCallback(async () => {
    const response = await fetch(`/api/chat/sessions/${sessionId}/messages?limit=200`);
    if (!response.ok) return [] as Message[];
    const data = await response.json();
    const next = data.messages || [];
    setMessages(next);
    return next as Message[];
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sessionResponse = await fetch(`/api/chat/sessions/${sessionId}`);
      if (!sessionResponse.ok) return setError(l('群聊会话不存在', 'Group chat session does not exist'));
      const sessionData = await sessionResponse.json();
      const loadedSession = sessionData.session as ChatSession;
      if (loadedSession.conversation_kind !== 'group' || !loadedSession.group_id) return setError(l('这个会话没有绑定角色群组', 'This session is not bound to a character group'));
      const groupResponse = await fetch(`/api/assistant-groups/${loadedSession.group_id}`);
      if (!groupResponse.ok) return setError(l('角色群组不存在', 'Character group does not exist'));
      const groupData = await groupResponse.json();
      if (!cancelled) {
        setSession(loadedSession);
        setGroup(groupData.group);
        await refreshMessages();
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, refreshMessages, l]);

  const waitForSpeakerMessage = async (runId: string, sequence: number) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const rows = await refreshMessages();
      const row = rows.find(item => item.group_run_id === runId && item.batch_sequence === sequence && item.role === 'assistant'
        && item.stream_status !== 'streaming');
      if (row?.stream_status === 'error') throw new Error(messageText(row.content, l('[工具调用或结构化内容]', '[Tool call or structured content]')));
      if (row) return;
      await delay(200);
    }
    throw new Error(l('角色回复已结束，但持久化确认超时', 'The character response ended, but persistence confirmation timed out'));
  };

  const runSpeaker = async (args: { runId: string; assistantId: string; sequence: number; objective: string }) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          content: args.objective,
          model: session?.model || undefined,
          provider_id: session?.provider_id || undefined,
          assistant_id: args.assistantId,
          group_run_id: args.runId,
          batch_sequence: args.sequence,
          continue_group: args.sequence > 0,
        }),
      });
      if (response.status === 409) {
        const payload = await response.json().catch(() => ({}));
        if (payload.code === 'SESSION_BUSY') { await delay(300); continue; }
        throw new Error(payload.error || l('群聊队列状态冲突', 'Group queue state conflict'));
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || l(`角色调用失败（HTTP ${response.status}）`, `Character call failed (HTTP ${response.status})`));
      }
      const reader = response.body?.getReader();
      while (reader) {
        const result = await reader.read();
        if (result.done) break;
      }
      await waitForSpeakerMessage(args.runId, args.sequence);
      return;
    }
    throw new Error(l('会话仍被上一位角色占用', 'The session is still occupied by the previous character'));
  };

  const send = async () => {
    const objective = input.trim();
    if (!objective || !group || running) return;
    setRunning(true); setError(''); setInput('');
    const optimisticId = `optimistic-user-${Date.now()}`;
    setMessages(current => [...current, {
      id: optimisticId,
      session_id: sessionId,
      role: 'user',
      content: objective,
      created_at: new Date().toISOString(),
      token_usage: null,
      stream_status: 'completed',
    } as Message]);
    let completed = 0;
    let runId = '';
    try {
      const response = await fetch(`/api/assistant-groups/${group.id}/runs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, objective }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || l('无法创建群聊批次', 'Could not create group batch'));
      runId = data.run.id;
      const queue = data.queue as Array<{ assistantId: string; sequence: number }>;
      for (const item of queue) {
        const assistant = assistantMap.get(item.assistantId);
        setActiveSpeaker(assistant?.name || l('角色', 'Character'));
        await runSpeaker({ runId, assistantId: item.assistantId, sequence: item.sequence, objective });
        completed += 1;
        await fetch(`/api/group-runs/${runId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'running', next_index: completed }),
        });
      }
      await fetch(`/api/group-runs/${runId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', next_index: completed }),
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : l('群聊执行失败', 'Group chat execution failed');
      setError(message);
      if (runId) {
        await fetch(`/api/group-runs/${runId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: completed > 0 ? 'partial' : 'failed', next_index: completed, error: message }),
        });
      }
      if (!runId) {
        setMessages(current => current.filter(message => message.id !== optimisticId));
        setInput(objective);
      }
    } finally {
      setActiveSpeaker(''); setRunning(false); await refreshMessages();
    }
  };

  if (!group || !session) {
    return <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">{error || l('正在打开群聊…', 'Opening group chat…')}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background/70 backdrop-blur-xl">
      <header className="flex shrink-0 items-center gap-4 border-b border-border/60 px-5 py-3">
        <Link href="/settings/characters" className="text-sm text-muted-foreground hover:text-foreground">← {l('角色库', 'Characters')}</Link>
        <div className="h-5 w-px bg-border" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h1 className="truncate font-medium">{group.name}</h1><Badge variant="outline">{l('顺序批次', 'Sequential')}</Badge></div>
          <p className="truncate text-xs text-muted-foreground">{(group.members || []).map(member => member.assistant?.name).filter(Boolean).join(' → ')}</p>
        </div>
        <div className="flex -space-x-2">{(group.members || []).map(member => <AssistantAvatar key={member.assistant_id} name={member.assistant?.name || member.assistant_id} size={30} className="rounded-full border-2 border-background" />)}</div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.length === 0 && <div className="rounded-2xl border border-dashed border-border p-10 text-center"><p className="font-medium">{l('开始第一轮讨论', 'Start the first discussion')}</p><p className="mt-2 text-sm text-muted-foreground">{l(`输入目标后，${group.members?.length || 0} 位角色会依次作答。一个角色失败不会删除已经完成的回复。`, `After you enter an objective, ${group.members?.length || 0} characters will reply in order. A failed character will not delete completed replies.`)}</p></div>}
          {messages.map(message => {
            const speaker = message.speaker_assistant_id ? assistantMap.get(message.speaker_assistant_id) : undefined;
            const isUser = message.role === 'user';
            return <div key={message.id} className={isUser ? 'flex justify-end' : 'flex gap-3'}>
              {!isUser && <AssistantAvatar name={speaker?.name || 'Assistant'} size={34} className="mt-1 overflow-hidden rounded-xl" />}
              <div className={isUser ? 'max-w-[82%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground' : 'min-w-0 max-w-[85%]'}>
                {!isUser && <div className="mb-1.5 flex items-center gap-2"><span className="text-sm font-medium">{speaker?.name || 'Assistant'}</span>{message.batch_sequence !== null && message.batch_sequence !== undefined && <span className="text-[11px] text-muted-foreground">{l(`第 ${message.batch_sequence + 1} 位`, `Speaker ${message.batch_sequence + 1}`)}</span>}</div>}
                <div className={isUser ? 'whitespace-pre-wrap' : 'whitespace-pre-wrap rounded-2xl rounded-tl-md border border-border/60 bg-card px-4 py-3 text-sm leading-6'}>{messageText(message.content, l('[工具调用或结构化内容]', '[Tool call or structured content]'))}</div>
              </div>
            </div>;
          })}
          {running && <div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-primary" />{l(`${activeSpeaker} 正在发言，后续角色已排队…`, `${activeSpeaker} is speaking; the remaining characters are queued…`)}</div>}
          {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
          <div ref={messageEndRef} aria-hidden />
        </div>
      </main>

      <footer className="shrink-0 border-t border-border/60 bg-background/90 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-border/70 bg-card p-2 shadow-sm">
          <Textarea value={input} onChange={event => setInput(event.target.value)} disabled={running} placeholder={l('给这个角色群组一个问题、场景或协作目标…', 'Give this character group a question, scenario, or collaboration objective…')} className="min-h-12 resize-none border-0 shadow-none focus-visible:ring-0" onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
          }} />
          <Button disabled={running || !input.trim()} onClick={() => void send()}>{running ? l('执行中', 'Running') : l('发送', 'Send')}</Button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl px-2 text-[11px] text-muted-foreground">{l('当前为顺序批次模式。每位角色使用隔离的 Runtime 回合，并共享这段群聊的持久化历史。', 'Sequential batch mode is active. Each character uses an isolated runtime turn while sharing this group chat’s durable history.')}</p>
      </footer>
    </div>
  );
}
