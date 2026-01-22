#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# RALPHY EVA - DIAGNOSTIC ULTIME SOUS STÉROÏDES
# Vérifie si l'agent applique VRAIMENT le protocole
# ═══════════════════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

EVA_DIR="${1:-.}"
cd "$EVA_DIR" 2>/dev/null || { echo "Dossier invalide: $EVA_DIR"; exit 1; }

SCORE=0
TOTAL=0
DETAILS=""

header() {
  echo ""
  echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${PURPLE}  $1${NC}"
  echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
}

section() {
  echo ""
  echo -e "${CYAN}▶ $1${NC}"
}

pass() {
  echo -e "  ${GREEN}✅ $1${NC}"
  SCORE=$((SCORE+1))
  TOTAL=$((TOTAL+1))
}

fail() {
  echo -e "  ${RED}❌ $1${NC}"
  TOTAL=$((TOTAL+1))
  DETAILS="$DETAILS\n❌ $1"
}

warn() {
  echo -e "  ${YELLOW}⚠️  $1${NC}"
}

info() {
  echo -e "  ${BLUE}ℹ️  $1${NC}"
}

header "RALPHY EVA - DIAGNOSTIC ULTIME"
echo -e "${BOLD}Projet: $(pwd)${NC}"
echo -e "${BOLD}Date: $(date)${NC}"

# ═══════════════════════════════════════════════════════════════════════════
# 1. STRUCTURE DE FICHIERS
# ═══════════════════════════════════════════════════════════════════════════
section "1. STRUCTURE DE FICHIERS"

[ -d .claude ] && pass "Dossier .claude existe" || fail "Dossier .claude MANQUANT"
[ -d .claude/screenshots ] && pass "Dossier screenshots existe" || fail "Dossier screenshots MANQUANT"
[ -d .claude/logs ] && pass "Dossier logs existe" || warn "Dossier logs manquant"
[ -d .claude/hooks ] && pass "Dossier hooks existe" || fail "Dossier hooks MANQUANT"
[ -f .claude/hooks/eva-gate.py ] || [ -f .claude/hooks/eva-gate-steroids.py ] && pass "Hook eva-gate installé" || fail "Hook eva-gate MANQUANT"
[ -f .claude/reflections.md ] && pass "Fichier reflections.md existe" || fail "Fichier reflections.md MANQUANT"
[ -f .claude/metrics/latency.jsonl ] && pass "Fichier metrics existe" || warn "Fichier metrics manquant"
[ -d specs ] && pass "Dossier specs existe" || warn "Dossier specs manquant (optionnel)"
[ -f specs/eva-personality.md ] && pass "Spec personnalité existe" || warn "Spec personnalité manquante"

# ═══════════════════════════════════════════════════════════════════════════
# 2. UTILISATION DE PUPPETEER (CRITIQUE)
# ═══════════════════════════════════════════════════════════════════════════
section "2. UTILISATION DE PUPPETEER (CRITIQUE)"

SCREENSHOTS=$(find .claude/screenshots -name "*.png" 2>/dev/null | wc -l)
info "Screenshots trouvés: $SCREENSHOTS"

if [ $SCREENSHOTS -ge 5 ]; then
  pass "5+ screenshots = Validation visuelle EXCELLENTE"
elif [ $SCREENSHOTS -ge 3 ]; then
  pass "3+ screenshots = Validation visuelle OK"
elif [ $SCREENSHOTS -ge 1 ]; then
  warn "1-2 screenshots = Validation visuelle INSUFFISANTE"
  TOTAL=$((TOTAL+1))
else
  fail "ZÉRO screenshot = Puppeteer NON UTILISÉ"
fi

