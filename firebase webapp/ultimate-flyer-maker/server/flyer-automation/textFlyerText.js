import { buildFlyerTextFromInput } from "./parseFlyerTextDeepSeek.js";
import { createFlyerItem } from "./models/FlyerItem.js";

const input =
  "有皮羊6.99lb，冰鲜牛尾8.99lb，猪瘦肉2.99lb，牛肉碎3.99lb，永达牛五花卷7.99lb";

(async () => {
  try {
    const blocks = await buildFlyerTextFromInput(input);

    console.log("====== RESULT ======");
    blocks.forEach((b, i) => {
      console.log(`\n#${i + 1}`);
      console.log(b.textBlock);
    });

    console.log("\n====== FLYER ITEMS ======");

    const flyerItems = blocks.map((b, i) =>
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

    console.dir(flyerItems, { depth: null });

  } catch (err) {
    console.error("TEST FAILED:", err);
  }
})();


