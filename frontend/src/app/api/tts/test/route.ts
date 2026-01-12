import { NextRequest, NextResponse } from "next/server";

// TTS Provider configurations
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// French voices configuration
export interface Voice {
  id: string;
  name: string;
  gender: "male" | "female" | "child";
  provider: "elevenlabs" | "openai" | "edge-tts";
  description: string;
  accent?: string;
}

// ElevenLabs French-capable multilingual voices
const ELEVENLABS_VOICES: Voice[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", provider: "elevenlabs", description: "Voix douce et naturelle", accent: "Neutre" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", gender: "female", provider: "elevenlabs", description: "Voix chaleureuse et expressive", accent: "Neutre" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", gender: "female", provider: "elevenlabs", description: "Voix jeune et dynamique", accent: "Neutre" },
  { id: "jBpfuIE2acCO8z3wKNLl", name: "Gigi", gender: "female", provider: "elevenlabs", description: "Voix enjouée et légère", accent: "Neutre" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", gender: "female", provider: "elevenlabs", description: "Voix professionnelle et claire", accent: "Neutre" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female", provider: "elevenlabs", description: "Voix élégante et posée", accent: "Neutre" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "male", provider: "elevenlabs", description: "Voix masculine profonde", accent: "Neutre" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", gender: "male", provider: "elevenlabs", description: "Voix masculine douce", accent: "Neutre" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", gender: "male", provider: "elevenlabs", description: "Voix jeune et énergique", accent: "Neutre" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", gender: "male", provider: "elevenlabs", description: "Voix mature et posée", accent: "Neutre" },
];

// OpenAI TTS voices (all support French text)
const OPENAI_VOICES: Voice[] = [
  { id: "alloy", name: "Alloy", gender: "female", provider: "openai", description: "Voix neutre et polyvalente", accent: "Standard" },
  { id: "echo", name: "Echo", gender: "male", provider: "openai", description: "Voix masculine profonde", accent: "Standard" },
  { id: "fable", name: "Fable", gender: "male", provider: "openai", description: "Voix narrative expressive", accent: "Standard" },
  { id: "onyx", name: "Onyx", gender: "male", provider: "openai", description: "Voix grave et autoritaire", accent: "Standard" },
  { id: "nova", name: "Nova", gender: "female", provider: "openai", description: "Voix féminine douce", accent: "Standard" },
  { id: "shimmer", name: "Shimmer", gender: "female", provider: "openai", description: "Voix légère et claire", accent: "Standard" },
];

// Edge TTS French voices (Microsoft Neural)
const EDGE_TTS_VOICES: Voice[] = [
  { id: "fr-FR-DeniseNeural", name: "Denise", gender: "female", provider: "edge-tts", description: "Voix féminine française naturelle", accent: "France" },
  { id: "fr-FR-HenriNeural", name: "Henri", gender: "male", provider: "edge-tts", description: "Voix masculine française claire", accent: "France" },
  { id: "fr-FR-EloiseNeural", name: "Eloise", gender: "child", provider: "edge-tts", description: "Voix enfantine douce", accent: "France" },
  { id: "fr-FR-VivienneMultilingualNeural", name: "Vivienne", gender: "female", provider: "edge-tts", description: "Voix multilingue élégante", accent: "France" },
  { id: "fr-FR-RemyMultilingualNeural", name: "Rémy", gender: "male", provider: "edge-tts", description: "Voix multilingue chaleureuse", accent: "France" },
  { id: "fr-BE-CharlineNeural", name: "Charline", gender: "female", provider: "edge-tts", description: "Voix belge douce", accent: "Belgique" },
  { id: "fr-BE-GerardNeural", name: "Gérard", gender: "male", provider: "edge-tts", description: "Voix belge masculine", accent: "Belgique" },
  { id: "fr-CA-SylvieNeural", name: "Sylvie", gender: "female", provider: "edge-tts", description: "Voix québécoise naturelle", accent: "Québec" },
  { id: "fr-CA-JeanNeural", name: "Jean", gender: "male", provider: "edge-tts", description: "Voix québécoise masculine", accent: "Québec" },
  { id: "fr-CA-ThierryNeural", name: "Thierry", gender: "male", provider: "edge-tts", description: "Voix québécoise dynamique", accent: "Québec" },
  { id: "fr-CA-AntoineNeural", name: "Antoine", gender: "male", provider: "edge-tts", description: "Voix québécoise posée", accent: "Québec" },
  { id: "fr-CH-ArianeNeural", name: "Ariane", gender: "female", provider: "edge-tts", description: "Voix suisse douce", accent: "Suisse" },
  { id: "fr-CH-FabriceNeural", name: "Fabrice", gender: "male", provider: "edge-tts", description: "Voix suisse masculine", accent: "Suisse" },
];

export async function GET() {
  const allVoices = [
    ...ELEVENLABS_VOICES,
    ...OPENAI_VOICES,
    ...EDGE_TTS_VOICES,
  ];

  return NextResponse.json({
    voices: allVoices,
    providers: {
      elevenlabs: !!ELEVENLABS_API_KEY,
      openai: !!OPENAI_API_KEY,
      "edge-tts": true, // Always available via backend
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voiceId, provider } = body;

    if (!text || !voiceId || !provider) {
      return NextResponse.json(
        { error: "Missing required fields: text, voiceId, provider" },
        { status: 400 }
      );
    }

    let audioBuffer: ArrayBuffer;

    switch (provider) {
      case "elevenlabs":
        audioBuffer = await generateElevenLabsTTS(text, voiceId);
        break;
      case "openai":
        audioBuffer = await generateOpenAITTS(text, voiceId);
        break;
      case "edge-tts":
        audioBuffer = await generateEdgeTTS(text, voiceId);
        break;
      default:
        return NextResponse.json(
          { error: "Unknown provider" },
          { status: 400 }
        );
    }

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("TTS Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS generation failed" },
      { status: 500 }
    );
  }
}

async function generateElevenLabsTTS(text: string, voiceId: string): Promise<ArrayBuffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ElevenLabs API key not configured");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs error: ${error}`);
  }

  return response.arrayBuffer();
}

async function generateOpenAITTS(text: string, voiceId: string): Promise<ArrayBuffer> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      input: text,
      voice: voiceId,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI TTS error: ${error}`);
  }

  return response.arrayBuffer();
}

async function generateEdgeTTS(text: string, voiceId: string): Promise<ArrayBuffer> {
  // Use the backend Edge-TTS endpoint with direct voice ID
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  // Try the direct TTS endpoint first
  const response = await fetch(`${BACKEND_URL}/tts/direct`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      rate: "+5%",
      pitch: "+0Hz",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Edge-TTS error: ${error}`);
  }

  return response.arrayBuffer();
}
