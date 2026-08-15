'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CharacterProfile } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/hooks/useTranslation';

const DEFAULT_VALUE = '__codepilot_default__';
export const CHARACTERS_UPDATED_EVENT = 'codepilot-characters-updated';

export function CharacterSelector({ value, onChange, disabled = false }: {
  value?: string;
  onChange: (assistantId: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);

  const load = useCallback(() => {
    fetch('/api/assistants')
      .then(response => response.ok ? response.json() : null)
      .then(data => setCharacters(data?.assistants || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(CHARACTERS_UPDATED_EVENT, load);
    return () => window.removeEventListener(CHARACTERS_UPDATED_EVENT, load);
  }, [load]);

  return (
    <Select value={value || DEFAULT_VALUE} onValueChange={next => onChange(next === DEFAULT_VALUE ? '' : next)} disabled={disabled}>
      <SelectTrigger className="composer-toolbar-trigger h-7 w-[150px] gap-1 border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground" aria-label={t('characters.selectorLabel')}>
        <SelectValue placeholder={t('characters.defaultAssistant')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_VALUE}>{t('characters.defaultAssistant')}</SelectItem>
        {characters.map(character => <SelectItem key={character.id} value={character.id}>{character.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
