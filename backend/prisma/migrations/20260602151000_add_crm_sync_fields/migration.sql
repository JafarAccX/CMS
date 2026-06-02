-- Add stable CRM identity fields for idempotent admin sync.
ALTER TABLE "users" ADD COLUMN "crm_customer_id" TEXT;
ALTER TABLE "users" ADD COLUMN "crm_mentor_id" TEXT;

ALTER TABLE "batches" ADD COLUMN "crm_batch_id" TEXT;
ALTER TABLE "batches" ADD COLUMN "crm_course" TEXT;
ALTER TABLE "batches" ADD COLUMN "crm_course_id" TEXT;
ALTER TABLE "batches" ADD COLUMN "crm_start_date" TIMESTAMP(3);
ALTER TABLE "batches" ADD COLUMN "crm_end_date" TIMESTAMP(3);
ALTER TABLE "batches" ADD COLUMN "crm_active" BOOLEAN;
ALTER TABLE "batches" ADD COLUMN "crm_deleted" BOOLEAN;
ALTER TABLE "batches" ADD COLUMN "crm_batch_type" TEXT;
ALTER TABLE "batches" ADD COLUMN "crm_image" TEXT;
ALTER TABLE "batches" ADD COLUMN "crm_last_synced_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_crm_customer_id_key" ON "users"("crm_customer_id");
CREATE UNIQUE INDEX "users_crm_mentor_id_key" ON "users"("crm_mentor_id");
CREATE UNIQUE INDEX "batches_crm_batch_id_key" ON "batches"("crm_batch_id");
