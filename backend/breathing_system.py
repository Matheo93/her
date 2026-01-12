"""
Natural Breathing & Hesitation System for Eva-Voice

Systeme de respiration et hesitations naturelles pour voix synthetique.
100% LOCAL - Pas d'API externe requise.

Genere des hesitations et pauses naturelles inserees dans le texte AVANT
le TTS pour etre prononcees naturellement par Edge-TTS.

Features:
- Hesitations naturelles (euh, hmm, enfin) inserees dans le texte
- Pauses respiratoires via ponctuation et ellipses
- Variations aleatoires pour eviter la monotonie
- 100% compatible avec Edge-TTS (pas de SSML custom)
"""

import re
import random
from typing import Optional


class NaturalBreathingSystem:
    """Systeme de respiration et hesitations naturelles pour voix synthetique."""

    # Configuration de respiration/pauses
    BREATH_CONFIG = {
        "enabled": True,
        "probability": 0.35,  # Probabilite d'ajouter une pause entre phrases
        "min_text_length": 40,  # Longueur minimale pour ajouter des pauses
    }

    # Configuration des hesitations
    HESITATION_CONFIG = {
        "enabled": True,
        "probability": 0.18,  # Probabilite d'ajouter une hesitation
        "max_per_response": 2,  # Maximum d'hesitations par reponse
    }

    # Hesitations naturelles francaises (prononcees par le TTS)
    HESITATIONS_FR = [
        "euh...",
        "hmm...",
        "enfin...",
        "bon...",
        "tu vois...",
        "comment dire...",
        "disons...",
    ]

    # Hesitations courtes pour milieu de phrase
    MICRO_HESITATIONS_FR = ["euh", "enfin", "bon", "hm"]

    # Patterns pre-compiles pour inserer des hesitations
    HESITATION_INSERT_PATTERNS = [
        (re.compile(r'(Je pense que )', re.IGNORECASE), r'\1euh... '),
        (re.compile(r'^(C\'est )', re.IGNORECASE), r'Hmm... \1'),
        (re.compile(r'(Peut-être que )', re.IGNORECASE), r'\1bon... '),
        (re.compile(r'(En fait,? )', re.IGNORECASE), r'\1euh... '),
        (re.compile(r'(Tu sais,? )', re.IGNORECASE), r'\1enfin... '),
        (re.compile(r'(Je crois que )', re.IGNORECASE), r'\1hmm... '),
        (re.compile(r'(Mais bon,? )', re.IGNORECASE), r'\1euh... '),
        (re.compile(r'(Donc,? )', re.IGNORECASE), r'\1euh... '),
    ]

    # Sons de reflexion naturels
    THINKING_SOUNDS = ["hmm...", "mmh...", "ah..."]

    # Mots de liaison apres lesquels on peut inserer une pause
    LIAISON_WORDS = ['et', 'ou', 'mais', 'donc', 'car', 'puis', 'alors', 'parce']

    def __init__(self):
        self._hesitation_count = 0

    def reset_hesitation_count(self):
        """Reset le compteur d'hesitations pour une nouvelle reponse."""
        self._hesitation_count = 0

    def insert_hesitations(self, text: str) -> str:
        """Insere des hesitations naturelles dans le texte.

        Les hesitations sont ajoutees AVANT la synthese TTS, donc le TTS
        les prononcera naturellement.

        Args:
            text: Texte original

        Returns:
            Texte avec hesitations inserees
        """
        if not self.HESITATION_CONFIG["enabled"]:
            return text

        if self._hesitation_count >= self.HESITATION_CONFIG["max_per_response"]:
            return text

        # Probabilite de ne pas ajouter d'hesitation
        if random.random() > self.HESITATION_CONFIG["probability"]:
            return text

        result = text

        # Methode 1: Patterns specifiques (60% du temps)
        if random.random() < 0.6:
            for pattern, replacement in self.HESITATION_INSERT_PATTERNS:
                if pattern.search(result):
                    result = pattern.sub(replacement, result, count=1)
                    self._hesitation_count += 1
                    return result

        # Methode 2: Insertion en debut (pour phrases longues)
        if len(text) > 60 and random.random() < 0.4:
            hesitation = random.choice(self.HESITATIONS_FR)
            # Ne pas ajouter si commence deja par une interjection
            starts_with = any(
                text.lower().startswith(h.split('.')[0].lower())
                for h in self.HESITATIONS_FR + self.THINKING_SOUNDS
            )
            if not starts_with:
                result = f"{hesitation} {text[0].lower()}{text[1:]}"
                self._hesitation_count += 1
                return result

        # Methode 3: Apres une virgule
        if ',' in text and random.random() < 0.3:
            parts = text.split(',', 1)
            if len(parts) == 2 and len(parts[1]) > 20:
                micro = random.choice(self.MICRO_HESITATIONS_FR)
                result = f"{parts[0]}, {micro}...{parts[1]}"
                self._hesitation_count += 1
                return result

        return text

    def add_breathing_pauses(self, text: str) -> str:
        """Ajoute des pauses respiratoires dans le texte via des ellipses.

        Edge-TTS interprete les ellipses comme des pauses naturelles.

        Args:
            text: Texte original

        Returns:
            Texte avec pauses de respiration ajoutees
        """
        if not self.BREATH_CONFIG["enabled"]:
            return text

        if len(text) < self.BREATH_CONFIG["min_text_length"]:
            return text

        result = text

        # Son de reflexion au debut si texte long
        if len(text) > 100 and random.random() < 0.25:
            starts_with = any(
                text.lower().startswith(s.split('.')[0].lower())
                for s in self.THINKING_SOUNDS + self.HESITATIONS_FR
            )
            if not starts_with:
                sound = random.choice(self.THINKING_SOUNDS)
                result = f"{sound} {text[0].lower()}{text[1:]}"

        # Pauses subtiles entre les phrases
        sentences = re.split(r'([.!?]+)', result)
        if len(sentences) >= 4:  # Au moins 2 phrases completes
            new_parts = []
            for i, part in enumerate(sentences):
                new_parts.append(part)
                # Apres la ponctuation, potentiellement ajouter une pause
                if re.match(r'^[.!?]+$', part) and i < len(sentences) - 2:
                    if random.random() < self.BREATH_CONFIG["probability"]:
                        # Ellipse = pause naturelle dans TTS
                        pause = random.choice(['', '..', ' '])
                        new_parts.append(pause)
            result = ''.join(new_parts)

        return result

    def add_micro_pauses(self, text: str) -> str:
        """Ajoute des micro-pauses dans les phrases longues.

        Insere des ellipses apres les mots de liaison pour creer
        des pauses naturelles dans les phrases sans ponctuation.

        Args:
            text: Texte original

        Returns:
            Texte avec micro-pauses ajoutees
        """
        words = text.split()
        if len(words) > 15 and ',' not in text and '...' not in text:
            for i, word in enumerate(words):
                clean = word.lower().strip('.,!?')
                if clean in self.LIAISON_WORDS and 5 < i < len(words) - 5:
                    if random.random() < 0.4:
                        words[i] = word + '...'
                        break
            return ' '.join(words)
        return text

    def process_text_for_naturalness(self, text: str) -> str:
        """Traitement complet du texte pour le rendre plus naturel.

        Applique hesitations, pauses de respiration et micro-pauses.

        Args:
            text: Texte original

        Returns:
            Texte traite avec hesitations et pauses naturelles
        """
        # Reset le compteur pour une nouvelle reponse
        self.reset_hesitation_count()

        # 1. Inserer des hesitations (occasionnellement)
        result = self.insert_hesitations(text)

        # 2. Ajouter des pauses de respiration
        result = self.add_breathing_pauses(result)

        # 3. Ajouter des micro-pauses dans les phrases longues
        result = self.add_micro_pauses(result)

        return result

    def configure(
        self,
        breath_enabled: Optional[bool] = None,
        breath_probability: Optional[float] = None,
        hesitation_enabled: Optional[bool] = None,
        hesitation_probability: Optional[float] = None,
        max_hesitations: Optional[int] = None,
    ):
        """Configure les parametres du systeme de respiration.

        Args:
            breath_enabled: Activer/desactiver les pauses de respiration
            breath_probability: Probabilite d'ajouter une pause (0.0-1.0)
            hesitation_enabled: Activer/desactiver les hesitations
            hesitation_probability: Probabilite d'ajouter une hesitation (0.0-1.0)
            max_hesitations: Nombre maximum d'hesitations par reponse
        """
        if breath_enabled is not None:
            self.BREATH_CONFIG["enabled"] = breath_enabled
        if breath_probability is not None:
            self.BREATH_CONFIG["probability"] = max(0.0, min(1.0, breath_probability))
        if hesitation_enabled is not None:
            self.HESITATION_CONFIG["enabled"] = hesitation_enabled
        if hesitation_probability is not None:
            self.HESITATION_CONFIG["probability"] = max(0.0, min(1.0, hesitation_probability))
        if max_hesitations is not None:
            self.HESITATION_CONFIG["max_per_response"] = max(0, max_hesitations)


# Instance globale pre-configuree
breathing_system = NaturalBreathingSystem()


# Fonction utilitaire pour acces direct
def make_natural(text: str) -> str:
    """Rend un texte plus naturel avec hesitations et pauses.

    Fonction utilitaire pour un acces simple au systeme de respiration.

    Args:
        text: Texte original

    Returns:
        Texte avec hesitations et pauses naturelles
    """
    return breathing_system.process_text_for_naturalness(text)


if __name__ == "__main__":
    # Tests
    test_texts = [
        "Bonjour, comment ça va aujourd'hui?",
        "Je pense que tu devrais essayer cette approche.",
        "C'est vraiment intéressant ce que tu me racontes là.",
        "En fait, je ne suis pas sûre de comprendre ce que tu veux dire.",
        "Tu sais, parfois c'est difficile de trouver les bons mots.",
        "J'adore quand on discute ensemble comme ça, c'est vraiment agréable.",
    ]

    print("=== Test du système de respiration naturelle ===\n")
    for text in test_texts:
        result = make_natural(text)
        if result != text:
            print(f"Original: {text}")
            print(f"Naturel:  {result}")
            print()
        else:
            print(f"Inchangé: {text}")
            print()
