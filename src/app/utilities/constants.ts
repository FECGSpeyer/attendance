export enum PlayerHistoryType {
    PAUSED = 1,
    UNEXCUSED = 2,
    MISSING_OFTEN = 3,
    ATTENDANCE = 4,
    NOTES = 5,
    UNPAUSED = 6,
    INSTRUMENT_CHANGE = 7,
    OTHER = 99,
};

export enum Role {
    ADMIN = 1,
    PLAYER = 2,
    VIEWER = 3,
    HELPER = 4,
    RESPONSIBLE = 5,
    PARENT = 6,
    NONE = 99,
};

export enum AttendanceStatus {
    Neutral = 0,
    Present = 1,
    Excused = 2,
    Late = 3,
    Absent = 4,
    LateExcused = 5,
}

export enum SupabaseTable {
    CONDUCTORS = "conductors",
    PLAYER = "player",
    VIEWERS = "viewers",
}

export enum AttendanceType {
    ORCHESTRA = "orchestra",
    CHOIR = "choir",
    GROUP = "group",
}

export const DEFAULT_IMAGE = "https://ionicframework.com/docs/img/demos/avatar.svg";