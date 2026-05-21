-- CreateTable
CREATE TABLE "direct_message_attachments" (
    "id" UUID NOT NULL,
    "direct_message_id" UUID NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,

    CONSTRAINT "direct_message_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "direct_message_attachments" ADD CONSTRAINT "direct_message_attachments_direct_message_id_fkey" FOREIGN KEY ("direct_message_id") REFERENCES "direct_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
