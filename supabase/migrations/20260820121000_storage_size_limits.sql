-- Ни у одного хранилища не было ограничения на размер файла: любой вошедший
-- пользователь мог залить файл любого объёма. Проверки в интерфейсе есть, но они
-- живут в браузере и обходятся прямым запросом к хранилищу.
--
-- Потолки выставлены с запасом к тому, что уже загружено, иначе новая версия
-- существующего файла перестала бы влезать. Сверено по факту: крупнейший логотип
-- сейчас 7,4 МБ, аватар 4,1 МБ, ролик в #subFlow 51 МБ.
-- Договоры ограничены 20 МБ — ровно столько обещает интерфейс загрузки.

UPDATE storage.buckets SET file_size_limit = 20971520  WHERE id = 'shop-contracts';  --  20 МБ
UPDATE storage.buckets SET file_size_limit = 10485760  WHERE id = 'avatars';         --  10 МБ
UPDATE storage.buckets SET file_size_limit = 15728640  WHERE id = 'shop-logos';      --  15 МБ
UPDATE storage.buckets SET file_size_limit = 10485760  WHERE id = 'ad-banners';      --  10 МБ
UPDATE storage.buckets SET file_size_limit = 10485760  WHERE id = 'app-assets';      --  10 МБ
UPDATE storage.buckets SET file_size_limit = 10485760  WHERE id = 'media';           --  10 МБ
-- #subFlow принимает и видео, поэтому потолок выше остальных.
UPDATE storage.buckets SET file_size_limit = 104857600 WHERE id = 'subflow-images';  -- 100 МБ
