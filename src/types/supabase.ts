export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      pilots: {
        Row: {
          id: string
          callsign: string
          boardNumber: number
          discordId?: string | null
          created_at: string
          updated_at: string | null
          discord_original_id?: string | null
          qualifications?: string[] | null
          role_id?: string | null
          status_id?: string | null
        }
        Insert: {
          id?: string
          callsign: string
          boardNumber: number
          discordId?: string | null
          discord_original_id?: string | null
          qualifications?: string[] | null
          role_id?: string | null
          status_id?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          callsign?: string
          boardNumber?: number
          discordId?: string | null
          discord_original_id?: string | null
          qualifications?: string[] | null
          role_id?: string | null
          status_id?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilots_primary_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilots_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          }
        ]
      }
      statuses: {
        Row: {
          id: string
          name: string
          isActive: boolean
          order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          isActive?: boolean
          order: number
          created_at?: string
        }
        Update: {
          name?: string
          isActive?: boolean
          order?: number
          created_at?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          id: string
          name: string
          isExclusive: boolean
          compatible_statuses: string[]
          order: number
          created_at?: string | null
        }
        Insert: {
          id?: string
          name: string
          isExclusive?: boolean
          compatible_statuses?: string[]
          order: number
          created_at?: string | null
        }
        Update: {
          name?: string
          isExclusive?: boolean
          compatible_statuses?: string[]
          order?: number
          created_at?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          name: string
          start_datetime: string
          end_datetime: string | null
          type: string | null
          event_type: string | null
          description: string | null
          status: string | null
          created_at: string
          updated_at: string | null
          discord_event_id: string | null
          discord_guild_id: string | null
          cycle_id: string | null
          image_url: string | null
        }
        Insert: {
          id?: string
          name: string
          start_datetime: string
          end_datetime?: string | null
          type?: string | null
          event_type?: string | null
          description?: string | null
          status?: string | null
          created_at?: string
          updated_at?: string | null
          discord_event_id?: string | null
          discord_guild_id?: string | null
          cycle_id?: string | null
          image_url?: string | null
        }
        Update: {
          id?: string
          name?: string
          start_datetime?: string
          end_datetime?: string | null
          type?: string | null
          event_type?: string | null
          description?: string | null
          status?: string | null
          created_at?: string
          updated_at?: string | null
          discord_event_id?: string | null
          discord_guild_id?: string | null
          cycle_id?: string | null
          image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          }
        ]
      }
      discord_event_attendance: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          discord_event_id: string | null
          discord_id: string | null
          discord_username: string | null
          user_response: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          discord_event_id?: string | null
          discord_id?: string | null
          discord_username?: string | null
          user_response: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          discord_event_id?: string | null
          discord_id?: string | null
          discord_username?: string | null
          user_response?: string
        }
        Relationships: []
      }
      cycles: {
        Row: {
          id: string
          name: string
          description: string | null
          start_date: string
          end_date: string
          status: string
          type: string
          created_at: string
          updated_at: string
          creator_id: string
          creator_call_sign: string | null
          creator_board_number: string | null
          creator_billet: string | null
          discord_guild_id: string
          restricted_to: string[] | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          start_date: string
          end_date: string
          status: string
          type: string
          created_at?: string
          updated_at?: string
          creator_id: string
          creator_call_sign?: string | null
          creator_board_number?: string | null
          creator_billet?: string | null
          discord_guild_id: string
          restricted_to?: string[] | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          start_date?: string
          end_date?: string
          status?: string
          type?: string
          created_at?: string
          updated_at?: string
          creator_id?: string
          creator_call_sign?: string | null
          creator_board_number?: string | null
          creator_billet?: string | null
          discord_guild_id?: string
          restricted_to?: string[] | null
        }
        Relationships: []
      }
      qualifications: {
        Row: {
          id: string
          name: string
          code: string
          category: string | null
          color: string | null
          active: boolean
          is_expirable: boolean
          validity_period: number | null
          requirements: Json | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          code: string
          category?: string | null
          color?: string | null
          active?: boolean
          is_expirable?: boolean
          validity_period?: number | null
          requirements?: Json | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          code?: string
          category?: string | null
          color?: string | null
          active?: boolean
          is_expirable?: boolean
          validity_period?: number | null
          requirements?: Json | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pilot_qualifications: {
        Row: {
          id: string
          pilot_id: string
          qualification_id: string
          achieved_date: string | null
          expiry_date: string | null
          notes: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          pilot_id: string
          qualification_id: string
          achieved_date?: string | null
          expiry_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          pilot_id?: string
          qualification_id?: string
          achieved_date?: string | null
          expiry_date?: string | null
          notes?: string | null
          created_at?: string
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
          }
        ]
      }
      squadron_settings: {
        Row: {
          id: string
          key: string
          value: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          key: string
          value?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          key?: string
          value?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}