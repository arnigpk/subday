import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubscriptionEditor, type EditableSubscription } from '@/components/admin/SubscriptionEditor';

// Кнопка «период тарифа» меняет СРАЗУ ДВА поля — остаток и срок. Первая версия
// это ломала: оба обработчика разворачивали один и тот же снимок состояния, и
// второй затирал работу первого. Внешне выглядело так, будто добавились только
// чашки, а дни остались прежними. Тест держит именно этот случай.

const SUB: EditableSubscription = {
  name: 'Subday Plus',
  expires_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
  sub_id: 'sub-1',
  cups_count: 30,
  duration_days: 30,
};

/** Обёртка с настоящим состоянием — как в карточке пользователя. */
function Harness({ sub = SUB as EditableSubscription | null, startRemaining = 6, startDays = 8 as number | null }) {
  const [form, setForm] = useState({ remaining: startRemaining, days: startDays });
  return (
    <>
      <div data-testid="state">{form.remaining}/{form.days}</div>
      <SubscriptionEditor
        title="Кофе"
        icon={null}
        sub={sub}
        remaining={form.remaining}
        days={form.days}
        canManage
        onRemaining={(v) => setForm((prev) => ({ ...prev, remaining: v }))}
        onDays={(v) => setForm((prev) => ({ ...prev, days: v }))}
      />
    </>
  );
}

const state = () => screen.getByTestId('state').textContent;
const plus = () => screen.getByText(/период тарифа/);
const minus = () => screen.getByText('−период');

describe('карточка подписки в админке', () => {
  it('«период тарифа» добавляет И дни, И чашки за одно нажатие', () => {
    render(<Harness startRemaining={6} startDays={8} />);
    expect(state()).toBe('6/8');
    fireEvent.click(plus());
    expect(state()).toBe('36/38');   // не «36/8» — оба поля, а не одно
  });

  it('нажатие дважды складывается, а не перезаписывает', () => {
    render(<Harness startRemaining={6} startDays={8} />);
    fireEvent.click(plus());
    fireEvent.click(plus());
    expect(state()).toBe('66/68');
  });

  it('«−период» снимает ровно столько же', () => {
    render(<Harness startRemaining={36} startDays={38} />);
    fireEvent.click(minus());
    expect(state()).toBe('6/8');
  });

  it('«−период» не уводит в минус', () => {
    render(<Harness startRemaining={5} startDays={3} />);
    fireEvent.click(minus());
    expect(state()).toBe('0/0');
  });

  it('на кнопке — числа именно этого тарифа', () => {
    render(<Harness />);
    expect(plus().textContent).toContain('+30 дн');
    expect(plus().textContent).toContain('+30 шт');
  });

  it('без подписки поля закрыты и кнопок нет', () => {
    render(<Harness sub={null} />);
    expect(screen.getByText(/нет подписки/)).toBeTruthy();
    expect(screen.queryByText(/период тарифа/)).toBeNull();
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs.every((i) => i.disabled)).toBe(true);
  });

  it('без прав на управление править нельзя', () => {
    render(
      <SubscriptionEditor
        title="Кофе" icon={null} sub={SUB} remaining={6} days={8}
        canManage={false} onRemaining={vi.fn()} onDays={vi.fn()}
      />
    );
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs.every((i) => i.disabled)).toBe(true);
    expect(screen.queryByText(/период тарифа/)).toBeNull();
  });
it('предупреждает, если начислили чашки на истёкший срок', () => {
    // Ежечасная проверка обнуляет остаток у просроченной подписки — без
    // предупреждения админ бы не понял, куда делись начисленные чашки.
    render(<Harness startRemaining={30} startDays={0} />);
    expect(screen.getByText(/Остаток обнулится/)).toBeTruthy();
  });

  it('срок продлён — предупреждения нет', () => {
    render(<Harness startRemaining={30} startDays={30} />);
    expect(screen.queryByText(/Остаток обнулится/)).toBeNull();
  });
});
