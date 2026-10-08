-- DropForeignKey
ALTER TABLE "public"."InventoryMovement" DROP CONSTRAINT "InventoryMovement_inventoryId_fkey";

-- AddForeignKey
ALTER TABLE "public"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "public"."Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
