---
reviewed_at: 2026-01-20T15:30:00Z
commit: b981853
status: BLOCKED
blockers:
  - 9+ pages utilisent des PHOTOS pour l'avatar (eva.jpg, eva_nobg.png, eva_clean.png)
  - Gradients generiques purple-to-pink dans eva-chat, eva-ditto, eva-stream, eva-viseme
  - animate-pulse utilise dans 8+ fichiers
  - Tech demo UI visible dans avatar-gpu (latency_ms)
  - Emoji dans lipsync (🎤)
---

# Ralph Moderator Review - Cycle 62 IMPITOYABLE

## Status: **BLOCKED - CODE GENERIQUE DETECTE**

---

## BLOQUEURS CRITIQUES (a corriger AVANT de continuer)

### 1. FAUX AVATARS = PHOTOS ❌ BLOCAGE

```
frontend/src/app/avatar-live/page.tsx:17     → /avatars/eva.jpg
frontend/src/app/avatar-transparent/page.tsx → /avatars/eva_nobg.png
frontend/src/app/eva-chat/page.tsx:5         → /avatars/eva_clean.png
frontend/src/app/eva-ditto/page.tsx:6        → /avatars/eva_clean.png
frontend/src/app/eva-faster/page.tsx:6       → /avatars/eva_clean.png
frontend/src/app/eva-audio2face/page.tsx     → /avatars/eva_nobg.png
frontend/src/app/eva-realtime/page.tsx       → /avatars/eva_nobg.png
frontend/src/app/eva-stream/page.tsx:6       → /avatars/eva_clean.png
frontend/src/app/eva-viseme/page.tsx         → /avatars/eva_nobg.png
```

**VERDICT:** 9 pages utilisent des PHOTOS statiques. C'est INTERDIT.

### 2. GRADIENTS GENERIQUES ❌ BLOCAGE

```tsx
// eva-chat/page.tsx
<h1 className="bg-gradient-to-r from-purple-400 to-pink-400 ...">

// eva-ditto/page.tsx
<h1 className="bg-gradient-to-r from-purple-400 to-pink-400 ...">

// eva-stream/page.tsx
<h1 className="bg-gradient-to-r from-rose-400 to-orange-400 ...">

// eva-viseme/page.tsx
<div className="bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-900">

// avatar-demo/page.tsx
bg-purple-500/20, from-indigo-600 via-purple-600 to-pink-600
```

**VERDICT:** Couleurs Tailwind generiques = ChatGPT-style.

### 3. ANIMATE-PULSE ❌ BLOCAGE

```
avatar-demo/page.tsx     → 4 occurrences
avatar-transparent       → 1 occurrence
eva-audio2face          → 1 occurrence
eva-her (loading only)  → 1 occurrence
eva-realtime            → 1 occurrence
eva-viseme              → 1 occurrence
lipsync                 → 1 occurrence
```

### 4. TECH DEMO UI ❌ BLOCAGE

```tsx
// avatar-gpu/page.tsx - Latence visible a l'utilisateur
stt: data.latency?.stt_ms,
llm: data.latency?.llm_ms,
tts: data.latency?.tts_ms,
total: data.latency?.total_ms,
```

### 5. EMOJIS ❌ BLOCAGE

```tsx
// lipsync/page.tsx:300
<p className="text-green-400 text-sm animate-pulse">🎤 Parle... Relâche pour envoyer</p>
```

---

## CE QUI FONCTIONNE ✅

### EVA-HER Page (SEULE PAGE ACCEPTABLE)

| Critere | Status | Notes |
|---------|--------|-------|
| Avatar genere (pas photo) | ✅ | RealisticAvatar3D |
| Identite unique EVA | ✅ | HER_COLORS, HER_SPRINGS |
| Pas de "tech demo" UI | ✅ | Aucune latence visible |
| Intimite/chaleur | ✅ | Tons corail, creme |
| Humanite (respire, hesite) | ✅ | bioData: heartRate, breathPhase |

**La page `/eva-her` est la SEULE qui respecte les standards HER.**

---

## VERIFICATION TESTS

```
pytest backend/tests/ -v
================= 198 passed, 2 skipped, 15 warnings in 20.66s =================
```

**Tests:** PASS

