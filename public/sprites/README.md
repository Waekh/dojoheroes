# Sprites des personnages

Planches fournies par l'artiste, découpées sans modifier les pixels par :

    python3 tools/cut_sheet.py <planche.png|webp> public/sprites/<nom>

Le script rend seulement le fond transparent (damier ou fond clair), puis aligne chaque pose
dans une case de taille fixe (même ligne de sol par animation). Il écrit `<nom>.png` + `<nom>.json`.

Ordre des lignes attendu : attente, marche, course, coup de poing, coup de pied, saut, coup de pied sauté.
Personnage tourné vers la droite (le moteur fait le miroir).
