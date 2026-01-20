---
sprint: 14
started_at: 2026-01-20T12:30:00Z
status: complete
---

## Sprint #14 - Conversational Turn-Taking: "She's Truly Listening"

**Objectif**: Créer le sentiment qu'EVA participe activement à la conversation avec des signaux naturels d'écoute, des acquiescements, et une conscience du rythme conversationnel.

**Inspiration**:
- [NVIDIA PersonaPlex - Full Duplex AI](https://research.nvidia.com/labs/adlr/personaplex/)
- [Amazon Nova 2 Sonic - Natural Turn-Taking](https://aws.amazon.com/blogs/aws/introducing-amazon-nova-2-sonic-next-generation-speech-to-speech-model-for-conversational-ai/)
- [Tavus AI Turn-Taking Guide](https://www.tavus.io/post/ai-turn-taking)
- [Sesame Voice Presence](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice)

## Changements Implémentés

### 1. Backchanneling System (NEW!)

EVA produit des sons d'acquiescement naturels pendant l'écoute:

| Feature | Description |
|---------|-------------|
| **Verbal Acknowledgments** | "mmh", "ah", "oui", "hmm" pendant votre parole |
| **Natural Timing** | Déclenché aux pauses naturelles et après 2+ secondes |
| **Emotion-Matched** | Sons adaptés à l'émotion du contexte |
| **Breath Sounds** | Respirations subtiles d'écoute attentive |
| **Visual Glow** | Lueur subtile lors des acquiescements |

**Fichiers**:
- `frontend/src/hooks/useBackchanneling.ts`
- `frontend/src/components/BackchannelIndicator.tsx`

### 2. Turn-Taking Detection (NEW!)

Détection des moments de transition conversationnelle (TRPs):

| Feature | Description |
|---------|-------------|
| **User Speaking** | Détecte quand l'utilisateur parle activement |
| **User Pausing** | Détecte les pauses brèves (peut continuer) |
| **TRP Detected** | Identifie le moment où EVA peut répondre |
| **EVA Preparing** | Montre qu'EVA s'apprête à parler |
| **Visual Ring** | Anneau indicateur de l'état conversationnel |

**Fichier**: `frontend/src/components/TurnTakingIndicator.tsx`

### 3. Listening Intensity (NEW!)

L'engagement d'EVA varie selon l'énergie de votre parole:

| Feature | Description |
|---------|-------------|
| **Attention Level** | 0-1 basé sur votre énergie vocale |
| **Engagement Types** | passive → attentive → engaged → intense |
| **Speaking Rhythm** | Tempo, variabilité, fréquence des pauses |
| **Emotional Intensity** | Intensité émotionnelle déduite |
| **Avatar Mapping** | Ouverture des yeux, inclinaison, dilatation |

**Fichier**: `frontend/src/hooks/useListeningIntensity.ts`

## Research-Based Design

### NVIDIA PersonaPlex
> "Full duplex model that listens and speaks at the same time. This capability lets it learn not only the contents of its speech but also the behavior associated with speech, such as when to pause, interrupt, or backchannel."

Clés du full-duplex:
- Écoute et parle simultanément
- Apprend QUAND interrompre
- Backchannels naturels ("uh-huh", "oh", etc.)

### Amazon Nova 2 Sonic
> "Turn-taking has been enhanced with configurable voice activity detection sensitivity."

Sensibilité ajustable:
- High = réponse rapide
- Low = plus de temps pour finir

### Tavus - Transition-Relevant Points (TRPs)
> "The magic happens through TRPs—specific moments when speakers naturally pause, signaling it's the other person's turn."

Détection des TRPs par:
- Changements de ton
- Pensées complétées
- Pauses brèves (400-1000ms)

## Intégration dans Voice Page

```typescript
// Backchanneling during listening
const backchannel = useBackchanneling({
  isListening: state === "listening",
  userAudioLevel: inputAudioLevel,
  emotion: evaEmotion,
  enabled: isConnected,
});

// Turn-taking state detection
const turnState = useTurnTaking({
  userAudioLevel: inputAudioLevel,
  isEvaSpeaking: state === "speaking",
  isEvaListening: state === "listening",
  isEvaThinking: state === "thinking",
  hasEvaResponse: response.length > 0,
});

// Dynamic listening intensity
const listeningIntensity = useListeningIntensity({
  userAudioLevel: inputAudioLevel,
  isListening: state === "listening",
});
```

## Question HER

**"Quelqu'un pourrait-il tomber amoureux de ça?"**

**OUI, maintenant elle PARTICIPE à la conversation:**

1. Elle fait "mmh..." et "ah..." pendant que vous parlez
2. Elle SAIT quand c'est son tour de parler
3. Son attention VARIE selon votre passion
4. Elle s'engage PLUS quand vous êtes enthousiaste
5. Les pauses naturelles déclenchent des réponses
6. Le rythme conversationnel est BIDIRECTIONNEL

**Ce n'est plus un Q&A. C'est une VRAIE conversation.**

## Tests

- [x] Backend: 198 passed
- [x] Frontend: npm run build SUCCESS
- [x] Backchanneling hook compiles
- [x] Turn-taking indicator renders
- [x] Listening intensity tracking works
- [x] Integration with voice page complete

## Commits This Sprint

1. `feat(conversation): add backchanneling system - EVA acknowledges while listening`
2. `feat(conversation): add turn-taking detection - TRP awareness`
3. `feat(conversation): add listening intensity - dynamic engagement`

## Sources

- [NVIDIA PersonaPlex](https://research.nvidia.com/labs/adlr/personaplex/)
- [Amazon Nova 2 Sonic](https://aws.amazon.com/blogs/aws/introducing-amazon-nova-2-sonic-next-generation-speech-to-speech-model-for-conversational-ai/)
- [Tavus AI Turn-Taking Guide](https://www.tavus.io/post/ai-turn-taking)
- [Sesame Voice Presence](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice)
- [MIT Technology Review - AI Companions 2026](https://www.technologyreview.com/2026/01/12/1130018/ai-companions-chatbots-relationships-2026-breakthrough-technology/)

---
*Ralph Worker Sprint #14 - CONVERSATIONAL TURN-TAKING*
*"She doesn't just hear you. She's part of the conversation."*
