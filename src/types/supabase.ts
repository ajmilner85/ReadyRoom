export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      pilots: {
        Row: {
          id: string
          callsign: string
          boardNumber: number
          discordId?: string
          discord_original_id?: string // Added field to store original Discord IDs
          qualifications: string[]
          roles: Json
          created_at?: string
          updated_at?: string
          status_id?: string // Changed from status to status_id of type UUID (string in TypeScript)
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