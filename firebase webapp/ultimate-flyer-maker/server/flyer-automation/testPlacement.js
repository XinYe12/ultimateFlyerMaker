import { placeItems } from "./layout/placeItems.js";
import { buildFlyerTextFromInput } from "./parseFlyerTextDeepSeek.js";
import { createFlyerItem } from "./models/FlyerItem.js";

const input =
  "有皮羊6.99lb，冰鲜牛尾8.99lb，猪瘦肉2.99lb，牛肉碎3.99lb，永达牛五花卷7.99lb";

(async () => {
  const blocks = await buildFlyerTextFromInput(input);

  const items = blocks.map((b, i) =>
    createFlyerItem({
      id: `meat-${i + 1}`,
      enTitle: b.enTitle,
      cnTitle: b.cnTitle,
      priceValue: Number(b.priceLine.match(/\$(\d+\.\d+)/)[1]),
      unit: "LB",
      category: "Meat",
      sourceText: b.cnTitle
    })
  );

  // Example: make bottles MEDIUM
  items[4].layout.size = "MEDIUM";

  const placements = placeItems(items, {
    columns: 4,
    maxItems: 16
  });

  console.log("\n====== PLACEMENTS ======");
  console.dir(placements, { depth: null });
})();
