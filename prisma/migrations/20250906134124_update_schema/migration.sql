/*
  Warnings:

  - A unique constraint covering the columns `[sku]` on the table `Inventory` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."InventoryMoveType" AS ENUM ('IN', 'OUT', 'ADJUST');

-- AlterTable
ALTER TABLE "public"."Inventory" ADD COLUMN     "minThreshold" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "unit" TEXT,
ALTER COLUMN "quantity" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."InventoryMovement" (
    "id" SERIAL NOT NULL,
    "inventoryId" INTEGER NOT NULL,
    "type" "public"."InventoryMoveType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_sku_key" ON "public"."Inventory"("sku");

-- AddForeignKey
ALTER TABLE "public"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "public"."Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
