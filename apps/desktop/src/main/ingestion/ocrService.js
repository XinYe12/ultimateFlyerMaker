import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

export async function runOCR(imagePath) {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(imagePath));

  const res = await fetch("http://127.0.0.1:17890/ocr", {
    method: "POST",
    body: formData,
    headers: formData.getHeaders()
  });

  const data = await res.json();

  return {
    text: (data.rec_texts || []).join(" ").trim()
  };
}
