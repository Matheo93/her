# EVA-GPU Installation Log

> Serveur RTX - Installation complète le 2026-01-12

## Environnement

- **OS**: Linux (Ubuntu)
- **Python**: 3.12
- **GPU**: RTX avec CUDA 12.1
- **Emplacement**: `/workspace/eva-gpu`

## Composants installés

### 1. PyTorch + CUDA 12.1
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```
- torch 2.5.1+cu121
- torchvision 0.20.1+cu121
- torchaudio 2.5.1+cu121
- NVIDIA cuDNN 9.1.0.70
- Triton 3.1.0

### 2. SadTalker (Lip-sync)
```
Emplacement: /workspace/SadTalker
```
Dépendances installées:
- face_alignment
- librosa
- kornia
- basicsr
- facexlib
- gfpgan
- gradio

**Modèles**: En cours de téléchargement (~4GB)

### 3. Configuration

Fichier `.env` créé avec:
- `GROQ_API_KEY` configurée
- `EVA_DEV_MODE=true`
- `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`

## Scripts utiles

### Push automatique (watch-push.sh)
```bash
/workspace/watch-push.sh
```
Surveille les changements et push automatiquement.

## Commandes pour démarrer

### Backend
```bash
cd /workspace/eva-gpu/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd /workspace/eva-gpu/frontend
bun install
bun dev --port 3001
```

### SadTalker API
```bash
cd /workspace/SadTalker
python api.py  # Port 8003
```

## Ports utilisés

| Port | Service |
|------|---------|
| 3001 | Frontend (Next.js) |
| 8000 | Backend (FastAPI) |
| 8003 | SadTalker API |

## Notes

- Le .env contient la clé Groq (ne pas committer en clair sur repo public)
- SadTalker nécessite ~4GB de modèles
- GPU accélère le lip-sync de 4min (CPU) à ~20s (GPU)
