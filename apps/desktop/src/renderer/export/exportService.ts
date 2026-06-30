// apps/desktop/src/renderer/export/exportService.ts
// Service for exporting flyer to PDF

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export type ExportProgress = {
  stage: "rendering" | "capturing" | "generating" | "saving" | "complete";
  currentPage: number;
  totalPages: number;
  message: string;
};

export type ExportOptions = {
  onProgress?: (progress: ExportProgress) => void;
  filename?: string;
};

export type ExportResult = {
  pdfBase64: string;
  filename: string;
};

/**
 * Export rendered flyer pages to PDF
 */
export async function exportFlyerToPDF(options: ExportOptions = {}): Promise<ExportResult> {
  const { onProgress, filename = "flyer.pdf" } = options;

  try {
    // Find the export container
    const container = document.getElementById("flyer-export-container");
    if (!container) {
      throw new Error("Export container not found");
    }

    // Get all page elements
    const pageElements = container.querySelectorAll<HTMLElement>(".flyer-page");
    if (pageElements.length === 0) {
      throw new Error("No pages found to export");
    }

    const totalPages = pageElements.length;

    onProgress?.({
      stage: "capturing",
      currentPage: 0,
      totalPages,
      message: "Preparing to capture pages...",
    });

    // Capture each page as canvas
    const canvases: HTMLCanvasElement[] = [];

    for (let i = 0; i < pageElements.length; i++) {
      const pageElement = pageElements[i];

      onProgress?.({
        stage: "capturing",
        currentPage: i + 1,
        totalPages,
        message: `Capturing page ${i + 1} of ${totalPages}...`,
      });

      // Use html2canvas to capture the page.
      // windowWidth must be >= page width so html2canvas doesn't clip horizontally.
      const canvas = await html2canvas(pageElement, {
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: Math.max(pageElement.scrollWidth, 1650),
        windowHeight: pageElement.scrollHeight,
        scrollX: 0,
        scrollY: 0,
      });

      canvases.push(canvas);
    }

    onProgress?.({
      stage: "generating",
      currentPage: totalPages,
      totalPages,
      message: "Generating PDF...",
    });

    // Create PDF — each page uses its own aspect ratio so multi-page flyers render correctly.
    const pdfWidthIn = 8.5; // standard letter width in inches

    const pageDims = canvases.map(c => {
      const ratio = c.height / c.width;
      const h = pdfWidthIn * ratio;
      const orientation: "portrait" | "landscape" = ratio > 1 ? "portrait" : "landscape";
      return { w: pdfWidthIn, h, orientation };
    });

    const pdf = new jsPDF({
      orientation: pageDims[0].orientation,
      unit: "in",
      format: [pageDims[0].w, pageDims[0].h],
    });

    // Add each page to PDF
    for (let i = 0; i < canvases.length; i++) {
      const canvas = canvases[i];
      const { w: pdfWidth, h: pdfHeight, orientation } = pageDims[i];

      if (i > 0) {
        pdf.addPage([pdfWidth, pdfHeight], orientation);
      }

      // Convert canvas to image data
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      // Add image to PDF - fit exactly to preserve aspect ratio
      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");

      onProgress?.({
        stage: "generating",
        currentPage: i + 1,
        totalPages,
        message: `Adding page ${i + 1} to PDF...`,
      });
    }

    onProgress?.({
      stage: "saving",
      currentPage: totalPages,
      totalPages,
      message: "Saving PDF...",
    });

    // Save local copy and capture base64 for upload
    const pdfBase64 = pdf.output("datauristring").split(",")[1];
    pdf.save(filename);

    onProgress?.({
      stage: "complete",
      currentPage: totalPages,
      totalPages,
      message: "Export complete!",
    });

    return { pdfBase64, filename };
  } catch (error) {
    console.error("Export failed:", error);
    throw error;
  }
}

/**
 * Generate filename with timestamp
 */
export function generateExportFilename(templateId: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `flyer_${templateId}_${year}${month}${day}_${hours}${minutes}.pdf`;
}
