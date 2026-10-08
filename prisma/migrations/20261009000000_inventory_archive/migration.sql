-- Items are archived, never deleted, so their movement history stays.
ALTER TABLE "public"."Inventory" ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "public"."InventoryMovement" DROP CONSTRAINT "InventoryMovement_inventoryId_fkey";
ALTER TABLE "public"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "public"."Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An archived item's sku must not block a new item. Prisma 6 cannot express a partial index, so schema.prisma drops @unique on sku.
DROP INDEX "public"."Inventory_sku_key";
CREATE UNIQUE INDEX "Inventory_sku_key" ON "public"."Inventory"("sku") WHERE "archivedAt" IS NULL;
