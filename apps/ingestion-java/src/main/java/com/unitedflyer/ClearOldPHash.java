package com.unitedflyer;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.WriteBatch;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.cloud.FirestoreClient;

import java.io.FileInputStream;

public class ClearOldPHash {

    // Credentials path: set FIREBASE_CREDENTIALS env var, or place service-key.json in ./credentials/
    private static final String FIREBASE_CREDENTIALS =
            System.getenv("FIREBASE_CREDENTIALS") != null
            ? System.getenv("FIREBASE_CREDENTIALS")
            : "./credentials/service-key.json";

    private static final String COLLECTION = "product_vectors";

    public static void main(String[] args) throws Exception {
        initFirebase();

        Firestore db = FirestoreClient.getFirestore();

        System.out.println("📥 Loading product_vectors...");
        var snap = db.collection(COLLECTION).get().get();

        System.out.println("🔍 Found documents: " + snap.size());
        WriteBatch batch = db.batch();
        int count = 0;

        for (var doc : snap.getDocuments()) {
            if (doc.contains("pHash")) {
                batch.update(doc.getReference(), "pHash", null);
                System.out.println("🧹 Removed pHash from: " + doc.getId());
                count++;
            }
        }

        if (count > 0) {
            batch.commit().get();
            System.out.println("✨ Done! Cleared pHash from " + count + " documents.");
        } else {
            System.out.println("✔ No pHash fields found — nothing to clean.");
        }

        System.out.println("🏁 Cleanup completed.");
    }

    private static void initFirebase() throws Exception {
        System.out.println("🔥 Initializing Firebase using: " + FIREBASE_CREDENTIALS);

        FileInputStream serviceAccount = new FileInputStream(FIREBASE_CREDENTIALS);

        FirebaseOptions options = new FirebaseOptions.Builder()
                .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                .build();

        FirebaseApp.initializeApp(options);

        System.out.println("✅ Firebase ready.");
    }
}
