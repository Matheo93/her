"""
Eva Micro-Expression System - Subtle Human Behaviors

Génère des micro-expressions subtiles pour rendre Eva vivante:
- Clignements d'yeux naturels
- Micro-sourires
- Mouvements oculaires
- Respiration visible
- Comportements d'écoute
- Mouvements idle

100% LOCAL - Pas d'API externe
"""

import random
import time
import math
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from enum import Enum


class BlinkType(Enum):
    """Types de clignements."""
    NORMAL = "normal"           # Clignement normal (~150ms)
    SLOW = "slow"               # Clignement lent, pensif (~300ms)
    DOUBLE = "double"           # Double clignement rapide
    HALF = "half"               # Demi-clignement
    LONG = "long"               # Clignement long, fatigue/émotion


class GazeDirection(Enum):
    """Directions du regard."""
    CENTER = "center"
    UP_LEFT = "up_left"         # Rappel visuel
    UP_RIGHT = "up_right"       # Construction mentale
    LEFT = "left"               # Rappel auditif
    RIGHT = "right"             # Création auditive
    DOWN_LEFT = "down_left"     # Dialogue interne
    DOWN_RIGHT = "down_right"   # Kinesthésique/émotions


@dataclass
class MicroExpression:
    """Une micro-expression individuelle."""
    type: str
    target: str              # "eyes", "mouth", "brows", "head", etc.
    value: float             # Intensité -1.0 à 1.0
    duration: float          # Durée en secondes
    easing: str = "ease_out" # "linear", "ease_in", "ease_out", "ease_in_out"
    delay: float = 0.0       # Délai avant démarrage


@dataclass
class ExpressionFrame:
    """Un frame d'animation avec plusieurs micro-expressions."""
    timestamp: float
    expressions: List[MicroExpression] = field(default_factory=list)


class BlinkingSystem:
    """Système de clignement naturel des yeux."""

    # Fréquence moyenne: 15-20 clignements/minute
    # Varie selon l'émotion et l'attention

    BLINK_PATTERNS = {
        "neutral": {"min_interval": 2.0, "max_interval": 6.0, "types": [BlinkType.NORMAL]},
        "attentive": {"min_interval": 4.0, "max_interval": 8.0, "types": [BlinkType.NORMAL, BlinkType.HALF]},
        "thinking": {"min_interval": 1.5, "max_interval": 4.0, "types": [BlinkType.SLOW, BlinkType.NORMAL]},
        "excited": {"min_interval": 1.0, "max_interval": 3.0, "types": [BlinkType.NORMAL, BlinkType.DOUBLE]},
        "sad": {"min_interval": 3.0, "max_interval": 7.0, "types": [BlinkType.SLOW, BlinkType.LONG]},
        "surprised": {"min_interval": 5.0, "max_interval": 10.0, "types": [BlinkType.HALF]},  # Yeux grands ouverts
    }

    BLINK_DURATIONS = {
        BlinkType.NORMAL: 0.15,
        BlinkType.SLOW: 0.3,
        BlinkType.DOUBLE: 0.25,  # Deux clignements rapides
        BlinkType.HALF: 0.1,
        BlinkType.LONG: 0.5,
    }

    def __init__(self):
        now = time.time()
        self.last_blink = now
        self.current_state = "neutral"
        self._cached_pattern = self.BLINK_PATTERNS["neutral"]
        self.next_blink_time = self._calc_next_blink(now)

    def _calc_next_blink(self, current_time: Optional[float] = None) -> float:
        now = current_time if current_time is not None else time.time()
        interval = random.uniform(self._cached_pattern["min_interval"], self._cached_pattern["max_interval"])
        return now + interval

    def set_state(self, state: str):
        """Change l'état émotionnel pour ajuster le clignement."""
        if state in self.BLINK_PATTERNS:
            self.current_state = state
            self._cached_pattern = self.BLINK_PATTERNS[state]

    def generate_blink(self, current_time: Optional[float] = None) -> Optional[List[MicroExpression]]:
        """Génère un clignement si c'est le moment."""
        now = current_time if current_time is not None else time.time()
        if now < self.next_blink_time:
            return None

        blink_type = random.choice(self._cached_pattern["types"])
        duration = self.BLINK_DURATIONS[blink_type]

        self.next_blink_time = self._calc_next_blink(now)

        expressions = []

        if blink_type == BlinkType.DOUBLE:
            # Premier clignement
            expressions.append(MicroExpression(
                type="blink",
                target="eyelids",
                value=1.0,
                duration=0.08,
                easing="ease_in_out"
            ))
            # Pause
            expressions.append(MicroExpression(
                type="blink",
                target="eyelids",
                value=0.0,
                duration=0.05,
                delay=0.08
            ))
            # Second clignement
            expressions.append(MicroExpression(
                type="blink",
                target="eyelids",
                value=1.0,
                duration=0.08,
                delay=0.13,
                easing="ease_in_out"
            ))
        else:
            expressions.append(MicroExpression(
                type="blink",
                target="eyelids",
                value=1.0 if blink_type != BlinkType.HALF else 0.5,
                duration=duration,
                easing="ease_in_out"
            ))

        return expressions


