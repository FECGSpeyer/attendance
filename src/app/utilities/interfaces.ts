import { AttendanceStatus, PlayerHistoryType, Role } from "./constants";

export interface AuthObject {
    login: boolean;
}

export interface Tenant {
    id: number;
    created_at: string;
    shortName: string;
    longName: string;
    maintainTeachers: boolean;
    type: string;
    withExcuses: boolean;
    practiceStart: string;
    practiceEnd: string;
    hasNeutralStatus: boolean;
    seasonStart: string;
}

export interface TenantUser {
    id: number;
    created_at: string;
    tenantId: number;
    userId: string;
    role: number;
    email: string;
}

export interface Viewer {
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
}

export interface PlayerHistoryEntry {
    date: string;
    text: string;
    type: PlayerHistoryType;
}

export interface Player extends Person {
    instrument: number;
    instrumentName?: string;
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
    role?: Role;
}

export interface Instrument {
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
}

export interface AttendanceItem {
    [props: number]: AttendanceStatus;
}

export interface Attendance {
    id?: number;
    created_at?: string;
    date: string;
    type: string;
    players?: AttendanceItem;
    conductors?: any;
    percentage?: number;
    excused?: string[];
    criticalPlayers: number[];
    typeInfo: string;
    notes: string;
    playerNotes: { [prop: number]: string };
    img?: string;
    plan?: any;
    lateExcused?: string[];
    songs?: number[];
}

export interface Song {
    id?: number;
    created_at?: string;
    name: string;
    number: number;
    withChoir: boolean;
    lastSung?: string;
    link?: string;
    conductor?: string;
}

export interface PersonAttendance {
    id: number;
    date: string;
    attended: boolean;
    text: string;
    title: string;
    notes: string;
    songs?: number[];
}

export interface History {
    id?: number;
    created_at?: string;
    date: string;
    songId: number;
    number?: number;
    name?: string;
    conductor: number;
    conductorName?: string;
    otherConductor?: string;
    count?: number;
    tenantId?: number;
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
}
