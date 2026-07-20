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

export interface BlockedUser {
  blocked_id: string;
  name: string | null;
  avatar_url: string | null;
}

// Список заблокированных пользователей с именами/аватарами (для экрана в профиле).
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  try {
    const { data: blocks } = await supabase
      .from('subflow_blocks')
      .select('blocked_id')
      .order('created_at', { ascending: false });
    if (!blocks || blocks.length === 0) return [];
    const ids = blocks.map((b: any) => b.blocked_id);
    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('user_id, name, avatar_url')
      .in('user_id', ids);
    return ids.map((id: string) => {
      const p = (profiles || []).find((pr: any) => pr.user_id === id);
      return { blocked_id: id, name: p?.name || null, avatar_url: p?.avatar_url || null };
    });
  } catch {
    return [];
  }
}

// Разблокировать: удаляем свою запись блокировки (RLS «own blocks delete»).
export async function unblockUser(blockedId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('subflow_blocks').delete().eq('blocked_id', blockedId);
    return !error;
  } catch {
    return false;
  }
}

// Заблокировать автора: контент сразу убирается из ленты (на клиенте) + уведомление разработчику.
// postId — id поста, из-за которого блокируют (чтобы в уведомлении показать его суть).
export async function blockUser(targetUserId: string, reason?: string, postId?: string | null): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('subflow-report', {
      body: { action: 'block', targetUserId, reason, targetId: postId ?? null },
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
