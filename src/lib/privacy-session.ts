const PRIVACY_SESSION_QUERY = 'session';

export function getPrivacySessionId(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(PRIVACY_SESSION_QUERY) || '';
}

async function interruptPrivateSession(sessionId: string): Promise<void> {
  try {
    await fetch('/api/chat/interrupt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
  } catch {
    // Deletion below remains the source of truth for privacy cleanup.
  }
}

/** Stop any active turn and remove the current temporary conversation. */
export async function disposePrivateSession(sessionId?: string): Promise<void> {
  const id = sessionId || getPrivacySessionId();
  if (id) await interruptPrivateSession(id);

  try {
    await fetch(
      id
        ? `/api/privacy/sessions/${encodeURIComponent(id)}`
        : '/api/privacy/sessions',
      { method: 'DELETE' },
    );
  } catch {
    // The next application startup also purges private sessions.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('privacy-session-closed', { detail: { sessionId: id } }));
  }
}

/** Best-effort page-close cleanup; keepalive lets the request outlive unload. */
export function disposePrivateSessionOnPageHide(sessionId?: string): void {
  const id = sessionId || getPrivacySessionId();
  if (typeof window === 'undefined') return;
  const endpoint = id
    ? `/api/privacy/sessions/${encodeURIComponent(id)}`
    : '/api/privacy/sessions';
  try {
    void fetch(endpoint, { method: 'DELETE', keepalive: true });
  } catch {
    // Startup recovery is the final backstop.
  }
}
