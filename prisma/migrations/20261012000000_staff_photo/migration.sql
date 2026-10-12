CREATE TABLE "public"."StaffPhoto" (
    "staffId" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPhoto_pkey" PRIMARY KEY ("staffId")
);

ALTER TABLE "public"."StaffPhoto" ADD CONSTRAINT "StaffPhoto_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
