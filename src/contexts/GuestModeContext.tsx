import { createContext, useContext } from 'react';

// Гостевой режим: просмотр без входа (App Store 5.1.1 — не требовать регистрацию
// для функций, не связанных с аккаунтом). isGuest=true, когда пользователь
// смотрит приложение без сессии. requestLogin() уводит на экран входа/регистрации
// для действий, требующих аккаунта (оплата подписки и т.п.).
interface GuestModeValue {
  isGuest: boolean;
  requestLogin: () => void;
}

const GuestModeContext = createContext<GuestModeValue>({ isGuest: false, requestLogin: () => {} });

export const GuestModeProvider = GuestModeContext.Provider;

export function useGuestMode() {
  return useContext(GuestModeContext);
}
