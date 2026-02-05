/**
 * Utils Unit Tests
 *
 * This file demonstrates how to write unit tests for utility functions
 * using Vitest. It tests pure functions without complex dependencies.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Utils } from './Utils';
import { AttendanceStatus } from './constants';
import { Attendance, AttendanceType, Group, PersonAttendance, Player } from './interfaces';
import dayjs from 'dayjs';

describe('Utils', () => {
    describe('getId', () => {
        it('should return a number', () => {
            const id = Utils.getId();
            expect(typeof id).toBe('number');
        });

        it('should return a number in the expected range', () => {
            const id = Utils.getId();
            expect(id).toBeGreaterThanOrEqual(1000000000);
            expect(id).toBeLessThanOrEqual(999999999999);
        });

        it('should return different values on consecutive calls', () => {
            const id1 = Utils.getId();
            const id2 = Utils.getId();
            expect(id1).not.toBe(id2);
        });
    });

    describe('getPercentage', () => {
        it('should return 0 for empty array', () => {
            const result = Utils.getPercentage([]);
            expect(result).toBe(0);
        });

        it('should return 100 when all are present', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.Present },
                { status: AttendanceStatus.Present },
                { status: AttendanceStatus.Present },
            ];
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(100);
        });

        it('should return 0 when all are absent', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.Absent },
                { status: AttendanceStatus.Absent },
            ];
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(0);
        });

        it('should count Late as present', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.Late },
                { status: AttendanceStatus.Absent },
            ];
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(50);
        });

        it('should count LateExcused as present', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.LateExcused },
                { status: AttendanceStatus.Absent },
            ];
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(50);
        });

        it('should not count Excused as present', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.Present },
                { status: AttendanceStatus.Excused },
            ];
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(50);
        });

        it('should round the percentage', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.Present },
                { status: AttendanceStatus.Present },
                { status: AttendanceStatus.Absent },
            ];
            // 2/3 = 66.666...% should round to 67
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(67);
        });
    });

    describe('getClefText', () => {
        it('should return correct text for bass clef', () => {
            const result = Utils.getClefText('f');
            expect(result).toBe('Bassschlüssel');
        });

        it('should return correct text for treble clef', () => {
            const result = Utils.getClefText('g');
            expect(result).toBe('Violinschlüssel');
        });

        it('should return correct text for alto clef', () => {
            const result = Utils.getClefText('c');
            expect(result).toBe('Altschlüssel');
        });
    });

    describe('getModifiedPlayersForList - lateCount calculation', () => {
        const createMockPlayer = (id: number, personAttendances: Partial<PersonAttendance>[] = [], lastSolve?: string): Partial<Player> => ({
            id,
            firstName: `Player${id}`,
            lastName: `Test${id}`,
            instrument: 1,
            joined: '2020-01-01',
            lastSolve,
            person_attendances: personAttendances as PersonAttendance[],
        });

        const createMockAttendance = (id: number, date: string): Partial<Attendance> => ({
            id,
            date,
            type_id: 'general',
        });

        const createMockPersonAttendance = (attendanceId: number, status: AttendanceStatus): Partial<PersonAttendance> => ({
            id: `pa-${attendanceId}`,
            attendance_id: attendanceId,
            status,
        });

        const mockGroups: Group[] = [{ id: 1, name: 'Violin', tenantId: 1 } as Group];
        const mockTypes: AttendanceType[] = [{ id: 'general', name: 'Probe', include_in_average: true } as AttendanceType];

        it('should count unexcused late arrivals (AttendanceStatus.Late)', () => {
            const attendances: Attendance[] = [
                createMockAttendance(1, dayjs().subtract(1, 'day').format('YYYY-MM-DD')),
                createMockAttendance(2, dayjs().subtract(2, 'day').format('YYYY-MM-DD')),
                createMockAttendance(3, dayjs().subtract(3, 'day').format('YYYY-MM-DD')),
            ] as Attendance[];

            const players: Player[] = [
                createMockPlayer(1, [
                    createMockPersonAttendance(1, AttendanceStatus.Late),
                    createMockPersonAttendance(2, AttendanceStatus.Late),
                    createMockPersonAttendance(3, AttendanceStatus.Present),
                ]),
            ] as Player[];

            const result = Utils.getModifiedPlayersForList(players, mockGroups, attendances, mockTypes);
            expect(result[0].lateCount).toBe(2);
        });

        it('should NOT count excused late arrivals (AttendanceStatus.LateExcused)', () => {
            const attendances: Attendance[] = [
                createMockAttendance(1, dayjs().subtract(1, 'day').format('YYYY-MM-DD')),
                createMockAttendance(2, dayjs().subtract(2, 'day').format('YYYY-MM-DD')),
            ] as Attendance[];

            const players: Player[] = [
                createMockPlayer(1, [
                    createMockPersonAttendance(1, AttendanceStatus.Late),
                    createMockPersonAttendance(2, AttendanceStatus.LateExcused),
                ]),
            ] as Player[];

            const result = Utils.getModifiedPlayersForList(players, mockGroups, attendances, mockTypes);
            expect(result[0].lateCount).toBe(1);
        });

        it('should only count late arrivals after lastSolve date', () => {
            const lastSolveDate = dayjs().subtract(5, 'day').toISOString();

            const attendances: Attendance[] = [
                createMockAttendance(1, dayjs().subtract(1, 'day').format('YYYY-MM-DD')),  // After lastSolve
                createMockAttendance(2, dayjs().subtract(3, 'day').format('YYYY-MM-DD')),  // After lastSolve
                createMockAttendance(3, dayjs().subtract(10, 'day').format('YYYY-MM-DD')), // Before lastSolve
            ] as Attendance[];

            const players: Player[] = [
                createMockPlayer(1, [
                    createMockPersonAttendance(1, AttendanceStatus.Late),
                    createMockPersonAttendance(2, AttendanceStatus.Late),
                    createMockPersonAttendance(3, AttendanceStatus.Late), // Should be excluded
                ], lastSolveDate),
            ] as Player[];

            const result = Utils.getModifiedPlayersForList(players, mockGroups, attendances, mockTypes);
            expect(result[0].lateCount).toBe(2);
        });

        it('should count all late arrivals when lastSolve is not set', () => {
            const attendances: Attendance[] = [
                createMockAttendance(1, dayjs().subtract(1, 'day').format('YYYY-MM-DD')),
                createMockAttendance(2, dayjs().subtract(30, 'day').format('YYYY-MM-DD')),
                createMockAttendance(3, dayjs().subtract(60, 'day').format('YYYY-MM-DD')),
            ] as Attendance[];

            const players: Player[] = [
                createMockPlayer(1, [
                    createMockPersonAttendance(1, AttendanceStatus.Late),
                    createMockPersonAttendance(2, AttendanceStatus.Late),
                    createMockPersonAttendance(3, AttendanceStatus.Late),
                ], undefined), // No lastSolve
            ] as Player[];

            const result = Utils.getModifiedPlayersForList(players, mockGroups, attendances, mockTypes);
            expect(result[0].lateCount).toBe(3);
        });

        it('should return 0 when player has no late arrivals', () => {
            const attendances: Attendance[] = [
                createMockAttendance(1, dayjs().subtract(1, 'day').format('YYYY-MM-DD')),
                createMockAttendance(2, dayjs().subtract(2, 'day').format('YYYY-MM-DD')),
            ] as Attendance[];

            const players: Player[] = [
                createMockPlayer(1, [
                    createMockPersonAttendance(1, AttendanceStatus.Present),
                    createMockPersonAttendance(2, AttendanceStatus.Excused),
                ]),
            ] as Player[];

            const result = Utils.getModifiedPlayersForList(players, mockGroups, attendances, mockTypes);
            expect(result[0].lateCount).toBe(0);
        });

        it('should return 0 when player has no attendances', () => {
            const players: Player[] = [
                createMockPlayer(1, []),
            ] as Player[];

            const result = Utils.getModifiedPlayersForList(players, mockGroups, [], mockTypes);
            expect(result[0].lateCount).toBe(0);
        });

        it('should reset count to 0 after lastSolve is set to recent date', () => {
            // Simulate user clicking "Gespräch geführt" button
            const lastSolveDate = dayjs().toISOString(); // Just now

            const attendances: Attendance[] = [
                createMockAttendance(1, dayjs().subtract(1, 'day').format('YYYY-MM-DD')),
                createMockAttendance(2, dayjs().subtract(2, 'day').format('YYYY-MM-DD')),
                createMockAttendance(3, dayjs().subtract(3, 'day').format('YYYY-MM-DD')),
            ] as Attendance[];

            const players: Player[] = [
                createMockPlayer(1, [
                    createMockPersonAttendance(1, AttendanceStatus.Late),
                    createMockPersonAttendance(2, AttendanceStatus.Late),
                    createMockPersonAttendance(3, AttendanceStatus.Late),
                ], lastSolveDate), // All before lastSolve
            ] as Player[];

            const result = Utils.getModifiedPlayersForList(players, mockGroups, attendances, mockTypes);
            expect(result[0].lateCount).toBe(0);
        });
    });
});
