'use client';

import { useEffect, useState } from 'react';
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

export interface EmptyChatCleanupTarget {
  workingDirectory: string;
  displayName: string;
}

interface EmptyChatCleanupActionProps {
  target: EmptyChatCleanupTarget | null;
  onClose: () => void;
  onDeleted: (sessionIds: string[]) => void;
}

interface CleanupPreview {
  count?: unknown;
  sessionIds?: unknown;
}

export function EmptyChatCleanupAction({ target, onClose, onDeleted }: EmptyChatCleanupActionProps) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [candidateCount, setCandidateCount] = useState<number | null>(null);

  useEffect(() => {
    if (!target) {
      setCandidateCount(null);
      return;
    }

    const controller = new AbortController();
    const previewCleanup = async () => {
      setCandidateCount(null);
      try {
        const params = new URLSearchParams({ workingDirectory: target.workingDirectory });
        const response = await fetch(`/api/chat/sessions/empty?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({})) as CleanupPreview;
        if (!response.ok || typeof data.count !== 'number') throw new Error('Invalid cleanup preview');
        if (data.count === 0) {
          showToast({ type: 'info', message: t('chatList.cleanupEmptyNone') });
          onClose();
          return;
        }
        setCandidateCount(data.count);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        showToast({ type: 'error', message: t('chatList.cleanupEmptyFailed') });
        onClose();
      }
    };

    void previewCleanup();
    return () => controller.abort();
  }, [onClose, t, target]);

  const confirmCleanup = async () => {
    if (!target || deleting) return;
    setDeleting(true);
    try {
      const params = new URLSearchParams({ workingDirectory: target.workingDirectory });
      const response = await fetch(`/api/chat/sessions/empty?${params}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({})) as CleanupPreview & { deletedCount?: unknown };
      if (!response.ok || typeof data.deletedCount !== 'number' || !Array.isArray(data.sessionIds)) {
        throw new Error('Invalid cleanup response');
      }
      const sessionIds = data.sessionIds.filter((id): id is string => typeof id === 'string');
      onDeleted(sessionIds);
      showToast({
        type: data.deletedCount > 0 ? 'success' : 'info',
        message: data.deletedCount > 0
          ? t('chatList.cleanupEmptySuccess', { count: data.deletedCount })
          : t('chatList.cleanupEmptyNone'),
      });
      onClose();
    } catch {
      showToast({ type: 'error', message: t('chatList.cleanupEmptyFailed') });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={target !== null && candidateCount !== null}
      onOpenChange={(open) => {
        if (!open && !deleting) onClose();
      }}
    >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('chatList.cleanupEmptyDialogTitle', { project: target?.displayName || '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('chatList.cleanupEmptyDialogDescription', { count: candidateCount || 0 })}
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
  );
}
