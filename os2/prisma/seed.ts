import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const legacyTeamX = await prisma.supplier.findFirst({ where: { name: "Team X" } });
  if (legacyTeamX) {
    try {
      await prisma.supplier.delete({ where: { id: legacyTeamX.id } });
    } catch {
      console.warn(
        `"Team X" supplier has linked records and could not be deleted automatically — remove it manually.`
      );
    }
  }

  for (let i = 1; i <= 5; i++) {
    const code = `SUPP-${String(i).padStart(4, "0")}`;
    await prisma.supplier.upsert({
      where: { code },
      update: {},
      create: {
        name: `Supplier ${i}`,
        code,
        contact: "",
        email: "",
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
