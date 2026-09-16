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
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
    const onglet = $('ongletFangatahana');
    if (onglet) onglet.style.display = jeSuisLeProprietaire() ? '' : 'none';
  }

  // ---------- La porte ----------

  function maLigne() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) return Promise.resolve(null);
    return client.from('commun_alalana').select('code,active').ilike('email', email)
      .then(function (res) {
        if (res.error) { dire('porteMessage', expliquer(res), true); return null; }
        return (res.data || [])[0] || null;
      }, function () { return null; });
  }

  function verifier() {
    // Le propriétaire n'a pas à se demander l'entrée à lui-même.
    if (jeSuisLeProprietaire()) { montrer(true); return Promise.resolve(true); }

    const client = sb();
    if (!client || !monEmail()) {
      montrer(false);
      dire('porteMessage', 'Midira amin\'ny kaontinao aloha.', true);
      return Promise.resolve(false);
    }
    return maLigne().then(function (ligne) {
      const garde = codeGarde();
      const ok = !!(ligne && ligne.active && garde && String(ligne.code).trim().toUpperCase() === garde);
      montrer(ok);
      if (!ok) {
        if (ligne && ligne.active && !garde) {
          dire('porteMessage', 'Efa nomena alalana ianao : soraty eto ambany ny code nomen\'ny tompon\'ny site.');
        } else if (ligne && !ligne.active) {
          dire('porteMessage', 'Nesorina ny alalanao. Mangataha indray raha ilaina.', true);
        }
        montrerMonStatut();
      }
      return ok;
    });
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
    const client = sb();
    const email = monEmail();
    if (!client || !email) { dire('porteMessage', 'Midira amin\'ny kaontinao aloha.', true); return; }
    dire('porteMessage', 'Mandefa ny fangatahana…');
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
      dire('porteMessage', '');
      montrer(true);
      // La vue ouverte doit se remplir : elle était cachée quand on l'a dressée.
      if (typeof choisirOngletCommun === 'function') choisirOngletCommun('tableau');
    });
  }

  $('porteMangataka').addEventListener('click', mangataka);
  $('porteSokafy').addEventListener('click', sokafana);

  // ---------- Le côté du propriétaire ----------

  function nouveauCode() {
    const octets = new Uint8Array(8);
    crypto.getRandomValues(octets);
    return Array.from(octets).map(function (b) { return ALPHABET[b % ALPHABET.length]; }).join('');
  }

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
      return '<tr>' +
        '<td style="white-space:nowrap;">' + dateFr(f.created_at) + '</td>' +
        '<td>' + echapper(f.anarana || '—') + '<div style="color:var(--muted); font-size:0.75rem;">' + echapper(f.email) + '</div></td>' +
        '<td style="color:var(--muted);">' + echapper(f.hafatra || '—') + '</td>' +
        '<td>' + echapper(STATUTS[f.statut] || f.statut) + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-primary btn-sm" data-ekena="' + echapper(f.id) + '">Omeo code</button> ' +
          '<button type="button" class="btn btn-red btn-sm" data-lavina="' + echapper(f.id) + '">Lavina</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    $('admFangatahanaVide').style.display = fangatahana.length ? 'none' : '';

    $('admAlalanaListe').innerHTML = alalana.map(function (a) {
      return '<tr>' +
        '<td>' + echapper(a.anarana || '—') + '<div style="color:var(--muted); font-size:0.75rem;">' + echapper(a.email) + '</div></td>' +
        '<td style="font-family:var(--font-mono); font-size:1rem; letter-spacing:0.12em;">' + echapper(a.code) + '</td>' +
        '<td>' + (a.active ? 'Misokatra' : 'Nesorina') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm" data-code-vaovao="' + echapper(a.id) + '">Code vaovao</button> ' +
          (a.active
            ? '<button type="button" class="btn btn-red btn-sm" data-esory="' + echapper(a.id) + '">Esorina</button>'
            : '<button type="button" class="btn btn-sm" data-averina="' + echapper(a.id) + '">Averina</button>') +
        '</td>' +
      '</tr>';
    }).join('');
    $('admAlalanaVide').style.display = alalana.length ? 'none' : '';
  }

  function accorder(id) {
    const client = sb();
    const f = fangatahana.filter(function (x) { return x.id === id; })[0];
    if (!client || !f) return;
    const code = nouveauCode();
    const email = String(f.email).trim().toLowerCase();
    const dejaLa = alalana.filter(function (a) { return String(a.email).toLowerCase() === email; })[0];
    dire('admMessage', 'Mamorona code…');

    const pose = dejaLa
      ? client.from('commun_alalana').update({ code: code, active: true, anarana: f.anarana || null, updated_at: new Date().toISOString() }).eq('id', dejaLa.id)
      : client.from('commun_alalana').insert({ email: email, anarana: f.anarana || null, code: code });

    pose.then(function (res) {
      if (res.error) { dire('admMessage', expliquer(res), true); return; }
      return client.from('commun_fangatahana').update({ statut: 'ekena', updated_at: new Date().toISOString() }).eq('id', f.id)
        .then(function () {
          // Le code s'affiche, il ne s'envoie pas : c'est au propriétaire de
          // le dire à la personne, de vive voix.
          dire('admMessage', 'Code ho an\'i ' + (f.anarana || f.email) + ' : ' + code + ' — lazao azy mivantana.');
          chargerAdmin();
        });
    }, function () {
      dire('admMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  function refuser(id) {
    const client = sb();
    if (!client) return;
    client.from('commun_fangatahana').update({ statut: 'lavina', updated_at: new Date().toISOString() }).eq('id', id)
      .then(function (res) {
        if (res.error) { dire('admMessage', expliquer(res), true); return; }
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
    if (ekena) accorder(ekena.dataset.ekena);
    else if (lavina) refuser(lavina.dataset.lavina);
  });

  $('admAlalanaListe').addEventListener('click', function (e) {
    const vaovao = e.target.closest('[data-code-vaovao]');
    const esory = e.target.closest('[data-esory]');
    const averina = e.target.closest('[data-averina]');
    if (vaovao) {
      const code = nouveauCode();
      changerAcces(vaovao.dataset.codeVaovao, { code: code, active: true }, 'Code vaovao : ' + code + ' — lazao azy mivantana.');
    } else if (esory) {
      changerAcces(esory.dataset.esory, { active: false }, 'Nesorina ny alalana.');
    } else if (averina) {
      changerAcces(averina.dataset.averina, { active: true }, 'Naverina ny alalana.');
    }
  });

  // Appelées par common.js.
  window.renderPorteCommun = verifier;
  window.renderFangatahana = function () {
    dire('admMessage', '');
    return chargerAdmin();
  };
})();
