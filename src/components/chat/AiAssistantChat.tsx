import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;

const SUGGESTIONS = [
  'Какие подписки есть и сколько стоят?',
  'Как получить кофе?',
  'Какие кофейни работают?',
  'Что такое стрики?',
  'Как связаться с поддержкой?',
];

interface AiAssistantChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AiAssistantChat({ open, onOpenChange }: AiAssistantChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Msg = { role: 'user', content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setIsLoading(true);

    let assistantSoFar = '';

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Ошибка сервера' }));
        toast({ title: 'Ошибка', description: err.error || 'Попробуйте позже', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        const content = assistantSoFar;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
          }
          return [...prev, { role: 'assistant', content }];
        });
      };

      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, idx);
          textBuffer = textBuffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const c = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (c) upsert(c);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (!raw.startsWith('data: ')) continue;
          const j = raw.slice(6).trim();
          if (j === '[DONE]') continue;
          try {
            const p = JSON.parse(j);
            const c = p.choices?.[0]?.delta?.content as string | undefined;
            if (c) upsert(c);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error('Chat error:', e);
      toast({ title: 'Ошибка', description: 'Не удалось получить ответ', variant: 'destructive' });
    }

    setIsLoading(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[55vh] flex flex-col p-0 rounded-t-2xl">
        <SheetHeader className="px-4 pt-3 pb-2 border-b pr-12">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Bot className="h-4 w-4 text-primary" />
            <span className="flex-1">Служба заботы subday</span>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-md hover:bg-destructive/10"
                aria-label="Очистить чат"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-3" ref={scrollRef as any}>
          <div className="py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="text-center text-muted-foreground text-xs py-3">
                  Привет! 👋 Задайте вопрос или выберите тему:
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border bg-secondary/50 text-secondary-foreground hover:bg-secondary transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-1.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground'
                  }`}
                >
                  {m.content}
                  {m.role === 'assistant' && i === messages.length - 1 && isLoading && (
                    <span className="inline-block w-1 h-3 bg-current ml-0.5 animate-pulse" />
                  )}
                </div>
                {m.role === 'user' && (
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex gap-1.5 items-center">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-2 flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="Задайте вопрос..."
            disabled={isLoading}
            className="flex-1 h-8 text-xs"
          />
          <Button size="icon" className="h-8 w-8" onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