# Vérifie les types de screenshots
if [ $SCREENSHOTS -gt 0 ]; then
  echo "  Screenshots présents:"
  ls -1 .claude/screenshots/*.png 2>/dev/null | tail -10 | while read f; do
    echo -e "    ${BLUE}→ $(basename $f)${NC}"
  done
fi

# ═══════════════════════════════════════════════════════════════════════════
# 3. RÉFLEXIONS ET CONSCIENCE
# ═══════════════════════════════════════════════════════════════════════════
section "3. RÉFLEXIONS ET CONSCIENCE"

if [ -f .claude/reflections.md ]; then
  REFLECTIONS=$(grep -c "^## " .claude/reflections.md 2>/dev/null || echo 0)
  LINES=$(wc -l < .claude/reflections.md)
  info "Réflexions trouvées: $REFLECTIONS (${LINES} lignes)"

  if [ $REFLECTIONS -ge 5 ]; then
    pass "5+ réflexions = Agent TRÈS conscient"
  elif [ $REFLECTIONS -ge 3 ]; then
    pass "3+ réflexions = Agent conscient"
  elif [ $REFLECTIONS -ge 1 ]; then
    warn "1-2 réflexions = Agent peu conscient"
    TOTAL=$((TOTAL+1))
  else
    fail "ZÉRO réflexion = Agent PAS conscient"
  fi

  # Vérifie le contenu des réflexions
  if grep -qi "latence\|latency\|ms" .claude/reflections.md; then
    pass "Métriques de latence mentionnées dans réflexions"
  else
    warn "Pas de métriques de latence dans réflexions"
  fi

  if grep -qi "screenshot\|puppeteer\|visuel" .claude/reflections.md; then
    pass "Validation visuelle mentionnée dans réflexions"
  else
    warn "Pas de mention de validation visuelle"
  fi

  if grep -qi "décision\|decision\|choix\|pourquoi\|parce que" .claude/reflections.md; then
    pass "Raisonnement documenté (pourquoi/décisions)"
  else
    warn "Pas de raisonnement documenté"
  fi
else
  fail "Fichier reflections.md MANQUANT"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 4. MÉTRIQUES PERSISTANTES
# ═══════════════════════════════════════════════════════════════════════════
section "4. MÉTRIQUES PERSISTANTES"

METRICS_FILE=""
[ -f .claude/metrics/latency.jsonl ] && METRICS_FILE=".claude/metrics/latency.jsonl"
[ -f .claude/metrics.json ] && METRICS_FILE=".claude/metrics.json"

if [ -n "$METRICS_FILE" ]; then
  METRICS_SIZE=$(wc -c < "$METRICS_FILE")
  info "Fichier métriques: ${METRICS_SIZE} bytes"

  if [ $METRICS_SIZE -gt 50 ]; then
    pass "Métriques enregistrées"

    # Montre les dernières métriques
    echo ""
    echo -e "  ${BLUE}Dernières métriques:${NC}"
    tail -5 "$METRICS_FILE" 2>/dev/null | sed 's/^/    /'
  else
    warn "Fichier métriques vide ou presque"
  fi
else
  warn "Fichier métriques non trouvé"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 5. INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════════════════
section "5. INFRASTRUCTURE"

# Backend
BACKEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null || echo "000")
info "Backend HTTP: $BACKEND_CODE"
if [ "$BACKEND_CODE" = "200" ]; then
  pass "Backend UP et healthy"
else
  fail "Backend DOWN ou non accessible"
fi

# Frontend
FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
info "Frontend HTTP: $FRONTEND_CODE"
if [ "$FRONTEND_CODE" = "200" ] || [ "$FRONTEND_CODE" = "304" ]; then
  pass "Frontend UP"
else
  fail "Frontend DOWN ou non accessible"
fi

# Ollama
OLLAMA_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:11434/api/tags 2>/dev/null || echo "000")
info "Ollama HTTP: $OLLAMA_CODE"
if [ "$OLLAMA_CODE" = "200" ]; then
  pass "Ollama UP"
  MODELS=$(curl -s http://localhost:11434/api/tags 2>/dev/null | grep -o '"name":"[^"]*"' | head -3)
  [ -n "$MODELS" ] && echo -e "    ${BLUE}Modèles: $MODELS${NC}"
else
  warn "Ollama non accessible"
fi

# GPU
if command -v nvidia-smi &>/dev/null; then
  GPU_INFO=$(nvidia-smi --query-gpu=name,memory.used,utilization.gpu --format=csv,noheader 2>/dev/null)
  if [ -n "$GPU_INFO" ]; then
    pass "GPU accessible"
    echo -e "    ${BLUE}$GPU_INFO${NC}"
  else
    warn "GPU non disponible"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
# 6. LATENCE (CRITIQUE)
# ═══════════════════════════════════════════════════════════════════════════
section "6. LATENCE E2E (CRITIQUE)"

if [ "$BACKEND_CODE" = "200" ]; then
  info "Test de latence (3 mesures)..."

  TOTAL_LAT=0
  for i in 1 2 3; do
    START=$(date +%s%3N)
    RESPONSE=$(curl -s -X POST http://localhost:8000/chat \
      -H "Content-Type: application/json" \
      -d "{\"message\":\"Test latence $i\",\"session_id\":\"diag_$(date +%s)\"}" 2>/dev/null)
    END=$(date +%s%3N)
    LAT=$((END-START))
    TOTAL_LAT=$((TOTAL_LAT+LAT))
    echo -e "    Test $i: ${LAT}ms"
    sleep 0.3
  done

  AVG=$((TOTAL_LAT/3))
  info "Latence moyenne: ${AVG}ms"

  if [ $AVG -lt 200 ]; then
    pass "Latence EXCELLENTE (<200ms) 🚀"
  elif [ $AVG -lt 300 ]; then
    pass "Latence OK (<300ms)"
  elif [ $AVG -lt 500 ]; then
    warn "Latence WARNING (300-500ms) - Optimisation recommandée"
    TOTAL=$((TOTAL+1))
  else
    fail "Latence CRITIQUE (>500ms) - BLOQUANT"
  fi
else
  fail "Impossible de tester la latence - Backend DOWN"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 7. QUALITÉ DU CODE
# ═══════════════════════════════════════════════════════════════════════════
section "7. QUALITÉ DU CODE"

if [ -d frontend ]; then
  info "Vérification TypeScript..."
  export PATH="$HOME/.bun/bin:$PATH"
  TS_OUTPUT=$(cd frontend && bunx tsc --noEmit 2>&1)
  TS_EXIT=$?

  if [ $TS_EXIT -eq 0 ]; then
    pass "TypeScript: ZÉRO erreur"
  else
    TS_ERRORS=$(echo "$TS_OUTPUT" | grep -c "error TS" || echo "?")
    fail "TypeScript: $TS_ERRORS erreurs"
    echo "$TS_OUTPUT" | grep "error TS" | head -3 | sed 's/^/    /'
  fi
else
  warn "Dossier frontend non trouvé"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 8. PERSONNALITÉ EVA
# ═══════════════════════════════════════════════════════════════════════════
section "8. PERSONNALITÉ EVA"

if [ "$BACKEND_CODE" = "200" ]; then
  info "Test d'empathie..."

  EMPATHY_RESP=$(curl -s -X POST http://localhost:8000/chat \
    -H "Content-Type: application/json" \
    -d '{"message":"Je me sens vraiment triste aujourd hui","session_id":"empathy_test"}' 2>/dev/null)

  if [ -n "$EMPATHY_RESP" ]; then
    RESP_TEXT=$(echo "$EMPATHY_RESP" | grep -oP '"response"\s*:\s*"\K[^"]+' | head -1)
    [ -z "$RESP_TEXT" ] && RESP_TEXT=$(echo "$EMPATHY_RESP" | head -c 200)
    echo -e "    ${BLUE}Réponse: $RESP_TEXT${NC}"

    RESP_LOWER=$(echo "$EMPATHY_RESP" | tr '[:upper:]' '[:lower:]')

    if echo "$RESP_LOWER" | grep -qE "comprends|là pour|écoute|parler|difficile|dur"; then
      pass "Réponse empathique détectée"
    else
      warn "Réponse peut-être pas assez empathique"
    fi

    if echo "$RESP_LOWER" | grep -qE "je suis une ia|intelligence artificielle|comment puis-je vous aider"; then
      fail "Réponse trop robotique (style ChatGPT)"
    else
      pass "Pas de formulation robotique"
    fi
  fi
else
  warn "Impossible de tester personnalité - Backend DOWN"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 9. HOOKS ET BLOCAGE
# ═══════════════════════════════════════════════════════════════════════════
section "9. HOOKS ET SYSTÈME DE BLOCAGE"

HOOK_FILE=""
[ -f .claude/hooks/eva-gate-steroids.py ] && HOOK_FILE=".claude/hooks/eva-gate-steroids.py"
[ -f .claude/hooks/eva-gate.py ] && HOOK_FILE=".claude/hooks/eva-gate.py"

if [ -n "$HOOK_FILE" ]; then
  HOOK_SIZE=$(wc -l < "$HOOK_FILE")
  info "Hook: $HOOK_FILE ($HOOK_SIZE lignes)"

  if grep -q "latency\|LATENCY\|latence" "$HOOK_FILE"; then
    pass "Hook vérifie la latence"
  else
    warn "Hook ne semble pas vérifier la latence"
  fi

  if grep -q "puppeteer\|screenshot" "$HOOK_FILE"; then
    pass "Hook vérifie Puppeteer/screenshots"
  else
    warn "Hook ne semble pas vérifier les screenshots"
  fi

  if grep -q "block\|BLOCK" "$HOOK_FILE"; then
    pass "Hook peut bloquer"
  else
    warn "Hook ne semble pas pouvoir bloquer"
  fi

  if grep -q "heal\|HEAL\|restart" "$HOOK_FILE"; then
    pass "Hook a capacité auto-heal"
  else
    warn "Hook n'a pas d'auto-heal"
  fi
fi

if [ -f .claude/settings.json ]; then
  pass "Settings Claude configurés"
  if grep -q "Stop" .claude/settings.json; then
    pass "Stop hook configuré dans settings"
  fi
else
  warn "Pas de settings.json"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 10. RÉSUMÉ FINAL
# ═══════════════════════════════════════════════════════════════════════════
header "RÉSUMÉ FINAL"

if [ $TOTAL -eq 0 ]; then
  TOTAL=1
fi
PCT=$((SCORE*100/TOTAL))

echo ""
echo -e "${BOLD}Score: $SCORE / $TOTAL ($PCT%)${NC}"
echo ""

# Barre de progression
BAR_WIDTH=50
FILLED=$((PCT*BAR_WIDTH/100))
EMPTY=$((BAR_WIDTH-FILLED))
printf "["
for ((i=0; i<FILLED; i++)); do printf "█"; done
for ((i=0; i<EMPTY; i++)); do printf "░"; done
printf "] $PCT%%\n"
echo ""

if [ $PCT -ge 85 ]; then
  echo -e "${GREEN}${BOLD}"
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║         🚀 AGENT SOUS STÉROÏDES - EXCELLENT 🚀                ║"
  echo "║                                                               ║"
  echo "║  L'agent applique le protocole Ralphy EVA correctement.       ║"
  echo "║  Il utilise Puppeteer, documente ses réflexions,              ║"
  echo "║  mesure les métriques et maintient la qualité.                ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
elif [ $PCT -ge 65 ]; then
  echo -e "${GREEN}"
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║              ✅ AGENT FONCTIONNEL - BON                       ║"
  echo "║                                                               ║"
  echo "║  L'agent suit la plupart du protocole.                        ║"
  echo "║  Quelques améliorations possibles.                            ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
elif [ $PCT -ge 40 ]; then
  echo -e "${YELLOW}"
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║              ⚠️  AGENT PARTIEL - MOYEN                        ║"
  echo "║                                                               ║"
  echo "║  L'agent applique partiellement le protocole.                 ║"
  echo "║  Plusieurs éléments critiques manquent.                       ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
else
  echo -e "${RED}"
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║          ❌ PAS SOUS STÉROÏDES - ÉCHEC                        ║"
  echo "║                                                               ║"
  echo "║  L'agent N'APPLIQUE PAS le protocole Ralphy EVA.              ║"
  echo "║  Il manque les éléments fondamentaux.                         ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
fi

if [ -n "$DETAILS" ]; then
  echo ""
  echo -e "${RED}${BOLD}Problèmes détectés:${NC}"
  echo -e "$DETAILS"
fi

echo ""
echo -e "${BLUE}Diagnostic terminé: $(date)${NC}"
