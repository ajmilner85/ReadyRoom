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
          discordId?: string
          created_at?: string
          updated_at?: string
          discord_original_id?: string
          qualifications?: string[]
          roles?: Json
          status_id?: string // Changed from status to status_id of type UUID
        }
        Insert: {
          id?: string
          callsign: string
          boardNumber: number
          discordId?: string
          discord_original_id?: string
          qualifications?: string[]
          roles?: Json
          status_id?: string // Changed from status to status_id of type UUID
        }
        Update: {
          callsign?: string
          boardNumber?: number
          discordId?: string
          discord_original_id?: string
          qualifications?: string[]
          roles?: Json
          status_id?: string // Changed from status to status_id of type UUID
        }
      }
      statuses: {
        Row: {
          id: string
          name: string
          isActive: boolean
          order: number
          created_at?: string
        }
        Insert: {
          id?: string
          name: string
          isActive: boolean
          order: number
        }
        Update: {
          name?: string
          isActive?: boolean
          order?: number
        }
      }
      roles: {
        Row: {
          id: string
          name: string
          isExclusive: boolean
          compatible_statuses: string[]
          order: number
          created_at?: string
        }
        Insert: {
          id?: string
          name: string
          isExclusive: boolean
          compatible_statuses: string[]
          order: number
        }
        Update: {
          name?: string
          isExclusive?: boolean
          compatible_statuses?: string[]
          order?: number
        }
      }
      pilot_roles: {
        Row: {
          id: string
          pilot_id: string
          role_id: string
          created_at?: string
        }
        Insert: {
          id?: string
          pilot_id: string
          role_id: string
        }
        Update: {
          pilot_id?: string
          role_id?: string
        }
      }
      events: {
        Row: {
          id: string
          name: string
          date: string
          type: string
          description?: string
          status: string
          created_at?: string
          updated_at?: string
        }
        Insert: {
          id?: string
          name: string
          date: string
          type: string
          description?: string
          status: string
        }
        Update: {
          name?: string
          date?: string
          type?: string
          description?: string
          status?: string
        }
      }
      attendance: {
        Row: {
          id: string
          eventId: string
          pilotId: string
          status: string
          role?: string
          created_at?: string
          updated_at?: string
        }
        Insert: {
          id?: string
          eventId: string
          pilotId: string
          status: string
          role?: string
        }
        Update: {
          eventId?: string
          pilotId?: string
          status?: string
          role?: string
        }
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
  }
}