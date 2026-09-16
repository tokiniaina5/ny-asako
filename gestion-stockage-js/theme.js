// Mode jour, mode nuit.
//
// Deux façons de choisir, comme pour la rangée du bas :
//   - manuel : on dit soi-même « jour » ou « nuit », et le choix tient ;
//   - automatique : l'heure décide — le jour de 6 h à 18 h, la nuit le reste
//     du temps. La page bascule d'elle-même quand l'heure passe, sans qu'on
//     ait à la recharger.
//
// Le bouton du menu ouvre ce choix. Comme toute entrée du menu, il se pose
// aussi dans la rangée du bas ; son icône montre le mode en cours.
//
// Le mode est appliqué dès l'en-tête de la page (index.html), selon la même
// règle : sans cela, elle s'ouvrait sombre avant de s'éclairer.

(function () {
  const CLE_CHOIX = 'stockmanager_theme';
  const CLE_MODE = 'stockmanager_theme_mode';
  const DEBUT_JOUR = 6;
  const FIN_JOUR = 18;

  const bouton = document.getElementById('menuTheme');
  const panneau = document.getElementById('themePanneau');
  if (!bouton || !panneau) return;

  function lireMode() {
    try { return localStorage.getItem(CLE_MODE) === 'auto' ? 'auto' : 'manuel'; } catch (e) { return 'manuel'; }
  }
  function lireChoix() {
    try { return localStorage.getItem(CLE_CHOIX) === 'jour' ? 'jour' : 'alina'; } catch (e) { return 'alina'; }
  }
  function ecrire(cle, valeur) {
    try { localStorage.setItem(cle, valeur); } catch (e) {}
  }

  function selonLHeure() {
    const h = new Date().getHours();
    return (h >= DEBUT_JOUR && h < FIN_JOUR) ? 'jour' : 'alina';
  }
  function themeEnCours() {
    return lireMode() === 'auto' ? selonLHeure() : lireChoix();
  }

  function appliquer() {
    const mode = lireMode();
    const theme = themeEnCours();
    const racine = document.documentElement;
    if (theme === 'jour') racine.setAttribute('data-theme', 'jour');
    else racine.removeAttribute('data-theme');

    // La barre du navigateur, sur le téléphone, prend la couleur du fond.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'jour' ? '#eef2f5' : '#0a0d10');

    const emoji = theme === 'jour' ? '☀️' : '🌙';
    const nom = 'Andro / Alina';
    bouton.textContent = emoji + ' ' + nom;
    bouton.setAttribute('aria-label', 'Mode andro / alina');

    // Son icône dans la rangée a été posée avec l'ancien libellé : elle ne le
    // relit pas d'elle-même. Seul son premier nœud est du texte — la croix qui
    // suit est un élément, et doit rester.
    const icone = document.querySelector('#stockMainTabs [data-epingle="id:menuTheme"]');
    if (icone) {
      if (icone.firstChild && icone.firstChild.nodeType === 3) icone.firstChild.nodeValue = emoji;
      const titre = 'Mode ' + (theme === 'jour' ? 'andro' : 'alina') + (mode === 'auto' ? ' (automatique)' : '');
      icone.title = titre;
      icone.setAttribute('aria-label', titre);
    }

    panneau.querySelectorAll('[data-theme-mode]').forEach(function (b) {
      b.classList.toggle('actif', b.dataset.themeMode === mode);
    });
    panneau.querySelectorAll('[data-theme-choix]').forEach(function (b) {
      b.classList.toggle('actif', mode === 'manuel' && b.dataset.themeChoix === theme);
    });
    // Le jour ou la nuit ne se choisit qu'en manuel : en automatique, ces deux
    // boutons proposeraient un geste que l'heure défait.
    const manuel = document.getElementById('themeManuel');
    if (manuel) manuel.style.display = mode === 'manuel' ? '' : 'none';

    const note = document.getElementById('themeNote');
    if (note) {
      note.textContent = mode === 'auto'
        ? 'Andro manomboka amin\'ny ' + DEBUT_JOUR + ' ora maraina ka hatramin\'ny ' + (FIN_JOUR - 12) + ' ora hariva, alina amin\'ny ora hafa. Miova ho azy.'
        : 'Ianao no misafidy : andro na alina.';
    }
  }

  // ---------- Le panneau ----------

  // Au-dessus de la rangée du bas, au milieu : là où s'ouvrent déjà ses
  // réglages, pour que les deux choix se trouvent au même endroit.
  function placer() {
    const r = document.querySelector('.dash-tabs-main');
    const haute = (r && !r.classList.contains('barre-cachee') && getComputedStyle(r).display !== 'none')
      ? r.getBoundingClientRect().height : 0;
    panneau.style.bottom = (haute + 10) + 'px';
    panneau.style.top = 'auto';
    const large = panneau.getBoundingClientRect().width;
    let gauche = (window.innerWidth - large) / 2;
    gauche = Math.max(8, Math.min(gauche, window.innerWidth - large - 8));
    panneau.style.left = gauche + 'px';
  }

  function ouvrir(oui) {
    panneau.style.display = oui ? 'block' : 'none';
    bouton.setAttribute('aria-expanded', oui ? 'true' : 'false');
    if (!oui) return;
    // Le menu s'efface : ouvert, il recouvrirait le panneau qu'il vient
    // d'appeler.
    const menu = document.getElementById('navList');
    if (menu) menu.classList.remove('open');
    ['menuToggle', 'menuFlottant'].forEach(function (id) {
      const p = document.getElementById(id);
      if (p) p.setAttribute('aria-expanded', 'false');
    });
    placer();
  }

  // Hors de la page : le panneau flotte au-dessus de tout, comme les autres.
  document.body.appendChild(panneau);

  bouton.addEventListener('click', function (e) {
    // Sans cela, le guetteur de « clic à côté » refermerait le panneau dans
    // le geste même qui l'ouvre.
    e.stopPropagation();
    ouvrir(panneau.style.display !== 'block');
  });

  panneau.querySelectorAll('[data-theme-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      // Passer en manuel garde ce qu'on voit : l'écran ne doit pas changer de
      // couleur au moment où l'on prend la main.
      if (b.dataset.themeMode === 'manuel' && lireMode() === 'auto') ecrire(CLE_CHOIX, selonLHeure());
      ecrire(CLE_MODE, b.dataset.themeMode === 'auto' ? 'auto' : 'manuel');
      appliquer();
    });
  });

  panneau.querySelectorAll('[data-theme-choix]').forEach(function (b) {
    b.addEventListener('click', function () {
      ecrire(CLE_CHOIX, b.dataset.themeChoix === 'jour' ? 'jour' : 'alina');
      ecrire(CLE_MODE, 'manuel');
      appliquer();
    });
  });

  document.addEventListener('click', function (e) {
    if (panneau.style.display !== 'block') return;
    if (panneau.contains(e.target) || bouton.contains(e.target)) return;
    // L'icône de la rangée ouvre aussi le panneau : un clic sur elle n'est pas
    // un clic à côté.
    const icone = document.querySelector('#stockMainTabs [data-epingle="id:menuTheme"]');
    if (icone && icone.contains(e.target)) return;
    ouvrir(false);
  });

  window.addEventListener('resize', function () { if (panneau.style.display === 'block') placer(); });

  // En automatique, l'heure qui passe doit se voir sans recharger.
  setInterval(function () { if (lireMode() === 'auto') appliquer(); }, 60 * 1000);

  appliquer();
})();
