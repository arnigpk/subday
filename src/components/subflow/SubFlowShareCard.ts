import logoSrc from '@/assets/logo.png';

interface ShareCardOptions {
  authorName: string;
  content: string;
  imageUrl?: string | null;
  postId: string;
}

const CARD_W = 1080;
const CARD_H = 1920;
const PADDING = 60;
const BRAND_COLOR = '#C4982F'; // gold from logo
const BG_COLOR = '#1A1A1A';
const TEXT_COLOR = '#FFFFFF';
const MUTED_COLOR = '#AAAAAA';

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): number {
  const words = text.split(/\s+/);
  let line = '';
  let lineCount = 0;
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      lineCount++;
      if (lineCount > maxLines) {
        // Draw last line with ellipsis
        ctx.fillText(line.slice(0, -3) + '...', x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    lineCount++;
    if (lineCount > maxLines) {
      ctx.fillText(line.slice(0, -3) + '...', x, currentY);
    } else {
      ctx.fillText(line, x, currentY);
    }
    currentY += lineHeight;
  }
  return currentY;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function generateShareCard(options: ShareCardOptions): Promise<Blob> {
  const { authorName, content, imageUrl, postId } = options;

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, 'rgba(196, 152, 47, 0.08)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(196, 152, 47, 0.05)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  let currentY = 100;

  // Logo
  try {
    const logo = await loadImage(logoSrc);
    const logoSize = 120;
    const logoX = (CARD_W - logoSize) / 2;
    ctx.drawImage(logo, logoX, currentY, logoSize, logoSize);
    currentY += logoSize + 20;
  } catch {
    // fallback: text logo
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillStyle = BRAND_COLOR;
    ctx.textAlign = 'center';
    ctx.fillText('subday', CARD_W / 2, currentY + 50);
    currentY += 80;
  }

  // #subFlow tag
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillStyle = BRAND_COLOR;
  ctx.textAlign = 'center';
  ctx.fillText('#subFlow', CARD_W / 2, currentY + 40);
  currentY += 80;

  // Image area (blurred + lock)
  if (imageUrl) {
    try {
      const img = await loadImage(imageUrl);
      const imgAreaY = currentY;
      const imgAreaH = 600;
      const imgAreaW = CARD_W - PADDING * 2;

      // Draw blurred image
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(PADDING, imgAreaY, imgAreaW, imgAreaH, 24);
      ctx.clip();

      // Scale to cover
      const scale = Math.max(imgAreaW / img.width, imgAreaH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = PADDING + (imgAreaW - drawW) / 2;
      const drawY = imgAreaY + (imgAreaH - drawH) / 2;
      
      ctx.filter = 'blur(20px)';
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.filter = 'none';

      // Dark overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(PADDING, imgAreaY, imgAreaW, imgAreaH);

      ctx.restore();

      // Lock icon
      const lockCenterX = CARD_W / 2;
      const lockCenterY = imgAreaY + imgAreaH / 2;

      // Lock circle background
      ctx.beginPath();
      ctx.arc(lockCenterX, lockCenterY, 50, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(196, 152, 47, 0.3)';
      ctx.fill();

      // Lock emoji
      ctx.font = '56px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒', lockCenterX, lockCenterY);
      ctx.textBaseline = 'alphabetic';

      // "Контент заблокирован" text under lock
      ctx.font = '600 28px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.textAlign = 'center';
      ctx.fillText('Контент заблокирован', lockCenterX, lockCenterY + 80);

      currentY = imgAreaY + imgAreaH + 40;
    } catch {
      // Image failed to load — skip
      currentY += 20;
    }
  } else {
    currentY += 20;
  }

  // Author
  ctx.font = '600 32px system-ui, sans-serif';
  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'left';
  ctx.fillText(`Пост от @${authorName}`, PADDING, currentY + 40);
  currentY += 80;

  // Post text (truncated, partially visible with fade)
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillStyle = MUTED_COLOR;
  ctx.textAlign = 'left';
  const textEndY = wrapText(ctx, content, PADDING, currentY, CARD_W - PADDING * 2, 40, 4);

  // Fade effect on last lines
  const fadeGrad = ctx.createLinearGradient(0, textEndY - 80, 0, textEndY);
  fadeGrad.addColorStop(0, 'rgba(26, 26, 26, 0)');
  fadeGrad.addColorStop(1, BG_COLOR);
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(0, textEndY - 80, CARD_W, 80);

  currentY = textEndY + 40;

  // CTA Button
  const btnW = 500;
  const btnH = 80;
  const btnX = (CARD_W - btnW) / 2;
  const btnY = Math.max(currentY, CARD_H - 420);

  // Button background
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
  btnGrad.addColorStop(0, '#C4982F');
  btnGrad.addColorStop(1, '#D4A83F');
  ctx.beginPath();
  ctx.roundRect(btnX, btnY, btnW, btnH, 40);
  ctx.fillStyle = btnGrad;
  ctx.fill();

  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('Открой в subday', CARD_W / 2, btnY + btnH / 2 + 10);

  // Bottom text
  const bottomY = btnY + btnH + 50;
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillStyle = MUTED_COLOR;
  ctx.textAlign = 'center';
  ctx.fillText('Скачай subday чтобы увидеть', CARD_W / 2, bottomY);

  ctx.font = '22px system-ui, sans-serif';
  ctx.fillStyle = BRAND_COLOR;
  ctx.fillText('i.subday.app/subflow/post/' + postId.slice(0, 8), CARD_W / 2, bottomY + 40);

  // Bottom branding
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillText('subday © ' + new Date().getFullYear(), CARD_W / 2, CARD_H - 60);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      'image/png'
    );
  });
}

export async function shareSubFlowPost(options: ShareCardOptions): Promise<boolean> {
  try {
    const blob = await generateShareCard(options);
    const file = new File([blob], 'subflow-post.png', { type: 'image/png' });
    const shareUrl = `https://i.subday.app/subflow/post/${options.postId}`;

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `Пост от @${options.authorName} в #subFlow`,
        text: `Смотри пост в subday #subFlow`,
        url: shareUrl,
      });
      return true;
    }

    // Fallback: copy link
    await navigator.clipboard.writeText(shareUrl);
    return false; // indicates fallback was used
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return false; // user cancelled share
    }
    // Last resort: copy link
    try {
      await navigator.clipboard.writeText(`https://vhod.lovable.app/subflow/post/${options.postId}`);
    } catch {}
    return false;
  }
}
