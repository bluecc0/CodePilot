'use client';

import { Suspense, useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { NewChatPageContent } from '@/app/chat/page';
import { PrivacySessionView } from '@/components/chat/PrivacySessionView';
import { disposePrivateSession, disposePrivateSessionOnPageHide } from '@/lib/privacy-session';
import { PRIVACY_RETURN_PATH_KEY, safePrivacyReturnPath } from '@/lib/privacy-route';
import { useTranslation } from '@/hooks/useTranslation';

function PrivacyPageFallback() {
  return <div className="h-full bg-background" aria-label="Loading temporary conversation" />;
}

function PrivacyPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const sessionId = searchParams.get('session') || '';

  // A crashed renderer can leave a private row behind. Entering a fresh
  // privacy space clears only those rows; ordinary conversation history is
  // never touched.
  useEffect(() => {
    if (!sessionId) {
      void fetch('/api/privacy/sessions', { method: 'DELETE' }).catch(() => {});
    }
  }, [sessionId]);

  // If the app/window closes while a temporary chat is open, send a
  // keepalive deletion request. Startup recovery remains the final backstop.
  useEffect(() => {
    if (!sessionId) return;
    const onPageHide = () => disposePrivateSessionOnPageHide(sessionId);
    const onPopState = () => { void disposePrivateSession(sessionId); };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('popstate', onPopState);
    };
  }, [sessionId]);

  const exit = useCallback(async () => {
    await disposePrivateSession(sessionId);
    const target = safePrivacyReturnPath(sessionStorage.getItem(PRIVACY_RETURN_PATH_KEY));
    sessionStorage.removeItem(PRIVACY_RETURN_PATH_KEY);
    router.replace(target);
  }, [router, sessionId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void exit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exit]);

  return (
    <section
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background/35"
      data-privacy-chat="temporary"
      data-privacy-session={sessionId || 'new'}
    >
      <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
        <span className="rounded-full border border-border/50 bg-background/55 px-3 py-1 text-[10px] font-medium tracking-[0.16em] text-muted-foreground/80 backdrop-blur-xl">
          {t('privacy.temporaryHint')}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {sessionId
          ? <PrivacySessionView sessionId={sessionId} />
          : <NewChatPageContent ephemeral />}
      </div>
      <span className="sr-only">{pathname === '/privacy' ? 'Temporary conversation' : ''}</span>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <Suspense fallback={<PrivacyPageFallback />}>
      <PrivacyPageInner />
    </Suspense>
  );
}
