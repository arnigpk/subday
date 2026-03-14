import { supabase } from '@/integrations/supabase/client';

/**
 * Upload a file to Supabase Storage using XHR for byte-level progress tracking.
 * Falls back to SDK upload if XHR fails.
 */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: Blob,
  onProgress: (percent: number) => void
): Promise<{ publicUrl: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(path);
        resolve({ publicUrl });
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Cache-Control', 'max-age=31536000');

    // Send as FormData to match Supabase storage API
    const formData = new FormData();
    formData.append('', file, path.split('/').pop() || 'file');
    xhr.send(formData);
  });
}
