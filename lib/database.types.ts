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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      access_attempts: {
        Row: {
          action: string
          blocked: boolean
          created_at: string
          device: string | null
          id: number
          ip: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          blocked?: boolean
          created_at?: string
          device?: string | null
          id?: number
          ip?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          blocked?: boolean
          created_at?: string
          device?: string | null
          id?: number
          ip?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      addresses: {
        Row: {
          city: string
          complement: string | null
          created_at: string
          district: string
          id: string
          is_default: boolean
          label: string
          number: string
          reference: string | null
          state: string
          street: string
          user_id: string
          zip_code: string
        }
        Insert: {
          city: string
          complement?: string | null
          created_at?: string
          district: string
          id?: string
          is_default?: boolean
          label?: string
          number: string
          reference?: string | null
          state: string
          street: string
          user_id: string
          zip_code: string
        }
        Update: {
          city?: string
          complement?: string | null
          created_at?: string
          district?: string
          id?: string
          is_default?: boolean
          label?: string
          number?: string
          reference?: string | null
          state?: string
          street?: string
          user_id?: string
          zip_code?: string
        }
        Relationships: []
      }
      business_hours: {
        Row: {
          closed: boolean
          closes_at: string | null
          closes_next_day: boolean
          id: number
          opens_at: string | null
          weekday: number
        }
        Insert: {
          closed?: boolean
          closes_at?: string | null
          closes_next_day?: boolean
          id?: never
          opens_at?: string | null
          weekday: number
        }
        Update: {
          closed?: boolean
          closes_at?: string | null
          closes_next_day?: boolean
          id?: never
          opens_at?: string | null
          weekday?: number
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          note: string | null
          section_id: string | null
          short_label: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          note?: string | null
          section_id?: string | null
          short_label?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          note?: string | null
          section_id?: string | null
          short_label?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          name: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          name: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      couriers: {
        Row: {
          active: boolean
          created_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          route_provider: string | null
          last_speed_kmh: number | null
          confirm_accuracy_m: number | null
          confirm_distance_m: number | null
          confirm_lat: number | null
          confirm_lng: number | null
          courier_id: string | null
          created_at: string
          dest_approx: boolean
          dest_lat: number
          dest_lng: number
          distance_km: number | null
          eta_minutes: number | null
          eta_updated_at: string | null
          finished_at: string | null
          id: string
          last_accuracy_m: number | null
          last_captured_at: string | null
          last_lat: number | null
          last_lng: number | null
          order_id: string
          route_polyline: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          route_provider?: string | null
          last_speed_kmh?: number | null
          confirm_accuracy_m?: number | null
          confirm_distance_m?: number | null
          confirm_lat?: number | null
          confirm_lng?: number | null
          courier_id?: string | null
          created_at?: string
          dest_approx?: boolean
          dest_lat: number
          dest_lng: number
          distance_km?: number | null
          eta_minutes?: number | null
          eta_updated_at?: string | null
          finished_at?: string | null
          id?: string
          last_accuracy_m?: number | null
          last_captured_at?: string | null
          last_lat?: number | null
          last_lng?: number | null
          order_id: string
          route_polyline?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          route_provider?: string | null
          last_speed_kmh?: number | null
          confirm_accuracy_m?: number | null
          confirm_distance_m?: number | null
          confirm_lat?: number | null
          confirm_lng?: number | null
          courier_id?: string | null
          created_at?: string
          dest_approx?: boolean
          dest_lat?: number
          dest_lng?: number
          distance_km?: number | null
          eta_minutes?: number | null
          eta_updated_at?: string | null
          finished_at?: string | null
          id?: string
          last_accuracy_m?: number | null
          last_captured_at?: string | null
          last_lat?: number | null
          last_lng?: number | null
          order_id?: string
          route_polyline?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_positions: {
        Row: {
          accuracy_m: number
          captured_at: string
          delivery_id: string
          id: number
          lat: number
          lng: number
          received_at: string
          speed_kmh: number | null
        }
        Insert: {
          accuracy_m: number
          captured_at: string
          delivery_id: string
          id?: number
          lat: number
          lng: number
          received_at?: string
          speed_kmh?: number | null
        }
        Update: {
          accuracy_m?: number
          captured_at?: string
          delivery_id?: string
          id?: number
          lat?: number
          lng?: number
          received_at?: string
          speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_positions_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      extras: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price_cents: number | null
          sort_order: number
          type: Database["public"]["Enums"]["extra_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price_cents?: number | null
          sort_order?: number
          type: Database["public"]["Enums"]["extra_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price_cents?: number | null
          sort_order?: number
          type?: Database["public"]["Enums"]["extra_type"]
          updated_at?: string
        }
        Relationships: []
      }
      google_api_alerts: {
        Row: {
          created_at: string
          free_cap: number
          level: number
          period_start: string
          sku: string
          used_events: number
        }
        Insert: {
          created_at?: string
          free_cap: number
          level: number
          period_start: string
          sku: string
          used_events: number
        }
        Update: {
          created_at?: string
          free_cap?: number
          level?: number
          period_start?: string
          sku?: string
          used_events?: number
        }
        Relationships: []
      }
      google_api_calls: {
        Row: {
          cost_estimate: number
          courier_id: string | null
          created_at: string
          delivery_id: string | null
          endpoint: string
          id: number
          latency_ms: number | null
          order_id: string | null
          provider: string
          restaurant_id: string | null
          sku: string | null
          status: string
        }
        Insert: {
          cost_estimate?: number
          courier_id?: string | null
          created_at?: string
          delivery_id?: string | null
          endpoint: string
          id?: number
          latency_ms?: number | null
          order_id?: string | null
          provider: string
          restaurant_id?: string | null
          sku?: string | null
          status: string
        }
        Update: {
          cost_estimate?: number
          courier_id?: string | null
          created_at?: string
          delivery_id?: string | null
          endpoint?: string
          id?: number
          latency_ms?: number | null
          order_id?: string | null
          provider?: string
          restaurant_id?: string | null
          sku?: string | null
          status?: string
        }
        Relationships: []
      }
      google_api_usage: {
        Row: {
          created_at: string
          free_cap: number
          id: number
          period_end: string
          period_start: string
          sku: string
          updated_at: string
          used_events: number
        }
        Insert: {
          created_at?: string
          free_cap: number
          id?: number
          period_end: string
          period_start: string
          sku: string
          updated_at?: string
          used_events?: number
        }
        Update: {
          created_at?: string
          free_cap?: number
          id?: number
          period_end?: string
          period_start?: string
          sku?: string
          updated_at?: string
          used_events?: number
        }
        Relationships: []
      }
      order_events: {
        Row: {
          created_at: string
          data: Json | null
          id: number
          order_id: string
          type: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: number
          order_id: string
          type: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: number
          order_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_extras: {
        Row: {
          extra_id: string | null
          id: string
          name: string
          order_item_id: string
          quantity: number
          unit_price_cents: number | null
        }
        Insert: {
          extra_id?: string | null
          id?: string
          name: string
          order_item_id: string
          quantity: number
          unit_price_cents?: number | null
        }
        Update: {
          extra_id?: string | null
          id?: string
          name?: string
          order_item_id?: string
          quantity?: number
          unit_price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_item_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_extras_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          doneness: Database["public"]["Enums"]["doneness_level"] | null
          extras_cents: number
          id: string
          notes: string | null
          order_id: string
          price_pending: boolean
          product_id: string | null
          product_name: string
          quantity: number
          total_price_cents: number
          unit_price_cents: number | null
          variant_id: string | null
          variant_label: string
        }
        Insert: {
          doneness?: Database["public"]["Enums"]["doneness_level"] | null
          extras_cents?: number
          id?: string
          notes?: string | null
          order_id: string
          price_pending?: boolean
          product_id?: string | null
          product_name: string
          quantity: number
          total_price_cents?: number
          unit_price_cents?: number | null
          variant_id?: string | null
          variant_label?: string
        }
        Update: {
          doneness?: Database["public"]["Enums"]["doneness_level"] | null
          extras_cents?: number
          id?: string
          notes?: string | null
          order_id?: string
          price_pending?: boolean
          product_id?: string | null
          product_name?: string
          quantity?: number
          total_price_cents?: number
          unit_price_cents?: number | null
          variant_id?: string | null
          variant_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          restaurant_id: string | null
          dest_lat: number | null
          dest_lng: number | null
          dest_source: string | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          delivery_address: Json | null
          delivery_fee_cents: number
          discount_cents: number
          has_price_pending: boolean
          id: string
          notes: string | null
          order_number: number
          order_type: string
          payment_method: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          restaurant_id?: string | null
          dest_lat?: number | null
          dest_lng?: number | null
          dest_source?: string | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          delivery_address?: Json | null
          delivery_fee_cents?: number
          discount_cents?: number
          has_price_pending?: boolean
          id?: string
          notes?: string | null
          order_number?: never
          order_type: string
          payment_method?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          restaurant_id?: string | null
          dest_lat?: number | null
          dest_lng?: number | null
          dest_source?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          delivery_address?: Json | null
          delivery_fee_cents?: number
          discount_cents?: number
          has_price_pending?: boolean
          id?: string
          notes?: string | null
          order_number?: never
          order_type?: string
          payment_method?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          active: boolean
          id: string
          label: string
          price_cents: number | null
          product_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: string
          label?: string
          price_cents?: number | null
          product_id: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: string
          label?: string
          price_cents?: number | null
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          description: string | null
          group_label: string
          id: string
          image_url: string | null
          is_informational: boolean
          name: string
          price_cents: number | null
          requires_doneness: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          group_label?: string
          id?: string
          image_url?: string | null
          is_informational?: boolean
          name: string
          price_cents?: number | null
          requires_doneness?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          group_label?: string
          id?: string
          image_url?: string | null
          is_informational?: boolean
          name?: string
          price_cents?: number | null
          requires_doneness?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      restaurant_members: {
        Row: {
          created_at: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          active: boolean
          created_at: string
          google_maps_enabled: boolean
          google_maps_percent: number
          id: string
          lat: number | null
          lng: number | null
          name: string
          plan: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          google_maps_enabled?: boolean
          google_maps_percent?: number
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          plan?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          google_maps_enabled?: boolean
          google_maps_percent?: number
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_prompts: {
        Row: {
          created_at: string
          order_id: string
          outcome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          order_id: string
          outcome?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          order_id?: string
          outcome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_prompts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          google_clicked_at: string | null
          id: string
          order_id: string | null
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          google_clicked_at?: string | null
          id?: string
          order_id?: string | null
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          google_clicked_at?: string | null
          id?: string
          order_id?: string | null
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      route_cache: {
        Row: {
          created_at: string
          distance_m: number
          duration_s: number
          expires_at: string
          key: string
          polyline: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          distance_m: number
          duration_s: number
          expires_at: string
          key: string
          polyline?: string | null
          provider: string
        }
        Update: {
          created_at?: string
          distance_m?: number
          duration_s?: number
          expires_at?: string
          key?: string
          polyline?: string | null
          provider?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          address_district: string | null
          address_street: string | null
          address_zip: string | null
          delivery_confirm_radius_m: number
          email: string | null
          founded_year: number | null
          gps_max_accuracy_m: number
          id: boolean
          instagram_url: string | null
          menu_notice: string | null
          name: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          address_district?: string | null
          address_street?: string | null
          address_zip?: string | null
          delivery_confirm_radius_m?: number
          email?: string | null
          founded_year?: number | null
          gps_max_accuracy_m?: number
          id?: boolean
          instagram_url?: string | null
          menu_notice?: string | null
          name: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          address_district?: string | null
          address_street?: string | null
          address_zip?: string | null
          delivery_confirm_radius_m?: number
          email?: string | null
          founded_year?: number | null
          gps_max_accuracy_m?: number
          id?: boolean
          instagram_url?: string | null
          menu_notice?: string | null
          name?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
    }
    Views: {
      best_selling_products: {
        Row: {
          orders_count: number | null
          product_id: string | null
          product_name: string | null
          revenue_cents: number | null
          units_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_sales: {
        Row: {
          month: string | null
          revenue_cents: number | null
          total_orders: number | null
        }
        Relationships: []
      }
      sales_summary: {
        Row: {
          average_ticket_cents: number | null
          cancelled_orders: number | null
          revenue_cents: number | null
          sale_date: string | null
          total_orders: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      access_check: {
        Args: {
          p_action: string
          p_device: string
          p_ip: string
          p_user: string
        }
        Returns: boolean
      }
      admin_list_couriers: {
        Args: never
        Returns: {
          active: boolean
          email: string
          name: string
          open_deliveries: number
          user_id: string
        }[]
      }
      admin_set_courier: {
        Args: { p_active: boolean; p_email: string }
        Returns: string
      }
      admin_set_order_amounts: {
        Args: {
          p_delivery_fee_cents: number
          p_discount_cents: number
          p_order_id: string
        }
        Returns: {
          created_at: string
          customer_name: string
          customer_phone: string | null
          delivery_address: Json | null
          delivery_fee_cents: number
          discount_cents: number
          has_price_pending: boolean
          id: string
          notes: string | null
          order_number: number
          order_type: string
          payment_method: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      anonymize_customer_data: { Args: { p_user_id: string }; Returns: number }
      clean_text: { Args: { max_len: number; t: string }; Returns: string }
      courier_confirm_delivery: {
        Args: { p_delivery_id: string }
        Returns: {
          accuracy_m: number
          distance_m: number
          radius_m: number
          result: string
        }[]
      }
      courier_report_position: {
        Args: {
          p_accuracy_m: number
          p_captured_at: string
          p_delivery_id: string
          p_lat: number
          p_lng: number
          p_speed_kmh: number
        }
        Returns: string
      }
      courier_return_delivery: {
        Args: { p_delivery_id: string; p_motivo: string }
        Returns: string
      }
      courier_set_eta: {
        Args: {
          p_delivery_id: string
          p_distance_km: number
          p_eta_minutes: number
          p_polyline: string
          p_provider?: string
        }
        Returns: undefined
      }
      create_contact: {
        Args: { p_message: string; p_name: string }
        Returns: string
      }
      create_order: {
        Args: {
          p_customer_name: string
          p_customer_phone?: string
          p_delivery_address?: Json
          p_items: Json
          p_notes?: string
          p_order_type: string
          p_payment_method?: string
        }
        Returns: {
          r_has_price_pending: boolean
          r_order_id: string
          r_order_number: number
          r_subtotal_cents: number
          r_total_cents: number
        }[]
      }
      dispatch_order: {
        Args: {
          p_courier_id: string
          p_dest_approx?: boolean
          p_dest_lat: number
          p_dest_lng: number
          p_order_id: string
        }
        Returns: string
      }
      distance_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      is_courier: { Args: never; Returns: boolean }
      log_denied: {
        Args: { p_device: string; p_ip: string; p_user: string }
        Returns: undefined
      }
      order_status_ok: {
        Args: {
          p_de: Database["public"]["Enums"]["order_status"]
          p_para: Database["public"]["Enums"]["order_status"]
          p_tipo: string
        }
        Returns: boolean
      }
      default_restaurant: { Args: never; Returns: string }
      google_consolidate: {
        Args: never
        Returns: { free_cap: number; pct: number; sku: string; used_events: number }[]
      }
      google_reserve: {
        Args: { p_cap: number; p_sku: string; p_soft_pct?: number }
        Returns: string
      }
      is_order_restaurant_member: { Args: { p_order_id: string }; Returns: boolean }
      is_restaurant_member: { Args: { p_restaurant_id: string }; Returns: boolean }
      order_set_destination: {
        Args: { p_lat: number; p_lng: number; p_order_id: string; p_source: string }
        Returns: string
      }
      order_tracking: {
        Args: { p_order_id: string }
        Returns: {
          dest_lat: number
          dest_lng: number
          distance_km: number
          eta_minutes: number
          lat: number
          lng: number
          route_polyline: string
          status: string
          updated_at: string
          restaurant_lat: number
          restaurant_lng: number
          route_provider: string
          eta_updated_at: string
          speed_kmh: number
        }[]
      }
      purge_delivery_positions: { Args: never; Returns: number }
      review_decline: { Args: { p_order_id: string }; Returns: undefined }
      review_google_click: { Args: never; Returns: undefined }
      review_invite: {
        Args: never
        Returns: {
          order_id: string
          order_number: number
        }[]
      }
      review_submit: {
        Args: { p_comment: string; p_order_id: string; p_rating: number }
        Returns: string
      }
    }
    Enums: {
      app_role: "customer" | "admin"
      doneness_level: "rare" | "medium" | "well_done"
      extra_type: "sauce" | "addon" | "complement"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["customer", "admin"],
      doneness_level: ["rare", "medium", "well_done"],
      extra_type: ["sauce", "addon", "complement"],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
