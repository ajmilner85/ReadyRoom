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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      "carrier_ classes": {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      carriers: {
        Row: {
          callsign: string
          class: string | null
          created_at: string | null
          hull: string
          id: string
          name: string
          tacan_channel: string
          tacan_identifier: string
        }
        Insert: {
          callsign: string
          class?: string | null
          created_at?: string | null
          hull: string
          id?: string
          name: string
          tacan_channel: string
          tacan_identifier: string
        }
        Update: {
          callsign?: string
          class?: string | null
          created_at?: string | null
          hull?: string
          id?: string
          name?: string
          tacan_channel?: string
          tacan_identifier?: string
        }
        Relationships: [
          {
            foreignKeyName: "carriers_class_fkey"
            columns: ["class"]
            isOneToOne: false
            referencedRelation: "carrier_ classes"
            referencedColumns: ["id"]
          },
        ]
      }
      cycles: {
        Row: {
          created_at: string
          creator_billet: string | null
          creator_board_number: string | null
          creator_call_sign: string | null
          creator_id: string
          description: string | null
          discord_guild_id: string
          end_date: string
          id: string
          name: string
          participants: Json | null
          restricted_to: string[] | null
          start_date: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_billet?: string | null
          creator_board_number?: string | null
          creator_call_sign?: string | null
          creator_id: string
          description?: string | null
          discord_guild_id: string
          end_date: string
          id?: string
          name: string
          participants?: Json | null
          restricted_to?: string[] | null
          start_date: string
          status: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_billet?: string | null
          creator_board_number?: string | null
          creator_call_sign?: string | null
          creator_id?: string
          description?: string | null
          discord_guild_id?: string
          end_date?: string
          id?: string
          name?: string
          participants?: Json | null
          restricted_to?: string[] | null
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      discord_event_attendance: {
        Row: {
          created_at: string
          discord_event_id: string | null
          discord_id: string | null
          discord_username: string | null
          id: string
          roll_call_response: string | null
          updated_at: string
          user_response: string
        }
        Insert: {
          created_at?: string
          discord_event_id?: string | null
          discord_id?: string | null
          discord_username?: string | null
          id?: string
          roll_call_response?: string | null
          updated_at?: string
          user_response: string
        }
        Update: {
          created_at?: string
          discord_event_id?: string | null
          discord_id?: string | null
          discord_username?: string | null
          id?: string
          roll_call_response?: string | null
          updated_at?: string
          user_response?: string
        }
        Relationships: []
      }
      event_reminders: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          reminder_type: string
          scheduled_time: string
          sent: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          reminder_type: string
          scheduled_time: string
          sent?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          reminder_type?: string
          scheduled_time?: string
          sent?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          creator_billet: string | null
          creator_board_number: string | null
          creator_call_sign: string | null
          creator_id: string | null
          creator_pilot_id: string | null
          cycle_id: string | null
          description: string | null
          discord_event_id: Json | null
          end_datetime: string | null
          event_settings: Json | null
          event_type: string | null
          id: string
          image_url: Json | null
          mission_id: string | null
          name: string
          participants: Json | null
          start_datetime: string
          status: string | null
          track_qualifications: boolean | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          creator_billet?: string | null
          creator_board_number?: string | null
          creator_call_sign?: string | null
          creator_id?: string | null
          creator_pilot_id?: string | null
          cycle_id?: string | null
          description?: string | null
          discord_event_id?: Json | null
          end_datetime?: string | null
          event_settings?: Json | null
          event_type?: string | null
          id?: string
          image_url?: Json | null
          mission_id?: string | null
          name: string
          participants?: Json | null
          start_datetime: string
          status?: string | null
          track_qualifications?: boolean | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          creator_billet?: string | null
          creator_board_number?: string | null
          creator_call_sign?: string | null
          creator_id?: string | null
          creator_pilot_id?: string | null
          cycle_id?: string | null
          description?: string | null
          discord_event_id?: Json | null
          end_datetime?: string | null
          event_settings?: Json | null
          event_type?: string | null
          id?: string
          image_url?: Json | null
          mission_id?: string | null
          name?: string
          participants?: Json | null
          start_datetime?: string
          status?: string | null
          track_qualifications?: boolean | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_creator_pilot_id_fkey"
            columns: ["creator_pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string | null
          flight_import_filter: string
          flights: Json
          id: string
          mission_settings: Json
          miz_file_data: Json
          name: string
          pilot_assignments: Json
          selected_squadrons: Json
          status: string
          support_role_assignments: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          flight_import_filter?: string
          flights?: Json
          id?: string
          mission_settings?: Json
          miz_file_data?: Json
          name: string
          pilot_assignments?: Json
          selected_squadrons?: Json
          status?: string
          support_role_assignments?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          flight_import_filter?: string
          flights?: Json
          id?: string
          mission_settings?: Json
          miz_file_data?: Json
          name?: string
          pilot_assignments?: Json
          selected_squadrons?: Json
          status?: string
          support_role_assignments?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "missions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_commands: {
        Row: {
          created_at: string
          deactivated_date: string | null
          established_date: string | null
          id: string
          insignia_url: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          deactivated_date?: string | null
          established_date?: string | null
          id?: string
          insignia_url?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          deactivated_date?: string | null
          established_date?: string | null
          id?: string
          insignia_url?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      org_groups: {
        Row: {
          command_id: string
          created_at: string
          deactivated_date: string | null
          established_date: string | null
          id: string
          insignia_url: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          command_id?: string
          created_at?: string
          deactivated_date?: string | null
          established_date?: string | null
          id?: string
          insignia_url?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          command_id?: string
          created_at?: string
          deactivated_date?: string | null
          established_date?: string | null
          id?: string
          insignia_url?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "org_commands"
            referencedColumns: ["id"]
          },
        ]
      }
      org_squadrons: {
        Row: {
          callsigns: Json | null
          carrier_id: string | null
          color_palette: Json | null
          deactivated_date: string | null
          designation: string
          discord_integration: Json | null
          established_date: string | null
          id: string
          insignia_url: string | null
          name: string
          tail_code: string | null
          updated_at: string | null
          wing_id: string
        }
        Insert: {
          callsigns?: Json | null
          carrier_id?: string | null
          color_palette?: Json | null
          deactivated_date?: string | null
          designation: string
          discord_integration?: Json | null
          established_date?: string | null
          id?: string
          insignia_url?: string | null
          name: string
          tail_code?: string | null
          updated_at?: string | null
          wing_id?: string
        }
        Update: {
          callsigns?: Json | null
          carrier_id?: string | null
          color_palette?: Json | null
          deactivated_date?: string | null
          designation?: string
          discord_integration?: Json | null
          established_date?: string | null
          id?: string
          insignia_url?: string | null
          name?: string
          tail_code?: string | null
          updated_at?: string | null
          wing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "echelon4_squadrons_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "echelon4_squadrons_wing_id_fkey"
            columns: ["wing_id"]
            isOneToOne: false
            referencedRelation: "org_wings"
            referencedColumns: ["id"]
          },
        ]
      }
      org_wings: {
        Row: {
          carrier_id: string | null
          color_palette: Json | null
          created_at: string | null
          deactivated_date: string | null
          designation: string | null
          discord_integration: Json | null
          established_date: string | null
          group_id: string | null
          id: string
          insignia_url: string | null
          name: string
          tail_code: string | null
        }
        Insert: {
          carrier_id?: string | null
          color_palette?: Json | null
          created_at?: string | null
          deactivated_date?: string | null
          designation?: string | null
          discord_integration?: Json | null
          established_date?: string | null
          group_id?: string | null
          id?: string
          insignia_url?: string | null
          name: string
          tail_code?: string | null
        }
        Update: {
          carrier_id?: string | null
          color_palette?: Json | null
          created_at?: string | null
          deactivated_date?: string | null
          designation?: string | null
          discord_integration?: Json | null
          established_date?: string | null
          group_id?: string | null
          id?: string
          insignia_url?: string | null
          name?: string
          tail_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "echelon3_wings_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "echelon3_wings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "org_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_assignments: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          pilot_id: string
          squadron_id: string | null
          start_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          pilot_id: string
          squadron_id?: string | null
          start_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          pilot_id?: string
          squadron_id?: string | null
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilot_assignments_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_assignments_squadron_id_fkey"
            columns: ["squadron_id"]
            isOneToOne: false
            referencedRelation: "org_squadrons"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_qualifications: {
        Row: {
          achieved_date: string | null
          created_at: string
          expiry_date: string | null
          id: string
          notes: string | null
          pilot_id: string
          qualification_id: string
          updated_at: string | null
        }
        Insert: {
          achieved_date?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          pilot_id: string
          qualification_id: string
          updated_at?: string | null
        }
        Update: {
          achieved_date?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          pilot_id?: string
          qualification_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilot_qualifications_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_qualifications_qualification_id_fkey"
            columns: ["qualification_id"]
            isOneToOne: false
            referencedRelation: "qualifications"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_roles: {
        Row: {
          created_at: string
          effective_date: string
          end_date: string | null
          id: string
          is_acting: boolean
          pilot_id: string
          role_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          effective_date: string
          end_date?: string | null
          id?: string
          is_acting: boolean
          pilot_id: string
          role_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          effective_date?: string
          end_date?: string | null
          id?: string
          is_acting?: boolean
          pilot_id?: string
          role_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilot_roles_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_standings: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          pilot_id: string
          standing_id: string
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          pilot_id: string
          standing_id: string
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          pilot_id?: string
          standing_id?: string
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilot_standings_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_standings_standing_id_fkey"
            columns: ["standing_id"]
            isOneToOne: false
            referencedRelation: "standings"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_statuses: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          pilot_id: string
          start_date: string | null
          status_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          pilot_id: string
          start_date?: string | null
          status_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          pilot_id?: string
          start_date?: string | null
          status_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilot_statuses_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_statuses_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      pilots: {
        Row: {
          boardNumber: number
          callsign: string
          created_at: string
          discord_original_id: string | null
          discord_roles: Json | null
          discordId: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          boardNumber: number
          callsign: string
          created_at?: string
          discord_original_id?: string | null
          discord_roles?: Json | null
          discordId?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          boardNumber?: number
          callsign?: string
          created_at?: string
          discord_original_id?: string | null
          discord_roles?: Json | null
          discordId?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      qualifications: {
        Row: {
          active: boolean
          category: string | null
          code: string
          color: string | null
          created_at: string
          id: string
          is_expirable: boolean
          name: string
          requirements: Json | null
          updated_at: string | null
          validity_period: number | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          code: string
          color?: string | null
          created_at?: string
          id?: string
          is_expirable?: boolean
          name: string
          requirements?: Json | null
          updated_at?: string | null
          validity_period?: number | null
        }
        Update: {
          active?: boolean
          category?: string | null
          code?: string
          color?: string | null
          created_at?: string
          id?: string
          is_expirable?: boolean
          name?: string
          requirements?: Json | null
          updated_at?: string | null
          validity_period?: number | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          compatible_statuses: string[]
          created_at: string | null
          id: string
          isExclusive: boolean
          name: string
          order: number
        }
        Insert: {
          compatible_statuses?: string[]
          created_at?: string | null
          id?: string
          isExclusive?: boolean
          name: string
          order: number
        }
        Update: {
          compatible_statuses?: string[]
          created_at?: string | null
          id?: string
          isExclusive?: boolean
          name?: string
          order?: number
        }
        Relationships: []
      }
      standings: {
        Row: {
          created_at: string
          id: string
          name: string
          order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      statuses: {
        Row: {
          created_at: string
          id: string
          isActive: boolean
          name: string
          order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          isActive?: boolean
          name: string
          order: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          isActive?: boolean
          name?: string
          order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          auth_user_id: string
          created_at: string | null
          discord_guilds: string[] | null
          discord_id: string | null
          discord_username: string | null
          discord_avatar_url: string | null
          id: string
          pilot_id: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string | null
          discord_guilds?: string[] | null
          discord_id?: string | null
          discord_username?: string | null
          discord_avatar_url?: string | null
          id?: string
          pilot_id?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string | null
          discord_guilds?: string[] | null
          discord_id?: string | null
          discord_username?: string | null
          discord_avatar_url?: string | null
          id?: string
          pilot_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const