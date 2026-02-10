import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { UserPlus, LogIn, Calendar, TrendingUp } from 'lucide-react';

interface DashboardStats {
  todayRegistered: number;
  todayLogins: number;
  weekRegistered: number;
  weekLogins: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    todayRegistered: 0,
    todayLogins: 0,
    weekRegistered: 0,
    weekLogins: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [recentRedemptions, setRecentRedemptions] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    fetchRecentRedemptions();
  }, []);

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_dashboard_stats');
      
      if (error) throw error;

      const result = data as { today_registered: number; today_logins: number; week_registered: number; week_logins: number } | null;
      
      setStats({
        todayRegistered: result?.today_registered || 0,
        todayLogins: result?.today_logins || 0,
        weekRegistered: result?.week_registered || 0,
        weekLogins: result?.week_logins || 0,
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
      title: 'Сегодня зарегистрировано', 
      value: stats.todayRegistered, 
      icon: UserPlus,
      color: 'text-blue-500'
    },
    { 
      title: 'Сегодня зашли', 
      value: stats.todayLogins, 
      icon: LogIn,
      color: 'text-green-500'
    },
    { 
      title: 'Регистрации за неделю', 
      value: stats.weekRegistered, 
      icon: Calendar,
      color: 'text-purple-500'
    },
    { 
      title: 'Зашли за неделю', 
      value: stats.weekLogins, 
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
          <CardTitle>История подписок</CardTitle>
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
