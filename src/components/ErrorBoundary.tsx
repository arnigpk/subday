import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Необязательный ярлык секции — попадёт в лог, помогает понять, что упало. */
  section?: string;
  /**
   * Свой фолбэк. Если не задан — показываем стандартный экран «что-то пошло
   * не так». Для секций (лента, карточка) можно передать компактный фолбэк,
   * чтобы падение одного блока не занимало весь экран.
   */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Инлайновые стили: фолбэк обязан отрисоваться, даже если сломался CSS,
// тема или контексты. Поэтому не полагаемся на Tailwind/переменные темы,
// а определяем тёмную тему через matchMedia прямо здесь.
const isDark = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const COLORS = isDark
  ? { bg: '#141210', card: '#1e1b18', fg: '#f2ede8', sub: '#a89f97', border: '#2c2824' }
  : { bg: '#faf7f4', card: '#ffffff', fg: '#1a1613', sub: '#726a63', border: '#e8e1da' };

/**
 * Ловит ошибки рендера в поддереве и показывает мягкий фолбэк вместо белого
 * экрана. Без этого одна необработанная ошибка в любом компоненте роняет всё
 * приложение. React требует именно класс-компонент для error boundary.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Единая точка логирования — сюда позже можно подключить Sentry.
    console.error(
      `[ErrorBoundary${this.props.section ? ':' + this.props.section : ''}]`,
      error, info.componentStack,
    );
  }

  private handleReload = () => {
    // Полная перезагрузка — самый надёжный способ вернуть приложение в рабочее
    // состояние после сбоя рендера.
    try { window.location.reload(); } catch { /* ignore */ }
  };

  private handleHome = () => {
    try { window.location.assign('/'); } catch { /* ignore */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', background: COLORS.bg, color: COLORS.fg,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        <div style={{
          maxWidth: '360px', width: '100%', textAlign: 'center',
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderRadius: '24px', padding: '32px 24px',
        }}>
          <div style={{ fontSize: '48px', lineHeight: 1, marginBottom: '16px' }}>☕️</div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px' }}>
            Что-то пошло не так
          </h1>
          <p style={{ fontSize: '14px', color: COLORS.sub, margin: '0 0 24px', lineHeight: 1.5 }}>
            Приложение столкнулось с ошибкой. Обычно помогает перезагрузка — данные не потеряются.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              width: '100%', padding: '14px', borderRadius: '16px', border: 'none',
              background: 'linear-gradient(135deg, hsl(32 70% 50%), hsl(32 70% 40%))',
              color: '#fff', fontSize: '16px', fontWeight: 700, cursor: 'pointer',
              marginBottom: '10px',
            }}
          >
            Перезагрузить
          </button>
          <button
            onClick={this.handleHome}
            style={{
              width: '100%', padding: '12px', borderRadius: '16px',
              border: `1px solid ${COLORS.border}`, background: 'transparent',
              color: COLORS.sub, fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            На главную
          </button>
        </div>
      </div>
    );
  }
}
