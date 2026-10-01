-- ============================================================
-- Team Organization: agenda_items, agenda_item_attendances,
-- protocols, tasks + extend attendance_types and notifications
-- ============================================================

-- 1. extend attendance_types
ALTER TABLE attendance_types
  ADD COLUMN IF NOT EXISTS enable_protocol BOOLEAN NOT NULL DEFAULT false;

-- 2. extend notifications (opt-out flag for task reminders)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS tasks BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- 3. agenda_items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agenda_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title                text NOT NULL,
  description          text,
  status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'completed', 'postponed')),
  priority             text NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low', 'medium', 'high')),
  responsible_person_id integer REFERENCES player(id) ON DELETE SET NULL,
  due_date             date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.agenda_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read agenda items"
  ON public.agenda_items FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins can insert agenda items"
  ON public.agenda_items FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND role IN (1, 5)
    )
  );

CREATE POLICY "admins can update agenda items"
  ON public.agenda_items FOR UPDATE
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND role IN (1, 5)
    )
  );

CREATE POLICY "admins can delete agenda items"
  ON public.agenda_items FOR DELETE
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND role IN (1, 5)
    )
  );

-- ============================================================
-- 4. agenda_item_attendances (junction — no data copying)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agenda_item_attendances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id  uuid NOT NULL REFERENCES public.agenda_items(id) ON DELETE CASCADE,
  attendance_id   bigint NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agenda_item_id, attendance_id)
);

ALTER TABLE public.agenda_item_attendances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read agenda item attendances"
  ON public.agenda_item_attendances FOR SELECT
  USING (
    agenda_item_id IN (
      SELECT id FROM public.agenda_items
      WHERE tenant_id IN (
        SELECT "tenantId" FROM "tenantUsers"
        WHERE "userId" = auth.uid()::text
      )
    )
  );

CREATE POLICY "admins can insert agenda item attendances"
  ON public.agenda_item_attendances FOR INSERT
  WITH CHECK (
    agenda_item_id IN (
      SELECT id FROM public.agenda_items
      WHERE tenant_id IN (
        SELECT "tenantId" FROM "tenantUsers"
        WHERE "userId" = auth.uid()::text
          AND role IN (1, 5)
      )
    )
  );

CREATE POLICY "admins can delete agenda item attendances"
  ON public.agenda_item_attendances FOR DELETE
  USING (
    agenda_item_id IN (
      SELECT id FROM public.agenda_items
      WHERE tenant_id IN (
        SELECT "tenantId" FROM "tenantUsers"
        WHERE "userId" = auth.uid()::text
          AND role IN (1, 5)
      )
    )
  );

-- ============================================================
-- 5. protocols (max one per attendance)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.protocols (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id bigint NOT NULL UNIQUE REFERENCES attendance(id) ON DELETE CASCADE,
  content       jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  tenant_id     integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
);

ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read protocols"
  ON public.protocols FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins can insert protocols"
  ON public.protocols FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND role IN (1, 5)
    )
  );

CREATE POLICY "admins can update protocols"
  ON public.protocols FOR UPDATE
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND role IN (1, 5)
    )
  );

CREATE POLICY "admins can delete protocols"
  ON public.protocols FOR DELETE
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND role IN (1, 5)
    )
  );

-- ============================================================
-- 6. tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  description           text,
  responsible_person_id integer REFERENCES player(id) ON DELETE SET NULL,
  priority              text NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low', 'medium', 'high')),
  due_date              date,
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'in_progress', 'completed')),
  agenda_item_id        uuid REFERENCES public.agenda_items(id) ON DELETE SET NULL,
  protocol_id           uuid REFERENCES public.protocols(id) ON DELETE SET NULL,
  attendance_id         bigint REFERENCES attendance(id) ON DELETE SET NULL,
  reminder_sent         boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_tenant_due_idx
  ON public.tasks (tenant_id, due_date, status);

CREATE INDEX IF NOT EXISTS tasks_responsible_idx
  ON public.tasks (responsible_person_id, status);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read tasks"
  ON public.tasks FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins can insert tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND role IN (1, 5)
    )
  );

CREATE POLICY "admins can update tasks"
  ON public.tasks FOR UPDATE
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND role IN (1, 5)
    )
  );

CREATE POLICY "admins can delete tasks"
  ON public.tasks FOR DELETE
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND role IN (1, 5)
    )
  );
