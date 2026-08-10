import { describe, it, expect, vi, beforeEach } from 'vitest';

// Раньше почти весь код звал supabase.auth.getUser(), и каждый такой вызов уходил
// на сервер: при открытии главной летела пачка одновременных запросов. Обёртка
// берёт того же пользователя из локальной сессии — форма ответа та же, сети нет.

const getSession = vi.fn();
const getUser = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: () => getSession(), getUser: () => getUser() } },
}));

import { getAuthUser } from '@/lib/authUser';

describe('получение пользователя без обращения к сети', () => {
  beforeEach(() => {
    getSession.mockReset();
    getUser.mockReset();
  });

  it('отдаёт пользователя из сессии и НЕ ходит в сеть', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } });
    const { data: { user } } = await getAuthUser();
    expect(user?.id).toBe('u-1');
    expect(getUser).not.toHaveBeenCalled(); // именно это и экономит запросы
  });

  it('сессии нет → user null, как и у getUser()', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { data: { user }, error } = await getAuthUser();
    expect(user).toBeNull();
    expect(error).toBeNull();
  });

  it('форма ответа совпадает с getUser() — места вызова не переписывались', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u-2' } } } });
    const res = await getAuthUser();
    expect(Object.keys(res).sort()).toEqual(['data', 'error']);
    expect(Object.keys(res.data)).toEqual(['user']);
  });
});
