// Mode jour, mode nuit.
//
// Un bouton du menu, qui propose toujours l'autre mode : « ☀️ Mode andro » la
// nuit, « 🌙 Mode alina » le jour. Pressé, il bascule et s'en souvient. Comme
// toute entrée du menu, il se pose aussi dans la rangée du bas, où l'on
// bascule d'un geste.
//
// Le choix est appliqué dès l'en-tête de la page (index.html) : sans cela,
// elle s'ouvrait sombre avant de s'éclairer. Ce fichier ne fait que tenir le
// bouton à jour et répondre quand on le presse.

(function () {
  const CLE = 'stockmanager_theme';
  const bouton = document.getElementById('menuTheme');
  if (!bouton) return;

  function lire() {
    try { return localStorage.getItem(CLE) === 'jour' ? 'jour' : 'alina'; } catch (e) { return 'alina'; }
  }

  function appliquer(theme) {
    const racine = document.documentElement;
    if (theme === 'jour') racine.setAttribute('data-theme', 'jour');
    else racine.removeAttribute('data-theme');

    // La barre du navigateur, sur le téléphone, prend la couleur du fond.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'jour' ? '#eef2f5' : '#0a0d10');

    const emoji = theme === 'jour' ? '🌙' : '☀️';
    const nom = theme === 'jour' ? 'Mode alina' : 'Mode andro';
    bouton.textContent = emoji + ' ' + nom;
    bouton.setAttribute('aria-label', nom);

    // Son icône dans la rangée a été posée avec l'ancien libellé : elle ne le
    // relit pas d'elle-même. Seul son premier nœud est du texte — la croix qui
    // suit est un élément, et doit rester.
    const icone = document.querySelector('#stockMainTabs [data-epingle="id:menuTheme"]');
    if (icone) {
      if (icone.firstChild && icone.firstChild.nodeType === 3) icone.firstChild.nodeValue = emoji;
      icone.title = nom;
      icone.setAttribute('aria-label', nom);
    }
  }

  bouton.addEventListener('click', function () {
    const suivant = lire() === 'jour' ? 'alina' : 'jour';
    try { localStorage.setItem(CLE, suivant); } catch (e) {}
    appliquer(suivant);
  });

  appliquer(lire());
})();
