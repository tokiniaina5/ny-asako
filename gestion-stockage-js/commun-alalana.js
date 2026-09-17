// L'entrée de « Commun » : demandée, accordée, ouverte par un code.
//
// Ce qui vit dans « Commun » — pièces d'identité, cotisations, certificats —
// ne regarde pas tout le monde. On n'y entre donc pas parce qu'on a un
// compte : il faut l'avoir demandé, et que le propriétaire l'ait accordé.
//
// Le code ne part par aucun message : il s'affiche au propriétaire, qui le
// transmet de la main à la main. Ce qui ne passe nulle part ne s'intercepte
// pas. Il est gardé dans ce navigateur pour ne pas le retaper chaque fois,
// mais il est revérifié au serveur à chaque ouverture : un accès retiré se
// referme aussitôt, même ici.

(function () {
  if (!document.getElementById('communPorte')) return;

  function $(id) { return document.getElementById(id); }

  const CLE = 'stockmanager_commun_code';

  let fangatahana = [];
  let alalana = [];

  function sb() {
    // L'employé entré par son lien n'a pas de compte : il ne peut rien
    // demander, et rien ne lui est accordé.
    if (typeof MODE_MPIASA !== 'undefined' && MODE_MPIASA) return null;
    return window.__sb || null;
  }
  function monEmail() {
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    return (u && u.email) ? String(u.email).trim().toLowerCase() : '';
  }
  function monNom() {
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    return (u && u.name) ? String(u.name).trim() : '';
  }
  function jeSuisLeProprietaire() {
    return typeof isOwnerEmail === 'function' && isOwnerEmail(monEmail());
  }
  function echapper(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function dire(id, texte, erreur) {
    const el = $(id);
    if (!el) return;
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--cyan)';
  }
  function expliquer(res) {
    const e = res && res.error;
    if (!e) return '';
    const m = String(e.message || '');
    if (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(m)) {
      return 'Mbola tsy misy ny table « commun_alalana » ao amin\'ny Supabase.';
    }
    if (e.code === '23505') return 'Efa misy izany.';
    if (/row-level security/i.test(m)) return 'Nolavina : tsy manana alalana amin\'izany ianao.';
    return 'Tsy nety : ' + m;
  }

  function codeGarde() {
    try { return (localStorage.getItem(CLE) || '').trim().toUpperCase(); } catch (e) { return ''; }
  }
  function garderLeCode(code) {
    try { localStorage.setItem(CLE, String(code || '').trim().toUpperCase()); } catch (e) {}
  }

  function montrer(ouverte) {
    $('communContenu').style.display = ouverte ? '' : 'none';
    $('communPorte').style.display = ouverte ? 'none' : '';
    if (ouverte) $('porteJereo').style.display = 'none';
    const onglet = $('ongletFangatahana');
    if (onglet) onglet.style.display = jeSuisLeProprietaire() ? '' : 'none';
  }

  // ---------- La porte ----------

  // Qui est là, pour le serveur. « Midira aloha » répondait à quatre
  // situations différentes — lien d'employé, Supabase absent, session du
  // serveur perdue, pas de compte — et laissait la personne sans piste. La
  // règle d'accès du serveur lit l'email de la SESSION Supabase : c'est elle
  // qui compte, pas seulement le compte ouvert dans la page.
  function identite() {
    if (typeof MODE_MPIASA !== 'undefined' && MODE_MPIASA) {
      return Promise.resolve({ ok: false, pourquoi: 'Tsy azo ampiasaina amin\'ny rohy mpiasa ity pejy ity : sokafy ny site amin\'ny kaontinao manokana (email sy tenimiafina).' });
    }
    const client = window.__sb || null;
    if (!client) {
      return Promise.resolve({ ok: false, pourquoi: 'Tsy tafiditra ny fifandraisana amin\'ny serveur : havaozy ny pejy (actualiser).' });
    }
    const email = monEmail();
    const lire = (client.auth && client.auth.getSession)
      ? client.auth.getSession().then(function (r) {
          const u = r && r.data && r.data.session && r.data.session.user;
          return u && u.email ? String(u.email).trim().toLowerCase() : '';
        }, function () { return ''; })
      : Promise.resolve('');
    return lire.then(function (emailSession) {
      if (!emailSession) {
        return { ok: false, pourquoi: email
          ? 'Tsy tafiditra amin\'ny serveur ny kaontinao (' + email + ') : tsindrio « Se déconnecter », dia midira indray amin\'ny email sy tenimiafina.'
          : 'Midira amin\'ny kaontinao aloha.' };
      }
      if (email && email !== emailSession) {
        return { ok: false, pourquoi: 'Kaonty roa samy hafa no misokatra (' + email + ' / ' + emailSession + ') : mivoaha dia midira indray.' };
      }
      return { ok: true, client: client, email: emailSession };
    });
  }

  function maLigne(emailSession) {
    const client = sb();
    const email = emailSession || monEmail();
    if (!client || !email) return Promise.resolve(null);
    return client.from('commun_alalana').select('code,active,voamarina,nampiasaina_at').ilike('email', email)
      .then(function (res) {
        if (res.error) { dire('porteMessage', expliquer(res), true); return null; }
        return (res.data || [])[0] || null;
      }, function () { return null; });
  }

  function verifier() {
    // Le propriétaire n'a pas à se demander l'entrée à lui-même.
    if (jeSuisLeProprietaire()) { montrer(true); return Promise.resolve(true); }

    return identite().then(function (moi) {
      if (!moi.ok) {
        montrer(false);
        dire('porteMessage', moi.pourquoi, true);
        return false;
      }
      // Un message d'une vérification précédente ne doit pas rester affiché.
      dire('porteMessage', '');
      return maLigne(moi.email).then(suiteVerifier);
    });
  }
  function suiteVerifier(ligne) {
      const garde = codeGarde();
      const codeMety = !!(ligne && ligne.active && garde && String(ligne.code).trim().toUpperCase() === garde);
      // Une fois l'accès confirmé, c'est le compte qui ouvre : la personne
      // peut se déconnecter, changer d'appareil, oublier son code — elle
      // rentre en se connectant. Le code n'aura servi qu'une fois, à se faire
      // reconnaître ; le redemander ensuite fermerait la porte à celui-là
      // même à qui on vient de l'ouvrir.
      const ok = !!(ligne && ligne.active && ligne.voamarina);
      montrer(ok);
      if (!ok) {
        if (codeMety) {
          dire('porteMessage', 'Voaray ny code. Nampandrenesina ny tompon\'ny site : misokatra ny pejy rehefa nohamafisiny.');
          $('porteJereo').style.display = '';
          // Une seule fois par ouverture de page : sa boîte ne doit pas se
          // remplir parce qu'on a rouvert l'onglet trois fois.
          if (!signalEnvoye) { signalEnvoye = true; signaler(garde); }
        } else if (ligne && ligne.active && !garde) {
          // Le code est tiré avec la demande (commun-angataka) : il ne reste
          // qu'à attendre que le propriétaire valide.
          dire('porteMessage', 'Nalefa ny fangatahanao miaraka amin\'ny code. Miandry ny fanamarinan\'ny tompon\'ny site : misokatra ny pejy rehefa voamarina.');
          $('porteJereo').style.display = '';
        } else if (ligne && !ligne.active) {
          dire('porteMessage', 'Nesorina ny alalanao. Mangataha indray raha ilaina.', true);
        }
        montrerMonStatut();
      }
      return ok;
  }

  // Prévenir le propriétaire que le code vient d'être saisi. Le navigateur
  // n'écrit pas lui-même dans la table des accès : c'est la fonction qui
  // marque l'heure et envoie le message.
  let signalEnvoye = false;
  function signaler(code) {
    const client = sb();
    if (!client || !client.functions || !client.functions.invoke) return Promise.resolve();
    let appareil = '';
    try { appareil = String(navigator.userAgent || '').slice(0, 160); } catch (e) {}
    return client.functions.invoke('commun-fiditra', { body: { code: code, appareil: appareil } })
      .then(function () {}, function () {});
  }

  function montrerMonStatut() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) return;
    client.from('commun_fangatahana').select('statut,created_at').ilike('email', email)
      .then(function (res) {
        const f = !res.error && (res.data || [])[0];
        const el = $('porteStatut');
        if (!el) return;
        if (!f) { el.textContent = 'Mbola tsy nangataka ianao.'; return; }
        el.textContent = f.statut === 'ekena'
          ? 'Ny fangatahanao dia neken\'ny tompon\'ny site. Angataho aminy ny code.'
          : (f.statut === 'lavina'
            ? 'Nolavina ny fangatahanao.'
            : 'Nalefa ny fangatahanao, miandry valiny.');
      }, function () {});
  }

  function mangataka() {
    dire('porteMessage', 'Fanamarinana…');
    identite().then(function (moi) {
      if (!moi.ok) { dire('porteMessage', moi.pourquoi, true); return; }
      envoyerLaDemande(moi.client, moi.email);
    });
  }
  function envoyerLaDemande(client, email) {
    dire('porteMessage', 'Mandefa ny fangatahana…');
    // La fonction pose la demande ET prévient le propriétaire : écrite
    // seulement dans la table, elle attendait qu'il pense à venir la voir.
    if (client.functions && client.functions.invoke) {
      client.functions.invoke('commun-angataka', {
        body: { hafatra: $('porteHafatra').value.trim() || null, anarana: monNom() || null }
      }).then(function (res) {
        const data = (res && res.data) || {};
        if (res && res.error && !data.ok) { ecrireLaDemande(email); return; }
        dire('porteMessage', data.sent
          ? 'Nalefa ny fangatahanao sy ny code, ary nampandrenesina ny tompon\'ny site. Misokatra ny pejy rehefa nohamafisiny.'
          : 'Voatahiry ny fangatahanao sy ny code. Tsy lasa ny mailaka, fa ho hitany ao amin\'ny pejiny ihany izy.');
        $('porteJereo').style.display = '';
        montrerMonStatut();
      }, function () { ecrireLaDemande(email); });
      return;
    }
    ecrireLaDemande(email);
  }

  // Le recours, quand la fonction n'est pas déployée ou ne répond pas : la
  // demande s'écrit quand même, le propriétaire la verra dans son onglet.
  function ecrireLaDemande(emailSession) {
    const client = sb();
    const email = emailSession || monEmail();
    if (!client || !email) return;
    client.from('commun_fangatahana').insert({
      email: email,
      anarana: monNom() || null,
      hafatra: $('porteHafatra').value.trim() || null
    }).then(function (res) {
      if (res.error) {
        // Redemander n'ouvre pas une seconde file : la première tient encore.
        if (res.error.code === '23505') {
          dire('porteMessage', 'Efa nalefa ny fangatahanao : miandry ny valin\'ny tompon\'ny site.');
          montrerMonStatut();
          return;
        }
        dire('porteMessage', expliquer(res), true);
        return;
      }
      dire('porteMessage', 'Nalefa ny fangatahanao. Ny tompon\'ny site no hanome anao code.');
      montrerMonStatut();
    }, function () {
      dire('porteMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  function sokafana() {
    const tape = $('porteCode').value.trim().toUpperCase();
    if (!tape) { dire('porteMessage', 'Soraty ny code nomen\'ny tompon\'ny site.', true); return; }
    dire('porteMessage', 'Fanamarinana…');
    maLigne().then(function (ligne) {
      if (!ligne || !ligne.active) {
        dire('porteMessage', 'Mbola tsy nomena alalana ity kaonty ity.', true);
        montrerMonStatut();
        return;
      }
      if (String(ligne.code).trim().toUpperCase() !== tape) {
        dire('porteMessage', 'Tsy mety ny code.', true);
        return;
      }
      garderLeCode(tape);
      $('porteCode').value = '';
      // La suite est l'affaire de verifier() : il préviendra le propriétaire
      // si la confirmation manque, et n'ouvrira que si elle est là.
      verifier().then(function (ouverte) {
        if (!ouverte) return;
        dire('porteMessage', '');
        // La vue ouverte doit se remplir : elle était cachée quand on l'a dressée.
        if (typeof choisirOngletCommun === 'function') choisirOngletCommun('tableau');
      });
    });
  }

  $('porteMangataka').addEventListener('click', mangataka);
  $('porteSokafy').addEventListener('click', sokafana);
  // Confirmée entre-temps : on regarde à nouveau plutôt que de recharger.
  $('porteJereo').addEventListener('click', function () {
    dire('porteMessage', 'Fanamarinana…');
    verifier().then(function (ouverte) {
      if (ouverte && typeof choisirOngletCommun === 'function') choisirOngletCommun('tableau');
      else dire('porteMessage', 'Mbola tsy nohamafisin\'ny tompon\'ny site.');
    });
  });

  // ---------- Le côté du propriétaire ----------

  function chargerAdmin() {
    const client = sb();
    if (!client || !jeSuisLeProprietaire()) return Promise.resolve();
    return Promise.all([
      client.from('commun_fangatahana').select('*').order('created_at', { ascending: false }),
      client.from('commun_alalana').select('*').order('created_at', { ascending: false })
    ]).then(function (res) {
      if (res[0].error) { dire('admMessage', expliquer(res[0]), true); return; }
      fangatahana = res[0].data || [];
      alalana = (res[1] && !res[1].error) ? (res[1].data || []) : [];
      afficherAdmin();
    }, function () {
      dire('admMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  function dateFr(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
  }

  function afficherAdmin() {
    const STATUTS = { miandry: 'Miandry', ekena: 'Ekena', lavina: 'Lavina' };
    $('admFangatahanaListe').innerHTML = fangatahana.map(function (f) {
      // Le code tiré avec la demande, et le bouton pour valider sur place.
      const acces = alalana.filter(function (a) {
        return String(a.email).trim().toLowerCase() === String(f.email).trim().toLowerCase();
      })[0];
      const aValider = acces && acces.active && !acces.voamarina;
      return '<tr>' +
        '<td style="white-space:nowrap;">' + dateFr(f.created_at) + '</td>' +
        '<td>' + echapper(f.anarana || '—') + '<div style="color:var(--muted); font-size:0.75rem;">' + echapper(f.email) + '</div></td>' +
        '<td style="color:var(--muted);">' + echapper(f.hafatra || '—') + '</td>' +
        '<td>' + echapper(STATUTS[f.statut] || f.statut) +
          (acces ? '<div style="font-family:var(--font-mono); font-size:0.85rem; letter-spacing:0.1em; margin-top:0.2rem;">' + echapper(acces.code) + '</div>' : '') +
        '</td>' +
        '<td style="white-space:nowrap;">' +
          (aValider
            ? '<button type="button" class="btn btn-primary btn-sm" data-valider="' + echapper(acces.id) + '" data-valider-email="' + echapper(f.email) + '">✅ Hamafiso</button> '
            : '<button type="button" class="btn btn-primary btn-sm" data-ekena="' + echapper(f.id) + '">Omeo code</button> ') +
          '<button type="button" class="btn btn-red btn-sm" data-lavina="' + echapper(f.id) + '">Lavina</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    $('admFangatahanaVide').style.display = fangatahana.length ? 'none' : '';

    $('admAlalanaListe').innerHTML = alalana.map(function (a) {
      const miandry = !!a.nampiasaina_at && !a.voamarina;
      const etat = !a.active
        ? 'Nesorina'
        : (a.voamarina
          ? 'Misokatra'
          : (miandry
            ? '<span style="color:var(--amber);">Nosoratana ny code ' + dateFr(a.nampiasaina_at) + ' — miandry anao</span>'
            : '<span style="color:var(--muted);">Mbola tsy nosoratana ny code</span>'));
      return '<tr>' +
        '<td>' + echapper(a.anarana || '—') + '<div style="color:var(--muted); font-size:0.75rem;">' + echapper(a.email) + '</div>' +
          (a.appareil ? '<div style="color:var(--muted); font-size:0.7rem;">' + echapper(String(a.appareil).slice(0, 60)) + '</div>' : '') + '</td>' +
        '<td style="font-family:var(--font-mono); font-size:1rem; letter-spacing:0.12em;">' + echapper(a.code) + '</td>' +
        '<td>' + etat + '</td>' +
        '<td style="white-space:nowrap;">' +
          (a.active && !a.voamarina
            ? '<button type="button" class="btn btn-primary btn-sm" data-hamafiso="' + echapper(a.id) + '">✅ Hamafiso</button> '
            : '') +
          '<button type="button" class="btn btn-sm" data-code-vaovao="' + echapper(a.id) + '">Code vaovao</button> ' +
          (a.active
            ? '<button type="button" class="btn btn-red btn-sm" data-esory="' + echapper(a.id) + '">Esorina</button>'
            : '<button type="button" class="btn btn-sm" data-averina="' + echapper(a.id) + '">Averina</button>') +
        '</td>' +
      '</tr>';
    }).join('');
    $('admAlalanaVide').style.display = alalana.length ? 'none' : '';
  }

  // Le code n'est pas écrit d'ici : la fonction « commun-code » le tire, le
  // pose comme accès, et l'envoie par email avec un lien qui ouvre la page.
  // Le navigateur n'a pas le droit d'écrire dans la table des accès — c'est
  // ce qui empêche quiconque de s'en accorder un.
  function demanderUnCode(email, anarana, quoi) {
    const client = sb();
    if (!client || !client.functions || !client.functions.invoke) {
      dire('admMessage', 'Mbola tsy voapetraka ny fonction « commun-code ».', true);
      return;
    }
    dire('admMessage', quoi + '…');
    client.functions.invoke('commun-code', { body: { email: email, anarana: anarana || null } })
      .then(function (res) {
        const data = (res && res.data) || {};
        if ((res && res.error && !data.code) || !data.code) {
          dire('admMessage', 'Tsy nety : ' + ((res && res.error && res.error.message) || data.error || 'tsy fantatra'), true);
          chargerAdmin();
          return;
        }
        // Le code revient ici aussi : si le mail n'est pas parti, le
        // propriétaire peut encore le dire lui-même.
        dire('admMessage', data.sent
          ? 'Lasa tamin\'ny ' + email + ' ny mailaka. Code : ' + data.code
          : 'Tsy lasa ny mailaka (' + (data.error || 'antony tsy fantatra') + '). Code : ' + data.code + ' — lazao azy mivantana.');
        chargerAdmin();
      }, function (err) {
        dire('admMessage', 'Tsy tratra ny fonction : ' + ((err && err.message) || 'réseau'), true);
      });
  }

  function accorder(id) {
    const f = fangatahana.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    demanderUnCode(String(f.email).trim().toLowerCase(), f.anarana, 'Mandefa ny code');
  }

  function refuser(id) {
    const client = sb();
    if (!client) return;
    const f = fangatahana.filter(function (x) { return x.id === id; })[0];
    client.from('commun_fangatahana').update({ statut: 'lavina', updated_at: new Date().toISOString() }).eq('id', id)
      .then(function (res) {
        if (res.error) { dire('admMessage', expliquer(res), true); return; }
        // Le code tiré avec la demande ne doit plus attendre une validation.
        if (f && f.email) {
          client.from('commun_alalana').update({ active: false, voamarina: false, updated_at: new Date().toISOString() })
            .ilike('email', String(f.email).trim().toLowerCase()).then(function () {}, function () {});
        }
        dire('admMessage', 'Nolavina.');
        chargerAdmin();
      }, function () { dire('admMessage', 'Tsy tratra ny serveur.', true); });
  }

  function changerAcces(id, champs, mot) {
    const client = sb();
    if (!client) return;
    client.from('commun_alalana').update(Object.assign({ updated_at: new Date().toISOString() }, champs)).eq('id', id)
      .then(function (res) {
        if (res.error) { dire('admMessage', expliquer(res), true); return; }
        dire('admMessage', mot);
        chargerAdmin();
      }, function () { dire('admMessage', 'Tsy tratra ny serveur.', true); });
  }

  $('admFangatahanaListe').addEventListener('click', function (e) {
    const ekena = e.target.closest('[data-ekena]');
    const lavina = e.target.closest('[data-lavina]');
    const validerBtn = e.target.closest('[data-valider]');
    if (validerBtn) valider(validerBtn.dataset.valider, String(validerBtn.dataset.validerEmail || '').trim().toLowerCase());
    else if (ekena) accorder(ekena.dataset.ekena);
    else if (lavina) refuser(lavina.dataset.lavina);
  });

  $('admAlalanaListe').addEventListener('click', function (e) {
    const hamafiso = e.target.closest('[data-hamafiso]');
    if (hamafiso) {
      const a = alalana.filter(function (x) { return x.id === hamafiso.dataset.hamafiso; })[0];
      valider(hamafiso.dataset.hamafiso, a && String(a.email).trim().toLowerCase());
      return;
    }
    const vaovao = e.target.closest('[data-code-vaovao]');
    const esory = e.target.closest('[data-esory]');
    const averina = e.target.closest('[data-averina]');
    if (vaovao) {
      const a = alalana.filter(function (x) { return x.id === vaovao.dataset.codeVaovao; })[0];
      if (a) demanderUnCode(String(a.email).trim().toLowerCase(), a.anarana, 'Mandefa code vaovao');
    } else if (esory) {
      // Retirer, c'est aussi défaire la confirmation : un accès rendu plus
      // tard devra être confirmé à nouveau.
      changerAcces(esory.dataset.esory, { active: false, voamarina: false }, 'Nesorina ny alalana.');
    } else if (averina) {
      changerAcces(averina.dataset.averina, { active: true }, 'Naverina ny alalana.');
    }
  });

  // ---------- Le lien reçu par email ----------
  // « ?commun=<code> » : la personne a cliqué dans son message. On garde le
  // code et on ouvre la page — elle n'a rien à recopier. L'adresse est
  // nettoyée aussitôt : un code qui reste dans la barre se recopie par-dessus
  // l'épaule, et se retrouve dans l'historique.
  (function () {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    const code = String(params.get('commun') || '').trim().toUpperCase();
    if (!code) return;

    garderLeCode(code);
    params.delete('commun');
    const reste = params.toString();
    try { history.replaceState(null, '', window.location.pathname + (reste ? '?' + reste : '')); } catch (e) {}

    // L'application n'est pas encore ouverte au chargement : elle attend la
    // session, parfois l'écran de connexion. On rappelle, puis on renonce.
    function ouvrirQuandPret(reste) {
      const ecran = document.getElementById('appScreen');
      if (ecran && getComputedStyle(ecran).display !== 'none' && typeof ouvrirDepuisLeMenu === 'function') {
        ouvrirDepuisLeMenu('commun');
        return;
      }
      if (reste > 0) setTimeout(function () { ouvrirQuandPret(reste - 1); }, 1000);
    }
    setTimeout(function () { ouvrirQuandPret(20); }, 600);
  })();

  // « ?commun_valider=<email>&c=<code> » : le lien de l'email du
  // propriétaire. Il ne valide rien à lui seul — un antivirus qui ouvre les
  // liens le déclencherait. Il ouvre l'onglet des demandes et pose la
  // question ; c'est le compte connecté du propriétaire qui écrit.
  (function () {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    const email = String(params.get('commun_valider') || '').trim().toLowerCase();
    const code = String(params.get('c') || '').trim().toUpperCase();
    if (!email) return;
    params.delete('commun_valider');
    params.delete('c');
    const reste = params.toString();
    try { history.replaceState(null, '', window.location.pathname + (reste ? '?' + reste : '')); } catch (e) {}

    function essayer(n) {
      const ecran = document.getElementById('appScreen');
      const pret = ecran && getComputedStyle(ecran).display !== 'none' && monEmail() && typeof ouvrirDepuisLeMenu === 'function';
      if (!pret) {
        if (n > 0) setTimeout(function () { essayer(n - 1); }, 1000);
        return;
      }
      if (!jeSuisLeProprietaire()) {
        alert('Ity rohy ity dia an\'ny tompon\'ny site ihany : midira amin\'ny kaontiny vao manamarina.');
        return;
      }
      ouvrirDepuisLeMenu('commun');
      if (typeof choisirOngletCommun === 'function') choisirOngletCommun('fangatahana');
      chargerAdmin().then(function () {
        const a = alalana.filter(function (x) { return String(x.email).trim().toLowerCase() === email; })[0];
        if (!a) { dire('admMessage', 'Tsy hita ny fangatahan\'i ' + email + '.', true); return; }
        if (a.active && a.voamarina) { dire('admMessage', 'Efa voamarina teo aloha i ' + email + '.'); return; }
        if (code && String(a.code).trim().toUpperCase() !== code) {
          dire('admMessage', 'Efa niova ny code an\'i ' + email + ' : jereo ny fangatahana farany.', true);
          return;
        }
        if (window.confirm('Hamafisina ve ny fidiran\'i ' + (a.anarana ? a.anarana + ' (' + email + ')' : email) +
          ' ao amin\'ny « Administratif Fokontany » ?\n\nCode : ' + a.code)) {
          valider(a.id, email);
        }
      });
    }
    setTimeout(function () { essayer(25); }, 800);
  })();

  // Valider : l'accès confirmé, et la demande marquée acceptée.
  function valider(id, email) {
    const client = sb();
    if (!client) return;
    const maintenant = new Date().toISOString();
    client.from('commun_alalana').update({ voamarina: true, active: true, updated_at: maintenant }).eq('id', id)
      .then(function (res) {
        if (res.error) { dire('admMessage', expliquer(res), true); return; }
        const suite = email
          ? client.from('commun_fangatahana').update({ statut: 'ekena', updated_at: maintenant }).ilike('email', email)
          : Promise.resolve();
        return Promise.resolve(suite).then(function () {
          dire('admMessage', 'Nohamafisina : misokatra aminy izao ny pejy.');
          chargerAdmin();
        });
      }, function () { dire('admMessage', 'Tsy tratra ny serveur.', true); });
  }

  // La session Supabase arrive parfois après l'ouverture de la page : la
  // vérification, faite trop tôt, ne voyait aucune ligne et refermait la porte
  // devant quelqu'un qui avait le droit d'entrer. On la refait dès que la
  // session est là, si la page est ouverte et qu'un code est gardé ici.
  try {
    if (window.__sb && window.__sb.auth && window.__sb.auth.onAuthStateChange) {
      window.__sb.auth.onAuthStateChange(function () {
        const vue = document.getElementById('dash-commun');
        if (vue && vue.classList.contains('active') && codeGarde()) verifier();
        // L'Administratif Commun passe par la même porte : même retard possible.
        const commun = document.getElementById('dash-communadmin');
        if (commun && commun.classList.contains('active') && typeof ouvrirCommunAdmin === 'function') ouvrirCommunAdmin();
      });
    }
  } catch (e) {}

  // Appelées par common.js.
  window.renderPorteCommun = verifier;
  window.renderFangatahana = function () {
    dire('admMessage', '');
    return chargerAdmin();
  };
})();
