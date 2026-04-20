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
          audience_types: string[]
          autoplay_delay: number
          caption: string | null
          city: string | null
          country: string | null
          created_at: string
          display_location: string
          ends_at: string | null
          external_url: string | null
          id: string
          image_url: string
          is_active: boolean
          shop_id: string | null
          sort_order: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          audience_types?: string[]
          autoplay_delay?: number
          caption?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_location?: string
          ends_at?: string | null
          external_url?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          shop_id?: string | null
          sort_order?: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          audience_types?: string[]
          autoplay_delay?: number
          caption?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_location?: string
          ends_at?: string | null
          external_url?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          shop_id?: string | null
          sort_order?: number
          starts_at?: string | null
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
      ad_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          partner_user_id: string
          shop_id: string | null
          shop_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          partner_user_id: string
          shop_id?: string | null
          shop_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          partner_user_id?: string
          shop_id?: string | null
          shop_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_message_dismissals: {
        Row: {
          dismiss_date: string
          dismissed_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          dismiss_date?: string
          dismissed_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          dismiss_date?: string
          dismissed_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_message_dismissals_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "app_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      app_message_unique_views: {
        Row: {
          first_viewed_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          first_viewed_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          first_viewed_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_message_unique_views_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "app_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      app_message_views: {
        Row: {
          id: string
          message_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_message_views_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "app_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      app_messages: {
        Row: {
          audience_types: string[]
          content: string
          created_at: string
          created_by: string
          daily_frequency: number
          frequency_type: string
          id: string
          is_active: boolean
          scheduled_at: string | null
          updated_at: string
        }
        Insert: {
          audience_types?: string[]
          content: string
          created_at?: string
          created_by: string
          daily_frequency?: number
          frequency_type?: string
          id?: string
          is_active?: boolean
          scheduled_at?: string | null
          updated_at?: string
        }
        Update: {
          audience_types?: string[]
          content?: string
          created_at?: string
          created_by?: string
          daily_frequency?: number
          frequency_type?: string
          id?: string
          is_active?: boolean
          scheduled_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      auto_notification_templates: {
        Row: {
          channel: string
          created_at: string
          id: string
          is_active: boolean
          message_template: string
          name: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          message_template: string
          name: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          message_template?: string
          name?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      barista_shifts: {
        Row: {
          address: string
          created_at: string
          expires_at: string
          id: string
          shop_id: string
          started_at: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          expires_at?: string
          id?: string
          shop_id: string
          started_at?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          expires_at?: string
          id?: string
          shop_id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      broadcast_messages: {
        Row: {
          broadcast_type: string
          created_at: string
          failed_count: number
          id: string
          message: string
          recipient_count: number
          recipients: Json | null
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
          recipients?: Json | null
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
          recipients?: Json | null
          sent_by?: string
          sent_count?: number
          target_type?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
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
          subscription_type_id: string | null
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
          subscription_type_id?: string | null
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
          subscription_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_grants_subscription_type_id_fkey"
            columns: ["subscription_type_id"]
            isOneToOne: false
            referencedRelation: "subscription_types"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_settings: {
        Row: {
          created_at: string
          id: string
          note: string | null
          profit_percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          profit_percent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          profit_percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_dedupe_log: {
        Row: {
          alert_key: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          alert_key: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          alert_key?: string
          created_at?: string
          id?: string
          user_id?: string
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
      preorders: {
        Row: {
          cancelled_at: string | null
          coffee_name: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          max_volume: string | null
          qr_code: string
          qr_scanned: boolean
          shop_address: string | null
          shop_id: string
          shop_name: string
          status: string
          subscription_cups: number | null
          subscription_name: string | null
          subscription_price: number | null
          subscription_type_id: string | null
          syrup: string | null
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          coffee_name: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          max_volume?: string | null
          qr_code?: string
          qr_scanned?: boolean
          shop_address?: string | null
          shop_id: string
          shop_name: string
          status?: string
          subscription_cups?: number | null
          subscription_name?: string | null
          subscription_price?: number | null
          subscription_type_id?: string | null
          syrup?: string | null
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          coffee_name?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          max_volume?: string | null
          qr_code?: string
          qr_scanned?: boolean
          shop_address?: string | null
          shop_id?: string
          shop_name?: string
          status?: string
          subscription_cups?: number | null
          subscription_name?: string | null
          subscription_price?: number | null
          subscription_type_id?: string | null
          syrup?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preorders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_access: boolean
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_blocked: boolean | null
          name: string | null
          phone: string
          popup_shown_offer_ids: string[] | null
          public_id: string
          special_offer_popup_shown_at: string | null
          special_offer_redeemed_at: string | null
          subflow_access: boolean
          subflow_nickname: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_access?: boolean
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_blocked?: boolean | null
          name?: string | null
          phone: string
          popup_shown_offer_ids?: string[] | null
          public_id?: string
          special_offer_popup_shown_at?: string | null
          special_offer_redeemed_at?: string | null
          subflow_access?: boolean
          subflow_nickname?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_access?: boolean
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_blocked?: boolean | null
          name?: string | null
          phone?: string
          popup_shown_offer_ids?: string[] | null
          public_id?: string
          special_offer_popup_shown_at?: string | null
          special_offer_redeemed_at?: string | null
          subflow_access?: boolean
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
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      qr_settings: {
        Row: {
          created_at: string | null
          id: string
          setting_key: string
          setting_value: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string | null
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
          scanned_by: string | null
          shop_address: string | null
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
          scanned_by?: string | null
          shop_address?: string | null
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
          scanned_by?: string | null
          shop_address?: string | null
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
          country: string | null
          created_at: string | null
          description: string | null
          gallery_urls: string[] | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          preorders_enabled: boolean
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
          country?: string | null
          created_at?: string | null
          description?: string | null
          gallery_urls?: string[] | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          preorders_enabled?: boolean
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
          country?: string | null
          created_at?: string | null
          description?: string | null
          gallery_urls?: string[] | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          preorders_enabled?: boolean
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
          country: string | null
          created_at: string
          description: string | null
          eligibility_days: number
          eligibility_type: string
          id: string
          is_active: boolean
          max_redemptions_per_user: number
          name: string
          offer_cups_count: number
          offer_duration_days: number
          offer_price: number
          offer_valid_days: number | null
          target_subscription_type_id: string | null
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          eligibility_days?: number
          eligibility_type?: string
          id?: string
          is_active?: boolean
          max_redemptions_per_user?: number
          name: string
          offer_cups_count: number
          offer_duration_days: number
          offer_price: number
          offer_valid_days?: number | null
          target_subscription_type_id?: string | null
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          eligibility_days?: number
          eligibility_type?: string
          id?: string
          is_active?: boolean
          max_redemptions_per_user?: number
          name?: string
          offer_cups_count?: number
          offer_duration_days?: number
          offer_price?: number
          offer_valid_days?: number | null
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
          media_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          image_url: string
          media_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          image_url?: string
          media_type?: string
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
      subflow_ad_comments: {
        Row: {
          ad_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          ad_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          ad_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subflow_ad_comments_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "subflow_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      subflow_ad_events: {
        Row: {
          ad_id: string
          created_at: string
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          ad_id: string
          created_at?: string
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          ad_id?: string
          created_at?: string
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subflow_ad_events_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "subflow_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      subflow_ad_reactions: {
        Row: {
          ad_id: string
          created_at: string
          id: string
          reaction: string
          user_id: string
        }
        Insert: {
          ad_id: string
          created_at?: string
          id?: string
          reaction: string
          user_id: string
        }
        Update: {
          ad_id?: string
          created_at?: string
          id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subflow_ad_reactions_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "subflow_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      subflow_ads: {
        Row: {
          audience_types: string[]
          city: string | null
          content: string
          country: string | null
          created_at: string
          daily_limit: number
          ends_at: string | null
          frequency: number
          id: string
          image_url: string | null
          is_active: boolean
          link_type: string
          link_value: string | null
          shop_id: string | null
          shop_name: string | null
          starts_at: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          audience_types?: string[]
          city?: string | null
          content: string
          country?: string | null
          created_at?: string
          daily_limit?: number
          ends_at?: string | null
          frequency?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_type?: string
          link_value?: string | null
          shop_id?: string | null
          shop_name?: string | null
          starts_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          audience_types?: string[]
          city?: string | null
          content?: string
          country?: string | null
          created_at?: string
          daily_limit?: number
          ends_at?: string | null
          frequency?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_type?: string
          link_value?: string | null
          shop_id?: string | null
          shop_name?: string | null
          starts_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subflow_ads_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
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
      subflow_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      subflow_notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          is_read: boolean
          post_id: string | null
          reaction: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          post_id?: string | null
          reaction?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          post_id?: string | null
          reaction?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subflow_notifications_post_id_fkey"
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
          receipt_data: Json | null
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
          receipt_data?: Json | null
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
          receipt_data?: Json | null
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
          country: string | null
          created_at: string | null
          cups_count: number
          currency: string | null
          daily_limit: number | null
          description: string | null
          duration_days: number | null
          exclusions: string[] | null
          features: string[] | null
          how_it_works: string | null
          id: string
          is_active: boolean | null
          max_volume: string | null
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
          country?: string | null
          created_at?: string | null
          cups_count: number
          currency?: string | null
          daily_limit?: number | null
          description?: string | null
          duration_days?: number | null
          exclusions?: string[] | null
          features?: string[] | null
          how_it_works?: string | null
          id?: string
          is_active?: boolean | null
          max_volume?: string | null
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
          country?: string | null
          created_at?: string | null
          cups_count?: number
          currency?: string | null
          daily_limit?: number | null
          description?: string | null
          duration_days?: number | null
          exclusions?: string[] | null
          features?: string[] | null
          how_it_works?: string | null
          id?: string
          is_active?: boolean | null
          max_volume?: string | null
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
          daily_limit_override: number | null
          daily_limit_reset_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          started_at: string | null
          subscription_type_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_limit_override?: number | null
          daily_limit_reset_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          subscription_type_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_limit_override?: number | null
          daily_limit_reset_at?: string | null
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
      webhook_logs: {
        Row: {
          created_at: string
          event_type: string | null
          id: string
          order_id: string | null
          payload: Json
          source: string
          status: string | null
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          id?: string
          order_id?: string | null
          payload?: Json
          source?: string
          status?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string | null
          id?: string
          order_id?: string | null
          payload?: Json
          source?: string
          status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string | null
          name: string | null
          public_id: string | null
          subflow_nickname: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          name?: string | null
          public_id?: string | null
          subflow_nickname?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          name?: string | null
          public_id?: string | null
          subflow_nickname?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
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
      create_preorder_with_deduction: {
        Args: {
          _coffee_name: string
          _shop_address: string
          _shop_id: string
          _shop_name: string
          _syrup: string
        }
        Returns: Json
      }
      ensure_user_stats: { Args: { _user_id: string }; Returns: undefined }
      expire_subscriptions: { Args: never; Returns: undefined }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_banner_analytics: {
        Args: { _from?: string; _shop_id?: string; _to?: string }
        Returns: {
          banner_id: string
          clicks: number
          views: number
        }[]
      }
      get_partner_shop_id: { Args: { _user_id: string }; Returns: string }
      get_shop_visit_counts: {
        Args: never
        Returns: {
          shop_id: string
          visit_count: number
        }[]
      }
      get_staff_shop_id: { Args: { _user_id: string }; Returns: string }
      get_subflow_ad_analytics:
        | {
            Args: { _from?: string; _shop_id?: string; _to?: string }
            Returns: {
              ad_id: string
              clicks: number
              comments: number
              reactions: number
              views: number
            }[]
          }
        | {
            Args: {
              _city?: string
              _country?: string
              _from?: string
              _shop_id?: string
              _to?: string
            }
            Returns: {
              ad_id: string
              clicks: number
              comments: number
              reactions: number
              views: number
            }[]
          }
      get_user_phone: { Args: { _user_id: string }; Returns: string }
      grant_guest_access:
        | {
            Args: {
              _expires_at: string
              _invitee_id: string
              _inviter_id: string
              _month_key: string
            }
            Returns: Json
          }
        | {
            Args: {
              _expires_at: string
              _invitee_id: string
              _inviter_id: string
              _month_key: string
              _subscription_type_id?: string
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
      app_role:
        | "admin"
        | "moderator"
        | "partner"
        | "barista"
        | "superadmin"
        | "investor"
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
      app_role: [
        "admin",
        "moderator",
        "partner",
        "barista",
        "superadmin",
        "investor",
      ],
    },
  },
} as const
