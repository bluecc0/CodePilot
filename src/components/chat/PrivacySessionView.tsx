'use client';

import { useEffect, useState } from 'react';
import type { ChatSession, Message, MessagesResponse } from '@/types';
import { normalizePermissionProfile, type SessionPermissionProfile } from '@/lib/permission/profile';
import { ChatView } from '@/components/chat/ChatView';
import { SpinnerGap } from '@/components/ui/icon';
import { usePanel } from '@/hooks/usePanel';
import { useTranslation } from '@/hooks/useTranslation';
import { useRouter } from 'next/navigation';

interface PrivacySessionViewProps {
  sessionId: string;
}

/**
 * The second and subsequent turns of a privacy conversation. It deliberately
 * reuses ChatView's normal streaming/composer behavior while keeping the
 * route at `/privacy`; the session row is private and is deleted on exit.
 */
export function PrivacySessionView({ sessionId }: PrivacySessionViewProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    setWorkingDirectory,
    setSessionId,
    setSessionTitle,
    setFileTreeOpen,
  } = usePanel();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [model, setModel] = useState('');
  const [providerId, setProviderId] = useState('');
  const [runtimePin, setRuntimePin] = useState('');
  const [permissionProfile, setPermissionProfile] = useState<SessionPermissionProfile>('default');
  const [mode, setMode] = useState<'code' | 'plan'>('code');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setSession(null);
    setMessages([]);

    async function load() {
      try {
        const [sessionRes, messagesRes] = await Promise.all([
          fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`),
          fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages?limit=50`),
        ]);
        if (!sessionRes.ok || !messagesRes.ok) throw new Error('Temporary conversation not found');
        const sessionData: { session: ChatSession } = await sessionRes.json();
        const messagesData: MessagesResponse = await messagesRes.json();
        if (cancelled) return;
        if (sessionData.session.source !== 'private') throw new Error('Not a temporary conversation');

        setSession(sessionData.session);
        setMessages(messagesData.messages || []);
        setHasMore(messagesData.hasMore ?? false);
        setWorkingDirectory(sessionData.session.working_directory || '');
        setSessionId(sessionId);
        setSessionTitle(sessionData.session.title || t('chat.newConversation'));
        setModel(sessionData.session.model || '');
        setProviderId(sessionData.session.provider_id || '');
        setRuntimePin(sessionData.session.runtime_pin || '');
        setPermissionProfile(normalizePermissionProfile(sessionData.session.permission_profile));
        setMode((sessionData.session.mode as 'code' | 'plan') || 'code');
        setFileTreeOpen(false);
      } catch {
        if (!cancelled) {
          setError(true);
          router.replace('/privacy');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [router, sessionId, setFileTreeOpen, setSessionId, setSessionTitle, setWorkingDirectory, t]);

  if (loading && !session) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground" aria-label="Loading temporary conversation">
        <SpinnerGap className="animate-spin" size={22} />
      </div>
    );
  }

  if (error || !session) return null;

  return (
    <ChatView
      key={sessionId}
      sessionId={sessionId}
      initialMessages={messages}
      initialHasMore={hasMore}
      modelName={model}
      providerId={providerId}
      runtimePin={runtimePin}
      initialPermissionProfile={permissionProfile}
      initialMode={mode}
      initialHasSummary={!!session.context_summary}
    />
  );
}
