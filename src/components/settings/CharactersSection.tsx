"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AssistantGroup, CharacterProfile } from '@/types';
import { AssistantAvatar } from '@/components/ui/AssistantAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SettingsCard } from '@/components/patterns/SettingsCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/useTranslation';

type Notice = { kind: 'error' | 'success'; text: string } | null;

export function CharactersSection() {
  const router = useRouter();
  const { locale } = useTranslation();
  const l = useCallback((zh: string, en: string) => locale === 'zh' ? zh : en, [locale]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [assistants, setAssistants] = useState<CharacterProfile[]>([]);
  const [groups, setGroups] = useState<AssistantGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [importing, setImporting] = useState(false);
  const [characterDialog, setCharacterDialog] = useState(false);
  const [groupDialog, setGroupDialog] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [personality, setPersonality] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [assistantResponse, groupResponse] = await Promise.all([
        fetch('/api/assistants'), fetch('/api/assistant-groups'),
      ]);
      if (!assistantResponse.ok || !groupResponse.ok) throw new Error(l('加载角色库失败', 'Failed to load character library'));
      const assistantData = await assistantResponse.json();
      const groupData = await groupResponse.json();
      setAssistants(assistantData.assistants || []);
      setGroups(groupData.groups || []);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : l('加载失败', 'Loading failed') });
    } finally {
      setLoading(false);
    }
  }, [l]);

  useEffect(() => { void refresh(); }, [refresh]);

  const importCard = async (file: File) => {
    setImporting(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/assistants/import', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || l('导入失败', 'Import failed'));
      setNotice({ kind: 'success', text: l(`已导入角色「${data.assistant.name}」`, `Imported “${data.assistant.name}”`) });
      await refresh();
      window.dispatchEvent(new CustomEvent('codepilot-characters-updated'));
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : l('导入失败', 'Import failed') });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const createCharacter = async () => {
    const response = await fetch('/api/assistants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, personality }),
    });
    const data = await response.json();
    if (!response.ok) return setNotice({ kind: 'error', text: data.error || l('创建失败', 'Creation failed') });
    setCharacterDialog(false);
    setName(''); setDescription(''); setPersonality('');
    setNotice({ kind: 'success', text: l(`已创建角色「${data.assistant.name}」`, `Created “${data.assistant.name}”`) });
    await refresh();
    window.dispatchEvent(new CustomEvent('codepilot-characters-updated'));
  };

  const createGroup = async () => {
    const response = await fetch('/api/assistant-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: groupName,
        activation_strategy: 'list',
        generation_mode: 'sequential',
        members: selected.map(assistant_id => ({ assistant_id })),
      }),
    });
    const data = await response.json();
    if (!response.ok) return setNotice({ kind: 'error', text: data.error || l('建群失败', 'Failed to create group') });
    setGroupDialog(false); setGroupName(''); setSelected([]);
    setNotice({ kind: 'success', text: l(`已创建群组「${data.group.name}」`, `Created group “${data.group.name}”`) });
    await refresh();
  };

  const startGroup = async (group: AssistantGroup) => {
    setNotice(null);
    const response = await fetch(`/api/assistant-groups/${group.id}/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: localStorage.getItem('codepilot:last-model') || '',
        provider_id: localStorage.getItem('codepilot:last-provider-id') || '',
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice({ kind: 'error', text: data.error || l('无法创建群聊会话', 'Could not create group chat session') });
      return;
    }
    window.dispatchEvent(new CustomEvent('session-created'));
    router.push(`/group-chat/${data.session.id}`);
  };

  const startCharacter = async (assistant: CharacterProfile) => {
    setNotice(null);
    const response = await fetch(`/api/assistants/${assistant.id}/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        working_directory: localStorage.getItem('codepilot:last-working-directory') || '',
        model: localStorage.getItem('codepilot:last-model') || '',
        provider_id: localStorage.getItem('codepilot:last-provider-id') || '',
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice({ kind: 'error', text: data.error || l('无法创建角色单聊', 'Could not create character chat') });
      return;
    }
    window.dispatchEvent(new CustomEvent('session-created'));
    router.push(`/chat/${data.session.id}`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Persona studio</p>
          <h1 className="text-2xl font-semibold tracking-tight">{l('角色与群聊', 'Characters & group chat')}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{l('导入主流角色卡，把多个角色组成顺序批次群聊。角色内容不会覆盖 CodePilot 的权限与工具规则。', 'Import mainstream character cards and organize characters into sequential group chats. Card content cannot override CodePilot permissions or tool rules.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input ref={fileRef} type="file" accept=".json,.png,application/json,image/png" className="hidden"
            onChange={event => { const file = event.target.files?.[0]; if (file) void importCard(file); }} />
          <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? l('导入中…', 'Importing…') : l('导入角色卡', 'Import character card')}</Button>
          <Button onClick={() => setCharacterDialog(true)}>{l('新建角色', 'New character')}</Button>
        </div>
      </div>

      {notice && (
        <div className={notice.kind === 'error'
          ? 'rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive'
          : 'rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300'}>
          {notice.text}
        </div>
      )}

      <Tabs defaultValue="characters">
        <TabsList>
          <TabsTrigger value="characters">{l('角色库', 'Characters')} <span className="ml-1 text-muted-foreground">{assistants.length}</span></TabsTrigger>
          <TabsTrigger value="groups">{l('群组', 'Groups')} <span className="ml-1 text-muted-foreground">{groups.length}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="characters" className="mt-5">
          {loading ? <p className="text-sm text-muted-foreground">{l('加载中…', 'Loading…')}</p> : assistants.length === 0 ? (
            <SettingsCard className="py-14 text-center">
              <p className="text-base font-medium">{l('角色库还是空的', 'Your character library is empty')}</p>
              <p className="text-sm text-muted-foreground">{l('导入 SillyTavern 兼容的 V1/V2/V3 JSON 或 PNG 卡片，或手工创建第一个角色。', 'Import a SillyTavern-compatible V1/V2/V3 JSON or PNG card, or create your first character manually.')}</p>
            </SettingsCard>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {assistants.map(assistant => (
                <div key={assistant.id} className="group rounded-2xl border border-border/60 bg-card/70 p-4 transition-colors hover:border-border">
                  <div className="flex gap-3">
                    {assistant.avatar_path ? (
                      // eslint-disable-next-line @next/next/no-img-element -- authenticated local API avatar
                      <img src={`/api/assistants/${assistant.id}/avatar`} alt="" className="size-12 rounded-xl object-cover" />
                    ) : <AssistantAvatar name={assistant.name} size={48} className="overflow-hidden rounded-xl" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate font-medium">{assistant.name}</h3>
                        <Badge variant="secondary" className="uppercase">{assistant.source_spec}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{assistant.description || assistant.personality || l('尚未填写角色描述', 'No character description yet')}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{JSON.parse(assistant.tags_json || '[]').slice(0, 2).join(' · ') || assistant.creator || l('本地角色', 'Local character')}</span>
                    <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => void startCharacter(assistant)}>{l('开始单聊', 'Start chat')}</Button>
                    <Button variant="ghost" size="sm" className="h-auto px-1 py-0 text-xs opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive" onClick={async () => {
                      if (!window.confirm(l(`删除角色「${assistant.name}」？`, `Delete “${assistant.name}”?`))) return;
                      const response = await fetch(`/api/assistants/${assistant.id}`, { method: 'DELETE' });
                      if (!response.ok) setNotice({ kind: 'error', text: (await response.json()).error || l('删除失败', 'Deletion failed') });
                      else { await refresh(); window.dispatchEvent(new CustomEvent('codepilot-characters-updated')); }
                    }}>{l('删除', 'Delete')}</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="groups" className="mt-5 space-y-4">
          <div className="flex justify-end"><Button disabled={assistants.length === 0} onClick={() => setGroupDialog(true)}>{l('创建群组', 'Create group')}</Button></div>
          {groups.length === 0 ? (
            <SettingsCard className="py-14 text-center">
              <p className="text-base font-medium">{l('还没有角色群组', 'No character groups yet')}</p>
              <p className="text-sm text-muted-foreground">{l('创建角色后，把一个或多个角色组成按顺序发言的批次群聊。', 'Create characters, then arrange one or more of them into a sequential group chat.')}</p>
            </SettingsCard>
          ) : groups.map(group => (
            <div key={group.id} className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/70 p-5 sm:flex-row sm:items-center">
              <div className="flex -space-x-2">
                {(group.members || []).slice(0, 4).map(member => <AssistantAvatar key={member.assistant_id} name={member.assistant?.name || member.assistant_id} size={38} className="rounded-full border-2 border-card" />)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><h3 className="font-medium">{group.name}</h3><Badge variant="outline">{l('顺序批次', 'Sequential')}</Badge></div>
                <p className="mt-1 text-sm text-muted-foreground">{(group.members || []).map(member => member.assistant?.name).filter(Boolean).join(' → ')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => void startGroup(group)}>{l('开始群聊', 'Start group chat')}</Button>
                <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={async () => {
                  if (!window.confirm(l(`删除群组「${group.name}」？已有群聊历史会保留。`, `Delete group “${group.name}”? Existing group chat history will be kept.`))) return;
                  const response = await fetch(`/api/assistant-groups/${group.id}`, { method: 'DELETE' });
                  if (!response.ok) setNotice({ kind: 'error', text: (await response.json()).error || l('删除群组失败', 'Failed to delete group') });
                  else { setNotice({ kind: 'success', text: l(`已删除群组「${group.name}」`, `Deleted group “${group.name}”`) }); await refresh(); }
                }}>{l('删除', 'Delete')}</Button>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={characterDialog} onOpenChange={setCharacterDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{l('新建角色', 'New character')}</DialogTitle><DialogDescription>{l('先建立最小身份，后续可以继续扩展场景、开场白和示例对话。', 'Start with a minimal identity. Scenarios, greetings, and dialogue examples can be expanded later.')}</DialogDescription></DialogHeader>
          <div className="space-y-3"><Input placeholder={l('角色名', 'Character name')} value={name} onChange={e => setName(e.target.value)} /><Textarea placeholder={l('角色描述', 'Character description')} value={description} onChange={e => setDescription(e.target.value)} /><Textarea placeholder={l('性格与说话风格', 'Personality and speaking style')} value={personality} onChange={e => setPersonality(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setCharacterDialog(false)}>{l('取消', 'Cancel')}</Button><Button disabled={!name.trim()} onClick={() => void createCharacter()}>{l('创建', 'Create')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialog} onOpenChange={setGroupDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{l('创建角色群组', 'Create character group')}</DialogTitle><DialogDescription>{l('首版采用单写者顺序批次，角色按照这里的选择顺序依次回复。', 'This version uses a single-writer sequential batch. Characters reply in the order selected here.')}</DialogDescription></DialogHeader>
          <Input placeholder={l('群组名', 'Group name')} value={groupName} onChange={e => setGroupName(e.target.value)} />
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {assistants.map(assistant => {
              const checked = selected.includes(assistant.id);
              return <label key={assistant.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/50 p-3 hover:bg-muted/50">
                <Input className="size-4" type="checkbox" checked={checked} onChange={() => setSelected(current => checked ? current.filter(id => id !== assistant.id) : [...current, assistant.id])} />
                <AssistantAvatar name={assistant.name} size={32} /><span className="text-sm font-medium">{assistant.name}</span>
              </label>;
            })}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setGroupDialog(false)}>{l('取消', 'Cancel')}</Button><Button disabled={!groupName.trim() || selected.length === 0} onClick={() => void createGroup()}>{l('创建群组', 'Create group')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
