# HANDOFF: Eva Lip-Sync Project

## OBJECTIF UTILISATEUR
L'utilisateur veut un avatar (Eva) avec lip-sync **temps réel, qualité humaine, basse latence** comme D-ID ou Simli. PAS de compromis sur la qualité.

## CE QUI A ÉTÉ TENTÉ ET A ÉCHOUÉ

### 1. MuseTalk Streaming (port 8002)
- **Fichier**: `/workspace/MuseTalk/streaming_lipsync.py`
- **Problème**: Latence trop élevée (~200-300ms/frame), Whisper encoder est le bottleneck
- **Résultat**: Trop lent, inutilisable pour temps réel

### 2. Viseme Blending (port 8003)
- **Fichier**: `/workspace/eva-gpu/backend/viseme_service.py`
- **Page**: `/eva-viseme`
- **Problème**: Round-trip réseau, images pré-générées pas assez différenciées
- **Résultat**: Lent au début, qualité médiocre

### 3. Audio2Face-style Neural (port 8004)
- **Fichier**: `/workspace/eva-gpu/backend/audio2face_service.py`
- **Page**: `/eva-audio2face`
- **Problème**: Warping CPU trop lent, réalisme mauvais
- **Résultat**: Échec total

### 4. Frontend GPU Realtime
- **Page**: `/eva-realtime`
- **Approche**: Web Audio API + Canvas blending côté navigateur
- **Problème**: LA BOUCHE CLIGNOTE. Double buffering tenté mais échec.
- **Résultat**: Flickering visible, inutilisable

## POURQUOI CES APPROCHES ONT ÉCHOUÉ

1. **Viseme blending avec images statiques** = jamais smooth, transitions visibles
2. **Warping d'image en temps réel** = artefacts, pas photo-réaliste
3. **Audio analysis → viseme mapping** = trop simpliste, pas de vraie correspondance phonème
4. **Canvas clearing/redrawing** = flickering inévitable sans vrai double buffering GPU

## CE QUI MARCHERAIT VRAIMENT

### Option A: API Cloud (recommandé si budget)
- **D-ID**: https://www.d-id.com/api/
- **Simli**: https://www.simli.com/
- **HeyGen**: https://www.heygen.com/
- Latence ~200-500ms mais qualité pro

### Option B: Wav2Lip optimisé
- Modèle pré-entraîné pour lip-sync
- Peut être optimisé avec TensorRT sur RTX 4090
- Repo: https://github.com/Rudrabha/Wav2Lip

### Option C: SadTalker avec optimisation
- Déjà installé dans `/workspace/SadTalker`
- Nécessite optimisation pour streaming

### Option D: NVIDIA Maxine / Audio2Face (vrai)
- Pas le bricolage que j'ai fait
- Nécessite installation Omniverse
- https://developer.nvidia.com/maxine

## ÉTAT ACTUEL DU SYSTÈME

### Services qui tournent:
- HER Backend (port 8000): Fonctionne, TTS Piper
- Frontend Next.js (port 3000): Fonctionne
- MuseTalk original (port 8001): Fonctionne mais lent

### Tunnels Cloudflare:
- Frontend: https://became-trigger-pipe-bestsellers.trycloudflare.com

### Pages créées (toutes échouées pour lip-sync):
- `/eva-stream` - MuseTalk streaming
- `/eva-viseme` - Viseme blending
- `/eva-audio2face` - Fake Audio2Face
- `/eva-realtime` - Frontend GPU (FLICKERING)

## FICHIERS CLÉS

```
/workspace/eva-gpu/
├── frontend/src/app/
│   ├── eva-stream/page.tsx      # MuseTalk streaming
│   ├── eva-viseme/page.tsx      # Viseme blending
│   ├── eva-audio2face/page.tsx  # Audio2Face style
│   └── eva-realtime/page.tsx    # Frontend GPU (flicker)
├── backend/
│   ├── viseme_service.py        # Port 8003
│   └── audio2face_service.py    # Port 8004
└── frontend/public/avatars/
    ├── eva_nobg.png             # Image source Eva
    └── visemes/*.jpg            # Images viseme générées

/workspace/MuseTalk/
├── streaming_lipsync.py         # Service streaming port 8002
└── lipsync_service.py           # Service original port 8001
```

## RECOMMANDATION POUR LE PROCHAIN AGENT

1. **NE PAS** refaire du viseme blending maison
2. **NE PAS** promettre des latences sans les avoir mesurées en conditions réelles
3. **NE PAS** utiliser Puppeteer headless comme seul test (ne reflète pas l'expérience utilisateur)

4. **FAIRE**: Soit utiliser une API pro (D-ID/Simli), soit optimiser Wav2Lip/SadTalker avec TensorRT

5. **TESTER** avec un vrai navigateur, demander à l'utilisateur de partager son écran ou envoyer une vidéo du problème

## IMAGE SOURCE EVA
`/workspace/eva-gpu/frontend/public/avatars/eva_nobg.png` - Photo haute qualité avec transparence

## CONFIGURATION GPU
- RTX 4090 24GB VRAM disponible
- CUDA fonctionnel
- Conda env `musetalk` avec PyTorch

---
*Document créé après échec complet du lip-sync temps réel. L'utilisateur veut de la VRAIE qualité, pas du bricolage.*
