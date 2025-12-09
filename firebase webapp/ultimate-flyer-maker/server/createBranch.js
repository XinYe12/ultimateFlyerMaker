// server/uploadDocument.js
import pkg from "@google-cloud/discoveryengine";
const { DocumentServiceClient } = pkg;
import fs from "fs";

const client = new DocumentServiceClient({
  apiEndpoint: "discoveryengine.googleapis.com",
});

const project = "ultimate-flyer-maker";
const location = "global";
const collection = "default_collection";
const dataStoreId = "united-flyer-warehouse";
const branchId = "default_branch";

async function uploadDocument() {
  const parent = `projects/${project}/locations/${location}/collections/${collection}/dataStores/${dataStoreId}/branches/${branchId}`;

  const imagePath = "./test.jpg";
  const imageData = fs.readFileSync(imagePath).toString("base64");

  const request = {
    parent,
    documentId: "test-photo-1", // 👈 required parameter
    document: {
      id: "test-photo-1",
      structData: {
        title: "Sample Product Image",
        imageUrl: "https://storage.googleapis.com/YOUR_BUCKET/test.jpg",
        imageBase64: imageData, // optional raw bytes
        derivedStructData: {
          imageEmbedding: Array(1408).fill(0),
        },
      },
    },
  };

  console.log("📤 Uploading document:", request.documentId);

  try {
    const [response] = await client.createDocument(request);
    console.log("✅ Uploaded successfully:", response.name);
  } catch (err) {
    console.error("❌ Failed:", err.message);
    if (err.details) console.error("🔍 Details:", err.details);
  }
}

uploadDocument();
