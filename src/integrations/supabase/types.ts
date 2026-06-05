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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      electricity_rates: {
        Row: {
          created_at: string
          id: string
          month: number
          rate_per_unit: number
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: number
          rate_per_unit: number
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: number
          rate_per_unit?: number
          year?: number
        }
        Relationships: []
      }
      flats: {
        Row: {
          created_at: string
          flat_number: string
          id: string
          is_vacant: boolean
          last_reviewed_year: number | null
          maintenance: number
          other_charges: number
          prev_meter_reading: number
          rent: number
          security_deposit: number
          tenant_id: string | null
          tenant_mobile: string
          tenant_name: string
          tenant_whatsapp: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          flat_number: string
          id?: string
          is_vacant?: boolean
          last_reviewed_year?: number | null
          maintenance?: number
          other_charges?: number
          prev_meter_reading?: number
          rent?: number
          security_deposit?: number
          tenant_id?: string | null
          tenant_mobile?: string
          tenant_name?: string
          tenant_whatsapp?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          flat_number?: string
          id?: string
          is_vacant?: boolean
          last_reviewed_year?: number | null
          maintenance?: number
          other_charges?: number
          prev_meter_reading?: number
          rent?: number
          security_deposit?: number
          tenant_id?: string | null
          tenant_mobile?: string
          tenant_name?: string
          tenant_whatsapp?: string
          updated_at?: string
        }
        Relationships: []
      }
      meter_readings: {
        Row: {
          amount_paid: number
          created_at: string
          curr_reading: number | null
          electricity_bill: number
          flat_id: string
          id: string
          maintenance: number
          month: number
          opening_balance: number
          other_charges: number
          payment_method: string | null
          payment_status: string
          payment_timestamp: string | null
          prev_reading: number
          rate_per_unit: number
          rent: number
          source: string
          total_due: number
          units: number
          updated_at: string
          year: number
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          curr_reading?: number | null
          electricity_bill?: number
          flat_id: string
          id?: string
          maintenance?: number
          month: number
          opening_balance?: number
          other_charges?: number
          payment_method?: string | null
          payment_status?: string
          payment_timestamp?: string | null
          prev_reading?: number
          rate_per_unit?: number
          rent?: number
          source?: string
          total_due?: number
          units?: number
          updated_at?: string
          year: number
        }
        Update: {
          amount_paid?: number
          created_at?: string
          curr_reading?: number | null
          electricity_bill?: number
          flat_id?: string
          id?: string
          maintenance?: number
          month?: number
          opening_balance?: number
          other_charges?: number
          payment_method?: string | null
          payment_status?: string
          payment_timestamp?: string | null
          prev_reading?: number
          rate_per_unit?: number
          rent?: number
          source?: string
          total_due?: number
          units?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          mobile: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mobile?: string
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mobile?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          electricity_rate_per_unit: number
          id: number
          owner_id: string | null
          owner_mobile: string
          owner_name: string
          owner_upi_id: string
          updated_at: string
        }
        Insert: {
          electricity_rate_per_unit?: number
          id?: number
          owner_id?: string | null
          owner_mobile?: string
          owner_name?: string
          owner_upi_id?: string
          updated_at?: string
        }
        Update: {
          electricity_rate_per_unit?: number
          id?: number
          owner_id?: string | null
          owner_mobile?: string
          owner_name?: string
          owner_upi_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_documents: {
        Row: {
          document_type: string
          file_path: string
          file_url: string
          id: string
          tenant_id: string
          uploaded_at: string
        }
        Insert: {
          document_type: string
          file_path: string
          file_url: string
          id?: string
          tenant_id: string
          uploaded_at?: string
        }
        Update: {
          document_type?: string
          file_path?: string
          file_url?: string
          id?: string
          tenant_id?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "tenant"
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
      app_role: ["owner", "tenant"],
    },
  },
} as const
