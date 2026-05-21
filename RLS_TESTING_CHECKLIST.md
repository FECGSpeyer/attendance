# RLS Testing Checklist - PRODUCTION CRITICAL

## ⚠️ Test in Development First!
Apply this SQL to a development/staging database before production. Test all scenarios thoroughly.

## Pre-Deployment Verification

### 1. Service Role Operations (Edge Functions)
Test all Edge Functions after enabling RLS:

- [ ] **evaluate-critical-rules** - Verify player.isCritical updates work
  - Run function manually, check player records are updated
  - Verify no "insufficient privileges" errors in logs

- [ ] **send-push** (send-photo) - Verify device_tokens cleanup works
  - Send test push, verify invalid tokens are deleted
  - Check device_tokens table for cleanup

- [ ] **send-checklist-reminders** - Verify attendance.checklist updates
  - Trigger reminder, check attendance.checklist field updated
  - Verify reminders sent successfully

- [ ] **send-attendance-reminders** - Read-only, should work fine
  - Trigger reminder, verify notifications sent

- [ ] **send-ad-hoc-reminder** - Read-only, should work fine
  - Send ad-hoc reminder, verify delivery

- [ ] **quick-processor** - Read-only, should work fine
  - Verify background processing continues

### 2. Self-Service Operations

#### Player Self-Service:
- [ ] **Update own profile** (ProfileService.updateProfile)
  - Login as PLAYER
  - Navigate to profile page
  - Update name/email/phone
  - Verify update succeeds
  - Verify cannot update OTHER players

- [ ] **Sign In/Out** (SignInOutService)
  - Login as PLAYER
  - View attendance list
  - Sign in to an attendance
  - Sign out from an attendance
  - Verify status updates in person_attendances
  - Verify cannot modify OTHER players' attendance

#### Parent Self-Service:
- [ ] **View children** (Player records with parent_id)
  - Login as PARENT
  - Verify can see linked children in player list
  - Verify cannot see OTHER parents' children

- [ ] **Update child attendance**
  - Login as PARENT
  - View child's attendance
  - Update child's attendance status
  - Verify update succeeds
  - Verify cannot update OTHER children's attendance

#### User Settings:
- [ ] **Favorite tenant** (DbService.setFavoriteTenant)
  - Login as any user
  - Toggle favorite on a tenant
  - Verify tenantUsers.favorite updates
  - Verify cannot modify other users' favorites

- [ ] **Notification settings** (NotificationService)
  - Login as any user
  - Update notification preferences
  - Verify notifications table INSERT/UPDATE works
  - Verify cannot see other users' settings

### 3. Public Access

#### Song Sharing:
- [ ] **View shared songs** (Anonymous)
  - Open browser in incognito mode
  - Navigate to `/{song_sharing_id}`
  - Verify songs load
  - Verify song categories load
  - Verify tenant info loads
  - Verify cannot access songs from OTHER tenants without song_sharing_id

#### Public Registration:
- [ ] **Self-register** (Anonymous)
  - Open browser in incognito mode
  - Navigate to `/register/{register_id}`
  - Verify tenant info loads
  - Verify instrument list loads
  - Verify churches list loads
  - Fill registration form
  - Submit
  - Verify player INSERT succeeds
  - Verify cannot register to OTHER tenants without register_id

### 4. Admin Operations

- [ ] **Create attendance** (AttendanceService.addAttendance)
  - Login as ADMIN
  - Create new attendance
  - Verify INSERT succeeds

- [ ] **Update attendance** (AttendanceService.updateAttendance)
  - Login as ADMIN
  - Edit attendance details
  - Verify UPDATE succeeds

- [ ] **Delete attendance** (AttendanceService.removeAttendance)
  - Login as ADMIN
  - Delete test attendance
  - Verify DELETE succeeds

- [ ] **Manage players** (PlayerService)
  - Login as ADMIN
  - Add new player
  - Update player details
  - Archive player
  - Restore player
  - Verify all operations succeed

- [ ] **Manage instruments** (GroupService)
  - Login as ADMIN
  - Add instrument
  - Update instrument
  - Delete instrument
  - Verify all operations succeed

- [ ] **Manage songs** (SongService)
  - Login as ADMIN
  - Add song
  - Upload song file
  - Update song details
  - Delete song file
  - Delete song
  - Verify all operations succeed

- [ ] **Manage users** (TenantService)
  - Login as ADMIN
  - Add user to tenant
  - Change user role
  - Remove user from tenant
  - Verify all operations succeed

- [ ] **Update tenant settings** (TenantService)
  - Login as ADMIN
  - Update tenant configuration
  - Verify UPDATE succeeds

### 5. Cross-Tenant Isolation

- [ ] **Tenant A cannot access Tenant B data**
  - Login as user in Tenant A
  - Try to access data from Tenant B directly
  - Verify query returns 0 rows (not error)
  - Test with: player, attendance, songs, instruments

- [ ] **User with multiple tenants**
  - Login as user in Tenant A and B
  - Switch between tenants
  - Verify data correctly filtered by selected tenant

### 6. Role-Based Access

- [ ] **VIEWER role** (read-only)
  - Login as VIEWER
  - Verify can read data
  - Try to create/update/delete
  - Verify operations fail gracefully

- [ ] **PLAYER role**
  - Login as PLAYER
  - Verify can read data
  - Verify can update own records only
  - Try to update other players
  - Verify fails gracefully

- [ ] **HELPER role**
  - Login as HELPER
  - Verify appropriate access based on tenant_role_permissions

- [ ] **PARENT role**
  - Login as PARENT
  - Verify can only see own children
  - Verify can update children's attendance

### 7. Error Handling

- [ ] **Check browser console** for:
  - No 401/403 errors on normal operations
  - Graceful error messages on unauthorized operations

- [ ] **Check Supabase logs** for:
  - No "policy does not exist" errors
  - No "insufficient privileges" errors from Edge Functions

### 8. Performance

- [ ] **Query performance**
  - Check slow query log in Supabase
  - Verify RLS policies don't cause significant slowdown
  - Test with large datasets (1000+ players, 100+ attendances)

## Rollback Plan

If issues are discovered after deployment:

```sql
-- Emergency RLS disable (per table)
ALTER TABLE <table_name> DISABLE ROW LEVEL SECURITY;
```

## Success Criteria

✅ All self-service operations work
✅ All admin operations work
✅ Public access works (songs, registration)
✅ Edge Functions work (no errors in logs)
✅ Cross-tenant isolation verified
✅ No unauthorized data access possible
✅ No performance degradation

## Post-Deployment Monitoring

- [ ] Monitor Supabase error logs for 24 hours
- [ ] Check Edge Function execution logs
- [ ] Review user-reported issues
- [ ] Monitor query performance metrics

## Estimated Test Time

- Full manual testing: 2-3 hours
- Edge Function testing: 30 minutes
- Performance testing: 30 minutes
- **Total: 3-4 hours**

## Notes

- Test with REAL user accounts (different roles)
- Test in INCOGNITO mode for public access
- Use multiple browsers for multi-tenant testing
- Keep production database backup before applying RLS
