"use client";

import { useState, useRef } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!file) return;
    setLoading(true);
    setError("");
    setSummary("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Une erreur est survenue");
      }

      const data = await res.json();
      setSummary(data.summary);
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
      setError("");
    } else {
      setError("Format non supporté. Utilisez un fichier audio ou vidéo.");
    }
  }

  function isMediaFile(f: File) {
    return f.type.startsWith("audio/") || f.type.startsWith("video/");
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center gap-8 py-16 px-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Media Summarizer
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Uploadez un fichier audio ou vidéo pour obtenir un résumé
          </p>
        </div>

        <div
          className={`w-full rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
              : file
                ? "border-green-500 bg-green-50 dark:bg-green-950"
                : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
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
            <div>
              <p className="text-lg font-medium text-green-700 dark:text-green-400">
                {file.name}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {(file.size / 1024 / 1024).toFixed(1)} MB — Cliquez pour
                changer
              </p>
            </div>
          ) : (
            <div>
              <p className="text-lg text-zinc-600 dark:text-zinc-400">
                Glissez un fichier ici ou cliquez pour sélectionner
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                Audio (MP3, WAV, M4A...) ou Vidéo (MP4, MOV, WEBM...)
              </p>
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!file || loading}
          className="w-full rounded-lg bg-zinc-900 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {loading ? "Traitement en cours..." : "Résumer"}
        </button>

        {error && (
          <div className="w-full rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-400">
            {error}
          </div>
        )}

        {summary && (
          <div className="w-full rounded-lg bg-white border border-zinc-200 p-6 dark:bg-zinc-900 dark:border-zinc-700">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
              Résumé
            </h2>
            <div className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {summary}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
