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
          criticalPlayers: number[]
          date: string | null
          excused: string[] | null
          id: number
          img: string | null
          notes: string | null
          plan: Json | null
          playerNotes: Json | null
          players: Json | null
          songs: number[] | null
          type: string
          typeInfo: string | null
        }
        Insert: {
          conductors?: Json | null
          created_at?: string | null
          criticalPlayers?: number[]
          date?: string | null
          excused?: string[] | null
          id?: number
          img?: string | null
          notes?: string | null
          plan?: Json | null
          playerNotes?: Json | null
          players?: Json | null
          songs?: number[] | null
          type?: string
          typeInfo?: string | null
        }
        Update: {
          conductors?: Json | null
          created_at?: string | null
          criticalPlayers?: number[]
          date?: string | null
          excused?: string[] | null
          id?: number
          img?: string | null
          notes?: string | null
          plan?: Json | null
          playerNotes?: Json | null
          players?: Json | null
          songs?: number[] | null
          type?: string
          typeInfo?: string | null
        }
        Relationships: []
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
          paused: boolean | null
          telegramId: string | null
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
          paused?: boolean | null
          telegramId?: string | null
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
          paused?: boolean | null
          telegramId?: string | null
        }
        Relationships: []
      }
      history: {
        Row: {
          conductor: number | null
          created_at: string | null
          date: string | null
          id: number
          name: string | null
          otherConductor: string | null
          songId: number | null
        }
        Insert: {
          conductor?: number | null
          created_at?: string | null
          date?: string | null
          id?: number
          name?: string | null
          otherConductor?: string | null
          songId?: number | null
        }
        Update: {
          conductor?: number | null
          created_at?: string | null
          date?: string | null
          id?: number
          name?: string | null
          otherConductor?: string | null
          songId?: number | null
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
            foreignKeyName: "history_songId_fkey"
            columns: ["songId"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          clefs: string[] | null
          created_at: string | null
          id: number
          name: string | null
          notes: string | null
          range: string | null
          tuning: string
        }
        Insert: {
          clefs?: string[] | null
          created_at?: string | null
          id?: number
          name?: string | null
          notes?: string | null
          range?: string | null
          tuning?: string
        }
        Update: {
          clefs?: string[] | null
          created_at?: string | null
          id?: number
          name?: string | null
          notes?: string | null
          range?: string | null
          tuning?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          attendees: number[]
          created_at: string | null
          date: string
          id: number
          notes: string | null
        }
        Insert: {
          attendees?: number[]
          created_at?: string | null
          date?: string
          id?: number
          notes?: string | null
        }
        Update: {
          attendees?: number[]
          created_at?: string | null
          date?: string
          id?: number
          notes?: string | null
        }
        Relationships: []
      }
      player: {
        Row: {
          appId: string | null
          birthday: string | null
          correctBirthday: boolean
          created_at: string | null
          criticalReason: number | null
          email: string | null
          examinee: boolean | null
          firstName: string | null
          hasTeacher: boolean | null
          history: Json[]
          id: number
          img: string | null
          instrument: number | null
          isCritical: boolean | null
          isLeader: boolean | null
          joined: string | null
          lastName: string | null
          lastSolve: string | null
          left: string | null
          notes: string | null
          otherExercise: string | null
          otherOrchestras: string[]
          paused: boolean | null
          playsSince: string | null
          role: number
          teacher: number | null
          telegramId: string | null
          testResult: string | null
        }
        Insert: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean
          created_at?: string | null
          criticalReason?: number | null
          email?: string | null
          examinee?: boolean | null
          firstName?: string | null
          hasTeacher?: boolean | null
          history?: Json[]
          id?: number
          img?: string | null
          instrument?: number | null
          isCritical?: boolean | null
          isLeader?: boolean | null
          joined?: string | null
          lastName?: string | null
          lastSolve?: string | null
          left?: string | null
          notes?: string | null
          otherExercise?: string | null
          otherOrchestras?: string[]
          paused?: boolean | null
          playsSince?: string | null
          role?: number
          teacher?: number | null
          telegramId?: string | null
          testResult?: string | null
        }
        Update: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean
          created_at?: string | null
          criticalReason?: number | null
          email?: string | null
          examinee?: boolean | null
          firstName?: string | null
          hasTeacher?: boolean | null
          history?: Json[]
          id?: number
          img?: string | null
          instrument?: number | null
          isCritical?: boolean | null
          isLeader?: boolean | null
          joined?: string | null
          lastName?: string | null
          lastSolve?: string | null
          left?: string | null
          notes?: string | null
          otherExercise?: string | null
          otherOrchestras?: string[]
          paused?: boolean | null
          playsSince?: string | null
          role?: number
          teacher?: number | null
          telegramId?: string | null
          testResult?: string | null
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
            foreignKeyName: "player_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          attDate: string | null
          id: number
          practiceEnd: string | null
          practiceStart: string | null
        }
        Insert: {
          attDate?: string | null
          id?: number
          practiceEnd?: string | null
          practiceStart?: string | null
        }
        Update: {
          attDate?: string | null
          id?: number
          practiceEnd?: string | null
          practiceStart?: string | null
        }
        Relationships: []
      }
      songs: {
        Row: {
          created_at: string | null
          id: number
          link: string | null
          name: string | null
          number: number | null
          withChoir: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          link?: string | null
          name?: string | null
          number?: number | null
          withChoir?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: number
          link?: string | null
          name?: string | null
          number?: number | null
          withChoir?: boolean | null
        }
        Relationships: []
      }
      teachers: {
        Row: {
          created_at: string | null
          id: number
          instruments: number[] | null
          name: string | null
          notes: string | null
          number: string | null
          private: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          instruments?: number[] | null
          name?: string | null
          notes?: string | null
          number?: string | null
          private?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: number
          instruments?: number[] | null
          name?: string | null
          notes?: string | null
          number?: string | null
          private?: boolean | null
        }
        Relationships: []
      }
      viewers: {
        Row: {
          appId: string | null
          created_at: string
          email: string | null
          firstName: string | null
          id: number
          lastName: string | null
        }
        Insert: {
          appId?: string | null
          created_at?: string
          email?: string | null
          firstName?: string | null
          id?: number
          lastName?: string | null
        }
        Update: {
          appId?: string | null
          created_at?: string
          email?: string | null
          firstName?: string | null
          id?: number
          lastName?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "viewers_appId_fkey"
            columns: ["appId"]
            isOneToOne: false
            referencedRelation: "users"
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
