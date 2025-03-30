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
        }
        Insert: {
          id?: string
          callsign: string
          boardNumber: number
          discordId?: string
          discord_original_id?: string // Added field to Insert operations
          qualifications?: string[]
          roles?: Json
        }
        Update: {
          callsign?: string
          boardNumber?: number
          discordId?: string
          discord_original_id?: string // Added field to Update operations
          qualifications?: string[]
          roles?: Json
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