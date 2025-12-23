import React, { useState } from "react";

export default function ImageSearch({ onImageSelected }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setError("");
    setResults([]);

    if (onImageSelected) {
      onImageSelected(file);
    }
  };

  const handleSearch = async () => {
    if (!selectedFile) {
      setError("Please select an image first!");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);

    const formData = new FormData();
    formData.append("image", selectedFile);

    try {
      const response = await fetch("http://localhost:5050/api/search-by-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Server error");
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError("Failed to search. Check backend connection.");
    }

    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🔍 Search Products by Image</h2>

      {/* Upload box */}
      <div style={styles.uploadBox}>
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </div>

      {/* Preview */}
      {preview && (
        <div style={styles.previewBox}>
          <p style={{ marginBottom: "6px" }}>Your uploaded image:</p>
          <img src={preview} alt="preview" style={styles.previewImage} />
        </div>
      )}

      <button onClick={handleSearch} style={styles.button} disabled={loading}>
        {loading ? "Searching…" : "Search Similar Products"}
      </button>

      {error && <p style={styles.error}>{error}</p>}

      {/* Results */}
      <div style={styles.resultsGrid}>
        {results.map((item) => (
          <div key={item.id} style={styles.card}>
            <img
                src={item.imageUrl}
                alt={item.englishTitle}
                style={styles.cardImage}
                />


            <div style={styles.cardInfo}>
              <h4 style={{ marginBottom: "4px" }}>{item.englishTitle || "No title"}</h4>
              <p style={styles.meta}>
                {item.chineseTitle && <span>{item.chineseTitle}</span>}
              </p>
              <p style={styles.meta}>Score: {(item.score * 100).toFixed(1)}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------
// Inline styles
// ------------------
const styles = {
  container: {
    padding: "20px",
    maxWidth: "700px",
    margin: "0 auto",
    fontFamily: "Arial, sans-serif",
  },
  title: { marginBottom: "20px" },
  uploadBox: {
    marginBottom: "20px",
    border: "2px dashed #ccc",
    padding: "15px",
    borderRadius: "10px",
  },
  previewBox: {
    marginBottom: "20px",
    textAlign: "center",
  },
  previewImage: {
    width: "200px",
    borderRadius: "10px",
    border: "1px solid #ddd",
  },
  button: {
    padding: "10px 20px",
    marginBottom: "20px",
    background: "#007bff",
    color: "white",
    border: "none",
    cursor: "pointer",
    borderRadius: "6px",
  },
  error: {
    color: "red",
    marginBottom: "10px",
  },
  resultsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "15px",
    marginTop: "25px",
  },
  card: {
    border: "1px solid #ddd",
    borderRadius: "10px",
    padding: "10px",
    background: "white",
    textAlign: "center",
  },
  cardImage: {
    width: "100%",
    height: "140px",
    objectFit: "cover",
    borderRadius: "6px",
  },
  cardInfo: {
    marginTop: "8px",
  },
  meta: {
    fontSize: "12px",
    color: "#666",
    margin: "2px 0",
  },
};
