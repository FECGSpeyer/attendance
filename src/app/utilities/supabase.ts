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
      attendance: {
        Row: {
          conductors: Json | null
          created_at: string | null
          criticalPlayers: number[] | null
          date: string | null
          excused: string[]
          hasNeutral: boolean
          id: number
          img: string | null
          notes: string | null
          plan: Json | null
          playerNotes: Json | null
          players: Json | null
          songs: number[]
          tenantId: number
          type: string | null
          typeInfo: string | null
        }
        Insert: {
          conductors?: Json | null
          created_at?: string | null
          criticalPlayers?: number[] | null
          date?: string | null
          excused?: string[]
          hasNeutral?: boolean
          id?: number
          img?: string | null
          notes?: string | null
          plan?: Json | null
          playerNotes?: Json | null
          players?: Json | null
          songs?: number[]
          tenantId: number
          type?: string | null
          typeInfo?: string | null
        }
        Update: {
          conductors?: Json | null
          created_at?: string | null
          criticalPlayers?: number[] | null
          date?: string | null
          excused?: string[]
          hasNeutral?: boolean
          id?: number
          img?: string | null
          notes?: string | null
          plan?: Json | null
          playerNotes?: Json | null
          players?: Json | null
          songs?: number[]
          tenantId?: number
          type?: string | null
          typeInfo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_attendance_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conductors: {
        Row: {
          appId: string | null
          birthday: string | null
          correctBirthday: boolean | null
          created_at: string | null
          email: string | null
          firstName: string | null
          id: number
          img: string | null
          joined: string | null
          lastName: string | null
          left: string | null
          notes: string | null
          tenantId: number
        }
        Insert: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean | null
          created_at?: string | null
          email?: string | null
          firstName?: string | null
          id?: number
          img?: string | null
          joined?: string | null
          lastName?: string | null
          left?: string | null
          notes?: string | null
          tenantId: number
        }
        Update: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean | null
          created_at?: string | null
          email?: string | null
          firstName?: string | null
          id?: number
          img?: string | null
          joined?: string | null
          lastName?: string | null
          left?: string | null
          notes?: string | null
          tenantId?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_conductors_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      history: {
        Row: {
          conductor: number | null
          created_at: string | null
          date: string | null
          id: number
          otherConductor: string | null
          songId: number | null
          tenantId: number | null
        }
        Insert: {
          conductor?: number | null
          created_at?: string | null
          date?: string | null
          id?: number
          otherConductor?: string | null
          songId?: number | null
          tenantId?: number | null
        }
        Update: {
          conductor?: number | null
          created_at?: string | null
          date?: string | null
          id?: number
          otherConductor?: string | null
          songId?: number | null
          tenantId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "history_conductor_fkey"
            columns: ["conductor"]
            isOneToOne: false
            referencedRelation: "conductors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_songid_fkey"
            columns: ["songId"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_history_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          clefs: string[] | null
          created_at: string | null
          id: number
          maingroup: boolean | null
          name: string | null
          notes: string | null
          range: string | null
          tenantId: number
          tuning: string | null
        }
        Insert: {
          clefs?: string[] | null
          created_at?: string | null
          id?: number
          maingroup?: boolean | null
          name?: string | null
          notes?: string | null
          range?: string | null
          tenantId: number
          tuning?: string | null
        }
        Update: {
          clefs?: string[] | null
          created_at?: string | null
          id?: number
          maingroup?: boolean | null
          name?: string | null
          notes?: string | null
          range?: string | null
          tenantId?: number
          tuning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_instruments_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          attendees: number[] | null
          created_at: string | null
          date: string | null
          id: number
          notes: string | null
          tenantId: number | null
        }
        Insert: {
          attendees?: number[] | null
          created_at?: string | null
          date?: string | null
          id?: number
          notes?: string | null
          tenantId?: number | null
        }
        Update: {
          attendees?: number[] | null
          created_at?: string | null
          date?: string | null
          id?: number
          notes?: string | null
          tenantId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "public_meetings_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      person_attendances: {
        Row: {
          attendance_id: number
          id: string
          notes: string | null
          person_id: number
          status: number
        }
        Insert: {
          attendance_id: number
          id?: string
          notes?: string | null
          person_id: number
          status: number
        }
        Update: {
          attendance_id?: number
          id?: string
          notes?: string | null
          person_id?: number
          status?: number
        }
        Relationships: [
          {
            foreignKeyName: "person_attendances_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_attendances_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      player: {
        Row: {
          appId: string | null
          birthday: string | null
          correctBirthday: boolean | null
          created_at: string | null
          criticalReason: number | null
          email: string | null
          firstName: string | null
          hasTeacher: boolean | null
          history: Json | null
          id: number
          img: string | null
          instrument: number | null
          instruments: string | null
          isCritical: boolean | null
          isLeader: boolean | null
          joined: string | null
          lastName: string | null
          lastSolve: string | null
          left: string | null
          notes: string | null
          otherExercise: string | null
          paused: boolean | null
          playsSince: string | null
          range: string | null
          teacher: number | null
          tenantId: number
        }
        Insert: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean | null
          created_at?: string | null
          criticalReason?: number | null
          email?: string | null
          firstName?: string | null
          hasTeacher?: boolean | null
          history?: Json | null
          id?: number
          img?: string | null
          instrument?: number | null
          instruments?: string | null
          isCritical?: boolean | null
          isLeader?: boolean | null
          joined?: string | null
          lastName?: string | null
          lastSolve?: string | null
          left?: string | null
          notes?: string | null
          otherExercise?: string | null
          paused?: boolean | null
          playsSince?: string | null
          range?: string | null
          teacher?: number | null
          tenantId: number
        }
        Update: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean | null
          created_at?: string | null
          criticalReason?: number | null
          email?: string | null
          firstName?: string | null
          hasTeacher?: boolean | null
          history?: Json | null
          id?: number
          img?: string | null
          instrument?: number | null
          instruments?: string | null
          isCritical?: boolean | null
          isLeader?: boolean | null
          joined?: string | null
          lastName?: string | null
          lastSolve?: string | null
          left?: string | null
          notes?: string | null
          otherExercise?: string | null
          paused?: boolean | null
          playsSince?: string | null
          range?: string | null
          teacher?: number | null
          tenantId?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_instrument_fkey"
            columns: ["instrument"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_player_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_player_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          created_at: string | null
          id: number
          name: string | null
          tenantId: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          name?: string | null
          tenantId?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string | null
          tenantId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "public_scores_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          created_at: string | null
          id: number
          link: string | null
          name: string | null
          number: number | null
          tenantId: number | null
          withChoir: boolean | null
          withOrchestra: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          link?: string | null
          name?: string | null
          number?: number | null
          tenantId?: number | null
          withChoir?: boolean | null
          withOrchestra?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: number
          link?: string | null
          name?: string | null
          number?: number | null
          tenantId?: number | null
          withChoir?: boolean | null
          withOrchestra?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "public_songs_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          id: number
          instruments: number[] | null
          name: string | null
          notes: string | null
          number: string | null
          private: boolean | null
          tenantId: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          instruments?: number[] | null
          name?: string | null
          notes?: string | null
          number?: string | null
          private?: boolean | null
          tenantId?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          instruments?: number[] | null
          name?: string | null
          notes?: string | null
          number?: string | null
          private?: boolean | null
          tenantId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "public_teachers_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          betaProgram: boolean
          created_at: string
          id: number
          longName: string | null
          maintainTeachers: boolean | null
          practiceEnd: string | null
          practiceStart: string | null
          seasonStart: string | null
          shortName: string | null
          type: string | null
          withExcuses: boolean | null
        }
        Insert: {
          betaProgram?: boolean
          created_at?: string
          id?: number
          longName?: string | null
          maintainTeachers?: boolean | null
          practiceEnd?: string | null
          practiceStart?: string | null
          seasonStart?: string | null
          shortName?: string | null
          type?: string | null
          withExcuses?: boolean | null
        }
        Update: {
          betaProgram?: boolean
          created_at?: string
          id?: number
          longName?: string | null
          maintainTeachers?: boolean | null
          practiceEnd?: string | null
          practiceStart?: string | null
          seasonStart?: string | null
          shortName?: string | null
          type?: string | null
          withExcuses?: boolean | null
        }
        Relationships: []
      }
      tenantUsers: {
        Row: {
          created_at: string
          email: string | null
          id: number
          role: number
          tenantId: number
          userId: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: number
          role: number
          tenantId: number
          userId: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: number
          role?: number
          tenantId?: number
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_tenantUsers_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      viewers: {
        Row: {
          appId: string | null
          created_at: string
          email: string | null
          firstName: string | null
          id: number
          lastName: string | null
          tenantId: number | null
        }
        Insert: {
          appId?: string | null
          created_at?: string
          email?: string | null
          firstName?: string | null
          id?: number
          lastName?: string | null
          tenantId?: number | null
        }
        Update: {
          appId?: string | null
          created_at?: string
          email?: string | null
          firstName?: string | null
          id?: number
          lastName?: string | null
          tenantId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "public_viewers_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
