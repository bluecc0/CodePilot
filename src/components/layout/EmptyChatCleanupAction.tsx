'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CodePilotIcon } from '@/components/ui/semantic-icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { showToast } from '@/hooks/useToast';
import { useTranslation } from '@/hooks/useTranslation';

interface EmptyChatCleanupActionProps {
  onDeleted: (sessionIds: string[]) => void;
}

interface CleanupPreview {
  count?: unknown;
  sessionIds?: unknown;
}

export function EmptyChatCleanupAction({ onDeleted }: EmptyChatCleanupActionProps) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [candidateCount, setCandidateCount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const previewCleanup = async () => {
    if (checking || deleting) return;
    setChecking(true);
    try {
      const response = await fetch('/api/chat/sessions/empty');
      const data = await response.json().catch(() => ({})) as CleanupPreview;
      if (!response.ok || typeof data.count !== 'number') throw new Error('Invalid cleanup preview');
      if (data.count === 0) {
        showToast({ type: 'info', message: t('chatList.cleanupEmptyNone') });
        return;
      }
      setCandidateCount(data.count);
      setConfirmOpen(true);
    } catch {
      showToast({ type: 'error', message: t('chatList.cleanupEmptyFailed') });
    } finally {
      setChecking(false);
    }
  };

  const confirmCleanup = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const response = await fetch('/api/chat/sessions/empty', { method: 'DELETE' });
      const data = await response.json().catch(() => ({})) as CleanupPreview & { deletedCount?: unknown };
      if (!response.ok || typeof data.deletedCount !== 'number' || !Array.isArray(data.sessionIds)) {
        throw new Error('Invalid cleanup response');
      }
      const sessionIds = data.sessionIds.filter((id): id is string => typeof id === 'string');
      setConfirmOpen(false);
      onDeleted(sessionIds);
      showToast({
        type: data.deletedCount > 0 ? 'success' : 'info',
        message: data.deletedCount > 0
          ? t('chatList.cleanupEmptySuccess', { count: data.deletedCount })
          : t('chatList.cleanupEmptyNone'),
      });
    } catch {
      showToast({ type: 'error', message: t('chatList.cleanupEmptyFailed') });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="group h-9 w-full justify-start gap-2 rounded-xl px-3 text-[13px] font-normal text-sidebar-foreground"
        disabled={checking || deleting}
        onClick={() => void previewCleanup()}
        title={t('chatList.cleanupEmpty')}
      >
        <CodePilotIcon
          name={checking ? 'loading' : 'delete'}
          size="md"
          className={checking ? 'animate-spin text-inherit' : 'text-inherit'}
          aria-hidden
        />
        {checking ? t('chatList.cleanupEmptyChecking') : t('chatList.cleanupEmpty')}
      </Button>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleting) setConfirmOpen(open);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chatList.cleanupEmptyDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('chatList.cleanupEmptyDialogDescription', { count: candidateCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmCleanup();
              }}
            >
              {deleting ? t('chatList.cleanupEmptyDeleting') : t('chatList.cleanupEmptyConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
