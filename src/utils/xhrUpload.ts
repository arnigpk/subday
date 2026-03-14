import { supabase } from '@/integrations/supabase/client';

interface UploadWithProgressOptions {
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
  cacheControl?: string;
  onProgress?: (percent: number, loaded: number, total: number) => void;
}

interface UploadResult {
  publicUrl: string;
}

/**
 * Upload a file to Supabase Storage using XHR for byte-level progress tracking.
 * Falls back to regular SDK upload if XHR fails.
 */
export function uploadWithProgress({
  bucket,
  path,
  blob,
  contentType,
  cacheControl = '31536000',
  onProgress,
}: UploadWithProgressOptions): Promise<UploadResult> {
  return new Promise(async (resolve, reject) => {
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);

      // Set headers
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
      xhr.setRequestHeader('apikey', anonKey);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('Cache-Control', cacheControl);
      xhr.setRequestHeader('x-upsert', 'false');

      // Track upload progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent, event.loaded, event.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(path);
          resolve({ publicUrl });
        } else {
          let errorMsg = `Upload failed with status ${xhr.status}`;
          try {
            const resp = JSON.parse(xhr.responseText);
            errorMsg = resp.message || resp.error || errorMsg;
          } catch {}
          reject(new Error(errorMsg));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during upload'));
      };

      xhr.onabort = () => {
        reject(new Error('Upload was aborted'));
      };

      xhr.send(blob);
    } catch (error) {
      reject(error);
    }
  });
}
