export const PRIVACY_RETURN_PATH_KEY = 'codepilot:privacy-return-path';

export function safePrivacyReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/privacy')) return '/chat';
  return value;
}
