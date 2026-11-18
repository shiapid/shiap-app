CREATE TABLE "public"."bookings" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "booking_code"   text                     NOT NULL,
  "customer_id"    uuid,
  "trip_id"        text,
  "schedule_id"    uuid,
  "pax"            integer                  NOT NULL DEFAULT 1,
  "total_price"    numeric(14,2)            DEFAULT 0,
  "status"         text                     DEFAULT 'WAITING_PAYMENT'::text,
  "payment_status" text                     DEFAULT 'UNPAID'::text,
  "notes"          text,
  "created_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "bookings_booking_code_key" UNIQUE (booking_code),
  CONSTRAINT "bookings_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."bookings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."customers" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"       text                     NOT NULL,
  "phone"      text                     NOT NULL,
  "email"      text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "customers_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."customers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."trip_schedules" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "trip_id"    text                     NOT NULL,
  "date"       date                     NOT NULL,
  "capacity"   integer                  NOT NULL DEFAULT 1,
  "booked"     integer                  NOT NULL DEFAULT 0,
  "status"     text                     DEFAULT 'OPEN'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "trip_schedules_pkey" PRIMARY KEY (id),
  CONSTRAINT "trip_schedules_trip_id_date_key" UNIQUE (trip_id, date)
);

ALTER TABLE "public"."trip_schedules"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."trips" (
  "id"                text                     NOT NULL,
  "name"              text                     NOT NULL,
  "type"              text                     DEFAULT 'PRIVATE'::text,
  "description"       text,
  "short_description" text,
  "price"             numeric(14,2)            DEFAULT 0,
  "capacity"          integer                  DEFAULT 1,
  "duration"          text,
  "image_url"         text,
  "status"            text                     DEFAULT 'ACTIVE'::text,
  "created_at"        timestamp with time zone DEFAULT now(),
  CONSTRAINT "trips_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."trips"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bookings"
  ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id);

ALTER TABLE "public"."bookings"
  ADD CONSTRAINT "bookings_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES public.trip_schedules(id);

ALTER TABLE "public"."bookings"
  ADD CONSTRAINT "bookings_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES public.trips(id);

ALTER TABLE "public"."trip_schedules"
  ADD CONSTRAINT "trip_schedules_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

CREATE INDEX idx_bookings_schedule ON public.bookings USING btree (schedule_id);

CREATE INDEX idx_trip_schedules_trip_date ON public.trip_schedules USING btree (trip_id, date);

CREATE POLICY "public read open schedules" ON "public"."trip_schedules"
  FOR SELECT
  TO PUBLIC
  USING ((status = 'OPEN'::text));

CREATE POLICY "public read active trips" ON "public"."trips"
  FOR SELECT
  TO PUBLIC
  USING ((status = 'ACTIVE'::text));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bookings" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."bookings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bookings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bookings" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customers" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."customers" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customers" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customers" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."trip_schedules" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."trip_schedules" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."trip_schedules" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."trip_schedules" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."trips" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."trips" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."trips" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."trips" TO "service_role";

