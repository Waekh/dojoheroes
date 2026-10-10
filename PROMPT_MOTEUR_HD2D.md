# Prompt — Moteur graphique HD-2D « au plus proche d'Octopath Traveler »

> Prompt destiné à Claude pour la prochaine session d'implémentation.
> Périmètre : **uniquement le moteur graphique** (rendu, environnement, sprites, animations, lumière, post-process).
> Aucun gameplay, sauf ce qu'il faut pour se déplacer dans la scène et montrer les animations.

---

## 1. Rôle et objectif

Tu es un développeur graphique senior spécialisé dans le rendu temps réel et le pixel art.
Construis un moteur de rendu web **HD-2D** dont les images doivent être, au maximum, **indiscernables du style d'Octopath Traveler I/II** (Square Enix, Unreal Engine) :

- des personnages en pixel art 2D (sprites) debout dans un décor 3D en forme de maquette (diorama) ;
- un décor 3D low-poly entièrement texturé en pixel art ;
- des lumières dynamiques, des ombres portées, un flou de profondeur très marqué (tilt-shift / bokeh), du bloom, un étalonnage chaud et un fort vignettage.

Le critère de réussite est **visuel** : à chaque étape, des captures du moteur sont comparées côte à côte avec des captures d'Octopath Traveler. Tant que l'écart est visible, on itère.

## 2. Référence open source à étudier : Lumina

- Dépôt : https://github.com/neimad-mp/Lumina. C'est un moteur et une démo HD-2D en three.js r186, dans le style d'Octopath Traveler II. Son README indique qu'il est parti d'un prototype généré en une passe par un modèle Claude Opus.
- **Attention, licence :** le dépôt **ne contient aucune licence**. Par défaut, tous les droits sont réservés : on peut **l'étudier**, mais **pas copier son code ni ses assets**. Implémente proprement, avec ton propre code, en t'inspirant uniquement des techniques. Pour réutiliser du code directement, il faudrait d'abord demander une licence à l'auteur.
- Techniques de Lumina à reprendre (en les réimplémentant) :
  - densité de pixels constante : **16 texels par unité de monde**, filtrage NEAREST partout ;
  - personnages d'environ 2 unités de haut (cadres de 32 px), sprites debout en 3D ;
  - **sprites éclairés et normal-mappés** : normale « courbée » vers la caméra et vers le haut, plus un léger arrondi horizontal ; diffuse enveloppante (wrap) ; les sprites projettent et reçoivent des ombres, sans auto-ombrage ;
  - caméra perspective à **FOV étroit (26 à 30°)**, inclinée de 30 à 35° vers le bas, placée loin, qui suit le joueur en douceur ;
  - DOF tilt-shift en demi-résolution, bloom multi-niveaux, tone mapping ACES, étalonnage réglable en direct ;
  - un `LightPool` qui partage au plus **12 vraies point lights** entre toutes les lanternes ; cycle jour/nuit à 24 images clés (soleil, lune, brouillard, ciel) ;
  - herbe et feuillage instanciés qui ondulent au vent, particules GPU, eau avec ondulations, écume et cascades ;
  - un harnais de captures headless (Chrome) pour comparer les rendus automatiquement.
- Autres références : **SimpleHD2D** (Godot 4.1, https://github.com/GSansigolo/SimpleHD2D) et **HD2D-like-Game-Engine** (C++ / OpenGL, MIT, https://github.com/ReskyQian/HD2D-like-Game-Engine). Vérifier leurs licences avant toute réutilisation.

## 3. Pile technique

- **three.js** (dernière version stable), JavaScript en modules ES, **Vite** pour le serveur de dev et le build.
- `WebGLRenderer` avec ombres activées (`PCFSoftShadowMap`), `outputColorSpace = SRGB`, tone mapping ACES appliqué une seule fois en fin de chaîne.
- Une scène « bac à sable » (`/sandbox`) par module, plus un script de capture Playwright (`npm run shots`) qui produit des PNG à résolution fixe (1920×1080) pour la validation.
- Objectif de performance : **60 fps en 1080p sur un GPU milieu de gamme**, au plus environ 300 draw calls, une shadow map directionnelle 2048², DOF et bloom en demi-résolution.

## 4. Les piliers visuels (tous obligatoires)

### 4.1 Sprites de personnages : le cœur du style
- **Pixel art de qualité « fait main »** : c'est le point qui a échoué lors des essais précédents avec des sprites 100 % procéduraux. Le moteur doit donc **charger des planches de sprites PNG** (assets CC0 ou libres de droits vérifiés, assets commandés, ou fournis par l'utilisateur), sans dépendre d'une génération procédurale. Un générateur procédural peut exister comme solution de secours, jamais comme rendu final.
- Caractéristiques Octopath :
  - personnages de **32 à 48 px de haut**, proportions d'environ 3 à 3,5 têtes ;
  - vue 3/4, palettes riches et décalées en teinte (ombres vers le bleu/violet, lumières vers le jaune) ;
  - contours sombres sélectifs, pas d'anti-aliasing, 4 à 5 tons par matériau.
