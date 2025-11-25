import { AttendanceStatus, FieldType, PlayerHistoryType, Role } from "./constants";

export interface AuthObject {
    login: boolean;
}

export interface Tenant {
    id?: number;
    created_at?: string;
    shortName: string;
    longName: string;
    maintainTeachers: boolean;
    showHolidays: boolean;
    type: string;
    withExcuses: boolean;
    practiceStart?: string;
    practiceEnd?: string;
    seasonStart?: string;
    parents?: boolean;
    betaProgram: boolean;
    region?: string;
    role?: Role;
    song_sharing_id?: string;
    additional_fields?: ExtraField[];
}

export interface ExtraField {
    id: string;
    name: string;
    type: FieldType;
    options?: string[];
}

export interface TenantUser {
    id?: number;
    created_at?: string;
    tenantId: number;
    userId: string;
    role: number;
    email: string;
    telegram_chat_id?: string;
    parent_id?: number;
}

export interface NotificationConfig {
    id: string;
    created_at: string;
    enabled: boolean;
    telegram_chat_id: string;
    birthdays: boolean;
    signins: boolean;
    signouts: boolean;
    enabled_tenants?: number[];
    updates: boolean;
}

export interface Viewer {
    id?: number;
    created_at?: string;
    appId: string;
    email: string;
    firstName: string;
    lastName: string;
}

export interface Parent {
    id?: number;
    created_at?: string;
    appId: string;
    email: string;
    firstName: string;
    lastName: string;
}


export interface Person {
    id?: number;
    created_at?: string;
    lastName: string;
    firstName: string;
    birthday: string;
    joined: string;
    isPresent?: boolean;
    isLateExcused?: boolean;
    left?: string;
    email?: string;
    appId?: string;
    notes: string;
    img?: string;
    attStatus?: AttendanceStatus;
    isConductor?: boolean;
    telegramId?: string;
    paused?: boolean;
    tenantId?: number;
    additional_fields?: { [key: string]: any };
    phone?: string;
}

export interface PlayerHistoryEntry {
    date: string;
    text: string;
    type: PlayerHistoryType;
}

export interface Player extends Person {
    instrument: number;
    groupName?: string;
    hasTeacher: boolean;
    playsSince: string;
    isLeader: boolean;
    firstOfInstrument?: boolean;
    isNew?: boolean;
    instrumentLength?: number;
    teacher?: number;
    teacherName?: string;
    isCritical: boolean;
    lastSolve?: string;
    correctBirthday: boolean;
    history: PlayerHistoryEntry[];
    criticalReason?: PlayerHistoryType;
    criticalReasonText?: string;
    otherOrchestras?: string[];
    otherExercise?: string;
    text?: string;
    attNote?: string;
    testResult?: string;
    examinee?: boolean;
    range?: string;
    instruments?: string;
    tenantId: number;
    person_attendances?: PersonAttendance[];
    percentage?: number;
    legacyId?: number;
    legacyConductorId?: number;
    parent_id?: number;
    newInstrument?: Group;
}

export interface Group {
    id?: number;
    created_at?: string;
    name: string;
    tuning?: string;
    notes?: string;
    range?: string;
    count?: number;
    clefs?: string[];
    clefText?: string;
    tenantId: number;
    maingroup: boolean;
    legacyId?: number;
    category?: number;
    firstOfCategory?: boolean;
    categoryName?: string;
    categoryLength?: number;
    categoryData?: GroupCategory;
    synonyms?: string;
}

export interface Attendance {
    id?: number;
    created_at?: string;
    date: string;
    type?: string;
    type_id: string;
    save_in_history: boolean;
    percentage?: number;
    excused?: string[];
    criticalPlayers?: number[];
    typeInfo: string;
    notes: string;
    playerNotes?: { [prop: number]: string };
    img?: string;
    plan?: any;
    lateExcused?: string[];
    songs?: number[];
    tenantId?: number;
    persons?: PersonAttendance[];
    players?: { [prop: string]: AttendanceStatus | boolean };
    start_time?: string;
    end_time?: string;
}

export interface Plan {
    end: string;
    time: string;
    fields: FieldSelection[];
}

export interface PersonAttendance {
    id?: string;
    attendance_id: number;
    person_id: number;
    status: AttendanceStatus;
    notes: string;
    firstName?: string;
    lastName?: string;
    img?: string;
    instrument?: number;
    groupName?: string;
    joined?: string;
    person?: Partial<Player>;
    attendance?: Partial<Attendance>;
    attended?: boolean;
    firstOfInstrument?: boolean;
    instrumentLength?: number;
    showDivider?: boolean;
    date?: string;
    text?: string;
    title?: string;
    songs?: number[];
    history?: History[];
    attId?: number;
    highlight?: boolean;
}

export interface Song {
    id?: number;
    created_at?: string;
    tenantId?: number;
    name: string;
    number: number;
    prefix?: string;
    withChoir: boolean;
    withSolo: boolean;
    lastSung?: string;
    link?: string;
    conductor?: string;
    legacyId?: number;
    instrument_ids?: number[];
    files?: SongFile[];
}

export interface SongFile {
    storageName?: string;
    created_at: string;
    fileName: string;
    fileType: string;
    url: string;
    instrumentId?: number;
    note?: string;
}

export interface History {
    id?: number;
    created_at?: string;
    date: string;
    songId: number;
    number?: number;
    name?: string;
    conductorName?: string;
    otherConductor?: string;
    count?: number;
    tenantId?: number;
    person_id?: number;
    attendance_id?: number;
    visible?: boolean;
    attendance?: {
        date: string;
    }
    song?: Song;
}

export interface Teacher {
    id?: number;
    created_at?: string;
    name: string;
    instruments: number[];
    notes: string;
    insNames?: string;
    number: string;
    private: boolean;
    playerCount?: number;
    tenantId?: number;
    legacyId?: number;
}

export interface Meeting {
    id?: number;
    created_at?: string;
    date: string;
    attendees: number[];
    notes: string;
}

export interface FieldSelection {
    id: string;
    name: string;
    time: string;
    conductor?: string;
    currentTime?: string;
    songId?: number;
}

export interface GroupCategory {
    id?: number;
    created_at?: string;
    name: string;
    tenant_id?: number;
}

export interface Admin {
    created_at?: string;
    userId: string;
    email: string;
}

export interface Organisation {
    id?: number;
    created_at?: string;
    name: string;
}

export interface AttendanceType {
    id?: string;
    created_at?: string;
    name: string;
    default_status: AttendanceStatus;
    available_statuses: AttendanceStatus[];
    default_plan?: Plan;
    tenant_id: number;
    relevant_groups: number[];
    start_time?: string;
    end_time?: string;
    manage_songs: boolean;
    index?: number;
    visible: boolean;
    color: string;
    highlight: boolean;
    hide_name: boolean;
}
