// Экспорт отчётов в НАСТОЯЩИЙ .xlsx (а не CSV): корректные столбцы в Excel на любом
// ПК/локали (раньше CSV с запятыми в русской локали Excel валил всё в столбец A).
// SheetJS грузим лениво (import() при первом скачивании) — стартовый бандл не пухнет.
// Мы только ПИШЕМ свои данные (parse не используем), поэтому advisory на parse-путь
// SheetJS нас не касается. Функция асинхронная; вызывающим await не нужен.

export async function downloadXLSX(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const XLSX = await import('xlsx');
  const norm = (v: string | number | null | undefined) => (v == null ? '' : v);
  const aoa: (string | number)[][] = [headers, ...rows.map(r => r.map(norm))];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Ширины столбцов по максимальной длине содержимого — чтобы всё читалось.
  ws['!cols'] = headers.map((h, i) => {
    let max = String(h ?? '').length;
    for (const r of rows) {
      const c = r[i];
      const len = c == null ? 0 : String(c).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(Math.max(max + 2, 8), 40) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Отчёт');

  // Имя: меняем .csv → .xlsx (вызывающие ещё передают .csv).
  const outName = filename.replace(/\.csv$/i, '') + '.xlsx';

  // Скачиваем сами через Blob (надёжнее, чем XLSX.writeFile с его детектом среды).
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Обратная совместимость: старое имя, теперь отдаёт корректный .xlsx.
export const downloadCSV = downloadXLSX;

export function formatDateRu(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Aqtau' });
}
