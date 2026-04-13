import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { writeFile, unlink, readFile, stat } from "fs/promises";
import { execFile, execSync } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import { readdirSync } from "fs";

const openai = new OpenAI();
const execFileAsync = promisify(execFile);

function isYouTubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

async function downloadYouTubeAudio(url: string): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `yt-${Date.now()}.mp3`);
  await execFileAsync("yt-dlp", [
    "--cookies-from-browser", "chrome",
    "-x", "--audio-format", "mp3", "--audio-quality", "9",
    "--postprocessor-args", "-ac 1 -ar 16000",
    "-o", outputPath, "--no-playlist", url,
  ], { timeout: 300000 });
  return outputPath;
}

// Extract audio and split into chunks of ~20 min each (stays under 25MB for Whisper)
async function extractAndSplitAudio(inputPath: string): Promise<string[]> {
  const prefix = path.join(os.tmpdir(), `chunk-${Date.now()}-`);

  await execFileAsync("ffmpeg", [
    "-i", inputPath,
    "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k",
    "-f", "segment",
    "-segment_time", "1200", // 20 minutes per chunk
    "-reset_timestamps", "1",
    "-y",
    `${prefix}%03d.mp3`,
  ], { timeout: 600000 });

  // Find all generated chunk files
  const dir = path.dirname(prefix);
  const baseName = path.basename(prefix);
  const chunks = readdirSync(dir)
    .filter((f) => f.startsWith(baseName) && f.endsWith(".mp3"))
    .sort()
    .map((f) => path.join(dir, f));

  return chunks;
}

// Transcribe a single audio chunk with Whisper
async function transcribeChunk(chunkPath: string): Promise<string> {
  const buffer = await readFile(chunkPath);
  const file = new File([buffer], "chunk.mp3", { type: "audio/mpeg" });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return result.text || "";
}

