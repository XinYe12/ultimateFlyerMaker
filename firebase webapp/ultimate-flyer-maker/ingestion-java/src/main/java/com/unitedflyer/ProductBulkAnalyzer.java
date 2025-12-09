package com.unitedflyer;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.WriteResult;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.Bucket;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.cloud.FirestoreClient;
import com.google.firebase.cloud.StorageClient;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import okhttp3.*;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

public class ProductBulkAnalyzer {

    // ---------- CONFIG ----------
    private static final String OPENAI_API_KEY = System.getenv("OPENAI_API_KEY");
    private static final String OPENAI_API_BASE = "https://api.openai.com/v1";

    private static final String FIREBASE_CREDENTIALS = "../server/credentials/service-key.json";
    private static final String FIRESTORE_COLLECTION = "product_vectors";

    private static final String VISION_MODEL = "gpt-4o-mini";
    private static final String EMBEDDING_MODEL = "text-embedding-3-large";

    // System flag to skip expensive AI calls
    private static boolean SKIP_AI = false;

    private static Firestore db;
    private static Bucket bucket;
    private static final Gson gson = new Gson();
    private static final OkHttpClient httpClient = new OkHttpClient();

    public static void main(String[] args) throws Exception {

        // Read skip flag
        SKIP_AI = Boolean.parseBoolean(System.getProperty("skipAI", "false"));
        if (SKIP_AI) {
            System.out.println("⚠️ Running in SKIP-AI MODE → No OpenAI calls will be made.");
        }

        if (!SKIP_AI && (OPENAI_API_KEY == null || OPENAI_API_KEY.isBlank())) {
            System.err.println("❌ OPENAI_API_KEY is not set.");
            return;
        }

        if (args.length != 1) {
            System.out.println("Usage:");
            System.out.println("  mvn exec:java -Dexec.mainClass=\"com.unitedflyer.ProductBulkAnalyzer\" -Dexec.args=\"/path/to/images\"");
            System.out.println("OR (zero-cost mode):");
            System.out.println("  mvn exec:java -DskipAI=true -Dexec.mainClass=\"com.unitedflyer.ProductBulkAnalyzer\" -Dexec.args=\"./single\"");
            return;
        }

        initFirebase();

        List<Path> imageFiles = listImages(args[0]);
        System.out.println("📂 Found " + imageFiles.size() + " image(s)");

        int success = 0;
        int fail = 0;

        for (Path imagePath : imageFiles) {
            try {
                System.out.println("\n🔍 Processing: " + imagePath);

                byte[] imageBytes = Files.readAllBytes(imagePath);
                String mimeType = guessMimeType(imagePath);

                // ---------- Compute pHash ----------
                String pHash = ImageHash.computePHash(imageBytes);
                System.out.println("🧩 pHash (64-bit hex) = " + pHash);

                // ---------- Check existing docs for duplicates ----------
                if (isDuplicate(pHash)) {
                    System.out.println("❌ DUPLICATE IMAGE — SKIPPED");
                    continue;
                }

                // ---------- Build metadata ----------
                JsonObject productInfo = SKIP_AI
                        ? fakeProductInfo(imagePath)
                        : analyzeWithVision(imageBytes, mimeType);

                // ---------- Prepare embedding text ----------
                String embeddingText = buildEmbeddingText(productInfo);

                // DEBUG PRINT (INGESTION)
                System.out.println("🔍 EMBEDDING TEXT (INGESTION): " + embeddingText);
                System.out.println("🔢 Length (INGESTION): " + embeddingText.length());

                // ---------- Embeddings ----------
                List<Double> embedding = SKIP_AI
                ? Collections.emptyList()
                : generateEmbedding(embeddingText);


                // ---------- Build product id ----------
                String productId = buildProductId(productInfo, imagePath);

                // ---------- Upload original image ----------
                Map<String, String> imageInfo = uploadImageToStorage(productId, imageBytes, mimeType);

                // ---------- Store Firestore document ----------
                storeProduct(productId, productInfo, embedding, imageInfo, pHash);

                System.out.println("✅ Stored product: " + productId);
                success++;
            } catch (Exception err) {
                System.out.println("❌ Error: " + imagePath);
                err.printStackTrace();
                fail++;
            }
        }

        System.out.println("\n🏁 Done → Success: " + success + " | Failed: " + fail);
    }