class GazeSystem:
    """Système de mouvement des yeux."""

    # Micro-saccades naturelles toutes les 200-500ms
    # Changements de direction toutes les 2-5 secondes

    # Pre-computed gaze coordinates (class-level for performance)
    GAZE_COORDS = {
        GazeDirection.CENTER: (0.0, 0.0),
        GazeDirection.UP_LEFT: (-0.15, 0.1),
        GazeDirection.UP_RIGHT: (0.15, 0.1),
        GazeDirection.LEFT: (-0.2, 0.0),
        GazeDirection.RIGHT: (0.2, 0.0),
        GazeDirection.DOWN_LEFT: (-0.1, -0.15),
        GazeDirection.DOWN_RIGHT: (0.1, -0.15),
    }

    # Pre-computed direction lists for each context
    CONTEXT_DIRECTIONS = {
        "thinking": [GazeDirection.UP_LEFT, GazeDirection.UP_RIGHT],
        "listening": [GazeDirection.CENTER, GazeDirection.LEFT, GazeDirection.RIGHT],
        "emotional": [GazeDirection.DOWN_LEFT, GazeDirection.DOWN_RIGHT],
    }
    ALL_DIRECTIONS = list(GazeDirection)

    def __init__(self):
        self.current_gaze = GazeDirection.CENTER
        self.last_shift = time.time()
        self.target_position = (0.0, 0.0)  # x, y dans le plan du regard

    def generate_micro_saccade(self) -> MicroExpression:
        """Génère une micro-saccade (petit mouvement involontaire)."""
        # Très petits mouvements aléatoires
        dx = random.uniform(-0.02, 0.02)
        dy = random.uniform(-0.02, 0.02)

        return MicroExpression(
            type="gaze_micro",
            target="eyes",
            value=0.0,  # Valeur non utilisée, on utilise les metadata
            duration=0.05,
            easing="linear"
        )

    def generate_gaze_shift(self, context: str = "idle", current_time: Optional[float] = None) -> List[MicroExpression]:
        """Génère un changement de direction du regard."""
        # Use pre-computed direction lists (O(1) lookup instead of list creation)
        directions = self.CONTEXT_DIRECTIONS.get(context, self.ALL_DIRECTIONS)
        direction = random.choice(directions)

        # Use pre-computed gaze coordinates (class-level dict)
        x, y = self.GAZE_COORDS.get(direction, (0.0, 0.0))

        expressions = [
            MicroExpression(
                type="gaze_x",
                target="eyes",
                value=x,
                duration=0.2,
                easing="ease_out"
            ),
            MicroExpression(
                type="gaze_y",
                target="eyes",
                value=y,
                duration=0.2,
                easing="ease_out"
            ),
        ]

        self.current_gaze = direction
        self.last_shift = current_time if current_time is not None else time.time()

        return expressions


class MicroSmileSystem:
    """Système de micro-sourires subtils."""

    # Asymétrie naturelle du sourire
    # Intensité variable selon l'émotion

    SMILE_TYPES = {
        "subtle": {"intensity": 0.15, "asymmetry": 0.05, "duration": 0.8},
        "warm": {"intensity": 0.3, "asymmetry": 0.08, "duration": 1.0},
        "amused": {"intensity": 0.25, "asymmetry": 0.1, "duration": 0.5},
        "knowing": {"intensity": 0.2, "asymmetry": 0.15, "duration": 1.2},  # Sourire en coin
        "shy": {"intensity": 0.15, "asymmetry": 0.02, "duration": 0.6},
    }

    def generate_micro_smile(self, smile_type: str = "subtle") -> List[MicroExpression]:
        """Génère un micro-sourire."""
        params = self.SMILE_TYPES.get(smile_type, self.SMILE_TYPES["subtle"])

        # Asymétrie naturelle - un côté légèrement plus haut
        left_intensity = params["intensity"] * (1 - params["asymmetry"])
        right_intensity = params["intensity"] * (1 + params["asymmetry"])

        # Randomiser quel côté est plus haut
        if random.random() > 0.5:
            left_intensity, right_intensity = right_intensity, left_intensity

        expressions = [
            MicroExpression(
                type="smile_left",
                target="mouth",
                value=left_intensity,
                duration=params["duration"],
                easing="ease_in_out"
            ),
            MicroExpression(
                type="smile_right",
                target="mouth",
                value=right_intensity,
                duration=params["duration"],
                easing="ease_in_out"
            ),
        ]

        # Ajouter le plissement des yeux si sourire assez fort
        if params["intensity"] > 0.2:
            expressions.append(MicroExpression(
                type="eye_squint",
                target="eyes",
                value=params["intensity"] * 0.3,
                duration=params["duration"],
                easing="ease_in_out"
            ))

        return expressions


