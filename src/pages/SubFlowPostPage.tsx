import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { User, MapPin, Lock, Download } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { isVideoUrl } from '@/utils/imageCompression';
import logo from '@/assets/logo.png';

interface PostData {
  id: string;
  content: string;
  image_url: string | null;
  image_urls: string[] | null;
  shop_name: string | null;
  created_at: string;
  user_id: string;
}

interface ProfileData {
  subflow_nickname: string | null;
  name: string | null;
  avatar_url: string | null;
}

export default function SubFlowPostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<PostData | null>(null);
  const [author, setAuthor] = useState<ProfileData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    loadPost();
  }, [id]);

  useEffect(() => {
    if (!session) {
      setHasAccess(false);
      return;
    }
    checkAccess();
  }, [session]);

  const loadPost = async () => {
    try {
      const { data, error } = await supabase
        .from('subflow_posts')
        .select('id, content, image_url, image_urls, shop_name, created_at, user_id')
        .eq('id', id!)
        .single();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setPost(data);

      // Load author profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('subflow_nickname, name, avatar_url')
        .eq('user_id', data.user_id)
        .single();

      setAuthor(profile);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const checkAccess = async () => {
    if (!session) return;

    // Check subscription or subflow_access flag
    const [subRes, profileRes] = await Promise.all([
      supabase
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .limit(1),
      supabase
        .from('profiles')
        .select('subflow_access')
        .eq('user_id', session.user.id)
        .single(),
    ]);

    const hasSub = (subRes.data?.length ?? 0) > 0;
    const hasFlag = profileRes.data?.subflow_access === true;
    setHasAccess(hasSub || hasFlag);
  };

  const authorName = author?.subflow_nickname || author?.name || 'Пользователь';
  const images = post?.image_urls?.length ? post.image_urls : (post?.image_url ? [post.image_url] : []);

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'd MMM в HH:mm', { locale: ru });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
        <img src={logo} alt="subday" className="w-16 h-16" />
        <h1 className="text-xl font-bold text-foreground">Пост не найден</h1>
        <p className="text-muted-foreground text-center">Возможно он был удалён или ссылка неверная</p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold"
        >
          На главную
        </button>
      </div>
    );
  }

  // Full access view — redirect to SubFlow page with post highlight
  if (session && hasAccess && post) {
    navigate(`/subflow?post=${post.id}`, { replace: true });
    return null;
  }

  // Locked preview for non-subscribers / non-authenticated users
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={logo} alt="subday" className="w-8 h-8" />
            <span className="font-bold text-foreground">#subFlow</span>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Post card */}
        <div className="bg-card rounded-2xl border border-border p-4 mb-6">
          {/* Author */}
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-11 h-11">
              {author?.avatar_url ? (
                <AvatarImage src={author.avatar_url} alt={authorName} className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-primary/10">
                <User size={20} className="text-primary" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-bold text-foreground">{authorName}</p>
              {post && <p className="text-xs text-muted-foreground">{formatDate(post.created_at)}</p>}
            </div>
          </div>

          {/* Shop tag */}
          {post?.shop_name && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium mb-3">
              <MapPin size={12} />
              <span>{post.shop_name}</span>
            </div>
          )}

          {/* Blurred content */}
          <div className="relative">
            <p className="text-foreground leading-relaxed mb-3 line-clamp-3">
              {post?.content.slice(0, 80)}...
            </p>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card" />
          </div>

          {/* Blurred image */}
          {images.length > 0 && (
            <div className="relative -mx-4 overflow-hidden rounded-lg mb-4">
              {isVideoUrl(images[0]) ? (
                <div className="w-full h-64 bg-muted flex items-center justify-center">
                  <Lock size={32} className="text-muted-foreground" />
                </div>
              ) : (
                <>
                  <img
                    src={images[0]}
                    alt="Post preview"
                    className="w-full h-72 object-cover blur-xl scale-110"
                    crossOrigin="anonymous"
                  />
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                      <Lock size={28} className="text-primary" />
                    </div>
                    <p className="text-white font-semibold text-sm">Контент заблокирован</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Locked overlay */}
          <div className="flex flex-col items-center gap-4 py-6 border-t border-border">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Lock size={24} className="text-primary" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-foreground mb-1">Контент заблокирован</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Чтобы увидеть полный пост, скачай приложение subday и оформи подписку
              </p>
            </div>
          </div>
        </div>

        {/* CTA section */}
        <div className="flex flex-col items-center gap-4">
          <a
            href="https://vhod.lovable.app"
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-lg"
          >
            <Download size={20} />
            Открыть subday
          </a>

          {!session && (
            <button
              onClick={() => navigate('/')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Уже есть аккаунт? Войти
            </button>
          )}

          <div className="flex items-center gap-2 mt-4">
            <img src={logo} alt="subday" className="w-6 h-6 opacity-50" />
            <span className="text-xs text-muted-foreground">subday #subFlow</span>
          </div>
        </div>
      </div>
    </div>
  );
}