- **Directions** : 4 au minimum (bas, haut, gauche, droite ; la droite peut être un miroir de la gauche), 8 en option.
- **Animations** (nombre d'images / FPS cible) :
  - repos (respiration) : 4 à 6 images à 6-8 fps ;
  - marche : 6 à 8 images à 10-12 fps ; course : 6 à 8 images à 14 fps ;
  - attaque : anticipation, impact (avec un « smear » sur 1 image) et récupération, 6 à 10 images ;
  - incantation : 6 images avec boucle ; dégât : 2 à 3 images avec flash blanc ; K.O. : 4 images ; victoire : 4 à 6 images.
  - Chaque image a sa propre durée (timing non uniforme), et les animations déclenchent des événements (par exemple « impact », « pas »).
- **Rendu d'un sprite** : un quad qui tourne uniquement autour de l'axe vertical pour faire face à la caméra, avec découpe alpha nette (alpha test, pas de transparence floue) et pieds ancrés au sol.
  - Une **normal map générée automatiquement** depuis le sprite : hauteur dérivée de la distance au bord et de la luminance, avec un biseau de 1 à 2 px.
  - Le sprite est éclairé par le soleil et les point lights, avec une **lumière de contour** venant des sources proches.
  - Il projette une ombre réelle (passe de profondeur avec alpha test) et une ombre de contact douce au sol.
  - Il prend le brouillard et le flou DOF comme le reste de la scène.
  - Effets : flash au coup, contour lumineux de sélection, couleur teintée selon l'état.

### 4.2 Environnement en diorama
- **Terrain en tuiles et blocs** : sol, falaises, escaliers, ponts et paliers de hauteur (environ 0,5 unité). Toutes les surfaces portent des **textures pixel art à 16 px par unité** : pavés, herbe avec brins, bois veiné, tuiles de toit, pierre moussue, avec des détails placés à la main.
- **Normal maps** générées depuis la hauteur des textures, pour que pavés et briques accrochent la lumière.
- **Décors (props)** :
  - maisons à colombages avec toits en tuiles et fenêtres émissives la nuit ;
  - lanternes, barils, caisses, clôtures, puits et étals à rayures ;
  - **arbres et buissons** composés de cartes pixel art croisées ou en volumes, qui ondulent au vent.
- **Herbe et fleurs instanciées** en grande quantité, qui ondulent au vent.
- **Eau** stylisée : couleur dégradée, ondulations animées, scintillements, écume au bord, cascades avec brume.
- **Ciel** en dégradé avec nuages, brouillard de distance coloré selon l'heure.

### 4.3 Caméra
- Perspective, FOV 26-30°, inclinaison 30-35°, distance d'environ 18 à 25 unités, suivi amorti, légère rotation et zoom optionnels.
- Ce cadrage donne l'impression de regarder une maquette.

### 4.4 Lumière
- **Soleil ou lune directionnel** chaud, avec ombres douces (PCF), et lumière d'ambiance hémisphérique froide.
- **Point lights** chaudes (lanternes, torches, feux de camp, fenêtres) qui scintillent, gérées par un pool (au plus 12 actives) et accompagnées de leur halo émissif.
- **Cycle jour/nuit** à images clés : aube rosée, jour, **heure dorée** (signature d'Octopath) et **nuit bleue** avec fenêtres allumées.
- **Rayons de lumière** (god rays) en cartes additives ou en volumétrie légère.

### 4.5 Post-process : la « lentille » Octopath
Dans l'ordre :
1. **Profondeur de champ tilt-shift** basée sur la profondeur réelle : seule une bande autour du joueur est nette. Le premier plan et l'arrière-plan tombent dans un **bokeh en disques** où les points brillants deviennent des pastilles lumineuses. C'est la signature n°1 du style.
2. **Bloom** à seuil doux et multi-niveaux.
3. **Tone mapping ACES**.
4. **Étalonnage** : lift/gamma/gain, ombres légèrement teal et relevées, hautes lumières chaudes, saturation +10-15 %.
5. **Vignettage fort**, **grain de film léger**, **aberration chromatique discrète** sur les bords.
Tous les paramètres sont réglables en direct depuis un panneau de debug.

### 4.6 Atmosphère
Poussières en suspension qui scintillent dans la lumière, lucioles la nuit, feuilles qui tombent, fumée de cheminée, braises de feu de camp, pluie et neige en option. Toutes les particules sont en pixel art (carrés nets), et éclairées.

## 5. Jalons (chacun validé par l'utilisateur sur captures)
1. **Noyau** : renderer, caméra diorama, une plateforme de tuiles texturées, un sprite statique éclairé avec ombre. → Captures.
2. **Pipeline sprites** : chargement des planches PNG, animations à durées par image, 4 directions, normal maps automatiques, ombres, flash au coup. → Planche d'animations et GIF.
3. **Lumière** : soleil, ombres, point lights en pool, cycle jour/nuit (heure dorée et nuit). → Captures à 4 heures de la journée.
4. **Post-process** : DOF bokeh, bloom, étalonnage, vignettage. → Comparaison avant/après.
5. **Kit d'environnement** : falaises, escaliers, maisons, arbres, herbe instanciée, eau, cascade. → Scène « village ».
6. **Polish** : particules, god rays, réglage fin des paramètres en comparant côte à côte avec Octopath. → Captures finales, plus mesure des fps.

## 6. Règles de travail
- **Ne copie aucun code ni asset** de Lumina, ni de projets sans licence compatible. Réécris tout de ton côté.
- Les **assets de personnages** viennent de sources à la licence vérifiée (CC0 ou équivalent), sont commandés, ou sont fournis par l'utilisateur. Documente la licence de chaque asset dans `assets/LICENSES.md`.
- Après chaque jalon, **envoie les captures à l'utilisateur et attends sa validation** avant de continuer.
- Pas de particules « pixel » qui polluent l'écran sans éclairage. L'interface reste hors périmètre pour l'instant.
