// generate_london_xlsx.mjs
// Run: node apps/desktop/generate_london_xlsx.mjs
// Generates screenshots/weekly-london-input.xlsx from the London Adelaide flyer (May 15–21, 2026).
//
// Column layout: # | EN | ZH | Size | Sale | Reg | Mon | Tue | Wed | Thu | Fri | Sat | Sun
// Same format as the system's exportExampleXlsx.js / parseDiscountXlsx.js.

import ExcelJS from "exceljs";
import JSZip from "jszip";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../../screenshots/weekly-london-input.xlsx");

// ── Data ──────────────────────────────────────────────────────────────────────
// [EN, ZH, size, sale, reg, mon, tue, wed, thu, fri, sat, sun]
// Day order matches flyer week: Mon May 18 … Sun May 17 (Fri=first day of flyer)
// "3 DAYS ONLY" items: Fri/Sat/Sun (May 15–17) marked true based on flyer banner.

const DATA = [
  {
    dept: "Grocery",
    items: [
      ["Orion Turtle Chips Series",                    "好丽友乌龟薯片系列",   "166g",     "4.99",    "5.99",  false, false, false, false, false, false, false],
      ["Samyang Korean Corn Tea",                      "三养玉米茶",           "150T",     "14.99",   "17.29", false, false, false, false, false, false, false],
      ["Dongwuk Brown Rice Snack Tea",                 "东屋糙米茶",           "60T",      "4.99",    "6.39",  false, false, false, false, false, false, false],
      ["Singapore Milk Drink Sets",                    "新加坡牛奶套装",       "6*200ml",  "2/7.59",  "8.29",  false, false, false, false, false, false, false],
      ["Royal Mahjong Organic Rice",                   "皇家有机糙米",         "2kg",      "19.99",   "22.99", false, false, false, false, false, false, false],
      ["Mr Greades Canola Oil",                        "芥花籽油",             "3L",       "8.99",    "11.99", false, false, false, false, false, false, false],
      ["Nandamont Growise Roasted Fish Fillet Series", "烤鱼片系列",           "40g",      "4.99",    "8.99",  false, false, false, false, false, false, false],
      ["WangZiHe Cooking Drink Series",                "王子和烹饪饮料系列",   "500ml",    "2/2.99",  "2.99",  false, false, false, false, false, false, false],
      ["M.Y. San Sky Flakes Crackers",                 "天空薄饼",             "330g",     "5.99",    "7.99",  false, false, false, false, false, false, false],
      ["Grace Condensed Whitener",                     "甜炼奶精",             "370g",     "3/3.59",  "1.94",  false, false, false, false, false, false, false],
      ["Badpath Granulated Sugar",                     "白砂糖",               "2kg",      "2/5.99",  "3.99",  false, false, false, false, false, false, false],
      ["Vita Malt Drink Classic Flavor & Bottle",      "麦芽饮料经典款",       "330ml",    "6.99",    "9.99",  false, false, false, false, false, false, false],
      ["Welaka ADA Calcium Milk Drink",                "牛奶饮料",             "4*250ml",  "3.59",    "4.99",  false, false, false, false, false, false, false],
      ["Squid Brand Fish Sauce",                       "鱿鱼牌鱼露",           "725ml",    "2/4.99",  "3.49",  false, false, false, false, false, false, false],
      ["Heritage Delicious Dried Shiitake Mushroom",   "干香菇",               "200g",     "7.99",    "9.99",  false, false, false, false, false, false, false],
      ["Desi Urid Split",                              "去皮黑豆仁",           "500g",     "2/5.99",  "3.99",  false, false, false, false, false, false, false],
      ["Dae Yeong Bamboo Shoot",                       "大荣竹笋",             "540ml",    "2/4.99",  "3.49",  false, false, false, false, false, false, false],
      ["Seka Pinakurat Spiced Coconut Vinegar",        "椰子香醋",             "500ml",    "5.99",    "7.99",  false, false, false, false, false, false, false],
      ["Ajinomoto Crispy Fry Breading Mix",            "味之素脆炸粉",         "225g",     "2.99",    "4.99",  false, false, false, false, false, false, false],
      ["YMY Rice Vermicelli Fine",                     "细米粉",               "500g",     "2.59",    "4.99",  false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Meat",
    items: [
      ["Beef Flank Hot Pot Slices Roll",  "牛肋火锅肉卷",   "/EA",  "5.99",  "7.99",  false, false, false, false, false, false, false],
      ["Fresh Beef Flank",                "新鲜牛腩",       "/LB",  "6.88",  "8.99",  false, false, false, false, false, false, false],
      ["Fresh Boneless Beef Shank Chunks","新鲜无骨牛腱",   "/LB",  "6.99",  "8.99",  false, false, false, false, false, false, false],
      ["Fresh Pork Chops",                "新鲜猪排",       "/LB",  "2.59",  "3.99",  false, false, false, false, false, false, false],
      ["Fresh Pork Back Picnic Sliced",   "新鲜猪背肉片",   "/LB",  "2.39",  "3.99",  false, false, false, false, false, false, false],
      ["Frozen Skin-on Goat",             "带皮冷冻山羊",   "/LB",  "8.88",  "10.99", false, false, false, false, false, false, false],
      ["Frozen Ox Tail",                  "冷冻牛尾",       "/LB",  "8.99",  "11.99", false, false, false, false, false, false, false],
      ["CBC Beef Brisket Sliced After",   "牛胸腩片",       "/EA",  "7.99",  "14.99", false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Frozen",
    items: [
      ["Jeju Salmon Salted Mackerel",                         "济州岛腌制鲭鱼",   "5*100g",  "11.99",   "13.99", false, false, false, false, false, false, false],
      ["Puimsome Corn Dogs Series",                           "玉米热狗系列",     "400g",    "8.99",    "11.99", false, false, false, false, false, false, false],
      ["Chilhak Spicy Cold Noodle",                           "七鹤辣味冷面",     "1kg",     "4.99",    "5.99",  false, false, false, false, false, false, false],
      ["Yongpyong Fish-shaped Bread Series",                  "鱼形面包系列",     "1kg",     "14.99",   "16.99", false, false, false, false, false, false, false],
      ["Younggifted Frozen Slice Cake Brown Sugar Flavor",    "冷冻棕糖蛋糕片",   "765g",    "3/3.99",  "2.19",  false, false, false, false, false, false, false],
      ["Thai Gold Head-On Shrimp 40/50",                      "泰国带头虾40/50",  "400g",    "6.99",    "9.99",  false, false, false, false, false, false, false],
      ["Gay Lea Butter Series",                               "盖利黄油系列",     "454g",    "7.59",    "9.99",  false, false, false, false, false, false, false],
      ["La Fe Cassava Manioc Yuca",                           "木薯",             "2.27lb",  "9.99",    "12.99", false, false, false, false, false, false, false],
      ["Frozen Ahi Tuna Steaks",                              "冷冻金枪鱼排",     "900g",    "6.99",    "8.99",  false, false, false, false, false, false, false],
      ["Supreme Fish Small Yellow Croaker Fillet",            "小黄鱼片",         "400g",    "3.99",    "5.99",  false, false, false, false, false, false, false],
      ["Bulacan Kikiam Fish Balls",                           "布拉干鱼豆腐",     "140g",    "5.99",    "8.99",  false, false, false, false, false, false, false],
      ["Y&B Sesame",                                          "芝麻",             "10*35g",  "2/4.99",  "3.99",  false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Seafood",
    items: [
      // 3 DAYS ONLY (Fri May 15, Sat May 16, Sun May 17)
      ["Fresh Smelt Fish",  "胡瓜鱼",  "/LB",  "6.99",  "2.99",  false, false, false, false, true, true, true],
    ],
  },
  {
    dept: "Produce",
    items: [
      // Fruit
      ["USA Royal Gala Apple",       "美国皇家嘎啦苹果",  "/LB",   "1.58",   "2.59",  false, false, false, false, true, true, true],  // 3 Days Only: Fri–Sun
      ["Mexico Cantaloupe",          "墨西哥哈密瓜",      "each",  "2/5.00", "3.99",  false, false, false, false, false, false, false],
      ["Vietnam White Dragon Fruit", "越南白火龙果",      "/LB",   "1.99",   "2.99",  false, false, false, false, true, true, true],   // 3 Days Only: Fri–Sun
      ["Vietnam Loonggan 2kg",       "越南龙眼",          "2kg",   "9.99",   "11.99", false, false, false, false, true, true, true],   // 3 Days Only: Fri–Sun
      ["Chinese Ya Pear",            "中国鸭梨",          "/LB",   "0.88",   "1.35",  false, false, false, false, false, false, false],
      ["Narcissus Mango",            "水仙芒果",          "/LB",   "1.68",   "3.99",  false, false, false, false, false, false, false],
      // Vegetables
      ["Fresh Naiyo Bokchoy Mia",    "新鲜小白菜",        "/LB",   "1.88",   "2.99",  false, false, false, false, false, false, false],
      ["Purple Daikon Radish",       "紫萝卜",            "/LB",   "0.88",   "1.99",  false, false, false, false, false, false, false],
      ["Taiwan Black Bamboo Shoot",  "台湾黑竹笋",        "/LB",   "4.88",   "5.99",  false, false, false, false, false, false, false],
      ["Snow Bean",                  "雪豆",              "/LB",   "3.88",   "4.99",  false, false, false, false, false, false, false],
      ["Green Papaya",               "青木瓜",            "/LB",   "1.68",   "2.99",  false, false, false, false, false, false, false],
      ["Winter Melon Cut",           "冬瓜",              "/LB",   "1.39",   "1.99",  false, false, false, false, false, false, false],
      ["A Choy",                     "A菜",               "/LB",   "1.88",   "2.99",  false, false, false, false, false, false, false],
      ["Enoki Mushrooms",            "金针菇",            "200g",  "2/2.48", "1.99",  false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Hot Food",
    items: [
      ["Fried Chicken Drumsticks",  "炸鸡腿",     "8pcs", "8.99",  "11.99", false, false, false, false, false, false, false],
      ["Lemon Chicken",             "柠檬鸡",     "each", "10.99", "11.99", false, false, false, false, false, false, false],
      ["Soft Noodles",              "软面条",     "each", "6.99",  "7.99",  false, false, false, false, false, false, false],
      ["Salt&Pepper Fish Fillet",   "椒盐鱼片",   "each", "10.99", "12.99", false, false, false, false, false, false, false],
      ["Eggplant with Garlic",      "蒜蓉茄子",   "each", "7.99",  "8.99",  false, false, false, false, false, false, false],
      ["Spicy Chicken",             "香辣鸡",     "each", "11.99", "13.99", false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Sushi",
    items: [
      ["Shrimp Cracker Roll",  "虾饼卷",  "each",  "8.98",  "9.99",  false, false, false, false, false, false, false],
    ],
  },
];

// ── Constants (copied from exportExampleXlsx.js) ──────────────────────────────

const HEADER = [
  "#", "English Name", "Chinese Name", "Size / Weight",
  "Sale Price", "Regular Price",
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
];

const COL_WIDTHS = [4, 38, 20, 12, 12, 12, 6, 6, 6, 6, 6, 6, 6];

const COL_DEFS = COL_WIDTHS.map((width, i) => ({
  width,
  ...(i >= 6 ? { style: { font: { color: { argb: "FFFFFFFF" } } } } : {}),
}));

const DAY_COL_INDICES = [6, 7, 8, 9, 10, 11, 12];
const ROWS_PER_DEPT = 50;

// ── VML (copied from exportExampleXlsx.js) ────────────────────────────────────

function buildVML(rowIndices) {
  const DX_L = 17, DX_R = 31, DY_T = 3, DY_B = 17;
  let shapeId = 1025;
  const shapes = [];
  for (const rowIdx of rowIndices) {
    for (const colIdx of DAY_COL_INDICES) {
      const colLetter = String.fromCharCode(65 + colIdx);
      const excelRow = rowIdx + 1;
      shapes.push(
        `<v:shape id="_x0000_s${shapeId}" type="#_x0000_t201" ` +
        `style="position:absolute;margin-left:0;margin-top:0;width:14pt;height:14pt;z-index:${shapeId - 1024}" ` +
        `filled="f" stroked="f">` +
        `<x:ClientData ObjectType="Checkbox">` +
        `<x:Anchor>${colIdx},${DX_L},${rowIdx},${DY_T},${colIdx},${DX_R},${rowIdx},${DY_B}</x:Anchor>` +
        `<x:AutoFill>False</x:AutoFill>` +
        `<x:FmlaLink>$${colLetter}$${excelRow}</x:FmlaLink>` +
        `<x:NoThreeD/>` +
        `</x:ClientData></v:shape>`
      );
      shapeId++;
    }
  }
  return (
    `<xml xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
    `xmlns:v="urn:schemas-microsoft-com:vml">` +
    `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>` +
    `<v:shapetype id="_x0000_t201" coordsize="21600,21600" o:spt="201" path="m,l,21600r21600,xe">` +
    `<v:stroke joinstyle="miter"/>` +
    `<v:path shadowok="f" o:connecttype="none"/>` +
    `</v:shapetype>` +
    shapes.join("") +
    `</xml>`
  );
}

async function injectCheckboxes(xlsxBuf, sheetDataRowsArray) {
  const zip = await JSZip.loadAsync(xlsxBuf);
  const ctEntry = zip.file("[Content_Types].xml");
  let ctXml = await ctEntry.async("string");
  if (!ctXml.includes('Extension="vml"') && !ctXml.includes(".vml")) {
    ctXml = ctXml.replace(
      "</Types>",
      `<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/></Types>`
    );
    zip.file("[Content_Types].xml", ctXml);
  }
  for (let i = 0; i < sheetDataRowsArray.length; i++) {
    const sheetNum = i + 1;
    const rowIndices = sheetDataRowsArray[i];
    const sheetPath = `xl/worksheets/sheet${sheetNum}.xml`;
    const relsPath  = `xl/worksheets/_rels/sheet${sheetNum}.xml.rels`;
    const vmlPath   = `xl/drawings/vmlDrawing${sheetNum}.vml`;
    const rId = "rIdVml";
    zip.file(vmlPath, buildVML(rowIndices));
    const relsEntry = zip.file(relsPath);
    let relsXml;
    if (relsEntry) {
      relsXml = await relsEntry.async("string");
      if (!relsXml.includes(rId)) {
        relsXml = relsXml.replace(
          "</Relationships>",
          `<Relationship Id="${rId}" ` +
          `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" ` +
          `Target="../drawings/vmlDrawing${sheetNum}.vml"/></Relationships>`
        );
      }
    } else {
      relsXml =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="${rId}" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" ` +
        `Target="../drawings/vmlDrawing${sheetNum}.vml"/>` +
        `</Relationships>`;
    }
    zip.file(relsPath, relsXml);
    let sheetXml = await zip.file(sheetPath).async("string");
    if (!sheetXml.includes("legacyDrawing")) {
      sheetXml = sheetXml.replace("</worksheet>", `<legacyDrawing r:id="${rId}"/></worksheet>`);
      zip.file(sheetPath, sheetXml);
    }
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

// ── Styling helpers ───────────────────────────────────────────────────────────

function styleHeader(row) {
  row.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  });
  for (let colNum = 7; colNum <= 13; colNum++) {
    row.getCell(colNum).font = { bold: true, color: { argb: "FF333333" } };
  }
}

function styleDept(row) {
  row.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCCCCC" } };
  });
}

// ── Build ─────────────────────────────────────────────────────────────────────

async function build() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Discounts");
  ws.columns = COL_DEFS;

  styleHeader(ws.addRow(HEADER));

  const dataRowIndices = [];

  for (const { dept, items } of DATA) {
    styleDept(ws.addRow([dept, ...Array(HEADER.length - 1).fill("")]));
    for (const row of items) {
      const addedRow = ws.addRow(["", ...row]);
      dataRowIndices.push(addedRow.number - 1);
    }
    const remaining = ROWS_PER_DEPT - items.length;
    for (let b = 0; b < remaining; b++) {
      const addedRow = ws.addRow(Array(HEADER.length).fill(""));
      dataRowIndices.push(addedRow.number - 1);
    }
    ws.addRow([]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const final = await injectCheckboxes(buf, [dataRowIndices]);
  fs.writeFileSync(OUT, Buffer.isBuffer(final) ? final : Buffer.from(final));
  console.log(`Saved: ${OUT}`);
}

build().catch(err => { console.error(err); process.exit(1); });
