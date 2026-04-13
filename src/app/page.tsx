"use client";

import { useState, useRef, useCallback } from "react";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import { saveAs } from "file-saver";

type InputMode = "file" | "url" | "path";
type SummaryTab = "chronological" | "thematic";

export default function Home() {
  const [mode, setMode] = useState<InputMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [chronological, setChronological] = useState("");
  const [thematic, setThematic] = useState("");
  const [activeTab, setActiveTab] = useState<SummaryTab>("chronological");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    mode === "file"
      ? !!file
      : mode === "url"
        ? url.trim().length > 0
        : localPath.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setChronological("");
    setThematic("");
    setActiveTab("chronological");

    try {
      let res: Response;

      if (mode === "file" && file) {
        // Send filename only — server finds the file on disk
        res = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name }),
        });
      } else if (mode === "url") {
        res = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
      } else {
        res = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localPath: localPath.trim() }),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Une erreur est survenue");
      }

      const data = await res.json();
      setChronological(data.chronological);
      setThematic(data.thematic);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isMediaFile(dropped)) {
      setFile(dropped);
      setMode("file");
      setError("");
    } else {
      setError("Format non supporté. Utilisez un fichier audio ou vidéo.");
    }
  }

  function isMediaFile(f: File) {
    return f.type.startsWith("audio/") || f.type.startsWith("video/");
  }

  const hasSummary = chronological || thematic;
  const activeSummary = activeTab === "chronological" ? chronological : thematic;

  const exportPDF = useCallback(() => {
    const doc = new jsPDF();
    const title = activeTab === "chronological" ? "ملخص زمني" : "ملخص موضوعي";

    // Load Arabic-compatible font (use built-in Helvetica for now, RTL handled via text)
    doc.setFont("Helvetica");
    doc.setFontSize(16);
    doc.text(title, doc.internal.pageSize.getWidth() / 2, 20, { align: "center" });

    doc.setFontSize(11);
    const lines = doc.splitTextToSize(activeSummary, 170);
    let y = 35;
    for (const line of lines) {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, doc.internal.pageSize.getWidth() - 20, y, { align: "right" });
      y += 6;
    }

    doc.save(`resume-${activeTab}.pdf`);
  }, [activeSummary, activeTab]);

  const exportWord = useCallback(async () => {
    const title = activeTab === "chronological" ? "ملخص زمني" : "ملخص موضوعي";

    const paragraphs = activeSummary.split("\n").map(
      (line) =>
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          children: [
            new TextRun({
              text: line,
              font: "Arial",
              size: 24,
              rightToLeft: true,
            }),
          ],
        })
    );

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: title,
                  bold: true,
                  font: "Arial",
                  size: 32,
                  rightToLeft: true,
                }),
              ],
            }),
            new Paragraph({ children: [] }),
            ...paragraphs,
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `resume-${activeTab}.docx`);
  }, [activeSummary, activeTab]);

  return (
    <div className="islamic-bg islamic-pattern min-h-screen flex flex-col items-center">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center gap-10 py-16 px-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <p
            className="text-2xl text-gold/60"
            style={{ fontFamily: "var(--font-noto-naskh), serif" }}
          >
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </p>
          <div className="relative inline-block">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-gold-light via-gold to-amber-600 bg-clip-text text-transparent">
              Media Summarizer
            </h1>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-24 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
          </div>
          <p
            className="text-xl text-gold/80 star-decoration"
            style={{ fontFamily: "var(--font-noto-naskh), serif" }}
          >
            ملخصات المحتوى الإسلامي
          </p>
          <p className="text-sm text-zinc-500">
            Uploadez un fichier, collez un lien, ou indiquez un chemin local
          </p>
        </div>

        {/* Input mode tabs */}
        <div className="w-full flex rounded-xl overflow-hidden border border-gold/20">
          <button
            onClick={() => setMode("file")}
            className={`flex-1 py-3 text-sm font-medium transition-all duration-300 ${
              mode === "file"
                ? "bg-gold/15 text-gold border-b-2 border-gold"
                : "bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            📁 Fichier
          </button>
          <button
            onClick={() => setMode("url")}
            className={`flex-1 py-3 text-sm font-medium transition-all duration-300 ${
              mode === "url"
                ? "bg-gold/15 text-gold border-b-2 border-gold"
                : "bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            🔗 URL
          </button>
          <button
            onClick={() => setMode("path")}
            className={`flex-1 py-3 text-sm font-medium transition-all duration-300 ${
              mode === "path"
                ? "bg-gold/15 text-gold border-b-2 border-gold"
                : "bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            💻 Chemin local
          </button>
        </div>

        {/* File upload zone */}
        {mode === "file" && (
          <div
            className={`w-full rounded-2xl border p-10 text-center transition-all duration-300 cursor-pointer backdrop-blur-sm ${
              dragOver
                ? "border-gold bg-gold/10 glow-gold-strong scale-[1.02]"
                : file
                  ? "border-emerald-500/50 bg-emerald-500/5 glow-gold"
                  : "border-gold/20 bg-white/[0.02] hover:border-gold/40 hover:bg-white/[0.04]"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) {
                  setFile(selected);
                  setError("");
                }
              }}
            />
            {file ? (
              <div className="space-y-2">
                <div className="text-3xl">📂</div>
                <p className="text-lg font-medium text-emerald-400">
                  {file.name}
                </p>
                <p className="text-sm text-zinc-500">
                  {(file.size / 1024 / 1024).toFixed(1)} MB — Cliquez pour
                  changer
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-4xl opacity-40">🎙️</div>
                <p className="text-lg text-zinc-300">
                  Glissez un fichier ici ou cliquez pour sélectionner
                </p>
                <p className="text-sm text-zinc-600">
                  Audio ou Vidéo (tous formats, toutes tailles)
                </p>
              </div>
            )}
          </div>
        )}

        {/* URL input */}
        {mode === "url" && (
          <div className="w-full rounded-2xl border border-gold/20 bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300 focus-within:border-gold/40">
            <div className="space-y-4">
              <div className="text-3xl text-center opacity-40">🔗</div>
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError("");
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-transparent border border-gold/20 rounded-xl px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-gold/50 transition-colors"
              />
              <p className="text-xs text-zinc-600 text-center">
                YouTube, ou lien direct vers un fichier audio/vidéo
              </p>
            </div>
          </div>
        )}

        {/* Local path input */}
        {mode === "path" && (
          <div className="w-full rounded-2xl border border-gold/20 bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300 focus-within:border-gold/40">
            <div className="space-y-4">
              <div className="text-3xl text-center opacity-40">💻</div>
              <input
                type="text"
                value={localPath}
                onChange={(e) => {
                  setLocalPath(e.target.value);
                  setError("");
                }}
                placeholder="/Users/kam/Videos/cours.mp4"
                className="w-full bg-transparent border border-gold/20 rounded-xl px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-gold/50 transition-colors font-mono text-sm"
              />
              <p className="text-xs text-zinc-600 text-center">
                Chemin vers un fichier audio/vidéo sur votre ordinateur (idéal pour les gros fichiers)
              </p>
            </div>
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="w-full relative rounded-xl px-6 py-4 text-base font-semibold transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-amber-700 via-gold to-amber-700 text-black hover:shadow-[0_0_30px_rgba(212,168,83,0.3)] active:scale-[0.98]"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Transcription et résumé en cours...
            </span>
          ) : (
            "Résumer"
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="w-full rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-red-400 text-center backdrop-blur-sm">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="w-full rounded-2xl border border-gold/20 bg-white/[0.02] p-8 space-y-4 backdrop-blur-sm">
            <div className="h-6 w-48 mx-auto rounded bg-gold/10 shimmer" />
            <div className="h-4 w-full rounded bg-gold/5 shimmer" />
            <div className="h-4 w-5/6 rounded bg-gold/5 shimmer" />
            <div className="h-4 w-4/6 rounded bg-gold/5 shimmer" />
            <div className="h-4 w-full rounded bg-gold/5 shimmer" />
            <div className="h-4 w-3/4 rounded bg-gold/5 shimmer" />
          </div>
        )}

        {/* Summary results */}
        {hasSummary && (
          <div className="w-full space-y-4">
            <div className="flex rounded-xl overflow-hidden border border-gold/20">
              <button
                onClick={() => setActiveTab("chronological")}
                className={`flex-1 py-3 text-sm font-medium transition-all duration-300 ${
                  activeTab === "chronological"
                    ? "bg-gold/15 text-gold border-b-2 border-gold"
                    : "bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                📜 Chronologique
              </button>
              <button
                onClick={() => setActiveTab("thematic")}
                className={`flex-1 py-3 text-sm font-medium transition-all duration-300 ${
                  activeTab === "thematic"
                    ? "bg-gold/15 text-gold border-b-2 border-gold"
                    : "bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                📚 Thématique
              </button>
            </div>

            <div
              dir="rtl"
              className="w-full rounded-2xl border border-gold/30 overflow-hidden glow-gold backdrop-blur-sm animate-border-glow"
            >
              <div className="relative bg-gradient-to-r from-amber-900/80 via-amber-800/80 to-amber-900/80 px-6 py-4 border-b border-gold/20">
                <div className="absolute inset-0 islamic-pattern opacity-30" />
                <div className="relative flex items-center justify-between">
                  <h2
                    className="text-xl font-bold text-gold-light"
                    style={{ fontFamily: "var(--font-noto-naskh), serif" }}
                  >
                    {activeTab === "chronological"
                      ? "✦ ملخص زمني ✦"
                      : "✦ ملخص موضوعي ✦"}
                  </h2>
                </div>
              </div>

              <div className="bg-black/40 p-8">
                <div
                  className="text-zinc-200 whitespace-pre-wrap leading-[2.2] text-right text-lg"
                  style={{ fontFamily: "var(--font-noto-naskh), serif" }}
                >
                  {activeSummary}
                </div>
              </div>

              <div className="bg-black/60 border-t border-gold/10 px-6 py-3 flex justify-between items-center">
                <p className="text-xs text-gold/30" dir="ltr">
                  Résumé généré par IA
                </p>
                <p
                  className="text-xs text-gold/30"
                  style={{ fontFamily: "var(--font-noto-naskh), serif" }}
                >
                  والله أعلم
                </p>
              </div>
            </div>

            {/* Export buttons */}
            <div className="flex gap-3">
              <button
                onClick={exportPDF}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-gold/20 bg-white/[0.03] px-4 py-3 text-sm font-medium text-gold/80 transition-all hover:bg-gold/10 hover:border-gold/40"
              >
                📄 Exporter en PDF
              </button>
              <button
                onClick={exportWord}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-gold/20 bg-white/[0.03] px-4 py-3 text-sm font-medium text-gold/80 transition-all hover:bg-gold/10 hover:border-gold/40"
              >
                📝 Exporter en Word
              </button>
            </div>
          </div>
        )}

        <div className="mt-auto pt-8 text-center">
          <div className="w-16 h-px mx-auto bg-gradient-to-r from-transparent via-gold/20 to-transparent mb-4" />
          <p className="text-xs text-zinc-600">
            Media Summarizer — Contenu islamique
          </p>
        </div>
      </main>
    </div>
  );
}
