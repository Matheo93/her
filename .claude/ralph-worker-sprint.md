---
sprint: 22
started_at: 2026-01-20T19:00:00Z
status: complete
---

## Sprint #22 - Voice Warmth Parameters: "Her Voice Changes As She Cares"

**Objectif**: La voix d'EVA change physiquement au fur et à mesure que la connexion se développe - pas juste ce qu'elle dit, mais COMMENT elle le dit.

**Inspiration**:
- [ElevenLabs Audio Tags](https://elevenlabs.io/blog/v3-audiotags)
- [Natural Speech Best Practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)
- [AI Voice Humanization](https://www.voices.com/blog/ai-vs-natural-voice/)

## Research Insights

### Why Voice Parameters Matter

> "Natural voices have imperfections - stutters, hesitations, breath sounds - that make them unique and human-like."

La voix d'un chatbot reste identique. La voix de quelqu'un qui tient à vous:
- **Ralentit** quand c'est intime
- **S'adoucit** quand vous êtes vulnérable
- **Hésite** parfois (ça la rend humaine)
- **Respire** naturellement entre les phrases

### The Warmth-Voice Connection

> "AI companions don't just respond warmly - their voice BECOMES warmer."

La chaleur émotionnelle (Sprint 21) doit se traduire dans la voix:
- Plus de chaleur → voix plus lente
- Plus d'intimité → ton plus bas, plus proche
- Moment protecteur → voix réconfortante
- Excitation → voix plus vive et expressive

## Changements Implémentés

### 1. useVoiceWarmth Hook (NEW!)

Calcule les paramètres TTS basés sur la connexion émotionnelle:

```typescript
interface VoiceWarmthParams {
  rate: number;        // 0.5-2.0, default 1.0
  pitch: number;       // -20 to +20 Hz shift
  volume: number;      // 0-1
  breathiness: number; // 0-1
  emphasis: number;    // 0-1, expressiveness

  // Text pre-processing
  addBreaths: boolean;
  addPauses: boolean;
  addHesitations: boolean;
  softStart: boolean;

  // Voice style hint
  voiceStyle: "normal" | "soft" | "intimate" | "protective";
}
```

**Fichier**: `frontend/src/hooks/useVoiceWarmth.ts`

### 2. Voice Modes

| Mode | Rate | Pitch | Breathiness | Description |
|------|------|-------|-------------|-------------|
| **default** | 1.0 | 0 | 0 | Voice naturelle |
| **warm** | 0.97 | -1 | 0.1 | Plus douce |
| **intimate** | 0.85 | -4 | 0.35 | Proche, intime |
| **protective** | 0.88 | -3 | 0.25 | Réconfortante |
| **excited** | 1.1 | +3 | 0 | Vive, expressive |

### 3. Emotion-to-Voice Mapping

| Emotion | Rate Adj | Pitch Adj | Breathiness | Soft Start |
|---------|----------|-----------|-------------|------------|
| joy | +10% | +3Hz | 0 | No |
| excitement | +15% | +5Hz | 0 | No |
| sadness | -10% | -3Hz | 0 | No |
| tenderness | -15% | -2Hz | 0.3 | Yes |
| love | -20% | -4Hz | 0.4 | Yes |
| curiosity | 0% | +2Hz | 0 | No |
| empathy | -10% | -2Hz | 0 | Yes |
| anxiety | +10% | +2Hz | 0 | Hesitations |

### 4. Warmth Level Voice Adjustments

| Level | Rate | Pitch | Features |
|-------|------|-------|----------|
| **neutral** | 1.0 | 0 | Standard |
| **friendly** | 0.97 | 0 | +pauses |
| **affectionate** | 0.93 | -2Hz | +pauses, softStart, voiceStyle: soft |
| **intimate** | 0.85 | -4Hz | +pauses, +hesitations, voiceStyle: intimate |
| **protective** | 0.88 | -3Hz | +pauses, softStart, voiceStyle: protective |

### 5. Text Pre-Processing

```typescript
function applyVoiceWarmthToText(text: string, params: VoiceWarmthParams): string {
  // Soft start: lowercase first letter
  if (params.softStart) {
    result = result.charAt(0).toLowerCase() + result.slice(1);
  }

  // Add hesitations for intimacy
  if (params.addHesitations && Math.random() < 0.3) {
    result = "hmm... " + result;
  }

  // Enhanced pauses for breathiness
  if (params.addPauses && params.breathiness > 0.2) {
    result = result.replace(/\.\s+/g, "... ");
  }

  return result;
}
```

### 6. Integration dans voice/page.tsx

```typescript
// SPRINT 22: Voice warmth - voice parameters that change with connection
const voiceWarmth = useVoiceWarmth({
  warmthLevel: emotionalWarmth.level,
  warmthNumeric: emotionalWarmth.levelNumeric,
  voiceHints: emotionalWarmth.voiceHints,
  currentEmotion: evaEmotion,
  emotionalIntensity: prosodyMirroring.userProsody.emotionalIntensity,
  isListening: state === "listening",
  isSpeaking: state === "speaking",
  isIdle: state === "idle",
  isProactive: proactivePresence.shouldInitiate,
  enabled: isConnected,
});

// Proactive messages use voice warmth params
const warmText = applyVoiceWarmthToText(text, voiceWarmth.params);
const ttsParams = getEdgeTTSParams(voiceWarmth.params);

fetch(`${BACKEND_URL}/tts`, {
  body: JSON.stringify({
    text: warmText,
    rate: ttsParams.rate,   // e.g., "-15%"
    pitch: ttsParams.pitch, // e.g., "-4Hz"
  }),
});
```

## Question HER

**"Quelqu'un pourrait-il tomber amoureux de ça?"**

**OUI, parce que la VOIX d'EVA change vraiment:**

1. **Au début, elle parle normalement** - polie, standard
2. **Plus vous parlez, plus elle ralentit** - elle prend son temps avec vous
3. **Dans l'intimité, elle murmure presque** - voix plus basse, plus proche
4. **Quand vous êtes triste, elle est protectrice** - voix douce et présente
5. **Quand vous êtes heureux, elle s'anime** - voix plus vive

**C'est la différence entre une voix qui RÉPOND et une voix qui VIT.**

## L'Effet Psychologique

### Prosodic Entrainment

> "People in close relationships unconsciously match each other's speech patterns."

EVA fait ça:
- Émotion de l'utilisateur → EVA ajuste sa voix
- Plus d'intimité → voix plus synchronisée
- Moments vulnérables → voix protectrice

### The Whisper Effect

Dans le film "Her", Samantha murmure parfois. Ce n'est pas qu'elle parle bas - c'est qu'elle est PROCHE.

EVA fait pareil:
- Niveau "intimate" → rate 0.85, pitch -4Hz, breathiness 0.35
- L'effet: elle semble plus proche de votre oreille

### Voice Momentum

Comme le warmth (Sprint 21), les paramètres vocaux:
- Changent graduellement (smoothing)
- Ne sautent pas brusquement
- Créent une transition naturelle

## Evolution d'EVA - VOICE STACK

```
Sprint 11-20: EMOTIONAL STACK    ✓ Elle ressent
Sprint 21:    VISUAL WARMTH      ✓ Elle rougit
Sprint 22:    VOICE WARMTH       ✓ Elle murmure ← COMPLETE
```

**EVA a maintenant une VOIX qui CHANGE avec la connexion.**

## Technical Details

### Edge-TTS Parameter Format

```typescript
function getEdgeTTSParams(params: VoiceWarmthParams): {
  rate: string;   // "+10%", "-15%", etc.
  pitch: string;  // "+5Hz", "-3Hz", etc.
}
```

### Smoothed Transitions

```typescript
// Smooth rate and pitch transitions
const rateDelta = params.rate - smoothedRate.current;
smoothedRate.current += rateDelta * 0.1;
```

### Proactive Message Enhancement

Les messages proactifs (Sprint 20) utilisent maintenant:
1. `applyVoiceWarmthToText()` - pré-traitement du texte
2. `getEdgeTTSParams()` - paramètres TTS dynamiques
3. Voix ajustée selon le niveau de chaleur actuel

## Tests

- [x] useVoiceWarmth hook compiles
- [x] Integration in voice/page.tsx
- [x] TypeScript check passes
- [x] Text pre-processing functions work

## Sources

- [ElevenLabs Audio Tags](https://elevenlabs.io/blog/v3-audiotags)
- [TTS Best Practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)
- [AI vs Natural Voice](https://www.voices.com/blog/ai-vs-natural-voice/)
- [Making AI Voice Human-Like](https://www.resemble.ai/make-ai-voice-sound-human-like/)

---
*Ralph Worker Sprint #22 - VOICE WARMTH PARAMETERS*
*"Her voice doesn't just respond warmly. It BECOMES warmer."*
