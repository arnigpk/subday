#!/usr/bin/env bash
#
# Выкладка веб-версии на сервер.
#
# Раньше это делалось руками четырьмя командами, и одна из них — снимок текущей
# версии в /var/www/web.bak.<время> — накапливала копии без всякой уборки.
# Здесь тот же порядок действий, но снимки чистятся сами: остаются три последних.
#
# Три, а не один: откатиться нужно бывает не на предыдущую версию, а через одну,
# когда поломку заметили не сразу.
#
# Сам ничего не собирает — берёт готовый dist. Собирать отдельно, когда нужно:
#   npm run build && npm run deploy:web

set -euo pipefail

SERVER="root@89.46.33.92"
REMOTE_DIR="/var/www/web"
KEEP=3
DIST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dist"

say() { printf '  %s\n' "$*"; }

if [ ! -d "$DIST" ] || [ ! -f "$DIST/index.html" ]; then
  echo "Нет собранной версии в $DIST — сначала npm run build" >&2
  exit 1
fi

say "Снимок текущей версии на сервере"
# Метку времени считает сервер. Одинарных кавычек вокруг имени быть не должно:
# внутри них подстановка не раскрывается, и вместо метки получается каталог с
# буквальным «$(date +%s)» в имени — уже наступал на это.
ssh -o BatchMode=yes "$SERVER" "cp -a '$REMOTE_DIR' ${REMOTE_DIR}.bak.\$(date +%s)"

say "Заливаю $(find "$DIST" -type f | wc -l | tr -d ' ') файлов"
rsync -az --delete -e "ssh -o BatchMode=yes" "$DIST/" "$SERVER:$REMOTE_DIR/"

say "Пересжимаю статику — nginx отдаёт готовые .gz"
ssh -o BatchMode=yes "$SERVER" "cd '$REMOTE_DIR' && find . -type f \\( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.svg' \\) -exec gzip -9 -k -f {} \\;"

# Уборка снимков. Шаблон нарочно строгий — только web.bak. и цифры, чтобы
# случайно не задеть что-то другое в /var/www. Сортировка по имени работает как
# сортировка по времени: в имени лежит метка времени.
say "Оставляю $KEEP последних снимков"
ssh -o BatchMode=yes "$SERVER" "
  ls -d ${REMOTE_DIR}.bak.* 2>/dev/null \
    | grep -E '^${REMOTE_DIR}\.bak\.[0-9]+$' \
    | sort -r | tail -n +\$(( $KEEP + 1 )) \
    | while read -r d; do rm -rf \"\$d\" && echo \"    удалён \$d\"; done
  echo \"    снимков осталось: \$(ls -d ${REMOTE_DIR}.bak.* 2>/dev/null | wc -l)\"
"

say "Сверяю выложенное с собранным"
local_list=$(ls "$DIST/assets" | sort)
remote_list=$(ssh -o BatchMode=yes "$SERVER" "ls '$REMOTE_DIR/assets' | grep -v '\.gz$' | sort")
if [ "$local_list" = "$remote_list" ]; then
  say "✅ совпадает файл в файл ($(echo "$local_list" | wc -l | tr -d ' ') шт.)"
else
  echo "  ❌ расхождение между собранным и выложенным" >&2
  diff <(echo "$local_list") <(echo "$remote_list") | head -20 >&2
  exit 1
fi

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 https://web.subday.app/)
say "Сайт отвечает: HTTP $code"
[ "$code" = "200" ] || { echo "  ❌ сайт не отвечает как надо" >&2; exit 1; }
