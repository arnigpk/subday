import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Не проверяем СГЕНЕРИРОВАННОЕ: сборку веба, вывод Gradle и копии веб-ассетов
    // внутри нативных проектов (их создаёт `cap copy`, руками там никто не пишет).
    // Иначе линт шумит сотнями замечаний на файлы, которые мы не пишем, и в этом
    // шуме тонет реальная новая ошибка.
    ignores: [
      "dist",
      "android/app/build",
      "android/app/src/main/assets/public",
      "ios/App/App/public",
      "builds",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Легаси-долг: `any` встречается по всей старой кодовой базе. Как ОШИБКА он
      // делал вывод линта бесполезным (500+ строк), и настоящая ошибка в нём тонула.
      // Оставляем видимым как предупреждение и чистим точечно при правках файла.
      "@typescript-eslint/no-explicit-any": "warn",
      // Пустой catch у нас — осознанный приём: молча глотаем некритичные сбои
      // (кеш, аналитика, необязательные уведомления), чтобы не ронять основной путь.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