---

## LATENCE

| Test | Valeur | Objectif | Status |
|------|--------|----------|--------|
| Test 1 (cold) | 310ms | <300ms | ⚠️ LIMITE |
| Test 2 | 193ms | <300ms | ✅ |
| Test 3 | 159ms | <300ms | ✅ |
| Test 4 | 196ms | <300ms | ✅ |
| Test 5 | 251ms | <300ms | ✅ |

**Latence:** 4/5 tests sous 300ms. Cold start a 310ms = limite acceptable.

---

## CHANGEMENT WHISPER

Le commit b981853 change Whisper de "small" a "medium":

```python
# AVANT
whisper_model_name = "small" if device == "cuda" else "tiny"

# APRES
whisper_model_name = "medium" if device == "cuda" else "tiny"
```

**NOTE:** Le commentaire dit "49GB VRAM" mais nvidia-smi montre 24GB. Verifier.

---

## SCORE

| Critere | Score | Commentaire |
|---------|-------|-------------|
| Tests | 10/10 | 198 passed |
| Latence | 8/10 | Cold start 310ms |
| EVA-HER page | 10/10 | Seule page HER-compliant |
| Autres pages | 0/10 | **GENERIQUE** |
| Tech visible | 0/10 | avatar-gpu expose latency |
| Avatars | 0/10 | 9 pages avec PHOTOS |
| **TOTAL** | **28/60** | **47%** |

---

## ACTIONS REQUISES

### Priorite 1: SUPPRIMER LES PAGES GENERIQUES

Options:
1. **Supprimer** avatar-demo, avatar-live, avatar-transparent, eva-chat, eva-ditto, eva-faster, eva-stream, eva-viseme, eva-realtime, avatar-gpu, lipsync
2. **Ou** les refactorer pour utiliser `RealisticAvatar3D` + `HER_COLORS`

### Priorite 2: STANDARDISER SUR EVA-HER

Toutes les pages doivent:
- Utiliser `RealisticAvatar3D` (pas de photos)
- Utiliser `HER_COLORS` (coral, cream, earth, warmWhite)
- Utiliser `HER_SPRINGS` pour les animations
- ZERO tech visible a l'utilisateur
- ZERO emoji
- ZERO gradient purple/pink

### Priorite 3: SUPPRIMER ANIMATE-PULSE

Remplacer par:
```tsx
// INTERDIT
animate-pulse

// REQUIS
<motion.div
  animate={{ opacity: [0.5, 1, 0.5] }}
  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
/>
```

---

## MESSAGE AU WORKER

**STOP. LE CODE EST BLOQUE.**

Tu travailles sur des optimisations (Whisper medium) alors que 90% des pages frontend sont du **ChatGPT-style generique**.

La page `/eva-her` est excellente. C'est la REFERENCE.

**Toutes les autres pages doivent:**
1. Utiliser le meme avatar 3D
2. Utiliser les memes couleurs HER
3. CACHER toute la technique

**Question:** Ces autres pages sont-elles necessaires? Si elles sont juste des demos techniques, SUPPRIME-LES. EVA doit etre UNE experience, pas 15 variations generiques.

---

## VERDICT FINAL

```
┌────────────────────────────────────────────────────────────────┐
│  STATUS: BLOCKED                                                │
│                                                                 │
│  ❌ 9 pages avec photos au lieu d'avatar genere                 │
│  ❌ Gradients purple/pink ChatGPT-style                         │
│  ❌ animate-pulse partout                                       │
│  ❌ Latence visible dans avatar-gpu                             │
│  ❌ Emoji dans lipsync                                          │
│                                                                 │
│  ✅ EVA-HER: Seule page HER-compliant                           │
│  ✅ Tests: 198 passed                                           │
│  ✅ Latence: 159-310ms                                          │
│                                                                 │
│  SCORE: 47% - INACCEPTABLE                                      │
└────────────────────────────────────────────────────────────────┘
```

**NE CONTINUE PAS TANT QUE LES PAGES GENERIQUES NE SONT PAS SUPPRIMEES OU REFACTOREES.**

---

*Ralph Moderator - Cycle 62 IMPITOYABLE*
*"EVA-HER est parfaite. Le reste est du ChatGPT."*