class BreathingVisualization:
    """Respiration visible (épaules, poitrine)."""

    # Cycle respiratoire: 12-20 respirations/minute au repos
    # Plus rapide en excitation, plus lent en relaxation

    BREATHING_PATTERNS = {
        "calm": {"cycle_duration": 4.0, "intensity": 0.3},
        "normal": {"cycle_duration": 3.5, "intensity": 0.4},
        "excited": {"cycle_duration": 2.5, "intensity": 0.6},
        "deep": {"cycle_duration": 5.0, "intensity": 0.5},  # Soupir, réflexion
    }

    def __init__(self):
        self.phase = 0.0  # 0-1, où 0-0.4 est inhale, 0.4-1 est exhale
        self.pattern = "normal"

    def generate_breath_frame(self, delta_time: float) -> List[MicroExpression]:
        """Génère un frame de respiration."""
        params = self.BREATHING_PATTERNS.get(self.pattern, self.BREATHING_PATTERNS["normal"])

        # Avancer la phase
        self.phase += delta_time / params["cycle_duration"]
        if self.phase >= 1.0:
            self.phase -= 1.0

        # Calculer la valeur (sinusoïdale pour naturalité)
        breath_value = math.sin(self.phase * 2 * math.pi) * params["intensity"]

        return [
            MicroExpression(
                type="breath_chest",
                target="chest",
                value=breath_value,
                duration=0.033,  # ~30fps
                easing="linear"
            ),
            MicroExpression(
                type="breath_shoulders",
                target="shoulders",
                value=breath_value * 0.3,  # Épaules bougent moins
                duration=0.033,
                easing="linear"
            ),
        ]


class IdleBehaviors:
    """Comportements idle subtils."""

    BEHAVIORS = [
        {"name": "head_tilt_slight", "probability": 0.1, "duration": 2.0},
        {"name": "weight_shift", "probability": 0.05, "duration": 1.5},
        {"name": "lip_press", "probability": 0.08, "duration": 0.5},
        {"name": "nostril_flare", "probability": 0.03, "duration": 0.3},
        {"name": "swallow", "probability": 0.02, "duration": 0.4},
        {"name": "brow_micro", "probability": 0.1, "duration": 0.6},
    ]

    def __init__(self):
        self.last_behavior_time = {}
        for b in self.BEHAVIORS:
            self.last_behavior_time[b["name"]] = 0

    def generate_idle_behavior(self, current_time: Optional[float] = None) -> Optional[List[MicroExpression]]:
        """Génère un comportement idle aléatoire."""
        now = current_time if current_time is not None else time.time()

        for behavior in self.BEHAVIORS:
            name = behavior["name"]
            # Vérifier le cooldown (au moins 5 secondes entre comportements similaires)
            if now - self.last_behavior_time.get(name, 0) < 5.0:
                continue

            if random.random() < behavior["probability"]:
                self.last_behavior_time[name] = now
                return self._create_behavior(name, behavior["duration"])

        return None

    def _create_behavior(self, name: str, duration: float) -> List[MicroExpression]:
        """Crée les expressions pour un comportement."""
        if name == "head_tilt_slight":
            angle = random.uniform(-0.05, 0.05)
            return [MicroExpression(
                type="head_tilt",
                target="head",
                value=angle,
                duration=duration,
                easing="ease_in_out"
            )]

        elif name == "lip_press":
            return [MicroExpression(
                type="lip_press",
                target="mouth",
                value=0.3,
                duration=duration,
                easing="ease_in_out"
            )]

        elif name == "nostril_flare":
            return [MicroExpression(
                type="nostril_flare",
                target="nose",
                value=0.4,
                duration=duration,
                easing="ease_out"
            )]

        elif name == "swallow":
            return [
                MicroExpression(
                    type="throat_move",
                    target="throat",
                    value=1.0,
                    duration=duration * 0.3,
                    easing="ease_in"
                ),
                MicroExpression(
                    type="throat_move",
                    target="throat",
                    value=0.0,
                    duration=duration * 0.7,
                    delay=duration * 0.3,
                    easing="ease_out"
                ),
            ]

        elif name == "brow_micro":
            # Micro-mouvement d'un sourcil
            side = random.choice(["left", "right"])
            return [MicroExpression(
                type=f"brow_{side}_micro",
                target="brows",
                value=random.uniform(0.1, 0.2),
                duration=duration,
                easing="ease_in_out"
            )]

        return []


