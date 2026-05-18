// apps/desktop/src/main/ipc/exportExampleXlsx.js
// Generate an example discount .xlsx template with realistic Asian grocery items.
// Column layout (matches parseDiscountXlsx.js):
//   A(0): #  B(1): EN  C(2): ZH  D(3): size  E(4): sale  F(5): reg
//   G(6): Mon  H(7): Tue  I(8): Wed  J(9): Thu  K(10): Fri  L(11): Sat  M(12): Sun
//
// Day columns G–M use VML Form Control checkboxes (linked to cell TRUE/FALSE).
// ExcelJS generates the xlsx; JSZip post-processes it to inject the VML layer.

import ExcelJS from "exceljs";
import JSZip from "jszip";
import { dialog, shell } from "electron";
import path from "path";
import os from "os";
import fs from "fs";

// Items: [en, zh, size, sale, reg, mon, tue, wed, thu, fri, sat, sun]
// Day booleans: true = checkbox pre-checked, false = unchecked
const EXAMPLE_DATA = [
  {
    dept: "Grocery",
    items: [
      ["Fortune Rose Rice",                  "好运香米",         "10lb",    "9.99",    "13.99", false, false, false, false, false, false, false],
      ["Lee Kum Kee Oyster Sauce",           "李锦记蚝油",       "907g",    "6.99",    "8.99",  false, false, false, false, false, false, false],
      ["Kikkoman Soy Sauce",                 "万字酱油",         "1.89L",   "4.99",    "6.49",  false, false, false, false, false, false, false],
      ["Coconut Milk",                       "椰汁",             "400ml",   "3/$5.00", "2.29",  false, false, false, false, false, false, false],
      ["Instant Noodles Assorted 6 Flavors", "即食面 6种",       "85g×5",   "2/5.00",  "3.49",  false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Frozen",
    items: [
      ["Wei-Chuan Pork Dumplings",           "味全猪肉白菜水饺", "600g",    "7.99",    "9.99",  false, false, false, false, false, false, false],
      ["Shrimp Wonton",                      "鲜虾云吞",         "500g",    "6.99",    "8.49",  false, false, false, false, false, false, false],
      ["Taro Balls",                         "芋圆",             "300g",    "2/7.00",  "4.49",  false, false, false, false, false, false, false],
      ["Deep-Fried Tofu",                    "炸豆腐",           "400g",    "3.49",    "4.99",  false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Hot Food",
    items: [
      ["BBQ Pork",                           "叉烧",             "/lb",     "8.99",    "10.99", false, false, false, true,  true,  true,  true ],
      ["Roast Duck",                         "烤鸭",             "each",    "12.99",   "15.99", false, false, false, false, false, false, false],
      ["Steamed Pork Ribs",                  "蒸排骨",           "/lb",     "9.99",    "11.99", false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Sushi",
    items: [
      ["California Roll",                    "加州卷",           "8pc",     "5.99",    "7.49",  false, false, false, false, false, false, false],
      ["Salmon Sashimi",                     "三文鱼刺身",       "10pc",    "12.99",   "15.99", false, false, false, false, false, false, false],
      ["Dragon Roll",                        "龙卷",             "8pc",     "8.99",    "10.99", false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Meat",
    items: [
      ["Pork Belly",                         "五花肉",           "/lb",     "3.99",    "5.49",  false, false, false, false, false, false, false],
      ["Chicken Thigh",                      "鸡腿",             "/lb",     "1.99",    "2.79",  true,  true,  true,  false, false, false, false],
      ["Beef Short Rib",                     "牛小排",           "/lb",     "6.99",    "8.99",  false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Seafood",
    items: [
      ["Live Lobster",                       "活龙虾",           "/lb",     "9.99",    "12.99", false, false, false, false, true,  true,  true ],
      ["Tilapia Fillet",                     "罗非鱼片",         "/lb",     "3.99",    "5.49",  false, false, false, false, false, false, false],
      ["King Crab Leg",                      "帝王蟹腿",         "/lb",     "16.99",   "21.99", false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Fruit",
    items: [
      ["Honey Mango",                        "蜜芒果",           "3lb bag", "4.99",    "6.99",  false, false, false, false, false, false, false],
      ["Lychee",                             "荔枝",             "2lb",     "5.99",    "7.99",  false, false, false, false, false, false, false],
      ["Durian",                             "榴莲",             "/lb",     "3.99",    "5.99",  false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Vegetable",
    items: [
      ["Baby Bok Choy",                      "小白菜",           "1lb",     "1.49",    "1.99",  false, false, false, false, false, false, false],
      ["Chinese Eggplant",                   "茄子",             "2lb",     "2.99",    "3.99",  false, false, false, false, false, false, false],
      ["Bitter Melon",                       "苦瓜",             "/lb",     "1.99",    "2.79",  false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Hot Sale",
    items: [
      ["Mooncake Gift Box 6 Flavors",        "月饼礼盒 6种",     "6pc",     "18.99",   "24.99", false, false, false, false, false, false, false],
      ["Longjing Green Tea",                 "龙井绿茶",         "200g",    "12.99",   "16.99", false, false, false, false, false, false, false],
    ],
  },
  {
    dept: "Produce",
    items: [
      ["Garlic",                             "大蒜",             "3lb bag", "3.99",    "5.49",  false, false, false, false, false, false, false],
      ["Ginger",                             "生姜",             "2lb",     "2.99",    "4.49",  false, false, false, false, false, false, false],
    ],
  },
];

const HEADER = [
  "#", "English Name", "Chinese Name", "Size / Weight",
  "Sale Price", "Regular Price",
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
];

const COL_WIDTHS = [4, 38, 20, 12, 12, 12, 6, 6, 6, 6, 6, 6, 6];

// Column definitions: day columns G–M get a white font as the column default
// so the linked-cell TRUE/FALSE value is invisible (white on white).
const COL_DEFS = COL_WIDTHS.map((width, i) => ({
  width,
  ...(i >= 6 ? { style: { font: { color: { argb: "FFFFFFFF" } } } } : {}),
}));

// Day column indices, 0-based from A=0 → G=6 through M=12
const DAY_COL_INDICES = [6, 7, 8, 9, 10, 11, 12];

// Pre-allocate this many rows per department so checkboxes exist for user-added products
const ROWS_PER_DEPT = 50;

// ── VML generation ─────────────────────────────────────────────────────────────

/**
 * Build the VML XML that provides Form Control checkboxes for the given row indices.
 *
 * @param {number[]} rowIndices  0-based Excel row indices (Excel row 1 = index 0)
 *
 * Each checkbox is linked to its cell (e.g. $G$2) so checking it stores TRUE,
 * unchecking stores FALSE. SheetJS reads these back as boolean values.
 *
 * Anchor format: colLeft, dxLeft, rowTop, dyTop, colRight, dxRight, rowBottom, dyBottom
 * Offsets are in screen pixels (96 DPI). Using colLeft=colRight=colIdx keeps the
 * checkbox within its own column; the dx/dy values center a ~14px square in each cell
 * (column ≈ 48px wide, row ≈ 20px tall → 17px margin each side horizontally, 3px vertically).
 */
function buildVML(rowIndices) {
  // Centering constants (pixels): 6-char col ≈ 48px, 15pt row ≈ 20px, checkbox = 14px
  const DX_L = 17;  // left offset from column left edge
  const DX_R = 31;  // right offset from column left edge  (DX_L + 14 = box right edge)
  const DY_T = 3;   // top offset from row top edge
  const DY_B = 17;  // bottom offset from row top edge     (DY_T + 14 = box bottom edge)

  let shapeId = 1025;
  const shapes = [];

  for (const rowIdx of rowIndices) {
    for (const colIdx of DAY_COL_INDICES) {
      const colLetter = String.fromCharCode(65 + colIdx); // A=65 → G=71
      const excelRow = rowIdx + 1;                        // 0-indexed → 1-indexed
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

// ── JSZip post-processing ──────────────────────────────────────────────────────

/**
 * Inject VML Form Control checkboxes into every worksheet of an xlsx buffer.
 *
 * @param {ArrayBuffer|Buffer} xlsxBuf        Output of ExcelJS writeBuffer()
 * @param {number[][]} sheetDataRowsArray     sheetDataRowsArray[i] = 0-based row indices
 *                                            for sheet i+1 that should get checkboxes
 */
async function injectCheckboxes(xlsxBuf, sheetDataRowsArray) {
  const zip = await JSZip.loadAsync(xlsxBuf);

  // Register .vml MIME type in [Content_Types].xml if not already present
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
    const sheetNum  = i + 1;
    const rowIndices = sheetDataRowsArray[i];
    const sheetPath = `xl/worksheets/sheet${sheetNum}.xml`;
    const relsPath  = `xl/worksheets/_rels/sheet${sheetNum}.xml.rels`;
    const vmlPath   = `xl/drawings/vmlDrawing${sheetNum}.vml`;
    const rId       = "rIdVml";

    // 1. Write VML file: checkboxes only for actual item rows
    zip.file(vmlPath, buildVML(rowIndices));

    // 2. Create or update the sheet's relationship file to reference the VML
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

    // 3. Add <legacyDrawing> reference inside the worksheet XML
    let sheetXml = await zip.file(sheetPath).async("string");
    if (!sheetXml.includes("legacyDrawing")) {
      sheetXml = sheetXml.replace(
        "</worksheet>",
        `<legacyDrawing r:id="${rId}"/></worksheet>`
      );
      zip.file(sheetPath, sheetXml);
    }
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

// ── ExcelJS workbook builders ──────────────────────────────────────────────────

function styleHeader(row) {
  row.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  });
  // Day column headers (G–M) need explicit dark color to override the white column default
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

async function buildSingleSheet() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Discounts");
  ws.columns = COL_DEFS;

  styleHeader(ws.addRow(HEADER));

  const dataRowIndices = [];

  for (const { dept, items } of EXAMPLE_DATA) {
    styleDept(ws.addRow([dept, ...Array(HEADER.length - 1).fill("")]));
    for (const row of items) {
      const addedRow = ws.addRow(["", ...row]);
      dataRowIndices.push(addedRow.number - 1); // 0-indexed
    }
    const remaining = ROWS_PER_DEPT - items.length;
    for (let b = 0; b < remaining; b++) {
      const addedRow = ws.addRow(Array(HEADER.length).fill(""));
      dataRowIndices.push(addedRow.number - 1);
    }
    ws.addRow([]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return injectCheckboxes(buf, [dataRowIndices]);
}

async function buildMultiSheet() {
  const wb = new ExcelJS.Workbook();
  const allSheetRowIndices = [];

  for (const { dept, items } of EXAMPLE_DATA) {
    const ws = wb.addWorksheet(dept);
    ws.columns = COL_DEFS;
    styleHeader(ws.addRow(HEADER));
    const sheetRowIndices = [];
    for (const row of items) {
      const addedRow = ws.addRow(["", ...row]);
      sheetRowIndices.push(addedRow.number - 1); // 0-indexed
    }
    const remaining = ROWS_PER_DEPT - items.length;
    for (let b = 0; b < remaining; b++) {
      const addedRow = ws.addRow(Array(HEADER.length).fill(""));
      sheetRowIndices.push(addedRow.number - 1);
    }
    allSheetRowIndices.push(sheetRowIndices);
  }

  const buf = await wb.xlsx.writeBuffer();
  return injectCheckboxes(buf, allSheetRowIndices);
}

// ── IPC handler ────────────────────────────────────────────────────────────────

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

  const finalBuf = isMulti ? await buildMultiSheet() : await buildSingleSheet();
  fs.writeFileSync(filePath, Buffer.isBuffer(finalBuf) ? finalBuf : Buffer.from(finalBuf));
  shell.openPath(filePath);

  return { filePath };
}
