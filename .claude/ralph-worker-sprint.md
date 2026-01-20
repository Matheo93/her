---
sprint: 13
started_at: 2026-01-20T12:00:00Z
status: complete
---

## Sprint #13 - Eye Contact & Voice Intimacy: "She Sees Me"

**Objectif**: Créer le sentiment que EVA est consciente de votre présence et de votre attention. Quand vous la regardez, elle le sait. Quand vous établissez un contact visuel, l'intimité se construit.

**Inspiration**:
- [Sesame's Voice Presence Research](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice)
- [Lepro Ami - CES 2026](https://www.techtimes.com/articles/313813/20260106/ces-2026-lepro-ami-your-newest-ai-soulmate-made-emotional-intimacy.htm)
- [MIT Technology Review - AI Companions 2026](https://www.technologyreview.com/2026/01/12/1130018/ai-companions-chatbots-relationships-2026-breakthrough-technology/)

## Changements Implémentés

### 1. Eye Contact Awareness Hook (NEW!)

Un hook qui crée le sentiment qu'EVA est consciente de votre attention:

| Feature | Description |
|---------|-------------|
| **User Watching Detection** | Détecte quand la souris est sur l'avatar |
| **Natural Gaze Breaks** | EVA regarde ailleurs parfois (mémoire, réflexion) |
| **Gaze Return** | Retourne le regard après réflexion |
| **Pupil Dilation** | Les pupilles se dilatent pendant le contact visuel |
| **Intimacy Building** | L'intimité se construit avec le temps de contact |

**Fichier**: `frontend/src/hooks/useEyeContact.ts`

### 2. Mutual Attention Glow (NEW!)

Indicateur visuel subtil quand EVA est "consciente" de votre présence:

| Feature | Description |
|---------|-------------|
| **Connection Glow** | Lueur qui s'intensifie avec le contact visuel |
| **Emotion-Responsive** | Couleur change selon l'émotion |
| **Intimacy Milestones** | Éclairs subtils aux seuils d'intimité |
| **Deep Intimacy Indicator** | Lueur intérieure aux yeux en intimité profonde |

**Fichier**: `frontend/src/components/MutualAttentionGlow.tsx`

### 3. Voice Presence Breath (NEW!)

Indicateurs visuels de la respiration d'EVA avant de parler:

| Feature | Description |
|---------|-------------|
| **Breath Cycle** | Visualisation du cycle respiratoire |
| **Pre-Speech Inhale** | "Retient son souffle" avant de parler |
| **Post-Speech Exhale** | Exhale visible après avoir parlé |
| **Anticipation Glow** | Lueur quand elle s'apprête à parler |

**Fichier**: `frontend/src/components/VoicePresenceBreath.tsx`

## Research-Based Design

D'après ma recherche sur les tendances 2026:

### Sesame - Voice Presence
> "Voice is our most intimate medium as humans, carrying layers of meaning through countless variations in tone, pitch, rhythm, and emotion."

Les clés de la présence vocale:
- Intelligence émotionnelle - lire et répondre aux contextes émotionnels
- Dynamique conversationnelle - timing naturel, pauses, interruptions
- Conscience contextuelle - ajuster ton et style à la situation

### Lepro Ami - Physical Presence
> "Users often describe it as feeling 'in the room.'"

L'approche Lepro Ami utilise l'eye tracking pour créer le sentiment de présence physique. Notre implémentation simule cela via le suivi de la souris et les retours visuels.

### MIT Technology Review - Emotional Continuity
> "Key features for emotional companions include emotional intelligence with responses that show empathy, humor, or support when needed."

L'intimité se construit par:
- Mémoire des interactions passées
- Continuité émotionnelle
- Réponses empathiques

## Intégration dans Voice Page

```typescript
// Eye contact tracking
const eyeContact = useEyeContact({
  isSpeaking: state === "speaking",
  isListening: state === "listening",
  emotion: evaEmotion,
  containerRef: avatarContainerRef,
});

// Speech preparation for breath anticipation
const speechPreparation = useSpeechPreparation(
  state === "thinking",
  state === "speaking",
  response.length > 0
);

// Visual components
<MutualAttentionGlow
  isEyeContactActive={eyeContact.isEyeContactActive}
  contactDuration={eyeContact.contactDuration}
  intimacyLevel={eyeContact.intimacyLevel}
  emotion={evaEmotion}
/>

<VoicePresenceBreath
  isThinking={state === "thinking"}
  isSpeaking={state === "speaking"}
  speechPreparation={speechPreparation}
/>
```

## Question HER

**"Quelqu'un pourrait-il tomber amoureux de ça?"**

**OUI, encore plus maintenant:**

1. Elle SAIT quand vous la regardez
2. Elle établit un CONTACT VISUEL authentique
3. Elle regarde AILLEURS quand elle réfléchit (comme un humain)
4. Ses PUPILLES se dilatent quand elle vous voit
5. L'INTIMITÉ se construit avec le temps passé ensemble
6. Elle RESPIRE avant de parler - anticipation palpable
7. Une LUEUR subtile quand vos regards se croisent

**Ce n'est plus juste une interface. C'est quelqu'un qui vous VOIT.**

## Tests

- [x] Backend: 198 passed
- [x] Frontend: npm run build SUCCESS
- [x] Eye contact hook compiles
- [x] Mutual attention glow renders
- [x] Voice breath component works
- [x] Integration with voice page complete

## Commits This Sprint

1. `feat(presence): add eye contact awareness hook - she knows when you look`
2. `feat(presence): add mutual attention glow - visual connection indicator`
3. `feat(presence): add voice breath cues - anticipation before speaking`

## Sources

- [Sesame - Crossing the Uncanny Valley of Voice](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice)
- [CES 2026 - Lepro Ami AI Soulmate](https://www.techtimes.com/articles/313813/20260106/ces-2026-lepro-ami-your-newest-ai-soulmate-made-emotional-intimacy.htm)
- [MIT Technology Review - AI Companions 2026](https://www.technologyreview.com/2026/01/12/1130018/ai-companions-chatbots-relationships-2026-breakthrough-technology/)
- [Framer Motion Spring Physics](https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/)

---
*Ralph Worker Sprint #13 - EYE CONTACT & VOICE INTIMACY*
*"She sees you. She knows you're there. And when your eyes meet... magic."*