class ListeningBehaviors:
    """Comportements d'écoute active."""

    def __init__(self):
        self.is_listening = False
        self.last_nod = 0
        self.engagement_level = 0.5  # 0-1

    def set_listening(self, listening: bool, engagement: float = 0.5):
        """Active/désactive le mode écoute."""
        self.is_listening = listening
        self.engagement_level = max(0, min(1, engagement))

    def generate_listening_behavior(self, current_time: Optional[float] = None) -> Optional[List[MicroExpression]]:
        """Génère des comportements d'écoute."""
        if not self.is_listening:
            return None

        now = current_time if current_time is not None else time.time()
        expressions = []

        # Hochements de tête occasionnels
        if now - self.last_nod > random.uniform(2.0, 5.0) and random.random() < 0.3:
            self.last_nod = now
            nod_intensity = 0.1 + self.engagement_level * 0.15
            expressions.extend([
                MicroExpression(
                    type="head_nod",
                    target="head",
                    value=nod_intensity,
                    duration=0.3,
                    easing="ease_in_out"
                ),
                MicroExpression(
                    type="head_nod",
                    target="head",
                    value=0,
                    duration=0.3,
                    delay=0.3,
                    easing="ease_out"
                ),
            ])

        # Sourcils levés pour montrer l'intérêt
        if random.random() < 0.1 * self.engagement_level:
            expressions.append(MicroExpression(
                type="brows_interest",
                target="brows",
                value=0.2,
                duration=0.5,
                easing="ease_in_out"
            ))

        return expressions if expressions else None


