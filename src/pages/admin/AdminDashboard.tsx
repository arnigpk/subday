import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Users, Coffee, TrendingUp, Calendar } from 'lucide-react';

interface DashboardStats {
  totalUsers: number;
  todayRedemptions: number;
  weeklyRedemptions: number;
  activeUsersWeek: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    todayRedemptions: 0,
    weeklyRedemptions: 0,
    activeUsersWeek: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [recentRedemptions, setRecentRedemptions] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    fetchRecentRedemptions();
  }, []);

  const fetchStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Total users
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Today's redemptions
      const { count: todayRedemptions } = await supabase
        .from('redemptions')
        .select('*', { count: 'exact', head: true })
        .gte('redeemed_at', today);

      // Weekly redemptions
      const { count: weeklyRedemptions } = await supabase
        .from('redemptions')
        .select('*', { count: 'exact', head: true })
        .gte('redeemed_at', weekAgo);

      // Active users this week
      const { count: activeUsersWeek } = await supabase
        .from('user_stats')
        .select('*', { count: 'exact', head: true })
        .gte('last_redemption_date', weekAgo);

      setStats({
        totalUsers: totalUsers || 0,
        todayRedemptions: todayRedemptions || 0,
        weeklyRedemptions: weeklyRedemptions || 0,
        activeUsersWeek: activeUsersWeek || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRecentRedemptions = async () => {
    try {
      const { data } = await supabase
        .from('redemptions')
        .select('*')
        .order('redeemed_at', { ascending: false })
        .limit(10);

      setRecentRedemptions(data || []);
    } catch (error) {
      console.error('Error fetching recent redemptions:', error);
    }
  };

  const statCards = [
    { 
      title: 'Всего пользователей', 
      value: stats.totalUsers, 
      icon: Users,
      color: 'text-blue-500'
    },
    { 
      title: 'Redemptions сегодня', 
      value: stats.todayRedemptions, 
      icon: Coffee,
      color: 'text-green-500'
    },
    { 
      title: 'За неделю', 
      value: stats.weeklyRedemptions, 
      icon: Calendar,
      color: 'text-purple-500'
    },
    { 
      title: 'Активных (7 дней)', 
      value: stats.activeUsersWeek, 
      icon: TrendingUp,
      color: 'text-orange-500'
    },
  ];

  return (
    <AdminLayout title="Дашборд">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              ) : (
                <div className="text-2xl font-bold">{stat.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Последние redemptions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentRedemptions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Нет данных
            </p>
          ) : (
            <div className="space-y-4">
              {recentRedemptions.map((redemption) => (
                <div
                  key={redemption.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <p className="font-medium">{redemption.drink_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {redemption.shop_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {new Date(redemption.redeemed_at).toLocaleDateString('ru-RU')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(redemption.redeemed_at).toLocaleTimeString('ru-RU', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
