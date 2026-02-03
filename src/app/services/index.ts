// Base
export { supabase, attendanceSelect, getSupabase } from './base/supabase';

// Services
export { AuthService } from './auth/auth.service';
export { PlayerService } from './player/player.service';
export { AttendanceService } from './attendance/attendance.service';
export { SongService } from './song/song.service';
export { TenantService } from './tenant/tenant.service';
export { HistoryService } from './history/history.service';
export { GroupService } from './group/group.service';
export { MeetingService } from './meeting/meeting.service';
export { NotificationService } from './notification/notification.service';
export { ImageService } from './image/image.service';
export { ShiftService } from './shift/shift.service';
export { AttendanceTypeService } from './attendance-type/attendance-type.service';
export { OrganisationService } from './organisation/organisation.service';
export { ChurchService } from './church/church.service';
export { FeedbackService } from './feedback/feedback.service';
export { HolidayService } from './holiday/holiday.service';
export { CrossTenantService } from './cross-tenant/cross-tenant.service';
export { AdminService } from './admin/admin.service';
export { HandoverService } from './handover/handover.service';
export { GroupCategoryService } from './group-category/group-category.service';
export { InstanceService } from './instance/instance.service';
export { ProfileService } from './profile/profile.service';
export { UserRegistrationService } from './user-registration/user-registration.service';
export { ViewerParentService } from './viewer-parent/viewer-parent.service';
export { ConductorService } from './conductor/conductor.service';
export { TeacherService } from './teacher/teacher.service';
export { TelegramService } from './telegram/telegram.service';
export { SignInOutService } from './sign-in-out/sign-in-out.service';
export { SongCategoryService } from './song-category/song-category.service';

// Main facade service (backwards compatibility)
export { DbService } from './db.service';
