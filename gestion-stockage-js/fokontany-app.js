// « Administratif Fokontany », ouvert comme une application à part
// (fokontany/index.html).
//
// Les fichiers du Fokontany — pieces-identite.js, pieces-scan.js,
// commun-alalana.js, taratasy.js, adidy.js — sont les mêmes que dans Ny
// asako. Ils attendent de common.js quelques noms : l'utilisateur connecté,
// le propriétaire, les onglets, les notifications. common.js pèse cinq mille
// lignes de stock, de factures et d'appels qui n'ont rien à faire ici : ce
// fichier ne fournit que ces noms-là, et l'écran de connexion.
//
// Chargé AVANT les fichiers du Fokontany : ils lisent ces noms à leur
// démarrage (typeof currentUser, typeof MODE_MPIASA…).

// var et non let : les fichiers du Fokontany les cherchent par « typeof »,
// et un nom de la portée globale se trouve de l'un à l'autre.
var MODE_MPIASA = false;
var currentUser = null;
var chartColors = ['#4fd8e0', '#f2a33c', '#8b93ff', '#6ee7b7', '#f472b6', '#60a5fa', '#fbbf24', '#a78bfa'];
var OWNER_EMAIL = 'rasolofonirainytokiniaina@gmail.com';

function normEmail(email) { return (email || '').trim().toLowerCase(); }
function isOwnerEmail(email) { return normEmail(email) === normEmail(OWNER_EMAIL); }

// Ouverte par « /commun/ », la même page est l'Administratif Commun : le
// tableau de bord seul, en lecture (le script de l'en-tête pose la classe).
var APP_COMMUN = document.documentElement.classList.contains('app-commun');

// ---------- Les onglets (les mêmes que dans common.js) ----------
var ongletCommun = 'tableau';
// L'Administratif Commun est au propriétaire seul, comme dans Ny asako.
function communInterdit() {
  return APP_COMMUN && !(currentUser && isOwnerEmail(currentUser.email));
}

function choisirOngletCommun(nom) {
  // Rien ne se montre ni ne se demande au serveur pour un autre compte.
  if (communInterdit()) return;
  if (APP_COMMUN) nom = 'tableau';
  var PANNEAUX = {
    tableau: 'communCorps', pieces: 'communPieces',
    adidy: 'communAdidy', historique: 'communHistorique',
    taratasy: 'communTaratasy', fangatahana: 'communFangatahana'
  };
  ongletCommun = PANNEAUX[nom] ? nom : 'tableau';
  Object.keys(PANNEAUX).forEach(function (cle) {
    var el = document.getElementById(PANNEAUX[cle]);
    if (el) el.style.display = cle === ongletCommun ? '' : 'none';
  });
  document.querySelectorAll('#dash-commun [data-commun]').forEach(function (t) {
    t.classList.toggle('active', t.dataset.commun === ongletCommun);
  });
  // La porte d'abord : sans alalana, rien ne se montre ni ne se demande.
  if (typeof renderPorteCommun === 'function') {
    renderPorteCommun().then(function (ouverte) { if (ouverte) remplirOngletCommun(); });
    return;
  }
  remplirOngletCommun();
}

function remplirOngletCommun() {
  var nom = ongletCommun;
  if (nom === 'fangatahana') {
    if (typeof renderFangatahana === 'function') renderFangatahana();
    return;
  }
  if (nom === 'adidy') {
    if (typeof renderAdidy === 'function') renderAdidy();
  } else if (nom === 'historique') {
    if (typeof renderHistorique === 'function') renderHistorique();
  } else if (nom === 'taratasy') {
    if (typeof renderTaratasy === 'function') renderTaratasy();
  } else if (typeof renderPiecesIdentite === 'function') {
    renderPiecesIdentite();
  }
  if (nom === 'tableau') {
    if (typeof renderVolaVoaangona === 'function') renderVolaVoaangona();
    if (typeof renderTaratasyIsa === 'function') renderTaratasyIsa();
  }
}

// commun-alalana.js l'appelle au retour d'un lien reçu par email. Il n'y a
// ici qu'une seule vue : l'ouvrir, c'est la redessiner.
function ouvrirDepuisLeMenu(nom) {
  if (nom === 'commun') choisirOngletCommun(ongletCommun);
}

