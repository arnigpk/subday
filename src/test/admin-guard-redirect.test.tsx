import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminProtectedRoute } from '@/components/admin/AdminProtectedRoute';

/**
 * Охранник при отказе кого-то куда-то отправляет, и это место должно быть
 * достижимо именно для этой роли. Раньше всех слало на /admin — а партнёру и
 * бариста туда нельзя, и получалось кольцо: заходишь по прямой ссылке на
 * закрытый раздел, тебя шлют на /admin, оттуда снова на /admin, страница
 * виснет. Владелец ходит по прямым ссылкам, так что путь этот живой.
 */

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: () => auth.value,
}));

function renderAt(path: string, allowedRoles?: string[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/history"
          element={
            <AdminProtectedRoute allowedRoles={allowedRoles as never}>
              <div>закрытый раздел</div>
            </AdminProtectedRoute>
          }
        />
        <Route path="/admin" element={<div>админ-панель</div>} />
        <Route path="/partner" element={<div>кабинет партнёра</div>} />
        <Route path="/" element={<div>главная</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('куда охранник отправляет при отказе', () => {
  beforeEach(() => {
    auth.value = { session: { user: {} }, isLoading: false, role: null, hasAccess: true };
  });

  it('партнёра — в его кабинет, а не на /admin', () => {
    auth.value = { ...auth.value, role: 'partner' };
    renderAt('/admin/history', ['admin']);
    expect(screen.getByText('кабинет партнёра')).toBeTruthy();
  });

  it('бариста — в его кабинет, а не на /admin', () => {
    auth.value = { ...auth.value, role: 'barista' };
    renderAt('/admin/history', ['admin']);
    expect(screen.getByText('кабинет партнёра')).toBeTruthy();
  });

  it('модератора — на /admin, туда ему можно', () => {
    auth.value = { ...auth.value, role: 'moderator' };
    renderAt('/admin/history', ['admin']);
    expect(screen.getByText('админ-панель')).toBeTruthy();
  });

  it('админа пускает внутрь', () => {
    auth.value = { ...auth.value, role: 'admin' };
    renderAt('/admin/history', ['admin']);
    expect(screen.getByText('закрытый раздел')).toBeTruthy();
  });

  it('суперадмина пускает внутрь, даже если его нет в списке', () => {
    auth.value = { ...auth.value, role: 'superadmin' };
    renderAt('/admin/history', ['admin']);
    expect(screen.getByText('закрытый раздел')).toBeTruthy();
  });

  it('без входа отправляет на главную', () => {
    auth.value = { session: null, isLoading: false, role: null, hasAccess: false };
    renderAt('/admin/history', ['admin']);
    expect(screen.getByText('главная')).toBeTruthy();
  });

  it('вошедшему без прав кабинета показывает отказ, а не крутит редиректы', () => {
    auth.value = { session: { user: {} }, isLoading: false, role: null, hasAccess: false };
    renderAt('/admin/history', ['admin']);
    expect(screen.getByText('Доступ запрещён')).toBeTruthy();
  });
});