    // -------------------------------------------------------
    // Firebase
    // -------------------------------------------------------
    private static void initFirebase() throws Exception {
        System.out.println("🔥 Initializing Firebase using: " + FIREBASE_CREDENTIALS);

        FileInputStream serviceAccount = new FileInputStream(FIREBASE_CREDENTIALS);

        FirebaseOptions options = new FirebaseOptions.Builder()
                .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                .setStorageBucket("flyer-maker-ai-478503.firebasestorage.app")
                .build();

        FirebaseApp.initializeApp(options);
        db = FirestoreClient.getFirestore();
        bucket = StorageClient.getInstance().bucket();

        System.out.println("✅ Firebase ready. Bucket: " + bucket.getName());
    }

    private static List<Path> listImages(String folderPath) throws IOException {
        return Files.walk(Paths.get(folderPath))
                .filter(Files::isRegularFile)
                .filter(p -> p.toString().toLowerCase().matches(".*\\.(png|jpg|jpeg|webp)$"))
                .toList();
    }

    private static String guessMimeType(Path p) {
        String s = p.toString().toLowerCase();
        if (s.endsWith(".png")) return "image/png";
        if (s.endsWith(".webp")) return "image/webp";
        return "image/jpeg";
    }

    // -------------------------------------------------------
    // Duplicate detection (pHash)
    // -------------------------------------------------------
    private static boolean isDuplicate(String newHash) throws Exception {
        var snap = db.collection(FIRESTORE_COLLECTION).get().get();

        for (var doc : snap.getDocuments()) {
            Object existing = doc.get("pHash");
            if (existing instanceof String existingHash) {
                int dist = ImageHash.hammingDistance(existingHash, newHash);
                if (dist <= 10) {
                    System.out.println("⚠️ DUPLICATE FOUND → " + doc.getId() + " (distance=" + dist + ")");
                    return true;
                }
            }
        }
        return false;
    }

    // -------------------------------------------------------
    // Fake metadata when skipAI=true
    // -------------------------------------------------------
    private static JsonObject fakeProductInfo(Path img) {
        JsonObject o = new JsonObject();
        String base = img.getFileName().toString();

        o.addProperty("englishTitle", "");
        o.addProperty("chineseTitle", "");
        o.addProperty("cleanTitle", base);
        o.addProperty("brand", "");
        o.addProperty("size", "");
        o.addProperty("category", "");
        o.addProperty("ocrText", "");
        o.addProperty("description", "");

        System.out.println("⚠️ SKIP-AI product info generated: " + base);
        return o;
    }

    // -------------------------------------------------------
    // Real Vision API call
    // -------------------------------------------------------
    private static JsonObject analyzeWithVision(byte[] imageBytes, String mimeType) throws IOException {
        String base64 = Base64.getEncoder().encodeToString(imageBytes);
        String dataUrl = "data:" + mimeType + ";base64," + base64;

        JsonObject req = new JsonObject();
        req.addProperty("model", VISION_MODEL);

        JsonObject responseFormat = new JsonObject();
        responseFormat.addProperty("type", "json_object");
        req.add("response_format", responseFormat);

        JsonObject imagePart = new JsonObject();
        imagePart.addProperty("type", "image_url");

        JsonObject urlObj = new JsonObject();
        urlObj.addProperty("url", dataUrl);
        imagePart.add("image_url", urlObj);

        JsonObject task = new JsonObject();
        task.addProperty("type", "text");
        task.addProperty("text",
                "Extract the following EXACT fields as JSON:\n" +
                        "{\"englishTitle\":string,\"chineseTitle\":string,\"size\":string," +
                        "\"brand\":string,\"category\":string,\"ocrText\":string," +
                        "\"description\":string,\"cleanTitle\":string}");

        JsonObject message = new JsonObject();
        message.addProperty("role", "user");
        message.add("content", gson.toJsonTree(List.of(imagePart, task)));

        req.add("messages", gson.toJsonTree(List.of(message)));

        RequestBody body = RequestBody.create(gson.toJson(req), MediaType.get("application/json"));

        Request httpReq = new Request.Builder()
                .url(OPENAI_API_BASE + "/chat/completions")
                .header("Authorization", "Bearer " + OPENAI_API_KEY)
                .post(body)
                .build();

        try (Response resp = httpClient.newCall(httpReq).execute()) {
            String raw = Objects.requireNonNull(resp.body()).string();
            JsonObject root = gson.fromJson(raw, JsonObject.class);

            String jsonOut = root.getAsJsonArray("choices")
                    .get(0).getAsJsonObject()
                    .getAsJsonObject("message")
                    .get("content").getAsString();

            return gson.fromJson(jsonOut, JsonObject.class);
        }
    }

