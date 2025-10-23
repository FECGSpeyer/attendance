export enum PlayerHistoryType {
    PAUSED = 1,
    UNEXCUSED = 2,
    MISSING_OFTEN = 3,
    ATTENDANCE = 4,
    NOTES = 5,
    UNPAUSED = 6,
    INSTRUMENT_CHANGE = 7,
    ARCHIVED = 8,
    RETURNED = 9,
    TRANSFERRED_FROM = 10,
    TRANSFERRED_TO = 11,
    COPIED_FROM = 12,
    COPIED_TO = 13,
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

export enum DefaultAttendanceType {
    ORCHESTRA = "orchestra",
    CHOIR = "choir",
    GENERAL = "general",
}

export const DEFAULT_IMAGE = "https://ionicframework.com/docs/img/demos/avatar.svg";

export const ATTENDANCE_STATUS_MAPPING = {
    DEFAULT: {
        [AttendanceStatus.Neutral]: AttendanceStatus.Present,
        [AttendanceStatus.Absent]: AttendanceStatus.Present,
        [AttendanceStatus.Present]: AttendanceStatus.Excused,
        [AttendanceStatus.Excused]: AttendanceStatus.Late,
        [AttendanceStatus.Late]: AttendanceStatus.Absent,
        [AttendanceStatus.LateExcused]: AttendanceStatus.Absent,
    },
    NO_NEUTRAL: {
        [AttendanceStatus.Present]: AttendanceStatus.Excused,
        [AttendanceStatus.Excused]: AttendanceStatus.Late,
        [AttendanceStatus.Late]: AttendanceStatus.Absent,
        [AttendanceStatus.Absent]: AttendanceStatus.Present,
        [AttendanceStatus.LateExcused]: AttendanceStatus.Absent,
    },
    NO_EXCUSED: {
        [AttendanceStatus.Neutral]: AttendanceStatus.Present,
        [AttendanceStatus.Absent]: AttendanceStatus.Present,
        [AttendanceStatus.Present]: AttendanceStatus.Late,
        [AttendanceStatus.Late]: AttendanceStatus.Absent,
        [AttendanceStatus.LateExcused]: AttendanceStatus.Absent,
        [AttendanceStatus.Excused]: AttendanceStatus.Present,
    },
    NO_LATE: {
        [AttendanceStatus.Neutral]: AttendanceStatus.Present,
        [AttendanceStatus.Absent]: AttendanceStatus.Present,
        [AttendanceStatus.Present]: AttendanceStatus.Excused,
        [AttendanceStatus.Excused]: AttendanceStatus.Absent,
        [AttendanceStatus.Late]: AttendanceStatus.Absent,
        [AttendanceStatus.LateExcused]: AttendanceStatus.Absent,
    },
    NO_NEUTRAL_NO_EXCUSED: {
        [AttendanceStatus.Present]: AttendanceStatus.Absent,
        [AttendanceStatus.Late]: AttendanceStatus.Present,
        [AttendanceStatus.LateExcused]: AttendanceStatus.Present,
        [AttendanceStatus.Absent]: AttendanceStatus.Late,
        [AttendanceStatus.Excused]: AttendanceStatus.Present,
    },
    NO_LATE_NO_EXCUSED: {
        [AttendanceStatus.Neutral]: AttendanceStatus.Present,
        [AttendanceStatus.Absent]: AttendanceStatus.Present,
        [AttendanceStatus.Present]: AttendanceStatus.Absent,
        [AttendanceStatus.Excused]: AttendanceStatus.Present,
        [AttendanceStatus.Late]: AttendanceStatus.Present,
        [AttendanceStatus.LateExcused]: AttendanceStatus.Present,
    },
    NO_LATE_NO_NEUTRAL: {
        [AttendanceStatus.Present]: AttendanceStatus.Excused,
        [AttendanceStatus.Excused]: AttendanceStatus.Absent,
        [AttendanceStatus.Absent]: AttendanceStatus.Present,
        [AttendanceStatus.Late]: AttendanceStatus.Present,
        [AttendanceStatus.LateExcused]: AttendanceStatus.Present,
    },
    ONLY_PRESENT_ABSENT: {
        [AttendanceStatus.Present]: AttendanceStatus.Absent,
        [AttendanceStatus.Absent]: AttendanceStatus.Present,
        [AttendanceStatus.Late]: AttendanceStatus.Present,
        [AttendanceStatus.LateExcused]: AttendanceStatus.Present,
        [AttendanceStatus.Excused]: AttendanceStatus.Present,
    },
    ONLY_PRESENT_EXCUSED: {
        [AttendanceStatus.Present]: AttendanceStatus.Excused,
        [AttendanceStatus.Excused]: AttendanceStatus.Present,
        [AttendanceStatus.Late]: AttendanceStatus.Present,
        [AttendanceStatus.LateExcused]: AttendanceStatus.Present,
    },
};