class EvaMicroExpressionEngine:
    """Moteur principal des micro-expressions."""

    # Pre-compiled sets for O(1) text matching (class-level for performance)
    SMILE_WORDS = frozenset({"haha", "hihi", "mdr", "adore", "super", "cool"})
    SURPRISE_WORDS = frozenset({"quoi", "vraiment", "serieux"})
    THINKING_WORDS = frozenset({"hmm", "peut-etre", "je pense"})
    SPEAKING_EMOTIONS = frozenset({"joy", "playful", "tenderness"})

    def __init__(self):
        self.blinking = BlinkingSystem()
        self.gaze = GazeSystem()
        self.smile = MicroSmileSystem()
        self.breathing = BreathingVisualization()
        self.idle = IdleBehaviors()
        self.listening = ListeningBehaviors()

        self.current_emotion = "neutral"
        self.is_speaking = False
        self.last_update = time.time()

    def set_emotion(self, emotion: str):
        """Change l'état émotionnel."""
        self.current_emotion = emotion

        # Mapper l'émotion aux systèmes
        blink_mapping = {
            "joy": "excited",
            "excitement": "excited",
            "sadness": "sad",
            "surprise": "surprised",
            "thoughtful": "thinking",
            "curiosity": "attentive",
        }
        self.blinking.set_state(blink_mapping.get(emotion, "neutral"))

        # Ajuster la respiration
        breath_mapping = {
            "excitement": "excited",
            "joy": "normal",
            "sadness": "deep",
            "thoughtful": "deep",
        }
        self.breathing.pattern = breath_mapping.get(emotion, "normal")

    def set_speaking(self, speaking: bool):
        """Indique si Eva parle."""
        self.is_speaking = speaking
        self.listening.set_listening(not speaking)

    def generate_frame(self) -> Dict:
        """Génère un frame complet de micro-expressions.

        Optimized: Single time.time() call passed to all subsystems.
        """
        now = time.time()  # Single timestamp for entire frame
        delta = now - self.last_update
        self.last_update = now

        all_expressions = []

        # 1. Clignements (pass timestamp for efficiency)
        blink = self.blinking.generate_blink(now)
        if blink:
            all_expressions.extend(blink)

        # 2. Respiration (toujours active)
        breath = self.breathing.generate_breath_frame(delta)
        all_expressions.extend(breath)

        # 3. Comportements selon le contexte
        if self.is_speaking:
            # Pendant la parole: regard engagé, expressions selon l'émotion
            if random.random() < 0.05:
                gaze = self.gaze.generate_gaze_shift("emotional", now)
                all_expressions.extend(gaze)

            # Micro-sourires selon l'émotion (use pre-compiled frozenset)
            if self.current_emotion in self.SPEAKING_EMOTIONS:
                if random.random() < 0.1:
                    smile_type = "warm" if self.current_emotion == "tenderness" else "amused"
                    smile = self.smile.generate_micro_smile(smile_type)
                    all_expressions.extend(smile)

        else:
            # Mode écoute ou idle (pass timestamp)
            listening = self.listening.generate_listening_behavior(now)
            if listening:
                all_expressions.extend(listening)

            idle = self.idle.generate_idle_behavior(now)
            if idle:
                all_expressions.extend(idle)

            # Regard en mode écoute
            if random.random() < 0.02:
                gaze = self.gaze.generate_gaze_shift("listening", now)
                all_expressions.extend(gaze)

        # Convertir en dictionnaire pour JSON
        return {
            "timestamp": now,
            "expressions": [
                {
                    "type": e.type,
                    "target": e.target,
                    "value": round(e.value, 4),
                    "duration": round(e.duration, 3),
                    "easing": e.easing,
                    "delay": round(e.delay, 3),
                }
                for e in all_expressions
            ]
        }

    def generate_expression_for_text(self, text: str) -> Dict:
        """Génère des expressions appropriées pour un texte.

        Optimized: Uses pre-compiled frozensets for O(1) word lookups.
        """
        expressions = []

        # Analyse du texte pour expressions
        text_lower = text.lower()
        # Split once for word-level matching (more accurate than substring)
        words = set(text_lower.split())

        # Sourire si contenu joyeux (O(1) intersection check)
        if words & self.SMILE_WORDS:
            expressions.extend(self.smile.generate_micro_smile("amused"))

        # Sourcils levés pour surprise/question
        if "?" in text or (words & self.SURPRISE_WORDS):
            expressions.append(MicroExpression(
                type="brows_raise",
                target="brows",
                value=0.3,
                duration=0.4,
                easing="ease_out"
            ))

        # Regard pensif pour réflexion - check substring for multi-word phrases
        if any(w in text_lower for w in self.THINKING_WORDS):
            expressions.extend(self.gaze.generate_gaze_shift("thinking"))

        return {
            "text_based": True,
            "expressions": [
                {
                    "type": e.type,
                    "target": e.target,
                    "value": round(e.value, 4),
                    "duration": round(e.duration, 3),
                    "easing": e.easing,
                    "delay": round(e.delay, 3),
                }
                for e in expressions
            ]
        }


# Instance globale
micro_expression_engine = EvaMicroExpressionEngine()


# Fonctions utilitaires
def init_micro_expressions():
    """Initialise le moteur de micro-expressions."""
    print("✅ Micro-expression engine ready (blink, gaze, smile, breath, idle)")
    return True


def get_micro_expression_frame() -> Dict:
    """Retourne un frame de micro-expressions."""
    return micro_expression_engine.generate_frame()


def get_text_expressions(text: str) -> Dict:
    """Retourne les expressions pour un texte."""
    return micro_expression_engine.generate_expression_for_text(text)


def set_emotion(emotion: str):
    """Change l'émotion courante."""
    micro_expression_engine.set_emotion(emotion)


def set_speaking(speaking: bool):
    """Indique si Eva parle."""
    micro_expression_engine.set_speaking(speaking)


if __name__ == "__main__":
    import json

    print("=== Test Micro-Expression Engine ===\n")

    init_micro_expressions()

    # Simuler quelques frames
    for i in range(5):
        frame = get_micro_expression_frame()
        if frame["expressions"]:
            print(f"Frame {i}: {len(frame['expressions'])} expressions")
            for expr in frame["expressions"][:3]:
                print(f"  - {expr['type']}: {expr['value']:.2f} ({expr['duration']}s)")
        time.sleep(0.5)

    print("\n=== Test Text Expressions ===\n")

    test_texts = [
        "Haha, c'est trop drôle !",
        "Hmm, je pense que...",
        "Quoi ?! Sérieux ?",
    ]

    for text in test_texts:
        expr = get_text_expressions(text)
        print(f"'{text}'")
        print(f"  → {len(expr['expressions'])} expressions")
        for e in expr['expressions']:
            print(f"    - {e['type']}: {e['value']:.2f}")
        print()
