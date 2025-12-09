import { useState, useEffect } from "react";
import { auth, provider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [combined, setCombined] = useState(null);

  // -----------------------------
  // AUTH LISTENER
  // -----------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // -----------------------------
  // GOOGLE LOGIN
  // -----------------------------
  const handleLogin = () => {
    signInWithPopup(auth, provider).catch((e) => console.error(e));
  };

  const handleLogout = () => {
    signOut(auth).catch((e) => console.error(e));
  };

 // -----------------------------
// MAIN IMAGE HANDLER WITH DEDUP
// -----------------------------
async function handleUnifiedUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  setPreview(URL.createObjectURL(file));
  setLoading(true);
  setCombined(null);

  try {
    console.log("🔵 Validating image with /api/check-duplicate-image …");

    const formData = new FormData();
    formData.append("image", file);

    // 1️⃣ --- DEDUP FIRST ---
    const dupRes = await fetch("http://localhost:5050/api/check-duplicate-image", {
      method: "POST",
      body: formData,
    });

    const dupJson = await dupRes.json();
    console.log("🔍 Dedup result:", dupJson);

    if (dupJson.duplicate) {
      alert(`❌ Duplicate image detected!\nThis image already exists as: ${dupJson.matchedId}`);
      setLoading(false);
      return; // STOP — do NOT send to analyze or search
    }

    console.log("✅ No duplicate found — proceeding to /analyze + search");

    // 2️⃣ --- CALL /analyze ---
    console.log("➡ Calling /analyze …");
    const analyzeRes = await fetch("http://localhost:5050/analyze", {
      method: "POST",
      body: formData,
    });

    const analyzeJson = await analyzeRes.json().catch((e) => {
      console.error("❌ /analyze JSON parse failed:", e);
      return null;
    });

    console.log("📥 /analyze result:", analyzeJson);

    // 3️⃣ --- CALL /api/search-by-image ---
    console.log("➡ Calling /api/search-by-image …");
    const searchRes = await fetch("http://localhost:5050/api/search-by-image", {
      method: "POST",
      body: formData,
    });

    const searchJson = await searchRes.json().catch((e) => {
      console.error("❌ /search-by-image JSON parse failed:", e);
      return null;
    });

    //console.log("📥 /search result:", searchJson);

    setCombined({
      analyze: analyzeJson,
      matches: searchJson?.results || [],
    });

  } catch (err) {
    console.error("🔥 Unified pipeline failed:", err);
  }

  setLoading(false);
}

  // ---------------------------------------------------
  // UI COMPONENTS
  // ---------------------------------------------------
  const renderUploadArea = () => (
    <div style={{ marginTop: 30 }}>
      <input
        type="file"
        accept="image/*"
        id="hiddenFileInput"
        style={{ display: "none" }}
        onChange={handleUnifiedUpload}
      />

      <button
        onClick={() =>
          document.getElementById("hiddenFileInput").click()
        }
        style={{
          padding: "12px 20px",
          background: "#4a86f7",
          color: "white",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          fontSize: "16px",
        }}
        disabled={loading}
      >
        {loading ? "Processing..." : "📤 Upload Product Image"}
      </button>
    </div>
  );

  const renderPreview = () =>
    preview && (
      <div style={{ marginTop: 25 }}>
        <h3>Your Uploaded Image</h3>
        <img
          src={preview}
          alt="preview"
          style={{
            width: 220,
            borderRadius: 8,
            boxShadow: "0 0 10px rgba(0,0,0,0.15)",
          }}
        />
      </div>
    );

  const renderAIResult = () =>
    combined?.analyze && (
      <div
        style={{
          marginTop: 35,
          padding: 20,
          background: "#fafafa",
          borderRadius: 10,
          boxShadow: "0 0 6px rgba(0,0,0,0.1)",
          maxWidth: 600,
          marginInline: "auto",
          textAlign: "left",
        }}
      >
        <h3>🤖 DeepSeek AI Parsed Title</h3>
        <pre
          style={{
            background: "#eef2ff",
            padding: 12,
            borderRadius: 6,
            whiteSpace: "pre-wrap",
            fontSize: 15,
          }}
        >
          {combined.analyze.parsed?.title_ai || "No title found"}
        </pre>
      </div>
    );

  const renderMatches = () =>
    combined?.matches?.length > 0 && (
      <div
        style={{
          marginTop: 40,
          textAlign: "left",
          maxWidth: 700,
          marginInline: "auto",
        }}
      >
        <h3>🔍 Top Matching Products</h3>

        {combined.matches.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              gap: 15,
              padding: 12,
              background: "white",
              borderRadius: 10,
              boxShadow: "0 0 6px rgba(0,0,0,0.08)",
              marginBottom: 15,
              alignItems: "center",
            }}
          >
            <img
              src={p.imageUrl}
              alt={p.id}
              style={{
                width: 100,
                height: 100,
                objectFit: "cover",
                borderRadius: 8,
              }}
            />

            <div>
              <strong>{p.englishTitle}</strong>
              <br />
              {p.chineseTitle}
              <br />
              <span style={{ color: "#777" }}>{p.size}</span>
              <br />
              <small style={{ color: "#999" }}>
                similarity: {(p.score * 100).toFixed(1)}%
              </small>
            </div>
          </div>
        ))}
      </div>
    );

  // ---------------------------------------------------
  // FINAL UI LAYOUT
  // ---------------------------------------------------
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h2>🧾 Ultimate Flyer Maker – Product Analyzer</h2>

      {!user ? (
        <button onClick={handleLogin}>Login with Google</button>
      ) : (
        <>
          <p>Welcome, {user.displayName}</p>
          <button onClick={handleLogout}>Logout</button>

          {renderUploadArea()}
          {renderPreview()}
          {renderAIResult()}
          {renderMatches()}
        </>
      )}
    </div>
  );
}
