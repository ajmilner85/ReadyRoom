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
      aar_reminders: {
        Row: {
          additional_recipients: Json | null
          created_at: string
          flight_debrief_id: string | null
          id: string
          message_id: string | null
          mission_id: string
          recipients: Json
          reminder_type: string
          scheduled_for: string
          sent_at: string | null
          squadron_id: string
        }
        Insert: {
          additional_recipients?: Json | null
          created_at?: string
          flight_debrief_id?: string | null
          id?: string
          message_id?: string | null
          mission_id: string
          recipients?: Json
          reminder_type: string
          scheduled_for: string
          sent_at?: string | null
          squadron_id: string
        }
        Update: {
          additional_recipients?: Json | null
          created_at?: string
          flight_debrief_id?: string | null
          id?: string
          message_id?: string | null
          mission_id?: string
          recipients?: Json
          reminder_type?: string
          scheduled_for?: string
          sent_at?: string | null
          squadron_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aar_reminders_flight_debrief_id_fkey"
            columns: ["flight_debrief_id"]
            isOneToOne: false
            referencedRelation: "flight_debriefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aar_reminders_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aar_reminders_squadron_id_fkey"
            columns: ["squadron_id"]
            isOneToOne: false
            referencedRelation: "org_squadrons"
            referencedColumns: ["id"]
          },
        ]
      }
      app_permissions: {
        Row: {
          available_scopes: string[] | null
          category: string
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          name: string
          scope_type: string
          updated_at: string | null
        }
        Insert: {
          available_scopes?: string[] | null
          category?: string
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          name: string
          scope_type?: string
          updated_at?: string | null
        }
        Update: {
          available_scopes?: string[] | null
          category?: string
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          name?: string
          scope_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
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
      change_log_posts: {
        Row: {
          content: string
          created_at: string | null
          created_by: string
          id: string
          is_archived: boolean
          reactions: Json
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by: string
          id?: string
          is_archived?: boolean
          reactions?: Json
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string
          id?: string
          is_archived?: boolean
          reactions?: Json
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_log_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
      debrief_delegation: {
        Row: {
          created_at: string
          delegated_by_user_id: string
          delegated_to_user_id: string
          flight_debrief_id: string
          id: string
          original_flight_lead_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          delegated_by_user_id: string
          delegated_to_user_id: string
          flight_debrief_id: string
          id?: string
          original_flight_lead_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          delegated_by_user_id?: string
          delegated_to_user_id?: string
          flight_debrief_id?: string
          id?: string
          original_flight_lead_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debrief_delegation_delegated_by_user_id_fkey"
            columns: ["delegated_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debrief_delegation_delegated_to_user_id_fkey"
            columns: ["delegated_to_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debrief_delegation_flight_debrief_id_fkey"
            columns: ["flight_debrief_id"]
            isOneToOne: false
            referencedRelation: "flight_debriefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debrief_delegation_original_flight_lead_id_fkey"
            columns: ["original_flight_lead_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
        ]
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
          notify_accepted: boolean | null
          notify_declined: boolean | null
          notify_no_response: boolean | null
          notify_tentative: boolean | null
          reminder_type: string
          scheduled_time: string
          sent: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          notify_accepted?: boolean | null
          notify_declined?: boolean | null
          notify_no_response?: boolean | null
          notify_tentative?: boolean | null
          reminder_type: string
          scheduled_time: string
          sent?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          notify_accepted?: boolean | null
          notify_declined?: boolean | null
          notify_no_response?: boolean | null
          notify_tentative?: boolean | null
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
          buttons_removed: boolean | null
          created_at: string
          creator_billet: string | null
          creator_board_number: string | null
          creator_call_sign: string | null
          creator_id: string | null
          creator_pilot_id: string | null
          cycle_id: string | null
          description: string | null
          discord_event_id: Json | null
          discord_flight_assignments_posts: Json | null
          discord_thread_ids: Json | null
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
          buttons_removed?: boolean | null
          created_at?: string
          creator_billet?: string | null
          creator_board_number?: string | null
          creator_call_sign?: string | null
          creator_id?: string | null
          creator_pilot_id?: string | null
          cycle_id?: string | null
          description?: string | null
          discord_event_id?: Json | null
          discord_flight_assignments_posts?: Json | null
          discord_thread_ids?: Json | null
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
          buttons_removed?: boolean | null
          created_at?: string
          creator_billet?: string | null
          creator_board_number?: string | null
          creator_call_sign?: string | null
          creator_id?: string | null
          creator_pilot_id?: string | null
          cycle_id?: string | null
          description?: string | null
          discord_event_id?: Json | null
          discord_flight_assignments_posts?: Json | null
          discord_thread_ids?: Json | null
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
          {
            foreignKeyName: "events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_debriefs: {
        Row: {
          callsign: string
          created_at: string
          flight_id: string
          flight_lead_pilot_id: string
          flight_status: string
          id: string
          key_lessons_learned: string | null
          mission_debriefing_id: string
          performance_ratings: Json
          squadron_id: string
          status: string
          submitted_at: string | null
          submitted_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          callsign: string
          created_at?: string
          flight_id: string
          flight_lead_pilot_id: string
          flight_status?: string
          id?: string
          key_lessons_learned?: string | null
          mission_debriefing_id: string
          performance_ratings?: Json
          squadron_id: string
          status?: string
          submitted_at?: string | null
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          callsign?: string
          created_at?: string
          flight_id?: string
          flight_lead_pilot_id?: string
          flight_status?: string
          id?: string
          key_lessons_learned?: string | null
          mission_debriefing_id?: string
          performance_ratings?: Json
          squadron_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_debriefs_flight_lead_pilot_id_fkey"
            columns: ["flight_lead_pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_debriefs_mission_debriefing_id_fkey"
            columns: ["mission_debriefing_id"]
            isOneToOne: false
            referencedRelation: "mission_debriefings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_debriefs_squadron_id_fkey"
            columns: ["squadron_id"]
            isOneToOne: false
            referencedRelation: "org_squadrons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_debriefs_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_debriefings: {
        Row: {
          created_at: string
          created_by: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          mission_id: string
          mission_objectives: Json | null
          mission_outcome: string | null
          status: string
          tacview_file_url: string | null
          tacview_uploaded_at: string | null
          tacview_uploaded_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          mission_id: string
          mission_objectives?: Json | null
          mission_outcome?: string | null
          status?: string
          tacview_file_url?: string | null
          tacview_uploaded_at?: string | null
          tacview_uploaded_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          mission_id?: string
          mission_objectives?: Json | null
          mission_outcome?: string | null
          status?: string
          tacview_file_url?: string | null
          tacview_uploaded_at?: string | null
          tacview_uploaded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_debriefings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_debriefings_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_debriefings_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_debriefings_tacview_uploaded_by_fkey"
            columns: ["tacview_uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          event_id: string | null
          flight_import_filter: string | null
          flights: Json | null
          id: string
          mission_settings: Json | null
          miz_file_data: Json | null
          name: string
          pilot_assignments: Json | null
          selected_squadrons: Json | null
          status: string | null
          step_time: string | null
          support_role_assignments: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          flight_import_filter?: string | null
          flights?: Json | null
          id?: string
          mission_settings?: Json | null
          miz_file_data?: Json | null
          name: string
          pilot_assignments?: Json | null
          selected_squadrons?: Json | null
          status?: string | null
          step_time?: string | null
          support_role_assignments?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          flight_import_filter?: string | null
          flights?: Json | null
          id?: string
          mission_settings?: Json | null
          miz_file_data?: Json | null
          name?: string
          pilot_assignments?: Json | null
          selected_squadrons?: Json | null
          status?: string | null
          step_time?: string | null
          support_role_assignments?: Json | null
          updated_at?: string | null
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
          airframe_id: string | null
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
          settings: Json | null
          tail_code: string | null
          updated_at: string | null
          wing_id: string
        }
        Insert: {
          airframe_id?: string | null
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
          settings?: Json | null
          tail_code?: string | null
          updated_at?: string | null
          wing_id?: string
        }
        Update: {
          airframe_id?: string | null
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
          settings?: Json | null
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
          {
            foreignKeyName: "org_squadrons_airframe_id_fkey"
            columns: ["airframe_id"]
            isOneToOne: false
            referencedRelation: "ref_aircraft_types"
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
      permission_rules: {
        Row: {
          active: boolean | null
          basis_id: string | null
          basis_type: string
          created_at: string | null
          created_by: string | null
          id: string
          permission_id: string
          scope: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          basis_id?: string | null
          basis_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          permission_id: string
          scope?: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          basis_id?: string | null
          basis_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          permission_id?: string
          scope?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_rules_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "app_permissions"
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
      pilot_kills: {
        Row: {
          air_to_air_kills: number
          air_to_ground_kills: number
          created_at: string
          flight_debrief_id: string
          id: string
          mission_id: string
          pilot_id: string
          pilot_mission_status: string
          updated_at: string
        }
        Insert: {
          air_to_air_kills?: number
          air_to_ground_kills?: number
          created_at?: string
          flight_debrief_id: string
          id?: string
          mission_id: string
          pilot_id: string
          pilot_mission_status?: string
          updated_at?: string
        }
        Update: {
          air_to_air_kills?: number
          air_to_ground_kills?: number
          created_at?: string
          flight_debrief_id?: string
          id?: string
          mission_id?: string
          pilot_id?: string
          pilot_mission_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_kills_flight_debrief_id_fkey"
            columns: ["flight_debrief_id"]
            isOneToOne: false
            referencedRelation: "flight_debriefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_kills_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
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
          is_current: boolean
          notes: string | null
          pilot_id: string
          qualification_id: string
          superseded_at: string | null
          superseded_by: string | null
          updated_at: string | null
        }
        Insert: {
          achieved_date?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          pilot_id: string
          qualification_id: string
          superseded_at?: string | null
          superseded_by?: string | null
          updated_at?: string | null
        }
        Update: {
          achieved_date?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          pilot_id?: string
          qualification_id?: string
          superseded_at?: string | null
          superseded_by?: string | null
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
          {
            foreignKeyName: "pilot_qualifications_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "current_pilot_qualifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_qualifications_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "pilot_qualifications"
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
      pilot_teams: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          pilot_id: string
          start_date: string
          team_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          pilot_id: string
          start_date?: string
          team_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          pilot_id?: string
          start_date?: string
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilot_teams_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      pilots: {
        Row: {
          boardNumber: number
          callsign: string
          created_at: string
          discord_id: string | null
          discord_roles: Json | null
          discord_username: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          boardNumber: number
          callsign: string
          created_at?: string
          discord_id?: string | null
          discord_roles?: Json | null
          discord_username?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          boardNumber?: number
          callsign?: string
          created_at?: string
          discord_id?: string | null
          discord_roles?: Json | null
          discord_username?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      polls: {
        Row: {
          archived_at: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          options: Json
          title: string
          updated_at: string | null
          votes: Json
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          options?: Json
          title: string
          updated_at?: string | null
          votes?: Json
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          options?: Json
          title?: string
          updated_at?: string | null
          votes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_interactions: {
        Row: {
          expires_at: string
          interaction_id: string
          processed_at: string
        }
        Insert: {
          expires_at: string
          interaction_id: string
          processed_at?: string
        }
        Update: {
          expires_at?: string
          interaction_id?: string
          processed_at?: string
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
          order: number | null
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
          order?: number | null
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
          order?: number | null
          requirements?: Json | null
          updated_at?: string | null
          validity_period?: number | null
        }
        Relationships: []
      }
      ref_aircraft_types: {
        Row: {
          created_at: string | null
          designation: string
          icon: string | null
          id: string
          mission_types: Json | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          designation: string
          icon?: string | null
          id?: string
          mission_types?: Json | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          designation?: string
          icon?: string | null
          id?: string
          mission_types?: Json | null
          name?: string
          updated_at?: string | null
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
      scheduled_event_publications: {
        Row: {
          created_at: string
          event_id: string
          id: string
          scheduled_time: string
          sent: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          scheduled_time: string
          sent?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          scheduled_time?: string
          sent?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_event_publications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
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
      teams: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          scope: string
          scope_id: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          scope: string
          scope_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          scope?: string
          scope_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_permission_cache: {
        Row: {
          bases_hash: string
          calculated_at: string | null
          expires_at: string | null
          permissions: Json
          user_id: string
        }
        Insert: {
          bases_hash: string
          calculated_at?: string | null
          expires_at?: string | null
          permissions: Json
          user_id: string
        }
        Update: {
          bases_hash?: string
          calculated_at?: string | null
          expires_at?: string | null
          permissions?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          auth_user_id: string
          created_at: string | null
          discord_avatar_url: string | null
          discord_guilds: string[] | null
          discord_id: string | null
          discord_username: string | null
          id: string
          pilot_id: string | null
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string | null
          discord_avatar_url?: string | null
          discord_guilds?: string[] | null
          discord_id?: string | null
          discord_username?: string | null
          id?: string
          pilot_id?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string | null
          discord_avatar_url?: string | null
          discord_guilds?: string[] | null
          discord_id?: string | null
          discord_username?: string | null
          id?: string
          pilot_id?: string | null
          settings?: Json | null
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
      current_pilot_qualifications: {
        Row: {
          achieved_date: string | null
          created_at: string | null
          expiry_date: string | null
          id: string | null
          notes: string | null
          pilot_id: string | null
          qualification_id: string | null
          updated_at: string | null
        }
        Insert: {
          achieved_date?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string | null
          notes?: string | null
          pilot_id?: string | null
          qualification_id?: string | null
          updated_at?: string | null
        }
        Update: {
          achieved_date?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string | null
          notes?: string | null
          pilot_id?: string | null
          qualification_id?: string | null
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
    }
    Functions: {
      add_event_thread_id: {
        Args: {
          p_channel_id: string
          p_event_id: string
          p_guild_id: string
          p_message_id: string
          p_squadron_id: string
          p_thread_id: string
        }
        Returns: boolean
      }
      add_pilot_qualification: {
        Args: {
          p_achieved_date?: string
          p_expiry_date?: string
          p_notes?: string
          p_pilot_id: string
          p_qualification_id: string
        }
        Returns: string
      }
      atomic_attendance_upsert: {
        Args: {
          p_discord_event_id: string
          p_discord_id: string
          p_discord_username: string
          p_user_response: string
        }
        Returns: {
          created_at: string
          discord_event_id: string
          discord_id: string
          discord_username: string
          id: string
          updated_at: string
          user_response: string
        }[]
      }
      bulk_add_pilot_qualifications: {
        Args: {
          p_achieved_date?: string
          p_pilot_ids: string[]
          p_qualification_id: string
        }
        Returns: {
          new_record_id: string
          pilot_id: string
          qualification_id: string
          was_updated: boolean
        }[]
      }
      check_admin_permissions: {
        Args: { p_auth_user_id: string }
        Returns: {
          has_admin_permissions: boolean
          permission_count: number
          user_profile_id: string
        }[]
      }
      check_squadrons_use_threads: {
        Args: { p_squadron_ids: string[] }
        Returns: boolean
      }
      clean_expired_permission_cache: { Args: never; Returns: number }
      cleanup_expired_interactions: { Args: never; Returns: undefined }
      clear_user_permission_cache: { Args: never; Returns: undefined }
      debug_permission_check: {
        Args: { permission_name: string; user_auth_id: string }
        Returns: {
          result: string
          step: string
        }[]
      }
      debug_scope_matching: {
        Args: { user_auth_id: string }
        Returns: {
          check_type: string
          details: string
          matches: boolean
          perm_value: string
          user_value: string
        }[]
      }
      debug_user_permissions: {
        Args: { user_auth_id: string }
        Returns: {
          step_data: string
          step_name: string
          step_result: string
        }[]
      }
      find_pilot_by_discord_id: {
        Args: { p_discord_id: string }
        Returns: string
      }
      get_event_no_response_users: {
        Args: { discord_message_id: string }
        Returns: {
          board_number: string
          callsign: string
          discord_id: string
          discord_username: string
        }[]
      }
      get_event_no_response_users_by_uuid: {
        Args: { event_uuid: string }
        Returns: {
          board_number: string
          callsign: string
          discord_id: string
          discord_username: string
        }[]
      }
      get_event_thread_ids: {
        Args: { p_event_id: string }
        Returns: {
          channel_id: string
          created_at: string
          guild_id: string
          message_id: string
          squadron_id: string
          thread_id: string
        }[]
      }
      get_latest_event_responses: {
        Args: { event_id: string }
        Returns: {
          created_at: string
          discord_event_id: string
          discord_id: string
          discord_username: string
          id: string
          updated_at: string
          user_response: string
        }[]
      }
      get_pilot_qualification_history: {
        Args: { p_pilot_id: string; p_qualification_id: string }
        Returns: {
          achieved_date: string
          expiry_date: string
          id: string
          is_current: boolean
          notes: string
          superseded_at: string
        }[]
      }
      get_thread_id_for_channel: {
        Args: { p_channel_id: string; p_event_id: string; p_guild_id: string }
        Returns: string
      }
      get_user_bases_hash: { Args: { p_user_id: string }; Returns: string }
      grant_admin_permissions: {
        Args: { p_auth_user_id: string }
        Returns: string
      }
      invalidate_user_permissions: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      is_valid_scope_for_permission: {
        Args: { p_permission_id: string; p_requested_scope: string }
        Returns: boolean
      }
      populate_user_permission_cache: {
        Args: { target_user_id?: string }
        Returns: undefined
      }
      release_reminder_lock: { Args: { lock_key: number }; Returns: boolean }
      revoke_admin_permissions: {
        Args: { p_auth_user_id: string }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      test_event_view_debug: {
        Args: { test_event_id: string; test_user_auth_id: string }
        Returns: {
          step: string
          value: string
        }[]
      }
      test_user_permissions: { Args: { user_auth_id: string }; Returns: string }
      try_acquire_reminder_lock: {
        Args: { lock_key: number }
        Returns: boolean
      }
      update_event_settings: {
        Args: { p_event_id: string; p_event_settings: Json }
        Returns: Json
      }
      update_squadron_timezone: {
        Args: { new_timezone: string }
        Returns: undefined
      }
      user_can_manage_assignment: {
        Args: { target_pilot_id: string; user_auth_id: string }
        Returns: boolean
      }
      user_can_manage_cycle:
        | {
            Args: { cycle_participants?: Json; user_auth_id: string }
            Returns: boolean
          }
        | {
            Args: { cycle_type: string; user_auth_id: string }
            Returns: boolean
          }
      user_can_manage_cycle_debug_return: {
        Args: { cycle_participants?: Json; user_auth_id: string }
        Returns: boolean
      }
      user_can_manage_cycle_with_logging: {
        Args: { cycle_participants?: Json; user_auth_id: string }
        Returns: boolean
      }
      user_can_manage_squadron: {
        Args: { squadron_id: string; user_auth_id: string }
        Returns: boolean
      }
      user_can_view_assignment: {
        Args: { target_pilot_id: string; user_auth_id: string }
        Returns: boolean
      }
      user_can_view_cycle:
        | {
            Args: { cycle_participants: Json; user_auth_id: string }
            Returns: boolean
          }
        | {
            Args: { cycle_squadron_id: string; user_auth_id: string }
            Returns: boolean
          }
      user_can_view_debrief: {
        Args: {
          target_flight_id?: string
          target_mission_id: string
          user_auth_id: string
        }
        Returns: boolean
      }
      user_can_view_event: {
        Args: { target_event_id: string; user_auth_id: string }
        Returns: boolean
      }
      user_can_view_mission: {
        Args: { target_mission_id: string; user_auth_id: string }
        Returns: boolean
      }
      user_can_view_pilot: {
        Args: { target_pilot_id: string; user_auth_id: string }
        Returns: boolean
      }
      user_can_view_squadron: {
        Args: { squadron_id: string; user_auth_id: string }
        Returns: boolean
      }
      user_can_view_wing: {
        Args: { user_auth_id: string; wing_id: string }
        Returns: boolean
      }
      user_has_event_permission: {
        Args: {
          permission_name: string
          target_event_id?: string
          user_auth_id: string
        }
        Returns: boolean
      }
      user_has_global_org_permission: {
        Args: { user_auth_id: string }
        Returns: boolean
      }
      user_has_manage_change_log_permission: {
        Args: { check_user_id: string }
        Returns: boolean
      }
      user_has_roster_permission: {
        Args: {
          permission_name: string
          target_pilot_id?: string
          user_auth_id: string
        }
        Returns: boolean
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
