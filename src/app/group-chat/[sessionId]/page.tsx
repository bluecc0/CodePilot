"use client";

import { GroupChatView } from '@/components/characters/GroupChatView';

export default function GroupChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return <GroupChatView params={params} />;
}
