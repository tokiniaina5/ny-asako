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
    renderPorteCommun().then(function (ouverte) {
      if (!ouverte) return;
      // Validé par l'admin (✅ Hamafiso) : le fokontany peut installer
      // l'application sur son ordinateur. Le Commun reste à l'admin.
      if (!APP_COMMUN && typeof window.__fkRendreInstallable === 'function') window.__fkRendreInstallable();
      remplirOngletCommun();
    });
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
    // Les papiers remis ont leur place dans l'historique aussi (taratasy.js).
    if (typeof renderTaratasyHistorique === 'function') renderTaratasyHistorique();
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
    // Son icône à lui, le « C » : celle du Fokontany est posée dans la page.
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(function (l) {
      l.setAttribute('href', '/commun/icone-192.png');
    });
    // Regarder sans toucher, comme dans Ny asako (components.css).
    $('communCorps').classList.add('lecture-seule');
  }

  // ---------- Sans réseau ----------
  // Comme dans Ny asako : la page s'ouvre, mais les listes restent vides sans
  // qu'on sache pourquoi. La bande le dit.
  (function () {
    var bande = $('bandeauReseau');
    if (!bande) return;
    function majReseau() { bande.hidden = navigator.onLine !== false; }
    window.addEventListener('online', majReseau);
    window.addEventListener('offline', majReseau);
    majReseau();
  })();

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
  // compte ou retrouver un mot de passe se fait aussi ici (plus bas).
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

  // ---------- Installation : l'admin, et le fokontany qu'il a validé ----------
  // La page n'a pas de manifeste : pour qui n'est pas entré, le navigateur n'a
  // rien à installer. L'admin — et, dans le Fokontany, celui dont il a validé
  // l'accès (✅ Hamafiso) — le reçoit ici, avec les balises
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
    var proprio = installable && !!currentUser && !dejaInstallee();
    $('fkInstaller').style.display = (proprio && invitation) ? '' : 'none';
    $('fkInstallIos').style.display = (proprio && !invitation && surIOS()) ? '' : 'none';
  }
  // Le propriétaire, et le fokontany dont l'admin a validé l'accès.
  window.__fkRendreInstallable = function () { rendreInstallable(); };
  function rendreInstallable() {
    if (!installable) {
      installable = true;
      // Le fokontany validé l'apprend : le bouton seul, en haut, passerait inaperçu.
      if (currentUser && !isOwnerEmail(currentUser.email) && !dejaInstallee()) {
        window.__ajouterNotificationAction('fangatahana',
          'Nohamafisin\'ny admin ny fidiranao : afaka mametraka ny app Fokontany amin\'ity ordinateur ity ianao (📲 Installer, eo ambony).');
      }
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
    if (!installable || !currentUser) return;
    invitation = e;
    montrerInstallation();
  });
  // L'application installée s'ouvre sur l'écran de connexion, pour le compte
  // du fokontany : elle a sa propre session (supabase-init.js), l'admin reste
  // connecté dans le navigateur.
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

  // ---------- Kaonty vaovao, mot de passe adino ----------
  // Comme dans Ny asako (common.js), mais on entre ensuite ici, dans le
  // Fokontany : la personne venue pour lui n'a pas à passer par le stock.
  function erreurAuth(e) {
    var brut = String((e && (e.message || e.error_description)) || '').toLowerCase();
    if (brut.indexOf('invalid login credentials') >= 0) return 'Diso ny email na ny mot de passe.';
    if (brut.indexOf('already') >= 0) return 'Efa manana kaonty io email io : midira, na ampiasao ny « Adino ny mot de passe ».';
    if (brut.indexOf('email not confirmed') >= 0) return 'Mbola tsy voamarina ny email : sokafy ny mailaka nalefa taminao.';
    if (brut.indexOf('signup') >= 0 && brut.indexOf('disabled') >= 0) return 'Tsy azo atao ny mamorona kaonty amin\'izao fotoana izao.';
    if (brut.indexOf('rate limit') >= 0 || brut.indexOf('too many') >= 0) return 'Be loatra ny fangatahana : andraso kely dia avereno.';
    if (brut.indexOf('password') >= 0 && brut.indexOf('6') >= 0) return 'Tokony ho 6 litera farafahakeliny ny mot de passe.';
    return 'Tsy nety : ' + ((e && e.message) || 'antony tsy fantatra');
  }
  function tsindry(id, idMiafina) {
    var box = $(id);
    var misokatra = box.style.display === 'none';
    box.style.display = misokatra ? '' : 'none';
    $(idMiafina).style.display = 'none';
  }
  $('fkVaovaoBtn').addEventListener('click', function () { tsindry('fkVaovaoForm', 'fkAdinoBox'); });
  $('fkAdinoBtn').addEventListener('click', function () {
    tsindry('fkAdinoBox', 'fkVaovaoForm');
    if (!$('fkAdinoEmail').value) $('fkAdinoEmail').value = $('fkLoginEmail').value;
  });

  $('fkVaovaoForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var st = $('fkVaovaoStatus');
    if (!auth) { st.textContent = 'Tsy tafiditra ny Supabase : jereo ny connexion internet.'; return; }
    var anarana = $('fkVaovaoAnarana').value.trim();
    var email = normEmail($('fkVaovaoEmail').value);
    var finday = $('fkVaovaoFinday').value.trim();
    var mdp = $('fkVaovaoMdp').value;
    if (!anarana || !email) { st.textContent = 'Soraty ny anarana sy ny email.'; return; }
    if (mdp.length < 6) { st.textContent = 'Tokony ho 6 litera farafahakeliny ny mot de passe.'; return; }
    $('fkVaovaoValider').disabled = true;
    st.textContent = 'Mamorona ny kaonty…';
    auth.signUp({ email: email, password: mdp, options: { data: { name: anarana, phone: finday } } }).then(function (res) {
      $('fkVaovaoValider').disabled = false;
      if (res && res.error) {
        // L'email a peut-être déjà un compte : on tente d'entrer avec, comme Ny asako.
        auth.signInWithPassword({ email: email, password: mdp }).then(function (r2) {
          if (r2 && r2.error) { st.textContent = erreurAuth(res.error); return; }
          ouvrir(r2.data.user);
        }, function () { st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.'; });
        return;
      }
      // La même trace qu'une inscription dans Ny asako : le propriétaire la voit.
      try {
        window.__sb.from('client_signups').insert({ name: anarana, email: email, phone: finday }).then(function () {}, function () {});
      } catch (err) {}
      if (res.data && res.data.session) { ouvrir(res.data.user); return; }
      st.textContent = 'Vita ny kaonty, fa mila hamafisina amin\'ny mailaka : sokafy ny mailaka nalefa tamin\'ny ' +
        email + ', tsindrio ny rohy, dia midira eto.';
      $('fkLoginEmail').value = email;
    }, function () {
      $('fkVaovaoValider').disabled = false;
      st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.';
    });
  });

  // Le code reçu vaut une connexion le temps de changer le mot de passe :
  // verifyOtp ouvre la session, updateUser pose le nouveau mot de passe.
  $('fkAdinoAlefa').addEventListener('click', function () {
    var st = $('fkAdinoStatus');
    var email = normEmail($('fkAdinoEmail').value);
    if (!email) { st.textContent = 'Soraty aloha ny email.'; return; }
    if (!auth) { st.textContent = 'Tsy tafiditra ny Supabase : jereo ny connexion internet.'; return; }
    st.textContent = 'Mandefa ny code…';
    auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname }).then(function (res) {
      if (res && res.error) { st.textContent = erreurAuth(res.error); return; }
      st.textContent = 'Nalefa tamin\'ny ' + email + ' ny code. Adikao eto ambany ilay ao amin\'ny mailaka farany ' +
        '(adiny iray no faharetany). Jereo koa ny « Spam ».';
      $('fkAdinoCodeBox').style.display = '';
      $('fkAdinoCode').focus();
    }, function () { st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.'; });
  });
  $('fkAdinoTehirizo').addEventListener('click', function () {
    var st = $('fkAdinoCodeStatus');
    var email = normEmail($('fkAdinoEmail').value);
    var code = $('fkAdinoCode').value.replace(/\s+/g, '');
    var mdp = $('fkAdinoMdp').value;
    if (!/^\d{6,10}$/.test(code)) { st.textContent = 'Adikao ilay code (isa) voaray tamin\'ny mailaka.'; return; }
    if (mdp.length < 6) { st.textContent = 'Tokony ho 6 litera farafahakeliny ny mot de passe vaovao.'; return; }
    st.textContent = 'Manamarina ny code…';
    auth.verifyOtp({ email: email, token: code, type: 'recovery' }).then(function (res) {
      if (res && res.error) {
        st.textContent = /expired|invalid/i.test(res.error.message || '') || res.error.code === 'otp_expired'
          ? 'Diso, lany daty na efa nampiasaina ilay code. Jereo ny mailaka farany, na mangataha vaovao.'
          : erreurAuth(res.error);
        return;
      }
      st.textContent = 'Mitahiry…';
      auth.updateUser({ password: mdp }).then(function (up) {
        if (up && up.error) { st.textContent = erreurAuth(up.error); return; }
        var user = (up && up.data && up.data.user) || (res.data && res.data.user);
        if (user) ouvrir(user);
      }, function () { st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.'; });
    }, function () { st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.'; });
  });

  // Revenu par le lien de l'email plutôt que par le code : la session est
  // ouverte pour changer le mot de passe, on le demande avant d'entrer.
  var retourRecuperation = !!window.__passwordRecovery || /type=recovery/.test(String(window.__authLinkHash || ''));
  if (retourRecuperation) {
    $('fkRecoveryBox').style.display = '';
    $('fkVaovaoBtn').style.display = 'none';
    $('fkAdinoBtn').style.display = 'none';
  }
  $('fkRecoveryTehirizo').addEventListener('click', function () {
    var st = $('fkRecoveryStatus');
    var mdp = $('fkRecoveryMdp').value;
    if (mdp.length < 6) { st.textContent = 'Tokony ho 6 litera farafahakeliny ny mot de passe vaovao.'; return; }
    st.textContent = 'Mitahiry…';
    auth.updateUser({ password: mdp }).then(function (up) {
      if (up && up.error) { st.textContent = erreurAuth(up.error); return; }
      retourRecuperation = false;
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
      if (up.data && up.data.user) ouvrir(up.data.user);
    }, function () { st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.'; });
  });

  $('fkSortir').addEventListener('click', function () {
    // Attendre la fin : fermer() peut recharger la page, et un rechargement
    // pendant la déconnexion garderait la session.
    if (!auth) { fermer(); return; }
    // Cette session seulement (scope local) : sortir de l'application
    // installée ne doit pas déconnecter l'admin de Ny asako, ni ailleurs.
    auth.signOut({ scope: 'local' }).then(fermer, fermer);
  });

  document.querySelectorAll('#dash-commun [data-commun]').forEach(function (tab) {
    tab.addEventListener('click', function () { choisirOngletCommun(tab.dataset.commun); });
  });

  // Une session déjà ouverte — ici ou dans Ny asako, même site, même
  // navigateur — rouvre l'application sans redemander le mot de passe.
  if (auth) {
    auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      // Retour de récupération : le nouveau mot de passe d'abord.
      if (session && session.user && !retourRecuperation) ouvrir(session.user);
    }, function () {});
    // Une déconnexion faite dans Ny asako, dans un autre onglet, vaut ici aussi.
    auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' && currentUser) fermer();
      // L'événement peut arriver après le chargement : la même boîte.
      if (event === 'PASSWORD_RECOVERY' && !currentUser) {
        retourRecuperation = true;
        $('fkRecoveryBox').style.display = '';
        $('fkVaovaoBtn').style.display = 'none';
        $('fkAdinoBtn').style.display = 'none';
      }
    });
  }

  // Installable et ouvrable sans réseau : le service worker du site entier.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
});