    // -------------------------------------------------------
    // Embeddings
    // -------------------------------------------------------
    private static List<Double> generateEmbedding(String txt) throws IOException {
        JsonObject req = new JsonObject();
        req.addProperty("model", EMBEDDING_MODEL);
        req.add("input", gson.toJsonTree(List.of(txt)));

        RequestBody body = RequestBody.create(gson.toJson(req), MediaType.get("application/json"));

        Request httpReq = new Request.Builder()
                .url(OPENAI_API_BASE + "/embeddings")
                .header("Authorization", "Bearer " + OPENAI_API_KEY)
                .post(body)
                .build();

        try (Response resp = httpClient.newCall(httpReq).execute()) {
            JsonObject root = gson.fromJson(Objects.requireNonNull(resp.body()).string(), JsonObject.class);

            List<Double> vec = new ArrayList<>();
            root.getAsJsonArray("data")
                    .get(0).getAsJsonObject()
                    .getAsJsonArray("embedding")
                    .forEach(v -> vec.add(v.getAsDouble()));

            return vec;
        }
    }

    private static String buildEmbeddingText(JsonObject o) {
        return String.join(" | ",
                o.get("englishTitle").getAsString(),
                o.get("chineseTitle").getAsString(),
                o.get("brand").getAsString(),
                o.get("size").getAsString(),
                o.get("category").getAsString(),
                o.get("cleanTitle").getAsString(),
                o.get("ocrText").getAsString()
        );
    }

    // -------------------------------------------------------
    // ID builder
    // -------------------------------------------------------
    private static String buildProductId(JsonObject info, Path imagePath) {
        String base = info.get("cleanTitle").getAsString();
        if (base == null || base.isBlank()) {
            base = imagePath.getFileName().toString();
        }
        return base.toLowerCase()
                .replaceAll("\\..*$", "")
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
    }

    // -------------------------------------------------------
    // Upload image to Firebase Storage
    // -------------------------------------------------------
    private static Map<String, String> uploadImageToStorage(String productId, byte[] data, String mime) {
        String ext = mime.equals("image/png") ? ".png" : ".jpg";
        String storagePath = "products/" + productId + "/original" + ext;

        Blob blob = bucket.create(storagePath, data, mime);

        // add token
        blob = blob.toBuilder()
                .setMetadata(Map.of("firebaseStorageDownloadTokens", UUID.randomUUID().toString()))
                .build()
                .update();

        String token = blob.getMetadata().get("firebaseStorageDownloadTokens");
        String publicUrl =
                "https://firebasestorage.googleapis.com/v0/b/" +
                        bucket.getName() + "/o/" +
                        java.net.URLEncoder.encode(storagePath, java.nio.charset.StandardCharsets.UTF_8) +
                        "?alt=media&token=" + token;

        Map<String, String> out = new HashMap<>();
        out.put("storagePath", storagePath);
        out.put("publicUrl", publicUrl);
        out.put("gsUri", "gs://" + bucket.getName() + "/" + storagePath);
        return out;
    }

    // -------------------------------------------------------
    // Store Firestore
    // -------------------------------------------------------
    private static void storeProduct(String id, JsonObject info, List<Double> embedding,
                                     Map<String, String> imageInfo, String pHash) throws Exception {

        Map<String, Object> doc = new HashMap<>();
        doc.put("id", id);
        doc.put("englishTitle", info.get("englishTitle").getAsString());
        doc.put("chineseTitle", info.get("chineseTitle").getAsString());
        doc.put("size", info.get("size").getAsString());
        doc.put("brand", info.get("brand").getAsString());
        doc.put("category", info.get("category").getAsString());
        doc.put("ocrText", info.get("ocrText").getAsString());
        doc.put("description", info.get("description").getAsString());
        doc.put("cleanTitle", info.get("cleanTitle").getAsString());

        doc.put("imageStoragePath", imageInfo.get("storagePath"));
        doc.put("publicUrl", imageInfo.get("publicUrl"));
        doc.put("imageGsUri", imageInfo.get("gsUri"));

        doc.put("embedding", embedding);
        doc.put("pHash", pHash);

        doc.put("createdAt", Instant.now().toEpochMilli());
        doc.put("updatedAt", Instant.now().toEpochMilli());

        WriteResult result = db.collection(FIRESTORE_COLLECTION).document(id).set(doc).get();
        System.out.println("🗄 Firestore updated: " + result.getUpdateTime());
    }
}
