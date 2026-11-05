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
          email: string | null
          founded_year: number | null
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
          email?: string | null
          founded_year?: number | null
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
          email?: string | null
          founded_year?: number | null
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
      is_admin: { Args: never; Returns: boolean }
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
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
