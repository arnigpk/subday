import { useEffect, useRef, useState, useCallback } from 'react';

export type SerialStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseSerialScannerOptions {
  onScan: (data: string) => void;
  baudRate?: number;
}

export function useSerialScanner({ onScan, baudRate = 9600 }: UseSerialScannerOptions) {
  const [status, setStatus] = useState<SerialStatus>('disconnected');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const onScanRef = useRef(onScan);
  const bufferRef = useRef('');
  const bufferTimeRef = useRef(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, []);

  const disconnect = useCallback(async () => {
    try { readerRef.current?.cancel(); } catch {}
    try { readerRef.current?.releaseLock(); } catch {}
    try { await portRef.current?.close(); } catch {}
    readerRef.current = null;
    portRef.current = null;
    bufferRef.current = '';
    if (mountedRef.current) setStatus('disconnected');
  }, []);

  // Общая обработка считанных строк с защитой от мусора и склейки
  const processBuffer = (chunk: string) => {
    const now = Date.now();
    // Если между чанками прошло больше 500мс — старый буфер протух, начинаем заново
    if (now - bufferTimeRef.current > 500) {
      bufferRef.current = '';
    }
    bufferTimeRef.current = now;

    bufferRef.current += chunk;

    const lines = bufferRef.current.split(/\r\n|\r|\n/);

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line.length === 0) continue;
      // Передаём только строки которые выглядят как наш JSON
      if (line.startsWith('{') && line.endsWith('}')) {
        onScanRef.current(line);
      } else {
        console.warn('[SerialScanner] Пропущена строка (не JSON):', JSON.stringify(line));
      }
    }

    bufferRef.current = lines[lines.length - 1];

    // Страховка: если "хвост" разросся (битый поток) — чистим
    if (bufferRef.current.length > 2000) {
      bufferRef.current = '';
    }
  };

  const readLoop = async (port: any) => {
    const reader = port.readable.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder('utf-8');
    bufferRef.current = '';

    while (true) {
      let value: Uint8Array;
      let done: boolean;
      try {
        ({ value, done } = await reader.read());
      } catch {
        break;
      }
      if (done || !mountedRef.current) break;
      processBuffer(decoder.decode(value, { stream: true }));
    }
  };

  const connect = useCallback(async () => {
    if (!('serial' in navigator)) {
      setStatus('error');
      setErrorMsg('Браузер не поддерживает Web Serial API. Используйте Chrome или Edge.');
      return;
    }

    setStatus('connecting');
    setErrorMsg(null);

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });
      portRef.current = port;

      if (!mountedRef.current) { await port.close(); return; }

      setStatus('connected');
      console.log('[SerialScanner] Порт открыт, начинаем чтение...');

      await readLoop(port);
      console.log('[SerialScanner] Цикл чтения завершён');

    } catch (err: any) {
      if (!mountedRef.current) return;
      if (err?.name === 'NotFoundError') {
        setStatus('disconnected');
        return;
      }
      console.error('[SerialScanner] Ошибка:', err);
      setStatus('error');
      setErrorMsg('Ошибка подключения к сканеру. Проверьте что сканер подключён.');
    }
  }, [baudRate]);

  const autoConnect = useCallback(async () => {
    if (!('serial' in navigator)) return;
    try {
      const ports = await (navigator as any).serial.getPorts();
      if (ports.length === 0) return;

      const port = ports[0];
      await port.open({ baudRate });
      portRef.current = port;

      if (!mountedRef.current) { await port.close(); return; }
      setStatus('connected');
      console.log('[SerialScanner] Автоподключение успешно');

      await readLoop(port);
    } catch (err) {
      console.log('[SerialScanner] Автоподключение не удалось:', err);
    }
  }, [baudRate]);

  useEffect(() => {
    autoConnect();
  }, [autoConnect]);

  const isSupported = 'serial' in navigator;

  return { status, errorMsg, connect, disconnect, isSupported };
}