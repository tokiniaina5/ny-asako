# Ny asako

Application installable de gestion de stock : produits et mouvements, factures,
portefeuille, pointage de l'équipe, suivi des livreurs et fil d'actualité pour
les clients. Une seule page, servie telle quelle : aucune étape de compilation,
aucune dépendance à installer.

Elle vivait jusqu'ici dans le dépôt du portfolio, à côté de pages qui n'ont rien
à voir avec elle. Elle a maintenant son dépôt.

## Ce qu'il y a dedans

| Chemin                  | Ce que c'est                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| `index.html`            | La page — tout le balisage de l'application                       |
| `gestion-stockage-css/` | `base.css` (socle, thème) et `components.css` (écrans, éléments)  |
| `gestion-stockage-js/`  | Un fichier par domaine : stock, factures, équipe, live, sécurité…  |
| `supabase/sql/`         | Le schéma des tables et les règles qui les gardent                |
| `supabase/functions/`   | Les fonctions Edge (portefeuille, alertes, traduction, suivi…)    |
| `outils/`               | `versionner.mjs` (empreintes) et `icones.mjs` (icônes PNG)        |
| `demarrage/`            | Les écrans de lancement iOS, une image par taille d'appareil      |
| `sw.js`                 | Le service worker : installation et ouverture sans réseau         |
| `LISEZ-MOI-SUPABASE.txt`| Le mode d'emploi : comment brancher la base et les fonctions      |

Le serveur est Supabase ; le navigateur lui parle directement. Il n'y a pas de
back-end à faire tourner en local.

## Travailler dessus

N'importe quel serveur de fichiers statiques suffit :

```bash
npx serve .
```

Puis ouvrir la racine : l'application est la page d'accueil du site.

## Avant chaque mise en ligne

Les fichiers gardent leur nom d'un envoi à l'autre : un téléphone qui a déjà
ouvert le site ressert sa copie, et la modification n'apparaît jamais. Il faut
donc estamper les adresses de leur empreinte, et renommer le cache du service
worker — c'est ce que fait cette commande :

```bash
node outils/versionner.mjs
```

Le dépôt n'est pas relié à Netlify : la mise en ligne est manuelle, et l'oubli
de cette étape ne se voit qu'au téléphone, où rien n'a changé.

## Ce qui ne doit pas être publié

`supabase/`, `outils/`, le mode d'emploi et ce fichier restent dans le dépôt
mais ne répondent pas en ligne : `_redirects` les referme. Les secrets ne sont
nulle part ici — ils vivent dans les secrets Supabase.
