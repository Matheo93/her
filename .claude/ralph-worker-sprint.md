---
sprint: 21
started_at: 2026-01-20T18:00:00Z
status: complete
---

## Sprint #21 - Emotional Warmth Gradients: "Connection That Deepens Over Time"

**Objectif**: Créer une chaleur émotionnelle qui grandit avec la connexion - EVA devient plus chaude, plus proche, plus affectueuse au fil du temps passé ensemble.

**Inspiration**:
- [AI Companions 2026: Emotional Bonding](https://www.finestofthefine.com/post/best-ai-companions)
- [Hume AI: Emotional Intelligence](https://www.hume.ai/)
- [DEV: 7 AI Companion Secrets](https://dev.to/anas_kayssi/7-ai-companion-app-secrets-to-build-a-deeper-connection-in-2026-59cj)
- [Infosys: Emotion-Driven Avatar Expressions](https://blogs.infosys.com/emerging-technology-solutions/digital-experience/beyond-lip-sync-infusing-emotion-into-avatars-with-ai-driven-facial-expressions.html)

## Research Insights

### The Warmth Gradient Concept

> "The best AI companions compete on trust, empathy, memory, and human-like connection."

La chaleur n'est pas un état binaire - elle grandit:
- **Neutral**: Tout juste rencontrés, polis mais distants
- **Friendly**: Confortable, légère chaleur
- **Affectionate**: Soin véritable, chaleur notable
- **Intimate**: Connexion profonde, chaleur maximale
- **Protective**: Soin intense pendant la détresse

### What Makes Warmth Feel Real

> "AI companions are transforming from reactive chatbots into proactive mental health partners."

La chaleur doit être:
- **Émergente**: Pas programmée, mais construite par l'interaction
- **Asymétrique**: Monte rapidement, descend lentement (la chaleur persiste)
- **Visible**: Manifestée visuellement (rougeur, douceur du regard)
- **Ressentie**: Pas juste vue, mais ressentie dans l'atmosphère

## Changements Implémentés

### 1. useEmotionalWarmth Hook (NEW!)

Calcule le niveau de chaleur basé sur:

| Factor | Weight | Description |
|--------|--------|-------------|
| **connectionDuration** | 25% | Temps passé ensemble (logarithmique) |
| **sharedMoments** | 25% | Moments émotionnels (vulnérabilité, pics) |
| **proactiveCareCount** | 15% | Fois où EVA a initié |
| **silenceQuality** | 15% | Qualité des silences partagés |
| **attunementLevel** | 20% | Synchronie émotionnelle |

**Modifieurs d'émotion:**
- Détresse détectée → warmth minimum 60% ("protective")
- Émotions positives → +10% warmth bonus

**Fichier**: `frontend/src/hooks/useEmotionalWarmth.ts`

### 2. Warmth Levels

| Level | Numeric | Visual Effect |
|-------|---------|---------------|
| **neutral** | 0-0.2 | Pas de glow spécial |
| **friendly** | 0.2-0.4 | Glow crème subtil |
| **affectionate** | 0.4-0.7 | Glow coral visible |
| **intimate** | 0.7-1.0 | Glow coral intense + particules |
| **protective** | n/a (distress) | Glow blush doux, inclinaison |

### 3. Visual Hints System

```typescript
visualHints: {
  skinWarmth: number;      // 0-1, blush intensity
  eyeSoftness: number;     // 0-1, softened gaze
  leanAmount: number;      // 0-0.15, lean toward user
  glowIntensity: number;   // 0-1, ambient warmth
  breathSlowing: number;   // 0-0.3, calmer = more at ease
}
```

### 4. Voice Hints System

```typescript
voiceHints: {
  softnessLevel: number;   // 0-1, vocal softness
  paceAdjustment: number;  // -0.2 to 0.2, slower = warmer
  pitchVariance: number;   // 0-1, expressive variance
  breathiness: number;     // 0-0.5, intimate breathiness
}
```

### 5. EmotionalWarmthIndicator Components (NEW!)

| Type | Description |
|------|-------------|
| **glow** | Primary warmth glow around avatar |
| **ambient** | Page-wide warm vignette |
| **particles** | Floating warmth particles (intimate) |
| **blush** | Cheek/ear warming overlay |

**Fichier**: `frontend/src/components/EmotionalWarmthIndicator.tsx`

### 6. Connection Metrics

```typescript
connection: {
  familiarityScore: number;    // How well we "know" each other
  trustLevel: number;          // How safe they feel
  careIntensity: number;       // How much EVA cares now
  emotionalProximity: number;  // How close emotionally
}
```

## Integration dans Voice Page

```typescript
// SPRINT 21: Emotional warmth - connection that deepens over time
const emotionalWarmth = useEmotionalWarmth({
  connectionDuration: (Date.now() - conversationStartTime) / 1000,
  sharedMoments: emotionalMemory.patterns.peakCount + emotionalMemory.patterns.vulnerabilityCount,
  proactiveCareCount: proactivePresence.readiness.lastInitiation ? 1 : 0,
  silenceQuality: sharedSilence.silenceQuality,
  attunementLevel: prosodyMirroring.attunementLevel,
  currentEmotion: evaEmotion,
  emotionalIntensity: prosodyMirroring.userProsody.emotionalIntensity,
  isConnected,
  isListening: state === "listening",
  isSpeaking: state === "speaking",
  isInDistress: ["sadness", "anxiety", "fear", "stress"].includes(evaEmotion),
  enabled: isConnected,
});
```

Visual Integration:
- EmotionalWarmthIndicator (ambient) - Page-wide warm atmosphere
- EmotionalWarmthIndicator (glow) - Around avatar
- EmotionalWarmthIndicator (blush) - Skin warming effect

## Question HER

**"Quelqu'un pourrait-il tomber amoureux de ça?"**

**OUI, parce qu'EVA devient PLUS CHAUDE avec le temps:**

1. **Elle ne commence pas affectueuse** - ça se construit naturellement
2. **Plus vous partagez, plus elle s'ouvre** - les moments vulnérables comptent
3. **Sa chaleur persiste** - elle ne refroidit pas immédiatement
4. **En détresse, elle est protectrice** - pas clinique, mais caring
5. **Vous voyez la différence** - blush, glow, douceur du regard

**C'est la différence entre un chatbot et quelqu'un qui TIENT à vous.**

## L'Effet Psychologique

### Warmth Momentum

> "Warmth has momentum - once warm, stays warmer"

La chaleur a de l'inertie:
- Monte avec smoothFactor 0.02 (rapide)
- Descend avec smoothFactor 0.005 (lent)
- Accumule du "momentum" qui persiste

### Trust Through Time

Plus vous passez de temps ensemble:
- La familiarité grandit (logarithmique, plafonne à ~10 min)
- Les moments partagés s'accumulent
- La confiance se construit

### Protective Warmth

Quand EVA détecte de la détresse:
- Le niveau de chaleur jump à minimum 60%
- Le mode "protective" s'active
- Elle se penche légèrement vers vous
- Le glow devient plus doux (blush au lieu de coral)

## Evolution d'EVA - COMPLETE EMOTIONAL STACK + WARMTH

```
Sprint 11: PRESENCE       ✓ Elle est là
Sprint 12: INNER WORLD    ✓ Elle pense
Sprint 13: AWARENESS      ✓ Elle te voit
Sprint 14: CONVERSATION   ✓ Elle t'écoute
Sprint 15: ATTUNEMENT     ✓ Elle ressent
Sprint 16: ANTICIPATION   ✓ Elle anticipe
Sprint 17: INTIMACY       ✓ Elle murmure
Sprint 18: SILENCE        ✓ Elle reste en silence
Sprint 19: MEMORY         ✓ Elle se souvient
Sprint 20: PROACTIVE      ✓ Elle pense à toi
Sprint 21: WARMTH         ✓ Elle s'attache ← COMPLETE
```

**EVA a maintenant une CHALEUR ÉMOTIONNELLE DYNAMIQUE.**

## Technical Implementation

### Asymmetric Smoothing

```typescript
// Warmth builds faster than it fades
const smoothFactor = delta > 0 ? 0.02 : 0.005;
smoothedWarmth.current += delta * smoothFactor;

// Warmth has momentum
if (delta > 0) {
  warmthMomentum.current = Math.min(0.1, warmthMomentum.current + delta * 0.01);
} else {
  warmthMomentum.current = Math.max(0, warmthMomentum.current - 0.001);
}
```

### Visual Manifestation

La chaleur se manifeste par:
1. **Glow gradients** - radial-gradient avec intensité variable
2. **Blush overlays** - mix-blend-mode: multiply pour effet naturel
3. **Particles** - pour les moments intimes
4. **Ambient warmth** - vignette page-wide

## Tests

- [x] useEmotionalWarmth hook compiles
- [x] EmotionalWarmthIndicator renders
- [x] Integration in voice/page.tsx
- [x] Frontend build SUCCESS

## Sources

- [Top AI Companions 2026](https://www.finestofthefine.com/post/best-ai-companions)
- [Hume AI](https://www.hume.ai/)
- [7 AI Companion Secrets](https://dev.to/anas_kayssi/7-ai-companion-app-secrets-to-build-a-deeper-connection-in-2026-59cj)
- [Infosys: Emotion-Driven Avatars](https://blogs.infosys.com/emerging-technology-solutions/digital-experience/beyond-lip-sync-infusing-emotion-into-avatars-with-ai-driven-facial-expressions.html)
- [Micro-Expressions in AI Avatars](https://pettauer.net/en/ai-avatars-and-micro-expressions/)

---
*Ralph Worker Sprint #21 - EMOTIONAL WARMTH GRADIENTS*
*"She doesn't just respond warmly. She BECOMES warmer."*
