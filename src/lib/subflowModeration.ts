import { supabase } from '@/integrations/supabase/client';

// Список id пользователей, заблокированных текущим пользователем (для фильтра ленты).
export async function getBlockedUserIds(): Promise<Set<string>> {
  try {
    const { data } = await supabase.from('subflow_blocks').select('blocked_id');
    return new Set((data || []).map((r: any) => r.blocked_id));
  } catch {
    return new Set();
  }
}

// Заблокировать автора: контент сразу убирается из ленты (на клиенте) + уведомление разработчику.
export async function blockUser(targetUserId: string, reason?: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('subflow-report', {
      body: { action: 'block', targetUserId, reason },
    });
    return !error;
  } catch {
    return false;
  }
}

// Пожаловаться на контент.
export async function reportContent(params: {
  targetType: 'post' | 'comment' | 'user';
  targetId?: string | null;
  targetUserId?: string | null;
  reason?: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('subflow-report', {
      body: {
        action: 'report',
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        targetUserId: params.targetUserId ?? null,
        reason: params.reason,
      },
    });
    return !error;
  } catch {
    return false;
  }
}
