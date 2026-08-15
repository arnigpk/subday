import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Роли живут в двух местах: меню в AdminLayout решает, что показать, а
 * allowedRoles в App.tsx решает, кого пустить. Разъехались — и человек видит
 * пункт меню, который выкидывает его на страницу, куда ему тоже нельзя.
 * Ровно так я и сломал партнёру «Историю» и «Кофейни».
 *
 * Проверяем обе стороны: охранник не должен быть строже меню (иначе пункт
 * ведёт в никуда) и не должен быть слабее (иначе роль заходит по прямой
 * ссылке туда, куда меню её не звало).
 */

const root = join(__dirname, '..');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const layout = readFileSync(join(root, 'components/admin/AdminLayout.tsx'), 'utf8');

/** Роли из меню админки: path -> набор ролей. */
function menuRoles(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const re = /path:\s*'(\/admin[^']*)'\s*,\s*roles:\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(layout))) {
    const roles = m[2].split(',').map((r) => r.trim().replace(/'/g, '')).filter(Boolean);
    out.set(m[1], new Set(roles));
  }
  return out;
}

/** Роли из охранников маршрутов: path -> набор ролей (undefined = ограничения нет). */
function guardRoles(): Map<string, Set<string> | undefined> {
  const out = new Map<string, Set<string> | undefined>();
  const re = /<Route\s+path="(\/admin[^"]*)"\s+element=\{\s*<AdminProtectedRoute([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(app))) {
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
    expect(menu.size).toBeGreaterThan(10);
    expect(guards.size).toBeGreaterThan(10);
  });

  it('у каждого админского маршрута задан список ролей', () => {
    // Без allowedRoles сюда проходит любой, у кого hasAccess — включая
    // партнёра и бариста, потому что они ходят через того же охранника.
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
    // Известное расхождение, оставлено сознательно: меню показывает «Настройки»
    // только суперадмину, а охранник пускает любого админа по прямой ссылке.
    // Так было до правок ролей; владелец решил не менять. Если появится новое
    // расхождение — тест упадёт, и это будет уже не про настройки.
    const известные = new Set(['/admin/settings: охранник пускает «admin», меню его не звало']);

    const дыры: string[] = [];
    for (const [path, guard] of guards) {
      const roles = menu.get(path);
      if (!guard || !roles) continue;
      for (const role of guard) {
        if (!roles.has(role)) дыры.push(`${path}: охранник пускает «${role}», меню его не звало`);
      }
    }
    expect(дыры.filter((d) => !известные.has(d))).toEqual([]);
  });

  it('бариста не имеет доступа ни к одному админскому разделу', () => {
    const сБариста = [...guards.entries()]
      .filter(([, roles]) => roles?.has('barista'))
      .map(([p]) => p);
    expect(сБариста).toEqual([]);
  });
});
