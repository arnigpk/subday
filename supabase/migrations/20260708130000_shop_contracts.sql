-- Договор кофейни: отдельно ссылка (электронно подписанные) и загруженный файл (PDF/doc).
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS contract_url text;       -- внешняя ссылка на договор
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS contract_file_url text;  -- URL загруженного файла (PDF/doc)

-- Бакет для файлов договоров (публичное чтение по URL).
INSERT INTO storage.buckets (id, name, public)
VALUES ('shop-contracts', 'shop-contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Публичное чтение файла по прямой ссылке.
DROP POLICY IF EXISTS "Public read shop-contracts" ON storage.objects;
CREATE POLICY "Public read shop-contracts" ON storage.objects
  FOR SELECT USING (bucket_id = 'shop-contracts');

-- Загрузка/замена/удаление — только админ/суперадмин.
DROP POLICY IF EXISTS "Admins manage shop-contracts" ON storage.objects;
CREATE POLICY "Admins manage shop-contracts" ON storage.objects
  FOR ALL
  USING (bucket_id = 'shop-contracts' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)))
  WITH CHECK (bucket_id = 'shop-contracts' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));
