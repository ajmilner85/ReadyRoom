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
      carriers: {
        Row: {
          callsign: string
          created_at: string | null
          hull: string
          id: string
          name: string
          tacan_channel: string
          tacan_identifier: string
        }
        Insert: {
          callsign: string
          created_at?: string | null
          hull: string
          id?: string
          name: string
          tacan_channel: string
          tacan_identifier: string
        }
        Update: {
          callsign?: string
          created_at?: string | null
          hull?: string
          id?: string
          name?: string
          tacan_channel?: string
          tacan_identifier?: string
        }
        Relationships: []
      }
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
        }
        Insert: {
          id?: string
          callsign: string
          boardNumber: number
          discordId?: string | null
          discord_original_id?: string | null
          qualifications?: string[] | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          callsign?: string
          boardNumber?: number
          discordId?: string | null
          discord_original_id?: string | null
          qualifications?: string[] | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      standings: {
        Row: {
          id: string
          name: string
          order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          order: number
          created_at?: string
        }
        Update: {
          name?: string
          order?: number
          created_at?: string
        }
        Relationships: []
      }
      pilot_standings: {
        Row: {
          id: string
          created_at: string
          pilot_id: string
          standing_id: string
          start_date: string | null
          end_date: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          pilot_id: string
          standing_id: string
          start_date?: string | null
          end_date?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          pilot_id?: string
          standing_id?: string
          start_date?: string | null
          end_date?: string | null
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
          }
        ]
      }
      pilot_statuses: {
        Row: {
          id: string
          created_at: string
          pilot_id: string
          status_id: string
          start_date: string | null
          end_date: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          pilot_id: string
          status_id: string
          start_date?: string | null
          end_date?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          pilot_id?: string
          status_id?: string
          start_date?: string | null
          end_date?: string | null
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
          roll_call_response: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          discord_event_id?: string | null
          discord_id?: string | null
          discord_username?: string | null
          user_response: string
          roll_call_response?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          discord_event_id?: string | null
          discord_id?: string | null
          discord_username?: string | null
          user_response?: string
          roll_call_response?: string | null
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
      pilot_roles: {
        Row: {
          id: string
          pilot_id: string
          role_id: string | null
          created_at: string
          effective_date: string
          is_acting: boolean
          end_date: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          pilot_id: string
          role_id?: string | null
          created_at?: string
          effective_date: string
          is_acting?: boolean
          end_date?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          pilot_id?: string
          role_id?: string | null
          created_at?: string
          effective_date?: string
          is_acting?: boolean
          end_date?: string | null
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
          }
        ]
      }
      org_wings: {
        Row: {
          id: string
          name: string
          designation: string
          established_date: string | null
          deactivated_date: string | null
          insignia_url: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          designation: string
          established_date?: string | null
          deactivated_date?: string | null
          insignia_url?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          designation?: string
          established_date?: string | null
          deactivated_date?: string | null
          insignia_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      org_squadrons: {
        Row: {
          id: string
          wing_id: string
          name: string
          established_date: string | null
          deactivated_date: string | null
          designation: string
          insignia_url: string | null
          carrier_id: string | null
          tail_code: string | null
          callsigns: Json | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          wing_id?: string
          name: string
          established_date?: string | null
          deactivated_date?: string | null
          designation: string
          insignia_url?: string | null
          carrier_id?: string | null
          tail_code?: string | null
          callsigns?: Json | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          wing_id?: string
          name?: string
          established_date?: string | null
          deactivated_date?: string | null
          designation?: string
          insignia_url?: string | null
          carrier_id?: string | null
          tail_code?: string | null
          callsigns?: Json | null
          updated_at?: string | null
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
          }
        ]
      }
      pilot_assignments: {
        Row: {
          id: string
          created_at: string
          pilot_id: string
          squadron_id: string
          start_date: string
          end_date: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          pilot_id: string
          squadron_id: string
          start_date: string
          end_date?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          pilot_id?: string
          squadron_id?: string
          start_date?: string
          end_date?: string | null
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
          }
        ]
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