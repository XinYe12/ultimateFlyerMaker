// apps/desktop/src/main/ipc/exportExampleXlsx.js
// Generate an example discount .xlsx template with realistic Asian grocery items.
// Format matches parseDiscountXlsx.js column layout:
//   col[0]: row# (blank)  col[1]: EN  col[2]: ZH  col[3]: size  col[4]: sale price  col[5]: reg price
// Department sections use a header row: col[0]=dept label, all other cols empty.

import XLSX from "xlsx";
import { dialog, shell } from "electron";
import path from "path";
import os from "os";

/** [deptLabel, [en, zh, size, sale, reg][], ...] */
const EXAMPLE_DATA = [
  {
    dept: "Grocery",
    items: [
      ["Fortune Rose Rice",                  "好运香米",         "10lb",    "9.99",      "13.99"],
      ["Lee Kum Kee Oyster Sauce",           "李锦记蚝油",       "907g",    "6.99",      "8.99" ],
      ["Kikkoman Soy Sauce",                 "万字酱油",         "1.89L",   "4.99",      "6.49" ],
      ["Coconut Milk",                       "椰汁",             "400ml",   "3/$5.00",   "2.29" ],
      ["Instant Noodles Assorted 6 Flavors", "即食面 6种",       "85g×5",   "2/5.00",    "3.49" ],
    ],
  },
  {
    dept: "Frozen",
    items: [
      ["Wei-Chuan Pork Dumplings",           "味全猪肉白菜水饺", "600g",    "7.99",      "9.99" ],
      ["Shrimp Wonton",                      "鲜虾云吞",         "500g",    "6.99",      "8.49" ],
      ["Taro Balls",                         "芋圆",             "300g",    "2/7.00",    "4.49" ],
      ["Deep-Fried Tofu",                    "炸豆腐",           "400g",    "3.49",      "4.99" ],
    ],
  },
  {
    dept: "Hot Food",
    items: [
      ["BBQ Pork",                           "叉烧",             "/lb",     "8.99",      "10.99"],
      ["Roast Duck",                         "烤鸭",             "each",    "12.99",     "15.99"],
      ["Steamed Pork Ribs",                  "蒸排骨",           "/lb",     "9.99",      "11.99"],
    ],
  },
  {
    dept: "Sushi",
    items: [
      ["California Roll",                    "加州卷",           "8pc",     "5.99",      "7.49" ],
      ["Salmon Sashimi",                     "三文鱼刺身",       "10pc",    "12.99",     "15.99"],
      ["Dragon Roll",                        "龙卷",             "8pc",     "8.99",      "10.99"],
    ],
  },
  {
    dept: "Meat",
    items: [
      ["Pork Belly",                         "五花肉",           "/lb",     "3.99",      "5.49" ],
      ["Chicken Thigh",                      "鸡腿",             "/lb",     "1.99",      "2.79" ],
      ["Beef Short Rib",                     "牛小排",           "/lb",     "6.99",      "8.99" ],
    ],
  },
  {
    dept: "Seafood",
    items: [
      ["Live Lobster",                       "活龙虾",           "/lb",     "9.99",      "12.99"],
      ["Tilapia Fillet",                     "罗非鱼片",         "/lb",     "3.99",      "5.49" ],
      ["King Crab Leg",                      "帝王蟹腿",         "/lb",     "16.99",     "21.99"],
    ],
  },
  {
    dept: "Fruit",
    items: [
      ["Honey Mango",                        "蜜芒果",           "3lb bag", "4.99",      "6.99" ],
      ["Lychee",                             "荔枝",             "2lb",     "5.99",      "7.99" ],
      ["Durian",                             "榴莲",             "/lb",     "3.99",      "5.99" ],
    ],
  },
  {
    dept: "Vegetable",
    items: [
      ["Baby Bok Choy",                      "小白菜",           "1lb",     "1.49",      "1.99" ],
      ["Chinese Eggplant",                   "茄子",             "2lb",     "2.99",      "3.99" ],
      ["Bitter Melon",                       "苦瓜",             "/lb",     "1.99",      "2.79" ],
    ],
  },
  {
    dept: "Hot Sale",
    items: [
      ["Mooncake Gift Box 6 Flavors",        "月饼礼盒 6种",     "6pc",     "18.99",     "24.99"],
      ["Longjing Green Tea",                 "龙井绿茶",         "200g",    "12.99",     "16.99"],
    ],
  },
  {
    dept: "Produce",
    items: [
      ["Garlic",                             "大蒜",             "3lb bag", "3.99",      "5.49" ],
      ["Ginger",                             "生姜",             "2lb",     "2.99",      "4.49" ],
    ],
  },
];

const COL_WIDTHS = [
  { wch: 4  },  // col A (row# / dept header)
  { wch: 38 },  // col B (EN name)
  { wch: 20 },  // col C (ZH name)
  { wch: 12 },  // col D (size)
  { wch: 12 },  // col E (sale price)
  { wch: 12 },  // col F (reg price)
];

const COLUMN_HEADER_ROW = ["#", "English Name", "Chinese Name", "Size / Weight", "Sale Price", "Regular Price"];

function buildSingleSheetWorkbook() {
  const rows = [COLUMN_HEADER_ROW];
  for (const { dept, items } of EXAMPLE_DATA) {
    rows.push([dept, "", "", "", "", ""]);
    for (const [en, zh, size, sale, reg] of items) {
      rows.push(["", en, zh, size, sale, reg]);
    }
    rows.push([]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = COL_WIDTHS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Discounts");
  return wb;
}

function buildMultiSheetWorkbook() {
  const wb = XLSX.utils.book_new();
  for (const { dept, items } of EXAMPLE_DATA) {
    const rows = [COLUMN_HEADER_ROW];
    for (const [en, zh, size, sale, reg] of items) {
      rows.push(["", en, zh, size, sale, reg]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = COL_WIDTHS;
    XLSX.utils.book_append_sheet(wb, ws, dept);
  }
  return wb;
}

/**
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {"single"|"multi"} [format="single"]
 */
export async function exportExampleXlsx(_event, format = "single") {
  const isMulti = format === "multi";
  const defaultName = isMulti ? "discount_template_multi_sheet.xlsx" : "discount_template.xlsx";

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: "Save Discount Template",
    defaultPath: path.join(os.homedir(), "Desktop", defaultName),
    filters: [{ name: "Excel Spreadsheet", extensions: ["xlsx"] }],
  });

  if (canceled || !filePath) return { canceled: true };

  const wb = isMulti ? buildMultiSheetWorkbook() : buildSingleSheetWorkbook();
  XLSX.writeFile(wb, filePath);
  shell.openPath(filePath);

  return { filePath };
}
