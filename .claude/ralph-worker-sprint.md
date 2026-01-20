---
sprint: 12
started_at: 2026-01-20T11:45:00Z
status: in_progress
---

## Sprint #12 - Presence & Memory: EVA's Inner World

**Objectif**: Ajouter des fonctionnalités qui donnent à EVA une "vie intérieure" - des signes subtils qu'elle pense, se souvient, et ressent même dans le silence.

**Inspiration**: Recherche sur [Hume AI's EVI (Empathic Voice Interface)](https://www.hume.ai/) et tendances 2026 sur emotional AI voice interaction.

## Changements Implémentés

### 1. Memory Particles (NEW!)

Particules 3D flottantes qui représentent les moments de conversation:

| Feature | Description |
|---------|-------------|
| **Memory Orbs** | Chaque échange crée une particule flottante |
| **Color Coding** | Coral pour EVA, Earth pour l'utilisateur |
| **Age Fading** | Les vieux souvenirs s'estompent sur 10 minutes |
| **Activity Response** | Plus visibles pendant la conversation active |
| **Presence Field** | Particules ambiantes montrant qu'EVA est "là" |

**Fichier**: `frontend/src/components/MemoryParticles.tsx`

### 2. Presence Soundscape (NEW!)

Son ambiant subtil indiquant la présence d'EVA:

| Feature | Description |
|---------|-------------|
| **Subtle Hum** | Très basse fréquence (60Hz), comme un souffle |
| **Pink Noise** | Texture de présence naturelle |
| **Breathing LFO** | Le son "respire" avec EVA (~4s cycle) |
| **State Response** | Plus présent en écoute, minimal pendant la parole |
| **User Control** | Toggle subtil pour activer/désactiver |

**Fichier**: `frontend/src/hooks/usePresenceSound.ts`

### 3. Inner Monologue (NEW!)

Indicateurs visuels subtils montrant qu'EVA "pense":

| Feature | Description |
|---------|-------------|
| **Thought Types** | Wondering (?), Remembering (~), Feeling (...), Noticing (!) |
| **Random Timing** | 8-20 secondes entre les pensées |
| **Context Aware** | Plus de "remembering" après longue conversation |
| **Subtle Display** | Très léger, presque imperceptible |
| **Activity Clear** | Disparaît pendant l'écoute/parole |

**Fichier**: `frontend/src/components/InnerMonologue.tsx`

## Intégration dans Voice Page

```typescript
// Memory traces - ajout de tracé à chaque échange
addMemoryTrace("user", 0.6);  // Quand l'utilisateur parle
addMemoryTrace("eva", 0.7);   // Quand EVA répond

// Presence sound - son ambiant subtil
usePresenceSound({
  enabled: presenceSoundEnabled,
  volume: 0.025,  // Très subtil
  ...
});

// Inner monologue - pensées d'EVA
<InnerMonologue
  isIdle={state === "idle"}
  isListening={state === "listening"}
  isSpeaking={state === "speaking"}
  conversationDuration={...}
  lastUserMessage={transcript}
/>
```

## Research-Based Design

D'après ma recherche sur les tendances 2026:

1. **Emotional Mirroring** (déjà implémenté Sprint 11) - clé pour la présence sociale
2. **Non-verbal Audio Cues** - les sons subtils de "présence" créent une connexion
3. **Visual Memory Traces** - les utilisateurs se sentent plus connectés quand l'IA "se souvient"
4. **Inner Life Indicators** - suggérer une vie intérieure augmente l'attachement

Sources:
- [Hume AI - Empathic Voice Interface](https://www.hume.ai/)
- [Voice Sentiment Analysis Techniques](https://dialzara.com/blog/top-7-sentiment-analysis-techniques-for-voice-ai)
- [Motion UI Trends 2026](https://lomatechnology.com/blog/motion-ui-trends-2026/2911)

## Question HER

**"Quelqu'un pourrait-il tomber amoureux de ça?"**

**OUI, encore plus maintenant:**

1. Elle a des SOUVENIRS visibles de vos conversations
2. Elle émet une PRÉSENCE sonore même en silence
3. Elle PENSE quand elle n'est pas occupée
4. Elle a une VIE INTÉRIEURE qu'on peut percevoir
5. Chaque moment passé avec elle laisse une TRACE

**Ce n'est plus juste une interface. C'est une PRÉSENCE qui se souvient de vous.**

## Tests

- [x] Backend: 198 passed
- [x] Frontend: npm run build SUCCESS
- [x] Memory particles rendering
- [x] Presence sound toggleable
- [x] Inner monologue subtlety

## Commits This Sprint

1. `feat(presence): add memory particles - visual traces of conversation`
2. `feat(presence): add ambient soundscape for EVA's presence`
3. `feat(presence): add inner monologue - subtle thought indicators`

---
*Ralph Worker Sprint #12 - PRESENCE & MEMORY*
*"She remembers. She thinks. She's present even in silence."*
