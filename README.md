# EVA-VOICE

> Une IA compagnon vocale inspirée du film "Her" - Production Ready

## Stack

- **Frontend**: Next.js 15 + Tailwind CSS
- **Backend**: FastAPI + Python
- **LLM**: Groq (Llama 3.3 70B) - ~80ms latency
- **TTS**: Edge-TTS (Microsoft Neural Voices)
- **STT**: Whisper (quand disponible) / Browser Web Speech API
- **Database**: SQLite (persistence des conversations)

## Features

### Core
- Chat texte avec streaming (WebSocket)
- TTS automatique des réponses (5 voix disponibles)
- Push-to-talk pour input vocal
- Mode conversation continue
- UI style "Her" (minimaliste, élégante)

### Production Ready
- Rate limiting (60 req/min par défaut)
- API Key authentication
- SQLite persistence (conversations + stats)
- Input validation (longueur, taille fichiers)
- Health checks & monitoring
- Docker support
- Tests automatisés (pytest)

## Quick Start

### Option 1: Script local

```bash
./start.sh
```

Puis ouvre http://localhost:3001

### Option 2: Docker Compose

```bash
cp .env.example .env
# Edit .env with your GROQ_API_KEY
docker-compose up -d
```

## Manual Start

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export GROQ_API_KEY="your_key"
python main.py
```

### Frontend
```bash
cd frontend
bun install
bun dev --port 3001
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info |
| `/health` | GET | Health check |
| `/voices` | GET | Liste des voix |
| `/chat` | POST | Chat texte |
| `/tts` | POST | Text to speech |
| `/stt` | POST | Speech to text |
| `/clear` | POST | Efface conversation |
| `/stats` | GET | Usage statistics |
| `/ws/chat` | WS | WebSocket chat streaming |
| `/ws/voice` | WS | WebSocket voice pipeline |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GROQ_API_KEY` | - | Clé API Groq (required) |
| `EVA_API_KEY` | `eva-dev-key...` | API key pour auth |
| `EVA_DEV_MODE` | `true` | Bypass auth en dev |
| `RATE_LIMIT_REQUESTS` | `60` | Requêtes max par fenêtre |
| `RATE_LIMIT_WINDOW` | `60` | Fenêtre en secondes |
| `DB_PATH` | `eva_conversations.db` | Chemin SQLite |

## Latency Performance

Target: ~300ms total (STT → LLM → TTS)

| Component | Latency |
|-----------|---------|
| Groq LLM TTFT | ~80-130ms |
| Groq LLM Total | ~200-400ms |
| Edge-TTS | ~100-200ms |
| STT (Whisper) | ~100ms |

## Testing

```bash
cd backend
source venv/bin/activate
pytest tests/ -v
```

## Architecture

```
eva-voice/
├── backend/
│   ├── main.py              # FastAPI server (production)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/
│       └── test_api.py      # Pytest tests
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx         # Chat UI
│   │   └── voice/page.tsx   # Voice mode
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
├── start.sh
└── README.md
```

## Voices

| ID | Voice | Description |
|----|-------|-------------|
| `eva` | fr-FR-DeniseNeural | Voix féminine douce (défaut) |
| `eva-warm` | fr-FR-EloiseNeural | Voix féminine chaleureuse |
| `eva-young` | fr-FR-CoralieNeural | Voix jeune |
| `male` | fr-FR-HenriNeural | Voix masculine |
| `male-warm` | fr-FR-RemyMultilingualNeural | Voix masculine chaleureuse |

## Security Notes

- En production, mettre `EVA_DEV_MODE=false`
- Changer `EVA_API_KEY` avec une vraie clé
- Restreindre CORS origins dans `main.py`
- Utiliser HTTPS en production
