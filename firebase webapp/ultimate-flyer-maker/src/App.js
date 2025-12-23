import { useState, useEffect } from "react";
import { auth, provider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { loadCutoutModel } from "./browser-ml/cutoutService";
import { applyImageTreatment } from "./flyer/applyImageTreatment";


export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const [manualTitle, setManualTitle] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  // 🔑 RAW IMAGE FILE (FOR CUTOUT)
  const [rawImageFile, setRawImageFile] = useState(null);
  const [flyerItems, setFlyerItems] = useState([]);


  // -----------------------------
  // AUTH + MODEL LOAD
  // -----------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    loadCutoutModel(); // preload browser ML once
    return () => unsub();
  }, []);

  // -----------------------------
  // AUTH ACTIONS
  // -----------------------------
  const handleLogin = () =>
    signInWithPopup(auth, provider).catch(console.error);

  const handleLogout = () =>
    signOut(auth).catch(console.error);

  // -----------------------------
  // IDENTIFY PRODUCT
  // -----------------------------
  async function handleIdentify(e) {
    const file = e.target.files?.[0];

    if (!file && !manualTitle.trim()) {
      alert("Please upload an image or enter a product name.");
      return;
    }

    if (file) {
      setPreview(URL.createObjectURL(file));
      setRawImageFile(file); // ✅ STORE RAW FILE
    }

    setLoading(true);
    setResult(null);

    try {
      // ---------- Dedup ----------
      if (file) {
        const dedupForm = new FormData();
        dedupForm.append("image", file);

        const dupRes = await fetch(
          "http://localhost:5050/api/check-duplicate-image",
          { method: "POST", body: dedupForm }
        );

        const dupJson = await dupRes.json();
        if (dupJson.duplicate) {
          alert(`❌ Duplicate image: ${dupJson.matchedId}`);
          setLoading(false);
          return;
        }
      }

      // ---------- Identify ----------
      const formData = new FormData();
      if (file) formData.append("image", file);
      if (manualTitle.trim()) formData.append("title", manualTitle.trim());

      const res = await fetch(
        "http://localhost:5050/api/identify-product",
        { method: "POST", body: formData }
      );

      const json = await res.json();
      setResult(json);
      // TEMP: build a single FlyerItem from identify result
      if (json.parsed && rawImageFile) {
        const items = [{
          id: "temp-1",
          title: {
            en: json.parsed.title_ai || "",
            cn: ""
          },
          price: null,
          category: "Grocery",
          image: {
            src: preview,
            treatment: "CARD"
          },
          layout: {
            size: "LARGE" // FORCE LARGE to test CUTOUT
          },
          rawImageFile
        }];

        const treated = await Promise.all(
          items.map(item => applyImageTreatment(item))
        );

        setFlyerItems(treated);
      }


    } catch (err) {
      console.error("❌ identify-product failed:", err);
    }

    setLoading(false);
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h2>🧾 Ultimate Flyer Maker – Product Identifier</h2>

      {!user ? (
        <button onClick={handleLogin}>Login with Google</button>
      ) : (
        <>
          <p>Welcome, {user.displayName}</p>
          <button onClick={handleLogout}>Logout</button>

          {/* INPUT */}
          <div style={{ marginTop: 30 }}>
            <input
              type="text"
              placeholder="Optional product name (e.g. Tao Su / 桃酥)"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              style={{
                width: 320,
                padding: 10,
                fontSize: 15,
                borderRadius: 6,
                border: "1px solid #ccc",
                marginBottom: 12,
              }}
            />

            <input
              type="file"
              accept="image/*"
              id="fileInput"
              style={{ display: "none" }}
              onChange={handleIdentify}
            />

            <button
              onClick={() => document.getElementById("fileInput").click()}
              disabled={loading}
              style={{
                padding: "12px 20px",
                background: "#4a86f7",
                color: "white",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: "16px",
              }}
            >
              {loading ? "Processing..." : "📤 Upload Image / Search"}
            </button>
          </div>

          {/* PREVIEW */}
          {preview && (
            <div style={{ marginTop: 25 }}>
              <h3>Uploaded Image</h3>
              <img
                src={preview}
                alt="preview"
                style={{ width: 220, borderRadius: 8 }}
              />
            </div>
          )}
               {/* render */}
          {flyerItems.map(item => (
            <div key={item.id} style={{ marginTop: 20 }}>
              <h4>{item.title.en}</h4>
              <img
                src={item.image.src}
                alt=""
                style={{ width: 220, background: "transparent" }}
              />
              <div>{item.image.treatment}</div>
            </div>
          ))}


          {/* AI RESULT */}
          {result?.parsed && (
            <div style={cardStyle}>
              <h3>🤖 AI Parsed Title</h3>
              <pre style={preStyle}>
                {result.parsed.title_ai || "No AI title"}
              </pre>
            </div>
          )}

          {/* FIRESTORE MATCHES */}
          {result?.matches?.length > 0 && (
            <div style={listStyle}>
              <h3>🗄 Top Matches (Firestore)</h3>
              {result.matches.map((p) => (
                <div key={p.id} style={itemStyle}>
                  <img
                    src={p.publicUrl}
                    alt={p.id}
                    style={{ width: 90, height: 90, objectFit: "cover" }}
                  />
                  <div>
                    <strong>{p.englishTitle}</strong><br />
                    {p.chineseTitle}<br />
                    <span style={{ color: "#666" }}>{p.size}</span><br />
                    <small>score: {(p.score * 100).toFixed(1)}%</small>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* BRAVE */}
          {result?.braveResults?.length > 0 && (
            <div style={listStyle}>
              <h3>🌐 Brave Search</h3>
              {result.braveResults.map((r, i) => (
                <div key={i} style={itemStyle}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    <strong>{r.title}</strong>
                  </a>
                  <p style={{ marginTop: 6 }}>{r.description}</p>
                </div>
              ))}
            </div>
          )}
        </>
        
      )}
    </div>
  );
}

// -----------------------------
// STYLES
// -----------------------------
const cardStyle = {
  marginTop: 30,
  padding: 20,
  background: "#fafafa",
  borderRadius: 10,
  maxWidth: 600,
  marginInline: "auto",
  textAlign: "left",
};

const preStyle = {
  background: "#eef2ff",
  padding: 12,
  borderRadius: 6,
  whiteSpace: "pre-wrap",
};

const listStyle = {
  marginTop: 40,
  maxWidth: 720,
  marginInline: "auto",
  textAlign: "left",
};

const itemStyle = {
  display: "flex",
  gap: 14,
  padding: 12,
  background: "white",
  borderRadius: 8,
  marginBottom: 14,
  boxShadow: "0 0 6px rgba(0,0,0,0.08)",
};
