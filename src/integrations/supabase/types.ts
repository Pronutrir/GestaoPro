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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          completed_at: string | null
          context_metadata: Json
          cost: number | null
          created_at: string
          created_by: string | null
          created_by_email: string | null
          deadline_flag: string | null
          description: string | null
          display_order: number | null
          end_date: string | null
          hours: number | null
          id: string
          is_critical: boolean
          is_milestone: boolean
          is_trashed: boolean
          last_update_date: string | null
          parent_id: string | null
          participants: string[] | null
          phase_id: string | null
          priority: string
          project_id: string
          raci_role: string | null
          sprint_id: string | null
          start_date: string | null
          status: string
          story_points: number | null
          tags: string[] | null
          title: string
          trashed_at: string | null
          ui_color_tag: string | null
          updated_at: string
          workflow_stage_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          completed_at?: string | null
          context_metadata?: Json
          cost?: number | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          deadline_flag?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          hours?: number | null
          id?: string
          is_critical?: boolean
          is_milestone?: boolean
          is_trashed?: boolean
          last_update_date?: string | null
          parent_id?: string | null
          participants?: string[] | null
          phase_id?: string | null
          priority?: string
          project_id: string
          raci_role?: string | null
          sprint_id?: string | null
          start_date?: string | null
          status?: string
          story_points?: number | null
          tags?: string[] | null
          title: string
          trashed_at?: string | null
          ui_color_tag?: string | null
          updated_at?: string
          workflow_stage_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          completed_at?: string | null
          context_metadata?: Json
          cost?: number | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          deadline_flag?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          hours?: number | null
          id?: string
          is_critical?: boolean
          is_milestone?: boolean
          is_trashed?: boolean
          last_update_date?: string | null
          parent_id?: string | null
          participants?: string[] | null
          phase_id?: string | null
          priority?: string
          project_id?: string
          raci_role?: string | null
          sprint_id?: string | null
          start_date?: string | null
          status?: string
          story_points?: number | null
          tags?: string[] | null
          title?: string
          trashed_at?: string | null
          ui_color_tag?: string | null
          updated_at?: string
          workflow_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_workflow_stage_id_fkey"
            columns: ["workflow_stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_comments: {
        Row: {
          activity_id: string
          author: string | null
          content: string
          created_at: string
          id: string
          is_trashed: boolean
          trashed_at: string | null
          updated_at: string
        }
        Insert: {
          activity_id: string
          author?: string | null
          content: string
          created_at?: string
          id?: string
          is_trashed?: boolean
          trashed_at?: string | null
          updated_at?: string
        }
        Update: {
          activity_id?: string
          author?: string | null
          content?: string
          created_at?: string
          id?: string
          is_trashed?: boolean
          trashed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_comments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_investments: {
        Row: {
          activity_id: string
          amount: number
          category: string | null
          description: string | null
          id: string
          project_id: string | null
          recorded_at: string
          responsible: string | null
        }
        Insert: {
          activity_id: string
          amount: number
          category?: string | null
          description?: string | null
          id?: string
          project_id?: string | null
          recorded_at?: string
          responsible?: string | null
        }
        Update: {
          activity_id?: string
          amount?: number
          category?: string | null
          description?: string | null
          id?: string
          project_id?: string | null
          recorded_at?: string
          responsible?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_investments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log_entries: {
        Row: {
          activity_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          promoted_to_lesson_id: string | null
        }
        Insert: {
          activity_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          promoted_to_lesson_id?: string | null
        }
        Update: {
          activity_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          promoted_to_lesson_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_entries_promoted_to_lesson_id_fkey"
            columns: ["promoted_to_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons_learned"
            referencedColumns: ["id"]
          },
        ]
      }
      assumptions: {
        Row: {
          category: string | null
          created_at: string
          description: string
          id: string
          impact: string | null
          is_trashed: boolean
          project_id: string
          status: string
          trashed_at: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description: string
          id?: string
          impact?: string | null
          is_trashed?: boolean
          project_id: string
          status?: string
          trashed_at?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          impact?: string | null
          is_trashed?: boolean
          project_id?: string
          status?: string
          trashed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assumptions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          changed_by: string | null
          changed_by_email: string | null
          changed_fields: string[] | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string
          table_name: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_email?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id: string
          table_name: string
        }
        Update: {
          changed_by?: string | null
          changed_by_email?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      change_request_approvers: {
        Row: {
          change_request_id: string
          created_at: string
          id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          change_request_id: string
          created_at?: string
          id?: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          change_request_id?: string
          created_at?: string
          id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_request_approvers_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      change_request_scope_items: {
        Row: {
          activity_id: string | null
          change_request_id: string
          created_at: string
          id: string
          item_type: string
          phase_id: string | null
        }
        Insert: {
          activity_id?: string | null
          change_request_id: string
          created_at?: string
          id?: string
          item_type: string
          phase_id?: string | null
        }
        Update: {
          activity_id?: string | null
          change_request_id?: string
          created_at?: string
          id?: string
          item_type?: string
          phase_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_request_scope_items_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_request_scope_items_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_request_scope_items_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
        ]
      }
      change_requests: {
        Row: {
          approver: string | null
          approver_id: string | null
          created_at: string
          decision_date: string | null
          decision_notes: string | null
          description: string | null
          expected_benefits: string | null
          id: string
          impact_cost: string | null
          impact_quality: string | null
          impact_schedule: string | null
          impact_scope: string | null
          is_trashed: boolean
          justification: string | null
          project_id: string
          requested_by: string | null
          requested_by_id: string | null
          status: string
          title: string
          trashed_at: string | null
          updated_at: string
        }
        Insert: {
          approver?: string | null
          approver_id?: string | null
          created_at?: string
          decision_date?: string | null
          decision_notes?: string | null
          description?: string | null
          expected_benefits?: string | null
          id?: string
          impact_cost?: string | null
          impact_quality?: string | null
          impact_schedule?: string | null
          impact_scope?: string | null
          is_trashed?: boolean
          justification?: string | null
          project_id: string
          requested_by?: string | null
          requested_by_id?: string | null
          status?: string
          title: string
          trashed_at?: string | null
          updated_at?: string
        }
        Update: {
          approver?: string | null
          approver_id?: string | null
          created_at?: string
          decision_date?: string | null
          decision_notes?: string | null
          description?: string | null
          expected_benefits?: string | null
          id?: string
          impact_cost?: string | null
          impact_quality?: string | null
          impact_schedule?: string | null
          impact_scope?: string | null
          is_trashed?: boolean
          justification?: string | null
          project_id?: string
          requested_by?: string | null
          requested_by_id?: string | null
          status?: string
          title?: string
          trashed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      csc_sla_configs: {
        Row: {
          created_at: string
          department: string
          description: string | null
          id: string
          service_type: string
          sla_hours: number
        }
        Insert: {
          created_at?: string
          department: string
          description?: string | null
          id?: string
          service_type: string
          sla_hours?: number
        }
        Update: {
          created_at?: string
          department?: string
          description?: string | null
          id?: string
          service_type?: string
          sla_hours?: number
        }
        Relationships: []
      }
      csc_tickets: {
        Row: {
          activity_id: string | null
          assigned_to: string | null
          attachment_url: string | null
          created_at: string
          created_by: string | null
          department: string
          description: string | null
          id: string
          priority: string
          project_id: string | null
          raci_role: string | null
          requested_date: string | null
          requesting_area: string | null
          resolved_at: string | null
          service_type: string
          sla_deadline: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          assigned_to?: string | null
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          raci_role?: string | null
          requested_date?: string | null
          requesting_area?: string | null
          resolved_at?: string | null
          service_type?: string
          sla_deadline?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          assigned_to?: string | null
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          raci_role?: string | null
          requested_date?: string | null
          requesting_area?: string | null
          resolved_at?: string | null
          service_type?: string
          sla_deadline?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "csc_tickets_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csc_tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_package_activities: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          package_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          package_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_package_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_package_activities_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "delivery_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_packages: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          is_trashed: boolean
          project_id: string
          responsible: string | null
          sector: string | null
          start_date: string | null
          status: string
          title: string
          trashed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_trashed?: boolean
          project_id: string
          responsible?: string | null
          sector?: string | null
          start_date?: string | null
          status?: string
          title: string
          trashed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_trashed?: boolean
          project_id?: string
          responsible?: string | null
          sector?: string | null
          start_date?: string | null
          status?: string
          title?: string
          trashed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_packages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          is_national: boolean
          name: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_national?: boolean
          name: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_national?: boolean
          name?: string
        }
        Relationships: []
      }
      lessons_learned: {
        Row: {
          category: string
          created_at: string
          id: string
          impact: string | null
          is_trashed: boolean
          phase_id: string | null
          problem: string
          project_id: string
          reported_by: string | null
          solution: string | null
          suggestion: string | null
          trashed_at: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          impact?: string | null
          is_trashed?: boolean
          phase_id?: string | null
          problem: string
          project_id: string
          reported_by?: string | null
          solution?: string | null
          suggestion?: string | null
          trashed_at?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          impact?: string | null
          is_trashed?: boolean
          phase_id?: string | null
          problem?: string
          project_id?: string
          reported_by?: string | null
          solution?: string | null
          suggestion?: string | null
          trashed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_learned_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_learned_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_actions: {
        Row: {
          activity_id: string | null
          assigned_to: string | null
          created_at: string
          description: string
          due_date: string | null
          id: string
          is_completed: boolean
          meeting_id: string
        }
        Insert: {
          activity_id?: string | null
          assigned_to?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          is_completed?: boolean
          meeting_id: string
        }
        Update: {
          activity_id?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean
          meeting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_actions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_actions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_decisions: {
        Row: {
          created_at: string
          description: string
          id: string
          meeting_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          meeting_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          meeting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: string | null
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          is_trashed: boolean
          location: string | null
          meeting_date: string | null
          meeting_type: string
          minutes: string | null
          participants: string[] | null
          phase_id: string | null
          project_id: string
          responsible: string | null
          sprint_id: string | null
          start_time: string | null
          title: string
          trashed_at: string | null
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          is_trashed?: boolean
          location?: string | null
          meeting_date?: string | null
          meeting_type?: string
          minutes?: string | null
          participants?: string[] | null
          phase_id?: string | null
          project_id: string
          responsible?: string | null
          sprint_id?: string | null
          start_time?: string | null
          title: string
          trashed_at?: string | null
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          is_trashed?: boolean
          location?: string | null
          meeting_date?: string | null
          meeting_type?: string
          minutes?: string | null
          participants?: string[] | null
          phase_id?: string | null
          project_id?: string
          responsible?: string | null
          sprint_id?: string | null
          start_time?: string | null
          title?: string
          trashed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          activity_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          project_id: string | null
          title: string
          type: string
        }
        Insert: {
          activity_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          project_id?: string | null
          title: string
          type: string
        }
        Update: {
          activity_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          project_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      okr_key_results: {
        Row: {
          created_at: string
          current_value: number
          id: string
          metric_type: string
          objective_id: string
          start_value: number
          target_value: number
          title: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          id?: string
          metric_type?: string
          objective_id: string
          start_value?: number
          target_value?: number
          title: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_value?: number
          id?: string
          metric_type?: string
          objective_id?: string
          start_value?: number
          target_value?: number
          title?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_key_results_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "okr_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      okr_objectives: {
        Row: {
          created_at: string
          cycle: string
          description: string | null
          id: string
          owner: string | null
          progress: number
          status: string
          title: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          cycle?: string
          description?: string | null
          id?: string
          owner?: string | null
          progress?: number
          status?: string
          title: string
          updated_at?: string
          year?: number
        }
        Update: {
          created_at?: string
          cycle?: string
          description?: string | null
          id?: string
          owner?: string | null
          progress?: number
          status?: string
          title?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      okr_project_links: {
        Row: {
          contribution_weight: number
          created_at: string
          id: string
          key_result_id: string
          project_id: string
        }
        Insert: {
          contribution_weight?: number
          created_at?: string
          id?: string
          key_result_id: string
          project_id: string
        }
        Update: {
          contribution_weight?: number
          created_at?: string
          id?: string
          key_result_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "okr_project_links_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "okr_key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okr_project_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      phases: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          is_trashed: boolean
          project_id: string
          title: string
          trashed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_trashed?: boolean
          project_id: string
          title: string
          trashed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_trashed?: boolean
          project_id?: string
          title?: string
          trashed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          role_title: string | null
          sector: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          role_title?: string | null
          sector?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          role_title?: string | null
          sector?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_dependencies: {
        Row: {
          created_at: string
          depends_on: string | null
          description: string
          due_date: string | null
          id: string
          linked_project_id: string | null
          project_id: string
          responsible: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          depends_on?: string | null
          description: string
          due_date?: string | null
          id?: string
          linked_project_id?: string | null
          project_id: string
          responsible?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          depends_on?: string | null
          description?: string
          due_date?: string | null
          id?: string
          linked_project_id?: string | null
          project_id?: string
          responsible?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_dependencies_linked_project_id_fkey"
            columns: ["linked_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          activity_id: string | null
          created_at: string
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          is_trashed: boolean
          phase_id: string | null
          project_id: string
          trashed_at: string | null
          updated_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          activity_id?: string | null
          created_at?: string
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          is_trashed?: boolean
          phase_id?: string | null
          project_id: string
          trashed_at?: string | null
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          activity_id?: string | null
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          is_trashed?: boolean
          phase_id?: string | null
          project_id?: string
          trashed_at?: string | null
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_move: boolean
          created_at: string
          id: string
          project_id: string
          sector: string | null
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_move?: boolean
          created_at?: string
          id?: string
          project_id: string
          sector?: string | null
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_move?: boolean
          created_at?: string
          id?: string
          project_id?: string
          sector?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          assignees: string[] | null
          blockers: string | null
          budget_planned: number | null
          budget_used: number | null
          category: string | null
          completion_percentage: number | null
          created_at: string
          description: string | null
          display_order: number | null
          due_date: string | null
          expected_benefits: string | null
          id: string
          is_trashed: boolean
          manager: string | null
          objective: string | null
          out_of_scope: string | null
          owner: string | null
          priority: string
          problem_statement: string | null
          program: string | null
          project_type: string | null
          regulatory_requirements: string | null
          restrictions: string | null
          root_cause: string | null
          scope: string | null
          solved_problem: string | null
          sponsor: string | null
          start_date: string | null
          status: string
          title: string
          trashed_at: string | null
          updated_at: string
        }
        Insert: {
          assignees?: string[] | null
          blockers?: string | null
          budget_planned?: number | null
          budget_used?: number | null
          category?: string | null
          completion_percentage?: number | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          due_date?: string | null
          expected_benefits?: string | null
          id?: string
          is_trashed?: boolean
          manager?: string | null
          objective?: string | null
          out_of_scope?: string | null
          owner?: string | null
          priority?: string
          problem_statement?: string | null
          program?: string | null
          project_type?: string | null
          regulatory_requirements?: string | null
          restrictions?: string | null
          root_cause?: string | null
          scope?: string | null
          solved_problem?: string | null
          sponsor?: string | null
          start_date?: string | null
          status?: string
          title: string
          trashed_at?: string | null
          updated_at?: string
        }
        Update: {
          assignees?: string[] | null
          blockers?: string | null
          budget_planned?: number | null
          budget_used?: number | null
          category?: string | null
          completion_percentage?: number | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          due_date?: string | null
          expected_benefits?: string | null
          id?: string
          is_trashed?: boolean
          manager?: string | null
          objective?: string | null
          out_of_scope?: string | null
          owner?: string | null
          priority?: string
          problem_statement?: string | null
          program?: string | null
          project_type?: string | null
          regulatory_requirements?: string | null
          restrictions?: string | null
          root_cause?: string | null
          scope?: string | null
          solved_problem?: string | null
          sponsor?: string | null
          start_date?: string | null
          status?: string
          title?: string
          trashed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      risks: {
        Row: {
          category: string | null
          contingency: string | null
          created_at: string
          description: string
          gravity: number | null
          id: string
          impact: string
          is_trashed: boolean
          mitigation: string | null
          probability: string
          project_id: string
          responsible: string | null
          severity_score: number | null
          status: string
          tendency: number | null
          trashed_at: string | null
          updated_at: string
          urgency: number | null
        }
        Insert: {
          category?: string | null
          contingency?: string | null
          created_at?: string
          description: string
          gravity?: number | null
          id?: string
          impact?: string
          is_trashed?: boolean
          mitigation?: string | null
          probability?: string
          project_id: string
          responsible?: string | null
          severity_score?: number | null
          status?: string
          tendency?: number | null
          trashed_at?: string | null
          updated_at?: string
          urgency?: number | null
        }
        Update: {
          category?: string | null
          contingency?: string | null
          created_at?: string
          description?: string
          gravity?: number | null
          id?: string
          impact?: string
          is_trashed?: boolean
          mitigation?: string | null
          probability?: string
          project_id?: string
          responsible?: string | null
          severity_score?: number | null
          status?: string
          tendency?: number | null
          trashed_at?: string | null
          updated_at?: string
          urgency?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_items: {
        Row: {
          confidence: number
          created_at: string
          created_by: string | null
          description: string | null
          effort: number
          id: string
          impact: number
          project_id: string | null
          reach: number
          score: number | null
          status: string
          target_quarter: string | null
          theme: string
          title: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          effort?: number
          id?: string
          impact?: number
          project_id?: string | null
          reach?: number
          score?: number | null
          status?: string
          target_quarter?: string | null
          theme?: string
          title: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          effort?: number
          id?: string
          impact?: number
          project_id?: string | null
          reach?: number
          score?: number | null
          status?: string
          target_quarter?: string | null
          theme?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
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
      sprints: {
        Row: {
          created_at: string
          end_date: string
          goal: string | null
          id: string
          project_id: string
          start_date: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          goal?: string | null
          id?: string
          project_id: string
          start_date: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          goal?: string | null
          id?: string
          project_id?: string
          start_date?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sticky_notes: {
        Row: {
          color: string
          content: string
          created_at: string
          id: string
          position_x: number
          position_y: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          content?: string
          created_at?: string
          id?: string
          position_x?: number
          position_y?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          content?: string
          created_at?: string
          id?: string
          position_x?: number
          position_y?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          id: string
          lag_days: number | null
          predecessor_id: string
          successor_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          id?: string
          lag_days?: number | null
          predecessor_id: string
          successor_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          id?: string
          lag_days?: number | null
          predecessor_id?: string
          successor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          activity_id: string
          created_at: string
          description: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          project_id: string
          started_at: string
          user_name: string | null
        }
        Insert: {
          activity_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          project_id: string
          started_at: string
          user_name?: string | null
        }
        Update: {
          activity_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          project_id?: string
          started_at?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_permissions: {
        Row: {
          allowed_modules: string[]
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_modules?: string[]
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_modules?: string[]
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stories: {
        Row: {
          acceptance_criteria: string[]
          action: string
          activity_id: string | null
          benefit: string
          created_at: string
          id: string
          image_url: string | null
          is_trashed: boolean
          narrative: string | null
          persona: string
          phase_id: string | null
          priority: string
          project_id: string
          stage_id: string | null
          status: string
          title: string
          trashed_at: string | null
          updated_at: string
        }
        Insert: {
          acceptance_criteria?: string[]
          action?: string
          activity_id?: string | null
          benefit?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_trashed?: boolean
          narrative?: string | null
          persona?: string
          phase_id?: string | null
          priority?: string
          project_id: string
          stage_id?: string | null
          status?: string
          title?: string
          trashed_at?: string | null
          updated_at?: string
        }
        Update: {
          acceptance_criteria?: string[]
          action?: string
          activity_id?: string | null
          benefit?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_trashed?: boolean
          narrative?: string | null
          persona?: string
          phase_id?: string | null
          priority?: string
          project_id?: string
          stage_id?: string | null
          status?: string
          title?: string
          trashed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stories_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stories_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stories_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_story_stages: {
        Row: {
          color: string
          created_at: string
          display_order: number
          id: string
          is_final: boolean
          project_id: string
          title: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          is_final?: boolean
          project_id: string
          title: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          is_final?: boolean
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_story_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tab_permissions: {
        Row: {
          allowed_tabs: string[]
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_tabs?: string[]
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_tabs?: string[]
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_work_schedules: {
        Row: {
          updated_at: string
          user_id: string
          vacation_periods: Json
          weekly_hours: Json
        }
        Insert: {
          updated_at?: string
          user_id: string
          vacation_periods?: Json
          weekly_hours?: Json
        }
        Update: {
          updated_at?: string
          user_id?: string
          vacation_periods?: Json
          weekly_hours?: Json
        }
        Relationships: []
      }
      workflow_stage_members: {
        Row: {
          created_at: string
          id: string
          stage_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          stage_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          stage_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stage_members_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_stages: {
        Row: {
          color: string
          created_at: string
          display_order: number
          id: string
          is_blocked: boolean
          is_final: boolean
          is_visible: boolean
          project_id: string
          title: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          is_blocked?: boolean
          is_final?: boolean
          is_visible?: boolean
          project_id: string
          title: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          is_blocked?: boolean
          is_final?: boolean
          is_visible?: boolean
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_overdue_notifications: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "gestor"
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
      app_role: ["admin", "user", "gestor"],
    },
  },
} as const