// Find file by name in common directories
function findFileByName(fileName: string): string | null {
  const searchDirs = [
    path.join(os.homedir(), "Downloads"),
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Movies"),
    path.join(os.homedir(), "Music"),
  ];
  for (const dir of searchDirs) {
    try {
      const result = execSync(
        `find ${JSON.stringify(dir)} -maxdepth 3 -name ${JSON.stringify(fileName)} -type f 2>/dev/null | head -1`,
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      if (result) return result;
    } catch {}
  }
  return null;
}

export async function POST(request: NextRequest) {
  const tempFiles: string[] = [];

  try {
    const contentType = request.headers.get("content-type") || "";
    let inputFilePath: string;

    if (contentType.includes("application/json")) {
      const body = await request.json();

      if (body.fileName) {
        const found = findFileByName(body.fileName);
        if (!found) {
          return NextResponse.json(
            { error: `Fichier "${body.fileName}" introuvable` },
            { status: 400 }
          );
        }
        inputFilePath = found;
      } else if (body.localPath) {
        try {
          await stat(body.localPath);
        } catch {
          return NextResponse.json(
            { error: "Fichier introuvable : " + body.localPath },
            { status: 400 }
          );
        }
        inputFilePath = body.localPath;
      } else if (body.url) {
        if (isYouTubeUrl(body.url)) {
          inputFilePath = await downloadYouTubeAudio(body.url);
          tempFiles.push(inputFilePath);
        } else {
          const response = await fetch(body.url);
          if (!response.ok) {
            return NextResponse.json(
              { error: "Impossible de télécharger le fichier depuis cette URL" },
              { status: 400 }
            );
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          inputFilePath = path.join(os.tmpdir(), `input-${Date.now()}`);
          await writeFile(inputFilePath, buffer);
          tempFiles.push(inputFilePath);
        }
      } else {
        return NextResponse.json(
          { error: "Aucune source fournie" },
          { status: 400 }
        );
      }
    } else {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "Aucun fichier fourni" },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      inputFilePath = path.join(os.tmpdir(), `input-${Date.now()}-${file.name}`);
      await writeFile(inputFilePath, buffer);
      tempFiles.push(inputFilePath);
    }

    // Extract audio and split into chunks
    const chunks = await extractAndSplitAudio(inputFilePath);
    tempFiles.push(...chunks);

    // Transcribe all chunks
    const transcriptions: string[] = [];
    for (const chunk of chunks) {
      const text = await transcribeChunk(chunk);
      transcriptions.push(text);
    }
    const fullTranscription = transcriptions.join("\n\n");

    if (fullTranscription.trim().length === 0) {
      return NextResponse.json(
        { error: "Impossible de transcrire le fichier audio" },
        { status: 422 }
      );
    }

    // Chronological summary
    const chronoResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `أنت متخصص في تلخيص المحتوى الإسلامي على شكل ملاحظات دراسية مفصّلة. مهمتك هي إعداد ملخص زمني (حسب ترتيب الحديث في التسجيل) باللغة العربية.

⚠️ قواعد مهمة جدًا:
- هذا ملخص تفصيلي وليس مجرد إشارات عامة
- عند ذكر تعريف: اكتب التعريف كاملاً ثم فصّل أجزاءه (أ، ب، ج...)
- عند ذكر شروط: اسردها مرقمة (١، ٢، ٣...)
- عند ذكر فروقات بين مفهومين: اكتب كل فرق على حدة مرقمًا
  مثال: الفرق بين القواعد الأصولية والقواعد الفقهية:
  ١- القواعد الأصولية: ...
  ٢- القواعد الفقهية: ...
  ٣- من حيث الموضوع: ...
- عند ذكر أقسام أو أنواع: رقّمها واشرح كل قسم
- عند ذكر أمثلة: اسردها مرقمة مع شرحها
- لا تكتب فقط "ذكر الشيخ الفرق بين كذا وكذا" بل اكتب الفرق نفسه بالتفصيل

قواعد الترتيب الزمني:
- اتبع الترتيب الذي وردت فيه المواضيع في التسجيل
- استخدم عبارات مثل: "بدأ بـ..." ، "ثم انتقل إلى..." ، "وختم بـ..."
- اذكر الآيات القرآنية والأحاديث النبوية مع مصادرها إن وُجدت`,
        },
        { role: "user", content: `النسخة المكتوبة:\n${fullTranscription}` },
      ],
    });

    const chronoSummary = chronoResponse.choices[0]?.message?.content || "";

    // Thematic summary
    const thematicResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `أنت متخصص في تلخيص المحتوى الإسلامي على شكل ملاحظات دراسية مفصّلة. مهمتك هي إعداد ملخص موضوعي (مجمّع حسب المواضيع والأفكار المتشابهة) باللغة العربية.

⚠️ قواعد مهمة جدًا:
- هذا ملخص تفصيلي وليس مجرد إشارات عامة
- عند ذكر تعريف: اكتب التعريف كاملاً ثم فصّل أجزاءه (أ، ب، ج...)
- عند ذكر شروط: اسردها مرقمة (١، ٢، ٣...)
- عند ذكر فروقات بين مفهومين: اكتب كل فرق على حدة مرقمًا
  مثال: الفرق بين القواعد الأصولية والقواعد الفقهية:
  ١- القواعد الأصولية: ...
  ٢- القواعد الفقهية: ...
  ٣- من حيث الموضوع: ...
- عند ذكر أقسام أو أنواع: رقّمها واشرح كل قسم
- عند ذكر أمثلة: اسردها مرقمة مع شرحها
- لا تكتب فقط "ذكر الشيخ الفرق بين كذا وكذا" بل اكتب الفرق نفسه بالتفصيل

قواعد التجميع الموضوعي:
- اجمع الأفكار والنقاط التي تتناول نفس الموضوع معًا حتى لو وردت في أوقات مختلفة
- أعطِ كل موضوع عنوانًا واضحًا
- رتّب المواضيع من الأهم إلى الأقل أهمية
- اذكر الآيات القرآنية والأحاديث النبوية مع مصادرها تحت الموضوع المناسب
- أضف قسم "الدروس والفوائد المستخلصة" في النهاية
- اختم بخلاصة شاملة`,
        },
        { role: "user", content: `النسخة المكتوبة:\n${fullTranscription}` },
      ],
    });

    const thematicSummary = thematicResponse.choices[0]?.message?.content || "";

    return NextResponse.json({
      chronological: chronoSummary,
      thematic: thematicSummary,
    });
  } catch (err) {
    console.error("Summarize error:", err);
    const message =
      err instanceof Error ? err.message : "Erreur lors du traitement";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    for (const f of tempFiles) {
      await unlink(f).catch(() => {});
    }
  }
}
