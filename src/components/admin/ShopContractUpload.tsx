import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, X, Loader2, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { logDataError } from '@/lib/errorLog';

interface ShopContractUploadProps {
  currentFileUrl: string | null;
  onFileChange: (url: string | null) => void;
  shopId?: string;
  maxSizeMb?: number;
}

const BUCKET = 'shop-contracts';
/** Сколько живёт ссылка на договор. Хватает открыть и скачать, но не разослать. */
const SIGNED_URL_TTL_SEC = 300;

/**
 * Путь файла внутри хранилища. В базе исторически лежали полные публичные ссылки
 * (бакет был открыт всем), поэтому старые записи распознаём и приводим к пути —
 * иначе уже загруженные договоры перестали бы открываться после закрытия бакета.
 */
function toStoragePath(value: string): string {
  const marker = `/${BUCKET}/`;
  const i = value.indexOf(marker);
  return i === -1 ? value : value.slice(i + marker.length);
}

// Загрузка файла договора (PDF/doc/docx) в бакет shop-contracts.
// Бакет закрытый: файл отдаётся только по временной подписанной ссылке.
export function ShopContractUpload({ currentFileUrl, onFileChange, shopId, maxSizeMb = 20 }: ShopContractUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Открываем договор по временной ссылке. Заводим её в момент нажатия, а не
  // заранее: ссылка живёт минуты, и выписанная при отрисовке протухла бы раньше,
  // чем до неё дойдут руки.
  const openContract = async () => {
    if (!currentFileUrl) return;
    setIsOpening(true);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(toStoragePath(currentFileUrl), SIGNED_URL_TTL_SEC);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      logDataError('admin-shops', error, 'ссылка на договор');
      toast({ title: 'Не удалось открыть договор', variant: 'destructive' });
    } finally {
      setIsOpening(false);
    }
  };

  const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    const ok = name.endsWith('.pdf') || name.endsWith('.doc') || name.endsWith('.docx');
    if (!ok) {
      toast({ title: 'Только PDF или Word (.pdf, .doc, .docx)', variant: 'destructive' });
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast({ title: `Максимальный размер файла ${maxSizeMb}MB`, variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `contracts/${shopId || 'new'}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { upsert: true, contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      // Сохраняем путь, а не готовую ссылку: бакет закрыт, постоянной ссылки у файла
      // больше нет — она выписывается на несколько минут в момент открытия.
      onFileChange(filePath);
      toast({ title: 'Файл договора загружен' });
    } catch (error) {
      console.error('Error uploading contract:', error);
      logDataError('admin-shops', error, 'загрузка договора');
      toast({ title: 'Ошибка загрузки файла', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Файл договора (PDF / Word)</Label>
      {currentFileUrl && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <FileText className="w-4 h-4 text-primary shrink-0" />
          <button
            type="button"
            onClick={openContract}
            disabled={isOpening}
            className="text-sm text-primary underline truncate flex-1 text-left disabled:opacity-60"
          >
            {isOpening ? 'Готовим ссылку…' : 'Открыть загруженный файл'}
          </button>
          <button type="button" onClick={() => { onFileChange(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
            className="w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept={ACCEPT} onChange={handleFileSelect} className="hidden" />
      <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
        {isUploading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Загрузка...</>) : (<><Upload className="w-4 h-4 mr-2" />{currentFileUrl ? 'Заменить файл' : 'Загрузить файл'}</>)}
      </Button>
      <p className="text-xs text-muted-foreground">До {maxSizeMb} МБ. PDF, .doc, .docx</p>
    </div>
  );
}
