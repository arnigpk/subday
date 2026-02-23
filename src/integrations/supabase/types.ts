export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_banner_events: {
        Row: {
          banner_id: string
          created_at: string
          event_type: string
          id: string
        }
        Insert: {
          banner_id: string
          created_at?: string
          event_type: string
          id?: string
        }
        Update: {
          banner_id?: string
          created_at?: string
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_banner_events_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "ad_banners"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_banners: {
        Row: {
          autoplay_delay: number
          caption: string | null
          created_at: string
          display_location: string
          external_url: string | null
          id: string
          image_url: string
          is_active: boolean
          shop_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          autoplay_delay?: number
          caption?: string | null
          created_at?: string
          display_location?: string
          external_url?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          shop_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          autoplay_delay?: number
          caption?: string | null
          created_at?: string
          display_location?: string
          external_url?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          shop_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_banners_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_messages: {
        Row: {
          broadcast_type: string
          created_at: string
          failed_count: number
          id: string
          message: string
          recipient_count: number
          sent_by: string
          sent_count: number
          target_type: string
        }
        Insert: {
          broadcast_type: string
          created_at?: string
          failed_count?: number
          id?: string
          message: string
          recipient_count?: number
          sent_by: string
          sent_count?: number
          target_type: string
        }
        Update: {
          broadcast_type?: string
          created_at?: string
          failed_count?: number
          id?: string
          message?: string
          recipient_count?: number
          sent_by?: string
          sent_count?: number
          target_type?: string
        }
        Relationships: []
      }
      guest_grants: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invitee_phone: string | null
          invitee_user_id: string | null
          inviter_user_id: string
          month_key: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          invitee_phone?: string | null
          invitee_user_id?: string | null
          inviter_user_id: string
          month_key: string
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invitee_phone?: string | null
          invitee_user_id?: string | null
          inviter_user_id?: string
          month_key?: string
          status?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          verified: boolean
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          verified?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          verified?: boolean
        }
        Relationships: []
      }
      payment_orders: {
        Row: {
          amount: number
          created_at: string
          id: string
          metadata: Json | null
          order_id: string
          paid_at: string | null
          payment_id: string | null
          payment_url: string | null
          status: string
          subscription_type_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          metadata?: Json | null
          order_id: string
          paid_at?: string | null
          payment_id?: string | null
          payment_url?: string | null
          status?: string
          subscription_type_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          order_id?: string
          paid_at?: string | null
          payment_id?: string | null
          payment_url?: string | null
          status?: string
          subscription_type_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_subscription_type_id_fkey"
            columns: ["subscription_type_id"]
            isOneToOne: false
            referencedRelation: "subscription_types"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          created_at: string
          id: string
          is_blocked: boolean | null
          name: string | null
          phone: string
          public_id: string
          special_offer_popup_shown_at: string | null
          special_offer_redeemed_at: string | null
          subflow_nickname: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_blocked?: boolean | null
          name?: string | null
          phone: string
          public_id?: string
          special_offer_popup_shown_at?: string | null
          special_offer_redeemed_at?: string | null
          subflow_nickname?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_blocked?: boolean | null
          name?: string | null
          phone?: string
          public_id?: string
          special_offer_popup_shown_at?: string | null
          special_offer_redeemed_at?: string | null
          subflow_nickname?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_notifications: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          title?: string
        }
        Relationships: []
      }
      redemptions: {
        Row: {
          created_at: string
          drink_name: string
          drink_type: string
          id: string
          redeemed_at: string
          shop_id: string | null
          shop_name: string
          subscription_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          drink_name: string
          drink_type: string
          id?: string
          redeemed_at?: string
          shop_id?: string | null
          shop_name: string
          subscription_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          drink_name?: string
          drink_type?: string
          id?: string
          redeemed_at?: string
          shop_id?: string | null
          shop_name?: string
          subscription_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      shops: {
        Row: {
          address: string | null
          addresses: string[] | null
          badge_color: string | null
          badge_text: string | null
          badges: Json | null
          city: string | null
          coordinates: Json | null
          created_at: string | null
          description: string | null
          gallery_urls: string[] | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          sort_order: number | null
          supported_types: string[]
          updated_at: string | null
          working_hours: string | null
        }
        Insert: {
          address?: string | null
          addresses?: string[] | null
          badge_color?: string | null
          badge_text?: string | null
          badges?: Json | null
          city?: string | null
          coordinates?: Json | null
          created_at?: string | null
          description?: string | null
          gallery_urls?: string[] | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          sort_order?: number | null
          supported_types?: string[]
          updated_at?: string | null
          working_hours?: string | null
        }
        Update: {
          address?: string | null
          addresses?: string[] | null
          badge_color?: string | null
          badge_text?: string | null
          badges?: Json | null
          city?: string | null
          coordinates?: Json | null
          created_at?: string | null
          description?: string | null
          gallery_urls?: string[] | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          sort_order?: number | null
          supported_types?: string[]
          updated_at?: string | null
          working_hours?: string | null
        }
        Relationships: []
      }
      special_offers: {
        Row: {
          badge_text: string | null
          created_at: string
          description: string | null
          eligibility_days: number
          eligibility_type: string
          id: string
          is_active: boolean
          name: string
          offer_cups_count: number
          offer_duration_days: number
          offer_price: number
          target_subscription_type_id: string | null
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          created_at?: string
          description?: string | null
          eligibility_days?: number
          eligibility_type?: string
          id?: string
          is_active?: boolean
          name: string
          offer_cups_count: number
          offer_duration_days: number
          offer_price: number
          target_subscription_type_id?: string | null
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          created_at?: string
          description?: string | null
          eligibility_days?: number
          eligibility_type?: string
          id?: string
          is_active?: boolean
          name?: string
          offer_cups_count?: number
          offer_duration_days?: number
          offer_price?: number
          target_subscription_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_offers_target_subscription_type_id_fkey"
            columns: ["target_subscription_type_id"]
            isOneToOne: false
            referencedRelation: "subscription_types"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          image_url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          image_url: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          image_url?: string
          user_id?: string
        }
        Relationships: []
      }
      story_likes: {
        Row: {
          created_at: string
          id: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_likes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          created_at: string
          id: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      subflow_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subflow_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "subflow_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      subflow_posts: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          image_urls: string[] | null
          shop_id: string | null
          shop_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          shop_id?: string | null
          shop_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          shop_id?: string | null
          shop_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subflow_posts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      subflow_reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reaction: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subflow_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "subflow_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_transactions: {
        Row: {
          activated_by: string | null
          amount: number | null
          created_at: string
          id: string
          is_special_offer: boolean | null
          payment_method: string | null
          payment_order_id: string | null
          subscription_name: string
          subscription_type_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          activated_by?: string | null
          amount?: number | null
          created_at?: string
          id?: string
          is_special_offer?: boolean | null
          payment_method?: string | null
          payment_order_id?: string | null
          subscription_name: string
          subscription_type_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          activated_by?: string | null
          amount?: number | null
          created_at?: string
          id?: string
          is_special_offer?: boolean | null
          payment_method?: string | null
          payment_order_id?: string | null
          subscription_name?: string
          subscription_type_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_transactions_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_transactions_subscription_type_id_fkey"
            columns: ["subscription_type_id"]
            isOneToOne: false
            referencedRelation: "subscription_types"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_types: {
        Row: {
          badge: string | null
          badge_color: string | null
          benefit: number | null
          created_at: string | null
          cups_count: number
          daily_limit: number | null
          description: string | null
          duration_days: number | null
          features: string[] | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          sort_order: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          badge?: string | null
          badge_color?: string | null
          benefit?: number | null
          created_at?: string | null
          cups_count: number
          daily_limit?: number | null
          description?: string | null
          duration_days?: number | null
          features?: string[] | null
          id?: string
          is_active?: boolean | null
          name: string
          price: number
          sort_order?: number | null
          type: string
          updated_at?: string | null
        }
        Update: {
          badge?: string | null
          badge_color?: string | null
          benefit?: number | null
          created_at?: string | null
          cups_count?: number
          daily_limit?: number | null
          description?: string | null
          duration_days?: number | null
          features?: string[] | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          sort_order?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      telegram_auth_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          first_name: string | null
          id: string
          last_name: string | null
          photo_url: string | null
          telegram_id: string
          username: string | null
          verified: boolean
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          photo_url?: string | null
          telegram_id: string
          username?: string | null
          verified?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          photo_url?: string | null
          telegram_id?: string
          username?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      user_offer_redemptions: {
        Row: {
          id: string
          offer_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          id?: string
          offer_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          id?: string
          offer_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_offer_redemptions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "special_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          shop_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          shop_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          shop_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          bonus_points: number
          coffee_remaining: number
          coffee_total: number
          created_at: string
          current_streak: number
          drinks_remaining: number
          drinks_total: number
          guest_coffees: number
          guest_ever_received: boolean
          guest_expires_at: string | null
          id: string
          last_redemption_date: string | null
          max_streak: number
          total_cups: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_points?: number
          coffee_remaining?: number
          coffee_total?: number
          created_at?: string
          current_streak?: number
          drinks_remaining?: number
          drinks_total?: number
          guest_coffees?: number
          guest_ever_received?: boolean
          guest_expires_at?: string | null
          id?: string
          last_redemption_date?: string | null
          max_streak?: number
          total_cups?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_points?: number
          coffee_remaining?: number
          coffee_total?: number
          created_at?: string
          current_streak?: number
          drinks_remaining?: number
          drinks_total?: number
          guest_coffees?: number
          guest_ever_received?: boolean
          guest_expires_at?: string | null
          id?: string
          last_redemption_date?: string | null
          max_streak?: number
          total_cups?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          started_at: string | null
          subscription_type_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          subscription_type_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          subscription_type_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_subscription_type_id_fkey"
            columns: ["subscription_type_id"]
            isOneToOne: false
            referencedRelation: "subscription_types"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_subscription: {
        Args: { _subscription_type_id: string; _user_id: string }
        Returns: Json
      }
      claim_pending_guest_access: {
        Args: { _invitee_id: string; _invitee_phone: string }
        Returns: Json
      }
      expire_subscriptions: { Args: never; Returns: undefined }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_partner_shop_id: { Args: { _user_id: string }; Returns: string }
      get_shop_visit_counts: {
        Args: never
        Returns: {
          shop_id: string
          visit_count: number
        }[]
      }
      get_staff_shop_id: { Args: { _user_id: string }; Returns: string }
      grant_guest_access: {
        Args: {
          _expires_at: string
          _invitee_id: string
          _inviter_id: string
          _month_key: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "partner" | "barista"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "partner", "barista"],
    },
  },
} as const
