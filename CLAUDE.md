# HER (EVA-VOICE) - Claude Code Guidelines

## Project Overview

HER is a production-ready voice AI companion inspired by the film "Her". It enables conversational interactions combining text chat, speech-to-text, and text-to-speech capabilities with an animated avatar.

## Tech Stack

### Backend (Python/FastAPI)
- **Framework**: FastAPI with uvicorn
- **LLM**: Groq's Llama 3.3 70B (~80ms latency)
- **TTS**: Microsoft Edge-TTS (5 voice options)
- **STT**: Whisper / Browser Web Speech API
- **Database**: SQLite for conversation persistence

### Frontend (Next.js)
- **Framework**: Next.js 15
- **Styling**: Tailwind CSS
- **Communication**: WebSocket for streaming

### Avatar
- **Engines**: LivePortrait, SadTalker, Avatar-Engine
- **Lipsync**: Real-time audio-to-viseme mapping

## Directory Structure

```
/home/dev/her/
├── backend/                 # FastAPI server
│   ├── main.py             # Main API (167KB - needs splitting)
│   ├── eva_*.py            # EVA personality modules
│   ├── *_tts.py            # TTS implementations
│   ├── *_service.py        # External service integrations
│   └── tests/              # Pytest tests
├── frontend/               # Next.js app
│   └── src/                # React components
├── avatar-engine/          # Avatar animation
├── liveportrait/           # LivePortrait integration
├── sadtalker/              # SadTalker integration
└── .claude/                # Claude Code config
    ├── agents/             # Specialized agents
    ├── rules/              # Coding rules
    ├── skills/             # Domain skills
    └── commands/           # Custom commands
```

## Development Rules

### Code Style

#### Python
- Use type hints everywhere
- Follow PEP 8 (max line 120)
- Async/await for all I/O operations
- Docstrings for public functions

```python
async def process_message(
    message: str,
    session_id: str,
    voice: str = "eva"
) -> dict[str, Any]:
    """Process a chat message and return response with audio.

    Args:
        message: User's input text
        session_id: Unique session identifier
        voice: TTS voice to use

    Returns:
        Dict with response text, audio data, and metadata
    """
    ...
```

#### TypeScript/React
- Strict TypeScript (no `any`)
- Functional components only
- Use hooks properly (no conditional hooks)

### Testing

**MANDATORY: TDD Approach**
1. Write failing test first
2. Implement minimal code to pass
3. Refactor
4. Repeat

```bash
# Run backend tests
cd /home/dev/her && pytest backend/tests/ -v

# Run with coverage
pytest backend/tests/ --cov=backend --cov-report=html
```

### Git Workflow

- Small, focused commits
- Descriptive commit messages
- Format: `type(scope): description`

```
feat(tts): add emotional voice modulation
fix(websocket): handle reconnection properly
test(api): add rate limiting tests
refactor(eva): split main.py into modules
```

### Security Checklist

- [ ] No hardcoded API keys (use .env)
- [ ] Input validation on all endpoints
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] WebSocket authentication

## Key Files to Know

### Backend Critical
- `backend/main.py` - Main API server (LARGE - 167KB, needs refactoring)
- `backend/eva_her.py` - EVA personality core
- `backend/eva_memory.py` - Conversation memory
- `backend/eva_emotional_tts.py` - Emotional TTS
- `backend/tests/test_api.py` - API tests

### Frontend Critical
- `frontend/src/` - React components
- `frontend/package.json` - Dependencies

## Available Agents

Located in `.claude/agents/`:

| Agent | Use For |
|-------|---------|
| `e2e-runner` | End-to-end Playwright tests |
| `code-reviewer` | Code review and security audit |
| `build-error-resolver` | Fix build/type errors |
| `tdd-guide` | Test-driven development |
| `security-reviewer` | Security vulnerability scan |
| `refactor-cleaner` | Code refactoring |

## Dual-Ralph System

This project uses a dual-agent development system:

### Ralph Worker
- Develops features continuously
- Follows TDD approach
- Commits frequently
- **MUST read `.claude/ralph-feedback.md` at end of each sprint**

### Ralph Moderator
- Runs tests continuously
- Reviews code changes
- Writes feedback to `.claude/ralph-feedback.md`
- Monitors for security issues

### Communication Files

| File | Purpose |
|------|---------|
| `.claude/ralph-feedback.md` | Moderator → Worker feedback |
| `.claude/ralph-worker-sprint.md` | Worker's current sprint |
| `.claude/ralph-moderator-status.md` | Moderator's status |

## Performance Targets

- Total latency: ~300ms (STT → LLM → TTS)
- LLM response: 200-400ms (Groq)
- TTS generation: <100ms
- WebSocket ping: <50ms

## Common Tasks

### Add New Feature
1. Create failing test in `backend/tests/`
2. Implement in appropriate module
3. Add to API in `main.py`
4. Update frontend if needed
5. Document in README

### Fix Bug
1. Write test that reproduces bug
2. Fix the bug
3. Verify test passes
4. Check for regression

### Refactor
1. Ensure tests exist for code being refactored
2. Make incremental changes
3. Run tests after each change
4. No behavior changes

## Environment Setup

```bash
# Backend
cd /home/dev/her
pip install -r backend/requirements.txt
cp .env.example .env
# Edit .env with your API keys

# Frontend
cd frontend
npm install

# Run
./start.sh  # or docker-compose up
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info |
| `/health` | GET | Health check |
| `/chat` | POST | Send message, get response |
| `/tts` | POST | Text to speech |
| `/voices` | GET | Available voices |
| `/clear` | POST | Clear conversation |
| `/stats` | GET | Usage statistics |
| `/ws` | WS | WebSocket for streaming |

## Priorities

1. **Stability** - Don't break existing functionality
2. **Performance** - Maintain <300ms latency
3. **Security** - No vulnerabilities
4. **Code Quality** - Clean, tested code
5. **Features** - New capabilities

## Contact

- Project: EVA-VOICE / HER
- Repo: https://github.com/Matheo93/her
