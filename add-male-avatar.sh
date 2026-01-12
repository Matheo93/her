#!/bin/bash
# Script pour ajouter un nouvel avatar masculin

AVATARS_DIR="/home/mathcode/DO NOT TOUCH/eva-voice/frontend/public/avatars"
VENV_DIR="/home/mathcode/DO NOT TOUCH/eva-voice/bg_removal_venv"

echo "=== Ajout d'avatar masculin pour eva-voice ==="

# Verifier si un fichier image est fourni
if [ -z "$1" ]; then
    echo ""
    echo "Usage: $0 <chemin_vers_image.jpg>"
    echo ""
    echo "Exemple:"
    echo "  $0 ~/Downloads/adam.jpg"
    echo ""
    echo "L'image doit etre:"
    echo "  - Un portrait frontal"
    echo "  - Expression neutre ou leger sourire"
    echo "  - Minimum 512x512 pixels"
    echo "  - Format JPG ou PNG"
    echo ""
    echo "Sources recommandees pour images libres de droits:"
    echo "  - https://unsplash.com (recherche: man portrait)"
    echo "  - https://pexels.com (recherche: professional headshot)"
    echo "  - https://generated.photos (visages IA)"
    exit 1
fi

SOURCE_IMAGE="$1"
AVATAR_NAME="${2:-adam}"

# Verifier que le fichier existe
if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "Erreur: Le fichier $SOURCE_IMAGE n'existe pas"
    exit 1
fi

echo "Source: $SOURCE_IMAGE"
echo "Nom avatar: $AVATAR_NAME"
echo ""

# Copier l'image
echo "1. Copie de l'image..."
cp "$SOURCE_IMAGE" "$AVATARS_DIR/${AVATAR_NAME}.jpg"

# Supprimer le fond avec rembg
echo "2. Suppression du fond avec rembg..."
source "$VENV_DIR/bin/activate"

python3 << PYTHON
from rembg import remove
from PIL import Image
import io

input_path = "$AVATARS_DIR/${AVATAR_NAME}.jpg"
output_path = "$AVATARS_DIR/${AVATAR_NAME}_nobg.png"

print(f"   Input: {input_path}")
print(f"   Output: {output_path}")

with open(input_path, 'rb') as f:
    input_data = f.read()

output_data = remove(input_data)

with open(output_path, 'wb') as f:
    f.write(output_data)

# Verifier les dimensions
img = Image.open(output_path)
print(f"   Dimensions: {img.size[0]}x{img.size[1]}")
print("   Fond supprime avec succes!")
PYTHON

deactivate

echo ""
echo "3. Verification des fichiers crees..."
ls -la "$AVATARS_DIR/${AVATAR_NAME}"*

echo ""
echo "=== Avatar '$AVATAR_NAME' ajoute avec succes! ==="
echo ""
echo "Pour l'utiliser, redemarrez le service LivePortrait:"
echo "  cd '$VENV_DIR/../liveportrait' && python api.py"
echo ""
echo "Puis selectionnez '$AVATAR_NAME' dans l'interface."
