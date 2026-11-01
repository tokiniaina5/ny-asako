// Disque : une copie des registres du Fokontany et de l'hôtel sur l'ordinateur.
//
// On choisit un dossier une fois (⚙️ Fikirana du Fokontany, ⚙️ Paramètres de
// Ny asako). Ensuite, chaque enregistrement, correction ou suppression dans
// Supabase (livre de famille, ses membres, taratasy, adidy, fandoavana ; menu
// et commandes de l'hôtel) réécrit le registre entier dans ce dossier :
// <table>.json pour garder, <table>.csv pour Excel. Le fichier suit donc
// toujours la base, sans rien à recoller.
//
// Le bloc #fkDisque dit ce qu'il garde par data-disque (« fokontany »,
// « hotel », ou les deux). Les commandes arrivent aussi des clients, sans
// écriture d'ici : leur relecture (toutes les 30 s, hotelerie.js) réécrit le
// fichier quand quelque chose a changé. Le menu d'un compte non connecté ne
// vit que dans le navigateur : c'est lui qui s'écrit alors.
//
// Le dossier passe par l'API File System Access (Chrome, Edge). Son accès est
// gardé dans IndexedDB ; après un rechargement, le navigateur redemande la
// permission au premier clic. Ailleurs (Firefox, Safari, téléphone), le même
// registre se télécharge à chaque enregistrement, si on l'a demandé.