// Au DOMContentLoaded et non tout de suite : ce fichier passe avant ceux du
// Fokontany, et une session trouvée trop tôt ouvrirait les onglets avant que
// leurs fonctions (renderPorteCommun…) n'existent.
document.addEventListener('DOMContentLoaded', function () {
  function $(id) { return document.getElementById(id); }

  if (APP_COMMUN) {
    $('fkNomApp').textContent = 'Administratif Commun';
    $('fkMarque').innerHTML = '🏛️ Administratif <span>Commun</span>';
    // Regarder sans toucher, comme dans Ny asako (components.css).
    $('communCorps').classList.add('lecture-seule');
  }

  // ---------- Notifications ----------
  // Pas de cloche ici : un bandeau bref suffit. Les demandes d'accès ont
  // déjà le leur, avec « Ekena » (commun-alalana.js).
  window.__notifActions = window.__notifActions || {};
  window.__ajouterNotificationAction = function (type, message) {
    var boite = $('fkToast');
    if (!boite) return;
    boite.textContent = message;
    boite.style.display = 'block';
    clearTimeout(boite.__minuterie);
    boite.__minuterie = setTimeout(function () { boite.style.display = 'none'; }, 6000);
  };
  window.__marquerNotificationFaite = function () {};

  // ---------- Connexion ----------
  // Le même compte que Ny asako : même base, mêmes identifiants. Créer un
  // compte ou retrouver un mot de passe se fait là-bas, où tout est prévu.
  function profilDe(user) {
    var meta = (user && user.user_metadata) || {};
    var email = (user && user.email) || '';
    return {
      name: meta.name || email.split('@')[0],
      email: email,
      phone: meta.phone || '',
      logo: meta.logo || null,
      company: meta.company || '',
      nif: meta.nif || '',
      stat: meta.stat || ''
    };
  }

  function ouvrir(user) {
    currentUser = profilDe(user);
    $('fkNom').textContent = currentUser.name;
    $('fkEmail').textContent = currentUser.email;
    $('loginScreen').style.display = 'none';
    $('appScreen').style.display = 'block';
    var interdit = communInterdit();
    $('fkReserve').style.display = interdit ? '' : 'none';
    $('dash-commun').style.display = interdit ? 'none' : '';
    if (isOwnerEmail(currentUser.email)) rendreInstallable();
    choisirOngletCommun(ongletCommun);
  }

  // ---------- Installation : le propriétaire seul ----------
  // La page n'a pas de manifeste : pour tout autre compte, le navigateur n'a
  // rien à installer. Le propriétaire, lui, le reçoit ici, avec les balises
  // d'iOS qui ne lit pas le manifeste. Il ne se retire pas à la déconnexion :
  // le navigateur l'a déjà lu, et seul un rechargement l'oublierait — d'où
  // le rechargement dans fermer().
  var invitation = null;
  var installable = false;
  function dejaInstallee() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function surIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function montrerInstallation() {
    var proprio = !!(currentUser && isOwnerEmail(currentUser.email)) && !dejaInstallee();
    $('fkInstaller').style.display = (proprio && invitation) ? '' : 'none';
    $('fkInstallIos').style.display = (proprio && !invitation && surIOS()) ? '' : 'none';
  }
  function rendreInstallable() {
    if (!installable) {
      installable = true;
      var tete = document.head;
      function balise(tag, attributs) {
        var el = document.createElement(tag);
        Object.keys(attributs).forEach(function (k) { el.setAttribute(k, attributs[k]); });
        tete.appendChild(el);
      }
      balise('link', { rel: 'manifest', href: APP_COMMUN ? '/commun/manifest.webmanifest' : '/fokontany/manifest.webmanifest' });
      balise('meta', { name: 'mobile-web-app-capable', content: 'yes' });
      balise('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
      balise('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
      balise('meta', { name: 'apple-mobile-web-app-title', content: APP_COMMUN ? 'Commun' : 'Fokontany' });
    }
    montrerInstallation();
  }
  // Chrome et Edge le préviennent une fois le manifeste lu ; on garde
  // l'invitation pour le bouton, qui seul peut la déclencher.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    if (!(currentUser && isOwnerEmail(currentUser.email))) return;
    invitation = e;
    montrerInstallation();
  });
  window.addEventListener('appinstalled', function () {
    invitation = null;
    montrerInstallation();
  });
  $('fkInstaller').addEventListener('click', function () {
    if (!invitation) return;
    invitation.prompt();
    invitation.userChoice.then(function () { invitation = null; montrerInstallation(); }, function () {});
  });

  function fermer() {
    // Le manifeste du propriétaire a été lu : seul un rechargement le fait
    // oublier au navigateur, pour que le compte suivant ne puisse installer.
    if (installable) { window.location.reload(); return; }
    currentUser = null;
    $('appScreen').style.display = 'none';
    $('loginScreen').style.display = '';
  }

  function dire(texte, erreur) {
    var el = $('fkLoginStatus');
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--muted)';
  }

  var auth = window.__sb && window.__sb.auth;

  $('fkLoginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!auth) { dire('Tsy tafiditra ny Supabase : jereo ny connexion internet.', true); return; }
    var email = normEmail($('fkLoginEmail').value);
    var mdp = $('fkLoginPassword').value;
    var bouton = $('fkLoginBtn');
    bouton.disabled = true;
    dire('Miditra…');
    auth.signInWithPassword({ email: email, password: mdp }).then(function (res) {
      bouton.disabled = false;
      if (res.error || !res.data || !res.data.user) {
        dire('Diso ny email na ny mot de passe.', true);
        return;
      }
      dire('');
      $('fkLoginPassword').value = '';
      ouvrir(res.data.user);
    }, function () {
      bouton.disabled = false;
      dire('Tsy tafaverina ny serveur. Andramo indray.', true);
    });
  });

  $('fkSortir').addEventListener('click', function () {
    // Attendre la fin : fermer() peut recharger la page, et un rechargement
    // pendant la déconnexion garderait la session.
    if (!auth) { fermer(); return; }
    auth.signOut().then(fermer, fermer);
  });

  document.querySelectorAll('#dash-commun [data-commun]').forEach(function (tab) {
    tab.addEventListener('click', function () { choisirOngletCommun(tab.dataset.commun); });
  });

  // Une session déjà ouverte — ici ou dans Ny asako, même site, même
  // navigateur — rouvre l'application sans redemander le mot de passe.
  if (auth) {
    auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (session && session.user) ouvrir(session.user);
    }, function () {});
    // Une déconnexion faite dans Ny asako, dans un autre onglet, vaut ici aussi.
    auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' && currentUser) fermer();
    });
  }

  // Installable et ouvrable sans réseau : le service worker du site entier.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
});
