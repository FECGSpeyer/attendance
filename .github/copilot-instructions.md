# Attendix - AI Coding Instructions

## Project Overview

Attendix is a multi-tenant attendance tracking app for organizations (orchestras, choirs, groups). Built with **Ionic 8 + Angular 18** for cross-platform deployment (web, iOS, Android) using **Capacitor 4**. Backend is **Supabase** (PostgreSQL + Auth + Realtime).

## Architecture

### Service Layer Pattern

- **`DbService`** (`src/app/services/db.service.ts`) is the legacy facade service that aggregates all modular services via `inject()`. New code should use modular services directly.
- **Modular services** in `src/app/services/<domain>/` (e.g., `playerSvc`, `attendanceSvc`, `authSvc`) handle specific domains. Export them via `src/app/services/index.ts`.
- All services use a shared Supabase client from `src/app/services/base/supabase.ts`.

### State Management

- Uses **Angular Signals** (`WritableSignal`, `signal()`, `effect()`) for reactive state in `DbService`:
  ```typescript
  public tenant: WritableSignal<Tenant | undefined>;  // Current tenant
  public tenantUser: WritableSignal<TenantUser | undefined>;  // Current user's tenant role
  public groups: WritableSignal<Group[]>;  // Groups/instruments
  ```
- Components react to tenant changes using `effect()` blocks in constructors.

### Multi-Tenant Data Model

- All entities are scoped by `tenantId`. Always include `tenantId` in queries.
- Users can belong to multiple tenants with different `Role` values per tenant.
- Key interfaces in `src/app/utilities/interfaces.ts`: `Tenant`, `TenantUser`, `Player`, `Attendance`, `PersonAttendance`.

### Role-Based Access

Roles defined in `src/app/utilities/constants.ts`:

```typescript
Role.ADMIN; // Full access
Role.RESPONSIBLE; // Can manage attendance/players
Role.HELPER; // Limited write access
Role.PLAYER; // Self-service only
Role.PARENT; // View/manage children
Role.VIEWER; // Read-only
```

Guard pattern: `AuthGuard` protects tabs, role checks happen in components via `db.tenantUser().role`.

## Key Conventions

### Page Structure

- Pages use Ionic lifecycle (`ngOnInit` async, rarely `ionViewWillEnter`)
- Modals opened via `ModalController.create()` with `@Input()` bindings
- Toast notifications: use `Utils.showToast(message, color)` (static helper)

### Realtime Subscriptions

Pages subscribe to Supabase Realtime channels for live updates. Always unsubscribe in `ngOnDestroy`:

```typescript
private sub: RealtimeChannel;

subscribe() {
  this.sub?.unsubscribe();  // Clean up existing subscription first
  this.sub = this.db.getSupabase()
    .channel('player-changes').on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'player' },
      (event: any) => {
        if (event.new?.tenantId === this.db.tenant().id) {
          this.getPlayers();  // Refresh data on change
        }
      })
    .subscribe();
}

async ngOnDestroy() {
  await this.sub?.unsubscribe();
}
```

### Mobile/Capacitor Patterns

- Use `isPlatform('ios')` from `@ionic/angular` for platform-specific behavior
- Capacitor plugins used: `@capacitor/app` (back button), `@capacitor/network` (connectivity), `@capacitor/browser`, `@capacitor/haptics`
- Network status monitoring in `src/app/attendance/attendance/attendance.page.ts` - show toast on connection changes
- Back button handling in `src/app/app.component.ts` via `platform.backButton.subscribeWithPriority()`

### Database Patterns

```typescript
// Always use typed Supabase client
const { data, error } = await supabase
  .from("player")
  .select("*")
  .eq("tenantId", tenantId)
  .is("left", null) // Active players only
  .order("lastName");

if (error) {
  Utils.showToast("Error message", "danger");
  throw error;
}
```

### Date Handling

- Use **dayjs** for date manipulation (not native Date or date-fns for logic)
- Dates stored as ISO strings in Supabase
- Display formatting often uses `date-fns` `format()` for German locale

### Generated Types

Run to regenerate Supabase types after schema changes:

```bash
npm run genTypes
```

This updates `src/app/utilities/supabase.ts` with typed `Database` definitions.

## Development Commands

```bash
npm start          # Dev server (ng serve)
npm run build      # Production build to www/
npm run lint       # ESLint
npm run resources  # Generate app icons/splash and sync Capacitor
```

## File Organization

- **Pages**: `src/app/<feature>/<page>/` with `.page.ts`, `.page.html`, `.page.scss`, `.module.ts`
- **Shared services**: `src/app/services/<domain>/`
- **Utilities**: `src/app/utilities/` - constants, interfaces, Utils class
- **Routing**: Lazy-loaded modules via `loadChildren` in routing modules

## Environment

- Environment files generated at build time via `server.js` from `ENV_FILE` env var
- Must contain `apiUrl` and `apiKey` for Supabase connection
- Firebase hosting for production web deployment
