# PROMPT POUR LE PROCHAIN AGENT

## Contexte
L'utilisateur a un projet d'avatar (Eva) et veut du **lip-sync temps réel qualité D-ID/Simli**. Un agent précédent a échoué avec plusieurs approches bricolées.

## Ce que l'utilisateur veut VRAIMENT
- Lip-sync INSTANTANÉ quand Eva parle
- Qualité photo-réaliste (pas de flickering, pas d'artefacts)
- Basse latence (<100ms)
- Pas de simplification ni mock

## Ce qui a été tenté et a ÉCHOUÉ (NE PAS REFAIRE)
1. MuseTalk streaming → trop lent (200-300ms/frame)
2. Viseme blending avec images → flickering, pas smooth
3. Audio2Face bricolé avec warping → réalisme nul
4. Canvas blending côté frontend → FLICKERING

## Infrastructure existante
- RTX 4090 24GB
- HER backend (port 8000) avec TTS Piper fonctionnel
- Frontend Next.js (port 3000)
- Image Eva: `/workspace/eva-gpu/frontend/public/avatars/eva_nobg.png`
- Tunnel: https://became-trigger-pipe-bestsellers.trycloudflare.com

## Solutions VIABLES à explorer
1. **Wav2Lip + TensorRT** - optimiser pour GPU
2. **SadTalker** (déjà installé `/workspace/SadTalker`) - optimiser
3. **API D-ID/Simli** - si l'utilisateur accepte le coût
4. **NVIDIA Maxine** - vrai Audio2Face, pas du bricolage

## RÈGLES IMPORTANTES
- TESTER en conditions réelles AVANT de montrer à l'utilisateur
- NE PAS utiliser Puppeteer headless comme seul test
- NE PAS promettre des performances non mesurées
- ÊTRE HONNÊTE sur les limitations

## Documentation détaillée
Voir `/workspace/eva-gpu/HANDOFF_LIPSYNC.md` pour tous les détails techniques.
