import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "fr",
    });

    if (!transcription.text || transcription.text.trim().length === 0) {
      return NextResponse.json(
        { error: "Impossible de transcrire le fichier audio" },
        { status: 422 }
      );
    }

    // Summarize with Claude
    const { text: summary } = await generateText({
      model: anthropic("claude-sonnet-4-6-20250514"),
      prompt: `Voici la transcription d'un fichier audio/vidéo. Fais-en un résumé clair et structuré en français.

Transcription :
${transcription.text}`,
    });

    return NextResponse.json({ summary });
  } catch (err) {
    console.error("Summarize error:", err);
    return NextResponse.json(
      { error: "Erreur lors du traitement du fichier" },
      { status: 500 }
    );
  }
}
