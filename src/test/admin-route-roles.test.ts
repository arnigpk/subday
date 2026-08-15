import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Роли живут в двух местах: меню в AdminLayout решает, какой пункт показать,
 * а allowedRoles в App.tsx — кого пустить по прямой ссылке. Пока они не
 * связаны, они разъезжаются в обе стороны, и обе плохи:
 *
 *   охранник строже меню — человек видит пункт, который ведёт в никуда;
 *   охранник слабее меню — роль заходит туда, куда меню её не звало.
 *
 * Второе и было дырой: у /admin/history и /admin/shops охранника не было
 * вовсе, а hasAccess в useAdminAuth пропускает партнёра и бариста, потому
 * что через него же они ходят в свои кабинеты.
 */

const root = join(__dirname, '..');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const layout = readFileSync(join(root, 'components/admin/AdminLayout.tsx'), 'utf8');

/** Роли из меню админки: путь -> набор ролей. */
function menuRoles(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of layout.matchAll(/path:\s*'(\/admin[^']*)'\s*,\s*roles:\s*\[([^\]]*)\]/g)) {
    out.set(m[1], new Set(m[2].split(',').map((r) => r.trim().replace(/'/g, '')).filter(Boolean)));
  }
  return out;
}

/** Роли из охранников: путь -> набор ролей, либо undefined, если ограничения нет. */
function guardRoles(): Map<string, Set<string> | undefined> {
  const out = new Map<string, Set<string> | undefined>();
  for (const m of app.matchAll(/<Route\s+path="(\/admin[^"]*)"\s+element=\{\s*<AdminProtectedRoute([^>]*?)>/g)) {
    const allowed = m[2].match(/allowedRoles=\{\[([^\]]*)\]/);
    out.set(
      m[1],
      allowed
        ? new Set(allowed[1].split(',').map((r) => r.trim().replace(/'/g, '')).filter(Boolean))
        : undefined,
    );
  }
  return out;
}

describe('роли админских маршрутов', () => {
  const menu = menuRoles();
  const guards = guardRoles();

  it('находит и меню, и охранники', () => {
    expect(menu.size).toBeGreaterThan(15);
    expect(guards.size).toBeGreaterThan(15);
  });

  it('у каждого админского маршрута задан список ролей', () => {
    const без = [...guards.entries()].filter(([, roles]) => roles === undefined).map(([p]) => p);
    expect(без).toEqual([]);
  });

  it('охранник пускает всех, кому меню показывает пункт', () => {
    const сломано: string[] = [];
    for (const [path, roles] of menu) {
      const guard = guards.get(path);
      if (!guard) continue;
      for (const role of roles) {
        // superadmin проходит везде отдельной проверкой в AdminProtectedRoute.
        if (role === 'superadmin') continue;
        if (!guard.has(role)) сломано.push(`${path}: меню показывает «${role}», охранник не пускает`);
      }
    }
    expect(сломано).toEqual([]);
  });

  it('охранник не пускает тех, кому меню пункт не показывает', () => {
    const дыры: string[] = [];
    for (const [path, guard] of guards) {
      const roles = menu.get(path);
      if (!guard || !roles) continue;
      for (const role of guard) {
        if (!roles.has(role)) дыры.push(`${path}: охранник пускает «${role}», меню его не звало`);
      }
    }
    expect(дыры).toEqual([]);
  });

  it('бариста не имеет доступа ни к одному админскому разделу', () => {
    expect([...menu.values()].some((r) => r.has('barista'))).toBe(false);
    const сБариста = [...guards.entries()].filter(([, r]) => r?.has('barista')).map(([p]) => p);
    expect(сБариста).toEqual([]);
  });

  it('партнёр сохраняет доступ к истории и кофейням', () => {
    for (const path of ['/admin/history', '/admin/shops']) {
      expect(guards.get(path)?.has('partner'), `${path} закрыт для партнёра`).toBe(true);
    }
  });
});
