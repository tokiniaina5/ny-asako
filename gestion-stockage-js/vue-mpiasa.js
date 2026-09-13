// L'employé, entré par son lien.
//
// Il arrive par un lien, pas par un mot de passe. Le jeton dans l'adresse
// dit qui il est ; la fonction « mpiasa » lui répond. Il reçoit alors
// l'application entière, et il en fait ce qu'il veut :
//
//   - Le stock est le sien. Au premier passage, il part d'une copie de celui
//     du patron ; ensuite il ajoute, modifie, efface chez lui, et le stock du
//     patron n'en sait rien. common.js range ce stock sous des clés à son
//     nom (SUFFIXE_MPIASA) : ouvert dans le navigateur du patron, les deux ne
//     se mélangent pas.
//
//   - L'équipe est celle du patron. Il y inscrit des gens, leur fait des
//     liens, pointe, confie des courses — et le patron voit tout. Il n'a pas
//     de compte pour écrire dans la base : equipe.js parle donc à un client
//     de remplacement, défini ici, qui fait passer chaque demande par la
//     fonction. C'est elle qui dit au nom de quel patron.

(function () {
  const jeton = (function () {
    try { return new URLSearchParams(location.search).get('mpiasa') || ''; }
    catch (e) { return ''; }
  })();

  // Pas de jeton : l'application se comporte comme d'habitude.
  if (!jeton) return;

  const ROLES = { mpiasa: 'Mpiasa', livreur: 'Livreur' };
  const STATUTS = {
    miandry: 'Miandry', nalaina: 'Nalaina', an_dalana: 'An-dalana',
    tonga: 'Tonga', foana: 'Foana'
  };

  function html(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function heures(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.round((ms % 3600000) / 60000);
    return h + ' h ' + (m < 10 ? '0' : '') + m;
  }

  // Vrai dès que l'application s'est ouverte pour lui.
  let entre = false;

  // ---------- Avant la première réponse ----------
  // On prend la place de tout le reste, le temps de savoir si le lien est
  // bon : l'écran de connexion n'a pas à clignoter devant lui.
  function poserLEcran() {
    ['loginScreen', 'appScreen', 'paywallScreen', 'welcomeOverlay', 'autoNoticeModal']
      .forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    let ecran = document.getElementById('mpiasaScreen');
    if (!ecran) {
      ecran = document.createElement('div');
      ecran.id = 'mpiasaScreen';
      ecran.style.cssText = 'min-height:100vh; padding:1.2rem 3vw 3rem;';
      document.body.appendChild(ecran);
    }
    ecran.style.display = 'block';
    return ecran;
  }

  function patienter() {
    poserLEcran().innerHTML =
      '<div class="login-card" style="margin:3rem auto;">' +
      '<div class="eyebrow">Ny asako</div>' +
      '<p class="sub">Miditra…</p>' +
      '</div>';
  }

  // ---------- Le stock de départ ----------
  // Une fois, et une seule : recopié à chaque ouverture, il effacerait ce
  // que l'employé a fait depuis. Et seulement s'il y a quelque chose à
  // recopier — un patron qui n'a pas encore ouvert son application n'a
  // déposé aucune copie, et on attend la suivante plutôt que de marquer
  // « fait » un stock vide.
  const CLE_COPIE = 'stockmanager_mpiasa_copie' + SUFFIXE_MPIASA;

  function copierLeStockUneFois(d) {
    try { if (localStorage.getItem(CLE_COPIE) === '1') return; } catch (e) { return; }
    if (!d.stockMaj) return;
    const marquer = function () {
      try { localStorage.setItem(CLE_COPIE, '1'); } catch (e) {}
    };
    // Il a déjà commencé sans copie : son travail passe avant.
    if (items.length || movements.length) { marquer(); return; }

    items = (d.articles || []).filter(function (a) { return a && typeof a === 'object'; })
      .map(function (it) {
        if (!it.id) it.id = genId();
        if (it.ref === undefined) it.ref = '';
        if (it.unit === undefined) it.unit = 'pièce';
        if (it.seuil === undefined) it.seuil = 5;
        if (it.supplier === undefined) it.supplier = '';
        return it;
      });
    movements = (d.mouvements || []).filter(function (m) {
      if (!m || !m.date) return false;
      if (!m.day) m.day = dayKey(new Date(m.date));
      return true;
    });
    saveItems(items);
    saveMovements(movements);
    marquer();
  }

  // ---------- Entrer ----------
  // Les appels et le direct reconnaissent les gens à leur email. On lui en
  // donne un qui n'appartient à personne — « .invalid » est réservé à cela —
  // plutôt que celui noté dans l'équipe : il pourrait être celui d'un compte,
  // et il se ferait passer pour lui.
  function emailDe(p) {
    return 'mpiasa-' + String(p.id || jeton.slice(0, 12)) + '@ny-asako.invalid';
  }

  function entrer(d) {
    const p = d.personne || {};
    copierLeStockUneFois(d);
    currentUser = {
      name: p.nom || 'Mpiasa', email: emailDe(p), phone: p.telephone || '',
      logo: null, company: '', nif: '', stat: ''
    };
    const nom = document.getElementById('currentUserName');
    if (nom) nom.textContent = currentUser.name;
    const sous = document.getElementById('currentUserEmail');
    if (sous) sous.textContent = ROLES[p.role] || p.role || '';

    const attente = document.getElementById('mpiasaScreen');
    if (attente) attente.style.display = 'none';
    entre = true;
    openApp();
    ouvrirSurLAccueil();
    // Le patron voit tout de suite où il en est, sans attendre un premier
    // changement.
    envoyerMonStock();
  }

  // ---------- Ny momba ahy ----------
  // Ce qui n'appartient qu'à lui : ses heures, ses courses, et pour un
  // livreur, où il est.
  function dessinerMoi(d) {
    const zone = document.getElementById('moiContenu');
    if (!zone) return;
    const p = d.personne || {};
    const livraisons = d.livraisons || [];
    const pointages = d.pointages || [];

    const ouvert = pointages.filter(function (l) { return !l.depart; })[0] || null;
    let msJour = 0;
    const jour = new Date(); jour.setHours(0, 0, 0, 0);
    pointages.forEach(function (l) {
      const debut = new Date(l.arrivee).getTime();
      if (debut < jour.getTime()) return;
      msJour += Math.max(0, (l.depart ? new Date(l.depart).getTime() : Date.now()) - debut);
    });

    let sortie = '';

    sortie += '<div class="section-head"><div>' +
      '<h2>' + html(p.nom || '—') + '</h2>' +
      '<p>' + html(ROLES[p.role] || p.role || '') +
      (ouvert
        ? ' · <span style="color:var(--cyan);">eo am-piasana hatramin\'ny ' +
          new Date(ouvert.arrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</span>'
        : '') +
      '</p></div></div>';

    sortie += '<div class="panel">' +
      '<div class="panneau-titre">Anio</div>' +
      '<p style="font-size:0.85rem; color:var(--muted); margin:0;">Ora niasana anio : <strong style="color:var(--cyan);">' +
      heures(msJour) + '</strong></p>' +
      '</div>';

    // ---- Où il est ----
    // Seulement pour les livreurs : un employé au magasin n'a pas à être suivi.
    if (p.role === 'livreur') {
      sortie += '<div class="panel" style="margin-top:1rem;">' +
        '<div class="panneau-titre">Ny toerana misy anao</div>' +
        '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.7rem;">' +
        'Raha manaiky ianao, ny toerana misy anao dia alefa isaky ny iray minitra, mba hahitan\'ny patron hoe aiza ianao. ' +
        'Azonao esorina na oviana na oviana ao amin\'ny réglages ny finday.' +
        '</p>' +
        '<p id="maPosition" style="font-size:0.85rem; line-height:1.6; margin:0 0 0.7rem;">—</p>' +
        '<button type="button" class="btn btn-primary btn-sm" id="maPositionBtn" style="width:auto;">Manaiky — alefaso ny toerako</button>' +
        '</div>';
    }

    // ---- Ses courses ----
    sortie += '<div class="panel" style="margin-top:1rem;">' +
      '<div class="panneau-titre">Ny fandefasana nomena anao</div>';
    if (!livraisons.length) {
      sortie += '<p class="empty-hint">Mbola tsy misy.</p>';
    } else {
      livraisons.forEach(function (l) {
        sortie += '<div style="border:1px solid var(--line); border-radius:8px; padding:0.7rem 0.9rem; margin-top:0.6rem; font-size:0.82rem; line-height:1.6;">' +
          '<strong style="color:var(--text);">' + html(l.designation) + '</strong>' +
          ' · <span style="color:var(--cyan);">' + html(STATUTS[l.statut] || l.statut) + '</span>' +
          (l.client ? '<br>Mpanjifa : ' + html(l.client) : '') +
          (l.adresse ? '<br>Adiresy : ' + html(l.adresse) : '') +
          (l.telephone ? '<br><a href="tel:' + html(l.telephone) + '" style="color:var(--cyan);">' + html(l.telephone) + '</a>' : '') +
          '</div>';
      });
    }
    sortie += '</div>';

    zone.innerHTML = sortie;

    // La page se redessine : un suivi déjà accepté ne doit pas redemander
    // l'accord, ni perdre la dernière position affichée.
    if (dernierePosition) montrerMaPosition(dernierePosition);
    const b = document.getElementById('maPositionBtn');
    if (b) {
      if (suivi !== null) { b.disabled = true; b.textContent = 'Alefa…'; }
      b.addEventListener('click', function () {
        b.disabled = true;
        b.textContent = 'Alefa…';
        commencerLeSuivi();
      });
    }
  }

  // ---------- Dire où l'on est ----------
  // Le navigateur demande la permission lui-même, et la refuse par défaut :
  // personne n'est suivi sans l'avoir accepté, et l'accord se retire dans les
  // réglages du téléphone. On ne contourne rien — on ne le pourrait pas.
  let suivi = null;
  let dernierEnvoi = 0;
  let dernierePosition = null;

  function envoyerPosition(pos) {
    const client = window.__sb;
    if (!client || !client.functions) return;
    // Une fois par minute au plus : un téléphone qui parle sans cesse se vide,
    // et une position à la seconde n'apprend rien de plus qu'une à la minute.
    const maintenant = Date.now();
    if (maintenant - dernierEnvoi < 60000) return;
    dernierEnvoi = maintenant;
    client.functions.invoke('mpiasa', {
      body: {
        jeton: jeton,
        action: 'position',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        precision: pos.coords.accuracy
      }
    }).then(function () {}, function () {});
    montrerMaPosition(pos);
  }

  function montrerMaPosition(pos) {
    dernierePosition = pos;
    const el = document.getElementById('maPosition');
    if (!el) return;
    const lat = pos.coords.latitude.toFixed(5);
    const lng = pos.coords.longitude.toFixed(5);
    el.innerHTML = 'Ny toerana misy anao : <strong style="color:var(--cyan);">' + lat + ', ' + lng + '</strong>' +
      ' (± ' + Math.round(pos.coords.accuracy) + ' m)<br>' +
      '<span style="color:var(--muted);">' + new Date(pos.timestamp || Date.now()).toLocaleTimeString('fr-FR') + '</span>';
  }

  function commencerLeSuivi() {
    const el = document.getElementById('maPosition');
    if (!navigator.geolocation) {
      if (el) el.textContent = 'Tsy mahay milaza toerana ity finday ity.';
      return;
    }
    if (el) el.textContent = 'Miandry ny toerana…';
    suivi = navigator.geolocation.watchPosition(envoyerPosition, function (e) {
      const ici = document.getElementById('maPosition');
      if (!ici) return;
      ici.textContent = (e && e.code === 1)
        ? 'Tsy nomena alalana. Sokafy ao amin\'ny réglages ny toerana raha tianao ho hitan\'ny patron.'
        : 'Tsy hita ny toerana amin\'izao fotoana izao.';
    }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
  }

  // ---------- Dire pourquoi ----------
  // « Tsy mety ny rohy » ne se répare pas : il faut savoir si le lien est
  // inconnu, suspendu, ou si c'est le serveur qui n'a pas répondu. Le
  // serveur le dit déjà ; il ne restait qu'à l'écouter.
  const RAISONS = {
    'lien invalide': 'Tsy fantatra ity rohy ity. Mety nesorina ilay olona, na nataovy rohy vaovao ka lany andro ity.',
    'lien suspendu': 'Naato ity rohy ity. Ny tompon\'ny fivarotana no afaka mamelona azy indray.',
    'méthode refusée': 'Tsy nety ny fangatahana.',
    'configuration incomplète': 'Tsy vita ny fandaminana ao amin\'ny Supabase.',
    'table refusée': 'Tsy azo atao amin\'ny rohy io.',
    'requête illisible': 'Tsy nety ny fangatahana.'
  };

  // Le corps de la réponse d'erreur n'arrive pas tout seul : supabase-js
  // tend la réponse brute, et c'est à nous de l'ouvrir.
  function codeDe(err) {
    try {
      const ctx = err && err.context;
      if (ctx && typeof ctx.json === 'function') {
        return ctx.json().then(function (b) {
          return b && b.error ? String(b.error) : '';
        }, function () { return ''; });
      }
    } catch (e) {}
    return Promise.resolve('');
  }
  function repondu(err) {
    return !!(err && err.context && typeof err.context.json === 'function');
  }

  // Un lien qui ne vaut plus ferme l'application, même ouverte : suspendu
  // pendant qu'il travaillait, il ne doit plus rien voir. Son stock, lui,
  // reste dans son navigateur — il le retrouvera si le patron le rétablit.
  function erreur(message) {
    if (entre && typeof teardownRealtimeFeatures === 'function') teardownRealtimeFeatures();
    entre = false;
    currentUser = null;
    const ecran = poserLEcran();
    ecran.innerHTML =
      '<div class="login-card" style="margin:3rem auto;">' +
      '<div class="eyebrow">Ny asako</div>' +
      '<h1 style="font-size:1.2rem;">Tsy mety ny rohy</h1>' +
      '<p class="sub">' + html(message) + '</p>' +
      '</div>';
  }
  function erreurDuServeur(err, repli) {
    codeDe(err).then(function (code) {
      erreur(RAISONS[code] || (code ? repli + ' (' + code + ')' : repli));
    });
  }

  let derniereDemande = 0;
  function demander() {
    derniereDemande = Date.now();
    const client = window.__sb;
    if (!client || !client.functions || !client.functions.invoke) {
      if (!entre) erreur('Tsy tafaraka amin\'ny Supabase. Andramo indray.');
      return;
    }
    client.functions.invoke('mpiasa', { body: { jeton: jeton } }).then(function (res) {
      if (res && res.error) {
        // Sans réponse du serveur — réseau coupé —, on garde ce qu'on a :
        // le lien n'y est pour rien. Avec une réponse, c'est lui qui parle.
        if (entre && !repondu(res.error)) return;
        erreurDuServeur(res.error, 'Tsy mahazo alalana ity rohy ity.');
        return;
      }
      const d = res && res.data;
      if (!d || d.error) { erreur('Tsy mahazo alalana ity rohy ity.'); return; }
      if (!entre) entrer(d);
      dessinerMoi(d);
    }, function () {
      if (!entre) erreur('Tsy tafita ny fangatahana.');
    });
  }

  // ---------- L'équipe du patron, sans compte ----------
  // equipe.js écrit « client.from('equipe').select('*').eq(...) », comme
  // pour Supabase. Ce client-ci prend note de la demande, sans rien savoir
  // faire, et l'envoie telle quelle à la fonction « mpiasa ». Elle seule
  // décide : quelles tables, quelles opérations, et surtout au nom de quel
  // patron — l'email que le code met dans la demande n'est pas écouté.
  function envoyer(demande) {
    const client = window.__sb;
    const echec = function (message) { return { data: null, error: { message: message } }; };
    if (!client || !client.functions) return Promise.resolve(echec('Tsy tafaraka amin\'ny Supabase.'));
    return client.functions.invoke('mpiasa', {
      body: { jeton: jeton, action: 'table', requete: demande }
    }).then(function (res) {
      if (res && res.error) {
        if (!repondu(res.error)) return echec('Tsy tafita ny fangatahana.');
        return codeDe(res.error).then(function (code) {
          if (code === 'lien invalide' || code === 'lien suspendu') erreur(RAISONS[code]);
          return echec(RAISONS[code] || code || 'Tsy nety ny fangatahana.');
        });
      }
      const d = (res && res.data) || {};
      // Une fonction pas encore redéployée ne connaît pas « table » : elle
      // rend la page de l'employé, et une liste vide passerait pour vraie.
      if (!('data' in d) && !('error' in d)) {
        return echec('Mbola tsy navoaka indray ny fonction « mpiasa » ao amin\'ny Supabase.');
      }
      return { data: d.data === undefined ? null : d.data, error: d.error ? { message: String(d.error) } : null };
    }, function () {
      return echec('Tsy tafita ny fangatahana.');
    });
  }

  function depuisLaTable(table) {
    const demande = {
      table: table, op: 'select', colonnes: '*', filtres: [],
      ordre: null, limite: null, unique: false, valeurs: null
    };
    const q = {
      select: function (c) { demande.colonnes = c || '*'; return q; },
      insert: function (v) { demande.op = 'insert'; demande.valeurs = v; return q; },
      update: function (v) { demande.op = 'update'; demande.valeurs = v; return q; },
      upsert: function (v) { demande.op = 'upsert'; demande.valeurs = v; return q; },
      delete: function () { demande.op = 'delete'; return q; },
      eq: function (c, v) { demande.filtres.push([c, 'eq', v]); return q; },
      is: function (c, v) { demande.filtres.push([c, 'is', v]); return q; },
      in: function (c, v) { demande.filtres.push([c, 'in', v]); return q; },
      order: function (c, o) {
        demande.ordre = { colonne: c, croissant: !(o && o.ascending === false) };
        return q;
      },
      limit: function (n) { demande.limite = n; return q; },
      maybeSingle: function () { demande.unique = true; return q; },
      single: function () { demande.unique = true; return q; },
      then: function (ok, ko) { return envoyer(demande).then(ok, ko); }
    };
    return q;
  }

  window.__sbMpiasa = {
    from: depuisLaTable,
    // equipe.js vérifie qu'une session est ouverte avant de lire. Ici, c'est
    // le jeton qui en tient lieu, et la fonction le revérifie à chaque fois.
    auth: {
      getSession: function () {
        return Promise.resolve({ data: { session: entre ? { lien: true } : null } });
      }
    }
  };

  // ---------- Ce que suit le patron ----------
  // Son stock ne quitte pas ce navigateur : le patron, qui doit pouvoir le
  // suivre, n'en verrait rien. On lui en envoie une copie après chaque
  // changement (common.js appelle deposerStockMpiasa à chaque
  // enregistrement), regroupée : dix articles saisis d'affilée partent en
  // une fois, trois secondes après le dernier.
  const MOUVEMENTS_ENVOYES = 1000;
  let envoiPrevu = null;

  function envoyerMonStock() {
    if (!entre) return;
    const client = window.__sb;
    if (!client || !client.functions) return;
    const recents = movements.slice()
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); })
      .slice(0, MOUVEMENTS_ENVOYES);
    client.functions.invoke('mpiasa', {
      body: { jeton: jeton, action: 'stock', articles: items, mouvements: recents }
    }).then(function () {}, function () {});
  }

  window.deposerStockMpiasa = function () {
    if (envoiPrevu) clearTimeout(envoiPrevu);
    envoiPrevu = setTimeout(function () {
      envoiPrevu = null;
      envoyerMonStock();
    }, 3000);
  };

  // L'onglet qu'on quitte ne laisse pas un envoi en suspens : fermé dans les
  // trois secondes, le dernier changement ne serait jamais parti.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden || !envoiPrevu) return;
    clearTimeout(envoiPrevu);
    envoiPrevu = null;
    envoyerMonStock();
  });

  // On pose l'attente tout de suite — sinon l'écran de connexion clignote
  // avant — et on demande dès que la page est prête.
  patienter();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demander);
  } else {
    demander();
  }
  // Toutes les cinq minutes, et au retour sur la page : un lien suspendu
  // doit cesser d'ouvrir, et une course a pu lui être confiée.
  setInterval(function () {
    if (entre && !document.hidden) demander();
  }, 300000);
  document.addEventListener('visibilitychange', function () {
    if (entre && !document.hidden && Date.now() - derniereDemande > 60000) demander();
  });
})();
