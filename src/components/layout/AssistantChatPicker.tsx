'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CharacterProfile } from '@/types';
import { AssistantAvatar } from '@/components/ui/AssistantAvatar';
import { Button } from '@/components/ui/button';
import { CodePilotIcon } from '@/components/ui/semantic-icon';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { showToast } from '@/hooks/useToast';
import { useTranslation } from '@/hooks/useTranslation';

const CHARACTERS_UPDATED_EVENT = 'codepilot-characters-updated';
const DEFAULT_ASSISTANT_ID = '__codepilot_default__';

function dispatchSessionCreated() {
  window.dispatchEvent(new CustomEvent('session-created'));
}

interface AssistantChatPickerProps {
  workingDirectory: string;
  defaultAssistantName?: string;
  defaultAssistantEmoji?: string;
}

export function AssistantChatPicker({
  workingDirectory,
  defaultAssistantName,
  defaultAssistantEmoji,
}: AssistantChatPickerProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const loadCharacters = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const response = await fetch('/api/assistants');
      if (!response.ok) throw new Error('Failed to load characters');
      const data = await response.json();
      setCharacters(Array.isArray(data.assistants) ? data.assistants : []);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadCharacters();
  }, [open, loadCharacters]);

  useEffect(() => {
    const handleCharactersUpdated = () => {
      if (open) void loadCharacters();
    };
    window.addEventListener(CHARACTERS_UPDATED_EVENT, handleCharactersUpdated);
    return () => window.removeEventListener(CHARACTERS_UPDATED_EVENT, handleCharactersUpdated);
  }, [open, loadCharacters]);

  const createConversation = async (character?: CharacterProfile) => {
    if (creatingId) return;
    const targetId = character?.id || DEFAULT_ASSISTANT_ID;
    setCreatingId(targetId);
    try {
      const model = localStorage.getItem('codepilot:last-model') || '';
      const provider_id = localStorage.getItem('codepilot:last-provider-id') || '';
      const endpoint = character
        ? `/api/assistants/${encodeURIComponent(character.id)}/sessions`
        : '/api/chat/sessions';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ working_directory: workingDirectory, model, provider_id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.session?.id !== 'string') throw new Error('Failed to create assistant chat');
      setOpen(false);
      dispatchSessionCreated();
      router.push(`/chat/${data.session.id}`);
    } catch {
      showToast({ type: 'error', message: t('chatList.assistantCreateFailed') });
    } finally {
      setCreatingId(null);
    }
  };

  const defaultName = defaultAssistantName?.trim() || t('characters.defaultAssistant');

  return (
    <Popover open={open} onOpenChange={(next) => !creatingId && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
          title={t('chatList.newAssistantConversation')}
          aria-label={t('chatList.newAssistantConversation')}
        >
          <CodePilotIcon name="edit" size="sm" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={8} className="w-[330px] gap-0 rounded-2xl p-2">
        <PopoverHeader className="px-2 pb-2 pt-1">
          <PopoverTitle className="text-sm font-semibold">{t('chatList.assistantPickerTitle')}</PopoverTitle>
          <PopoverDescription className="text-xs leading-5">
            {t('chatList.assistantPickerDescription')}
          </PopoverDescription>
        </PopoverHeader>

        <Button
          variant="ghost"
          className="h-auto w-full justify-start gap-3 rounded-xl px-2.5 py-2.5 text-left"
          disabled={creatingId !== null}
          onClick={() => void createConversation()}
        >
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-lg">
            {defaultAssistantEmoji || <CodePilotIcon name="assistant" size="lg" className="text-primary" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{defaultName}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t('chatList.assistantPickerDefaultBadge')}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
              {t('chatList.assistantPickerDefaultDescription')}
            </span>
          </span>
          {creatingId === DEFAULT_ASSISTANT_ID && (
            <CodePilotIcon name="loading" size="sm" className="animate-spin" aria-hidden />
          )}
        </Button>

        <div className="mx-2 my-1 h-px bg-border/60" />
        <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          {t('chatList.assistantPickerCharacters')}
        </p>

        <div className="max-h-64 overflow-y-auto">
          {loading && characters.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
              <CodePilotIcon name="loading" size="sm" className="animate-spin" aria-hidden />
              {t('common.loading')}
            </div>
          ) : loadFailed ? (
            <p className="px-3 py-5 text-center text-xs text-destructive">{t('chatList.assistantPickerLoadFailed')}</p>
          ) : characters.length === 0 ? (
            <p className="px-3 py-5 text-center text-xs leading-5 text-muted-foreground">
              {t('chatList.assistantPickerNoCharacters')}
            </p>
          ) : characters.map(character => (
            <Button
              key={character.id}
              variant="ghost"
              className="h-auto w-full justify-start gap-3 rounded-xl px-2.5 py-2 text-left"
              disabled={creatingId !== null}
              onClick={() => void createConversation(character)}
            >
              {character.avatar_path ? (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated local avatar endpoint
                <img
                  src={`/api/assistants/${encodeURIComponent(character.id)}/avatar`}
                  alt=""
                  className="size-10 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <AssistantAvatar name={character.name} size={40} className="overflow-hidden rounded-xl" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{character.name}</span>
                <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                  {character.description || character.personality || t('chatList.assistantPickerCharacterFallback')}
                </span>
              </span>
              {creatingId === character.id && (
                <CodePilotIcon name="loading" size="sm" className="animate-spin" aria-hidden />
              )}
            </Button>
          ))}
        </div>

        <div className="mx-2 my-1 h-px bg-border/60" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start rounded-xl px-2.5 text-xs text-muted-foreground"
          disabled={creatingId !== null}
          onClick={() => {
            setOpen(false);
            router.push('/settings/characters');
          }}
        >
          <CodePilotIcon name="settings" size="sm" aria-hidden />
          {t('chatList.assistantPickerManage')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