(function () {
  if (!document.getElementById('fkDisque')) return;

  function $(id) { return document.getElementById(id); }

  // Chaque registre, et la colonne qui le lie au compte : l'email pour le
  // Fokontany, l'identifiant pour l'hôtel.
  var GROUPES = {
    fokontany: ['fianakaviana', 'fianakaviana_mpikambana', 'taratasy', 'adidy', 'adidy_fandoavana'],
    hotel: ['hotelerie_menu', 'hotelerie_commande']
  };
  var COLONNE = { hotelerie_menu: 'user_id', hotelerie_commande: 'hotel_id' };
  var ANARANA = {
    fianakaviana: 'Boky fianakaviana',
    fianakaviana_mpikambana: 'Mpikambana',
    taratasy: 'Taratasy',
    adidy: 'Adidy',
    adidy_fandoavana: 'Fandoavana adidy',
    hotelerie_menu: 'Menu sakafo',
    hotelerie_commande: 'Commandes'
  };
  var groupes = ($('fkDisque').getAttribute('data-disque') || 'fokontany').split(/\s+/);
  var TABLES = [];
  groupes.forEach(function (g) { TABLES = TABLES.concat(GROUPES[g] || []); });
  // Le dossier gardé, et son nom pour le sélecteur : celui du Fokontany garde
  // le sien d'avant.
  var CLE_DOSSIER = groupes.join('-');
  var dernier = {};         // le dernier JSON écrit par registre : rien ne change, rien ne s'écrit
  var CLE_TELECHARGER = 'stockmanager_disque_telecharger';
  var aFichiers = typeof window.showDirectoryPicker === 'function';
  var dossier = null;       // FileSystemDirectoryHandle
  var permisDemande = false;
  var attente = {};

  function monEmail() {
    var u = (typeof currentUser !== 'undefined') ? currentUser : null;
    return (u && u.email) ? String(u.email).trim().toLowerCase() : '';
  }
  // L'email et l'identifiant du compte connecté, d'après la session.
  function moi() {
    var sb = window.__sb;
    if (!sb) return Promise.resolve({ email: monEmail(), id: '' });
    return sb.auth.getSession().then(function (r) {
      var u = r && r.data && r.data.session && r.data.session.user;
      return { email: monEmail() || (u && u.email ? String(u.email).trim().toLowerCase() : ''), id: u ? u.id : '' };
    }, function () { return { email: monEmail(), id: '' }; });
  }
  function dire(texte, erreur, montrer) {
    var st = $('fkDisqueStatus');
    if (st) {
      st.textContent = texte || '';
      st.style.color = erreur ? 'var(--red)' : 'var(--muted)';
    }
    if (montrer && texte) bulle(texte, erreur);
  }
  // Le panneau ⚙️ est fermé quand on enregistre : la nouvelle s'affiche en bas
  // de l'écran, quelques secondes.
  var bulleTimer = null;
  function bulle(texte, erreur) {
    var b = $('fkDisqueBulle');
    if (!b) {
      b = document.createElement('div');
      b.id = 'fkDisqueBulle';
      b.setAttribute('role', 'status');
      b.style.cssText = 'position:fixed; left:50%; bottom:20px; transform:translateX(-50%); z-index:9999; ' +
        'max-width:calc(100vw - 32px); padding:0.6rem 0.9rem; border-radius:10px; font-size:0.8rem; ' +
        'background:var(--panel); color:var(--text); border:1px solid var(--line); box-shadow:0 8px 24px rgba(0,0,0,0.35);';
      document.body.appendChild(b);
    }
    b.textContent = '💽 ' + texte;
    b.style.borderColor = erreur ? 'var(--red)' : 'var(--line)';
    b.style.display = '';
    clearTimeout(bulleTimer);
    bulleTimer = setTimeout(function () { b.style.display = 'none'; }, 4000);
  }

  // ---------- Le dossier, gardé d'une visite à l'autre ----------
  function base() {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open('nyasako-disque', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('dossier'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
  }
  function garder(valeur) {
    return base().then(function (db) {
      return new Promise(function (ok) {
        var tx = db.transaction('dossier', 'readwrite');
        if (valeur) tx.objectStore('dossier').put(valeur, CLE_DOSSIER);
        else tx.objectStore('dossier').delete(CLE_DOSSIER);
        tx.oncomplete = function () { ok(); };
        tx.onerror = function () { ok(); };
      });
    }).catch(function () {});
  }
  function relire() {
    return base().then(function (db) {
      return new Promise(function (ok) {
        var r = db.transaction('dossier').objectStore('dossier').get(CLE_DOSSIER);
        r.onsuccess = function () { ok(r.result || null); };
        r.onerror = function () { ok(null); };
      });
    }).catch(function () { return null; });
  }
  function permis(demander) {
    if (!dossier) return Promise.resolve(false);
    var mode = { mode: 'readwrite' };
    return dossier.queryPermission(mode).then(function (p) {
      if (p === 'granted') return true;
      if (!demander) return false;
      return dossier.requestPermission(mode).then(function (q) { return q === 'granted'; });
    }).catch(function () { return false; });
  }

  // ---------- Ce qui s'écrit ----------
  function enCsv(lignes) {
    if (!lignes.length) return '';
    var cols = [];
    lignes.forEach(function (l) {
      Object.keys(l).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); });
    });
    function cell(v) {
      if (v == null) return '';
      var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    // Point-virgule et BOM : Excel en français l'ouvre en colonnes, accents compris.
    return '﻿' + [cols.join(';')].concat(lignes.map(function (l) {
      return cols.map(function (c) { return cell(l[c]); }).join(';');
    })).join('\r\n');
  }
  // Le menu tel que ce navigateur le garde (hotelerie.js) : seul registre
  // d'un compte non connecté.
  function menuLocal() {
    function lu(cle, defaut) {
      try { return JSON.parse(localStorage.getItem(cle)) || defaut; } catch (e) { return defaut; }
    }
    var cle = 'stockmanager_hotelerie_sakafo';
    var plats = lu(cle, []);
    if (!plats.length) return [];
    return [{ plats: plats, voafafa: lu(cle + '_fafana', []), tete: lu(cle + '_tete', {}) }];
  }
  function lireTable(table) {
    var sb = window.__sb;
    return moi().then(function (c) {
      var col = COLONNE[table] || 'owner_email';
      var val = COLONNE[table] ? c.id : c.email;
      if (!sb || !val) {
        if (table === 'hotelerie_menu') return menuLocal();
        throw new Error('tsy tafiditra');
      }
      // Le from d'origine : relire n'est pas une écriture à suivre.
      var q = (sb.__fromDisque || sb.from).call(sb, table).select('*').eq(col, val);
      if (table === 'hotelerie_commande') q = q.order('created_at', { ascending: false });
      return q.then(function (r) {
        if (r.error) throw r.error;
        var l = r.data || [];
        return (!l.length && table === 'hotelerie_menu') ? menuLocal() : l;
      });
    });
  }
  function ecrireFichier(nom, contenu) {
    return dossier.getFileHandle(nom, { create: true }).then(function (fh) {
      return fh.createWritable();
    }).then(function (w) {
      return w.write(contenu).then(function () { return w.close(); });
    });
  }
  function telecharger(nom, contenu, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contenu], { type: type }));
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function telechargerActif() {
    try { return localStorage.getItem(CLE_TELECHARGER) === '1'; } catch (e) { return false; }
  }

  // vide === false laisse de côté un registre vide (« Tehirizo daholo » : un
  // hôtel n'a pas à recevoir les fichiers vides du Fokontany, ni l'inverse).
  // siChange : rien ne s'écrit si le registre est celui déjà écrit (-1).
  function sauver(table, versDossier, vide, siChange) {
    return lireTable(table).then(function (lignes) {
      var json = JSON.stringify(lignes, null, 2);
      if (vide === false && !lignes.length) return 0;
      if (siChange && dernier[table] === json) return -1;
      dernier[table] = json;
      var csv = enCsv(lignes);
      if (versDossier) {
        return ecrireFichier(table + '.json', json).then(function () {
          return ecrireFichier(table + '.csv', csv);
        }).then(function () { return lignes.length; });
      }
      telecharger(table + '.json', json, 'application/json');
      return lignes.length;
    });
  }

  // Après un enregistrement : on attend que les écritures groupées soient
  // passées, puis on réécrit le registre.
  // discret : une relecture (les commandes) et non un enregistrement d'ici.
  // Elle ne va qu'au dossier, sans bulle, et seulement si le registre a changé.
  function planifier(table, discret) {
    if (TABLES.indexOf(table) < 0) return;
    if (discret ? !dossier : (!dossier && !telechargerActif())) return;
    clearTimeout(attente[table]);
    attente[table] = setTimeout(function () {
      var versDossier = !!dossier;
      (versDossier ? permis(false) : Promise.resolve(true)).then(function (ok) {
        if (!ok) {
          if (!discret) dire('Tsy voasoratra tao amin\'ny disque : tsindrio « 💾 Tehirizo daholo » ao amin\'ny ⚙️ hamela azy indray.', true, true);
          return;
        }
        return sauver(table, versDossier, true, discret).then(function (n) {
          if (n < 0) return;
          dire('✓ ' + ANARANA[table] + ' voasoratra tao amin\'ny ' +
            (versDossier ? 'dossier « ' + dossier.name + ' »' : 'Téléchargements') + ' (' + n + ')', false, !discret);
        });
      }).catch(function (e) {
        dire('Tsy voasoratra tao amin\'ny disque : ' + ((e && e.message) || e), true, !discret);
      });
    }, 900);
  }
  // hotelerie.js l'appelle quand le menu change dans ce navigateur.
  window.__disque = { planifier: planifier };

  // ---------- Chaque écriture dans Supabase ----------
  // from(table).insert/update/upsert/delete rend un constructeur dont les
  // filtres (eq, select…) renvoient le même objet : son then suffit.
  function brancher(sb) {
    if (!sb || sb.__disque) return;
    sb.__disque = true;
    var from = sb.from.bind(sb);
    sb.__fromDisque = from;
    sb.from = function (table) {
      var q = from(table);
      if (TABLES.indexOf(table) < 0) return q;
      // Les commandes : chaque relecture réussie peut en apporter de nouvelles.
      if (table === 'hotelerie_commande' && typeof q.select === 'function') {
        var sel = q.select;
        q.select = function () {
          var b = sel.apply(q, arguments);
          var then = b.then;
          b.then = function (ok, ko) {
            return then.call(this, function (res) {
              if (res && !res.error) planifier(table, true);
              return ok ? ok(res) : res;
            }, ko);
          };
          return b;
        };
      }
      ['insert', 'update', 'upsert', 'delete'].forEach(function (m) {
        if (typeof q[m] !== 'function') return;
        var orig = q[m];
        q[m] = function () {
          var b = orig.apply(q, arguments);
          var then = b.then;
          b.then = function (ok, ko) {
            return then.call(this, function (res) {
              if (res && !res.error) planifier(table);
              return ok ? ok(res) : res;
            }, ko);
          };
          return b;
        };
      });
      return q;
    };
  }
  brancher(window.__sb);

  // ---------- ⚙️ Fikirana ----------
  function afficher() {
    var choisir = $('fkDisqueChoisir'), tout = $('fkDisqueTout'), esory = $('fkDisqueEsory');
    var auto = $('fkDisqueAuto'), nom = $('fkDisqueNom');
    if (aFichiers) {
      choisir.textContent = dossier ? '📁 Hanova dossier' : '📁 Misafidy dossier';
      nom.textContent = dossier ? 'Dossier : ' + dossier.name : 'Mbola tsy misy dossier voafidy.';
      tout.style.display = dossier ? '' : 'none';
      esory.style.display = dossier ? '' : 'none';
      auto.parentNode.style.display = 'none';
    } else {
      choisir.style.display = 'none';
      esory.style.display = 'none';
      tout.style.display = '';
      tout.textContent = '⬇️ Alaivo daholo';
      auto.parentNode.style.display = 'flex';
      nom.textContent = 'Tsy mahay misafidy dossier ity navigateur ity (ampiasao Chrome na Edge) : midina ao amin\'ny Téléchargements ny rakitra.';
      auto.checked = telechargerActif();
    }
  }

  $('fkDisqueChoisir').addEventListener('click', function () {
    window.showDirectoryPicker({ id: CLE_DOSSIER, mode: 'readwrite' }).then(function (h) {
      dossier = h;
      return garder(h);
    }).then(function () {
      afficher();
      dire('Voafidy ny dossier : soratana ao daholo izao…');
      return toutSauver();
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      dire('Tsy voafidy ny dossier : ' + ((e && e.message) || e), true);
    });
  });

  function toutSauver() {
    var versDossier = !!dossier;
    return (versDossier ? permis(true) : Promise.resolve(true)).then(function (ok) {
      if (!ok) { dire('Tsy navela hanoratra ao amin\'ny dossier.', true); return; }
      dire('Manoratra…');
      var total = 0;
      return TABLES.reduce(function (p, t) {
        return p.then(function () {
          return sauver(t, versDossier, false).then(function (n) { total += n; }, function (e) {
            // Sans compte, le menu s'écrit quand même ; le reste attend la connexion.
            if (!(e && e.message === 'tsy tafiditra')) throw e;
          });
        });
      }, Promise.resolve()).then(function () {
        dire('✓ Voasoratra daholo tao amin\'ny ' +
          (versDossier ? 'dossier « ' + dossier.name + ' »' : 'Téléchargements') + ' (' + total + ' andalana)', false, true);
      });
    }).catch(function (e) {
      dire('Tsy voasoratra : ' + ((e && e.message) || e), true);
    });
  }
  $('fkDisqueTout').addEventListener('click', toutSauver);

  $('fkDisqueEsory').addEventListener('click', function () {
    dossier = null;
    garder(null);
    afficher();
    dire('Tsy misy dossier intsony : tsy voasoratra ao amin\'ny disque ny fitehirizana.');
  });

  $('fkDisqueAuto').addEventListener('change', function () {
    try { localStorage.setItem(CLE_TELECHARGER, this.checked ? '1' : '0'); } catch (e) {}
  });

  // Les boutons qui enregistrent : livre de famille, ses membres, adidy,
  // taratasy. Ils écrivent aussi dans le dossier.
  var BOUTONS = ['famTehirizo', 'famAmpio', 'adidyAjouter', 'tarVokatra'];
  var refuse = false;   // dossier refusé une fois : on ne le redemande plus de la visite
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b || BOUTONS.indexOf(b.id) < 0) return;
    // Pendant le clic même : hors d'un geste, le navigateur refuse.
    if (dossier) {
      // Après un rechargement, l'accès se redemande ; déjà accordé, il
      // répond oui sans rien montrer.
      if (permisDemande) return;
      permisDemande = true;
      dossier.requestPermission({ mode: 'readwrite' }).catch(function () {});
      return;
    }
    if (!aFichiers || refuse || !monEmail()) return;
    // Pas encore de dossier : le premier « Tehirizo » le fait choisir. Le
    // registre entier s'y écrit dès qu'il est choisi, cet enregistrement compris.
    window.showDirectoryPicker({ id: CLE_DOSSIER, mode: 'readwrite' }).then(function (h) {
      dossier = h;
      return garder(h);
    }).then(function () {
      afficher();
      // Laisser l'enregistrement en cours arriver dans la base d'abord.
      setTimeout(toutSauver, 1500);
    }).catch(function () {
      refuse = true;
      bulle('Tsy nisy dossier voafidy : ao amin\'ny ⚙️ › 💽 Disque no hisafidianana azy.', false);
    });
  }, true);

  if (aFichiers) {
    relire().then(function (h) {
      dossier = h;
      afficher();
    });
  } else {
    afficher();
  }
})();
