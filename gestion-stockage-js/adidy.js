// Adidy : ce que chacun doit, et ce que chacun a versé.
//
// Deux choses, et non une : la cotisation (son nom, son montant, et si elle
// revient chaque mois ou chaque année), puis les versements — qui a payé,
// pour quelle période.
//
// Les personnes viennent du registre des CIN / passeports : on ne tient pas
// deux listes de gens, elles finiraient par ne plus se ressembler. Une
// personne qui a une CIN et un passeport n'y paraît qu'une fois, par son nom.
//
// Tout vit dans Supabase (supabase/sql/supabase-adidy.sql).

(function () {
  if (!document.getElementById('adidyListe')) return;

  function $(id) { return document.getElementById(id); }

  let adidy = [];
  let personnes = [];
  let versements = [];
  let enEdition = null;
  let chargees = false;

  function sb() {
    if (typeof MODE_MPIASA !== 'undefined' && MODE_MPIASA) return null;
    return window.__sb || null;
  }
  function monEmail() {
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    return (u && u.email) ? String(u.email).trim().toLowerCase() : '';
  }
  function echapper(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function ariary(n) {
    const v = Number(n);
    return (isFinite(v) ? v.toLocaleString('fr-FR') : '0') + ' Ar';
  }
  function cleOlona(nom) {
    return String(nom || '').trim().toLowerCase().replace(/\s+/g, ' ');
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
      return 'Mbola tsy misy ny table « adidy » ao amin\'ny Supabase.';
    }
    if (e.code === '23505') return 'Efa voasoratra io fandoavana io.';
    if (/row-level security/i.test(m)) return 'Nolavina : mivoaha dia midira indray.';
    return 'Tsy nety : ' + m;
  }

  // ---------- Les périodes ----------
  // '2026-09' pour un mois, '2026' pour une année : la clé dit d'elle-même
  // de quelle sorte de cotisation elle parle.
  function moisCourant() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function periodeChoisie() {
    return feChoisie() === 'taona' ? String($('adidyTaona').value || '') : String($('adidyVolana').value || '');
  }
  function feChoisie() {
    const choisie = adidy.filter(function (a) { return a.id === $('adidySafidy').value; })[0];
    return choisie ? choisie.fe_potoana : 'volana';
  }
  function ajusterPeriode() {
    const taona = feChoisie() === 'taona';
    $('adidyVolanaChamp').style.display = taona ? 'none' : '';
    $('adidyTaonaChamp').style.display = taona ? '' : 'none';
  }

  // ---------- La liste des cotisations ----------

  function chargerAdidy() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) {
      adidy = [];
      afficherAdidy();
      dire('adidyMessage', client ? 'Midira aloha.' : 'Tsy azo ampiasaina eto ity pejy ity.', true);
      return Promise.resolve();
    }
    return client.from('adidy').select('*').eq('owner_email', email).order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) { dire('adidyMessage', expliquer(res), true); return; }
        adidy = res.data || [];
        afficherAdidy();
        remplirLeChoix();
      }, function () {
        dire('adidyMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
      });
  }

  function afficherAdidy() {
    const corps = $('adidyListe');
    corps.innerHTML = adidy.map(function (a) {
      return '<tr>' +
        '<td>' + echapper(a.anarana) + '</td>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + (a.vidiny == null ? '—' : ariary(a.vidiny)) + '</td>' +
        '<td>' + (a.fe_potoana === 'taona' ? 'Isan-taona' : 'Isam-bolana') + '</td>' +
        '<td style="color:var(--muted);">' + echapper(a.fanamarihana || '—') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm" data-adidy-ovay="' + echapper(a.id) + '">Ovaina</button> ' +
          '<button type="button" class="btn btn-red btn-sm" data-adidy-fafao="' + echapper(a.id) + '">Fafana</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    $('adidyVide').style.display = adidy.length ? 'none' : '';
  }

  function remplirLeChoix() {
    const choix = $('adidySafidy');
    const avant = choix.value;
    choix.innerHTML = adidy.map(function (a) {
      return '<option value="' + echapper(a.id) + '">' + echapper(a.anarana) +
        ' — ' + (a.fe_potoana === 'taona' ? 'isan-taona' : 'isam-bolana') + '</option>';
    }).join('');
    if (avant && adidy.some(function (a) { return a.id === avant; })) choix.value = avant;
    ajusterPeriode();
  }

  function viderFormulaire() {
    enEdition = null;
    $('adidyAnarana').value = '';
    $('adidyVidiny').value = '';
    $('adidyFe').value = 'volana';
    $('adidyNote').value = '';
    $('adidyAjouter').textContent = '＋ Ajouter';
    $('adidyAnnuler').style.display = 'none';
  }

  function enregistrerAdidy() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { dire('adidyMessage', 'Midira aloha.', true); return; }
    const anarana = $('adidyAnarana').value.trim();
    if (!anarana) { dire('adidyMessage', 'Soraty ny anaran\'ny adidy.', true); return; }
    const brut = $('adidyVidiny').value.trim();
    if (brut && !(Number(brut) >= 0)) { dire('adidyMessage', 'Tsy mety ny vidiny.', true); return; }

    const ligne = {
      anarana: anarana,
      vidiny: brut === '' ? null : Number(brut),
      fe_potoana: $('adidyFe').value === 'taona' ? 'taona' : 'volana',
      fanamarihana: $('adidyNote').value.trim() || null,
      updated_at: new Date().toISOString()
    };
    const correction = !!enEdition;
    const requete = correction
      ? client.from('adidy').update(ligne).eq('id', enEdition)
      : client.from('adidy').insert(Object.assign({ owner_email: email }, ligne));

    dire('adidyMessage', 'Mitahiry…');
    requete.then(function (res) {
      if (res.error) { dire('adidyMessage', expliquer(res), true); return; }
      viderFormulaire();
      dire('adidyMessage', correction ? 'Voaova.' : 'Voatahiry.');
      chargerAdidy().then(chargerVersements);
    }, function () {
      dire('adidyMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  function corriger(id) {
    const a = adidy.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    enEdition = a.id;
    $('adidyAnarana').value = a.anarana || '';
    $('adidyVidiny').value = a.vidiny == null ? '' : a.vidiny;
    $('adidyFe').value = a.fe_potoana === 'taona' ? 'taona' : 'volana';
    $('adidyNote').value = a.fanamarihana || '';
    $('adidyAjouter').textContent = 'Enregistrer les modifications';
    $('adidyAnnuler').style.display = '';
    dire('adidyMessage', '');
    $('adidyAnarana').focus();
  }

  function supprimerAdidy(id) {
    const client = sb();
    const a = adidy.filter(function (x) { return x.id === id; })[0];
    if (!client || !a) return;
    // Les versements partent avec elle (on delete cascade) : le dire avant,
    // et non après.
    if (!window.confirm('Fafana ve ny adidy « ' + a.anarana + ' » ? Ho fafana koa ireo fandoavana rehetra momba azy.')) return;
    client.from('adidy').delete().eq('id', id).then(function (res) {
      if (res.error) { dire('adidyMessage', expliquer(res), true); return; }
      if (enEdition === id) viderFormulaire();
      dire('adidyMessage', 'Voafafa.');
      chargerAdidy().then(chargerVersements);
    }, function () {
      dire('adidyMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  // ---------- Les personnes, prises au registre ----------

  function chargerPersonnes() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { personnes = []; return Promise.resolve(); }
    return client.from('pieces_identite').select('anarana').eq('owner_email', email)
      .then(function (res) {
        if (res.error) { personnes = []; return; }
        const vues = {};
        (res.data || []).forEach(function (p) {
          const cle = cleOlona(p.anarana);
          if (cle && !vues[cle]) vues[cle] = { cle: cle, anarana: String(p.anarana).trim() };
        });
        personnes = Object.keys(vues).map(function (c) { return vues[c]; })
          .sort(function (a, b) { return a.anarana.localeCompare(b.anarana, 'fr'); });
      }, function () { personnes = []; });
  }

  // ---------- Les versements ----------

  function chargerVersements() {
    const client = sb();
    const email = monEmail();
    const adidyId = $('adidySafidy').value;
    const periode = periodeChoisie();
    if (!client || !email || !adidyId || !periode) { versements = []; afficherPersonnes(); return Promise.resolve(); }
    return client.from('adidy_fandoavana').select('*')
      .eq('owner_email', email).eq('adidy_id', adidyId).eq('vanim_potoana', periode)
      .then(function (res) {
        if (res.error) { dire('adidyFandoavanaMessage', expliquer(res), true); return; }
        versements = res.data || [];
        dire('adidyFandoavanaMessage', '');
        afficherPersonnes();
      }, function () {
        dire('adidyFandoavanaMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
      });
  }

  function verseDe(cle) {
    return versements.filter(function (v) { return v.olona === cle; })[0] || null;
  }

  function afficherPersonnes() {
    const corps = $('adidyOlonaListe');
    const choisie = adidy.filter(function (a) { return a.id === $('adidySafidy').value; })[0];
    corps.innerHTML = personnes.map(function (p) {
      const v = verseDe(p.cle);
      return '<tr>' +
        '<td>' + echapper(p.anarana) + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer;">' +
            '<input type="checkbox" data-olona="' + echapper(p.cle) + '"' + (v ? ' checked' : '') + '> ' +
            (v ? 'Naloha' : 'Tsy mbola') +
          '</label>' +
        '</td>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + (v && v.vola != null ? ariary(v.vola) : '—') + '</td>' +
        '<td style="color:var(--muted); white-space:nowrap;">' + (v && v.daty ? new Date(v.daty + 'T00:00:00').toLocaleDateString('fr-FR') : '—') + '</td>' +
      '</tr>';
    }).join('');

    $('adidyOlonaVide').style.display = personnes.length ? 'none' : '';
    const naloha = personnes.filter(function (p) { return !!verseDe(p.cle); }).length;
    const recolte = versements.reduce(function (s, v) { return s + Number(v.vola || 0); }, 0);
    const attendu = (choisie && choisie.vidiny != null) ? Number(choisie.vidiny) * personnes.length : null;
    $('adidyRecap').textContent = personnes.length
      ? naloha + ' / ' + personnes.length + ' naloha · Vola voaangona : ' + ariary(recolte) +
        (attendu != null ? ' / ' + ariary(attendu) : '')
      : '';
  }

  function basculer(cle, coché) {
    const client = sb();
    const email = monEmail();
    const adidyId = $('adidySafidy').value;
    const periode = periodeChoisie();
    const personne = personnes.filter(function (p) { return p.cle === cle; })[0];
    if (!client || !email || !adidyId || !periode || !personne) return;
    const choisie = adidy.filter(function (a) { return a.id === adidyId; })[0];
    const dejaLa = verseDe(cle);

    if (coché && !dejaLa) {
      client.from('adidy_fandoavana').insert({
        owner_email: email,
        adidy_id: adidyId,
        olona: cle,
        anarana: personne.anarana,
        vanim_potoana: periode,
        vola: choisie && choisie.vidiny != null ? choisie.vidiny : null
      }).then(function (res) {
        if (res.error) { dire('adidyFandoavanaMessage', expliquer(res), true); }
        chargerVersements();
      }, function () { dire('adidyFandoavanaMessage', 'Tsy tratra ny serveur.', true); });
      return;
    }
    if (!coché && dejaLa) {
      client.from('adidy_fandoavana').delete().eq('id', dejaLa.id).then(function (res) {
        if (res.error) { dire('adidyFandoavanaMessage', expliquer(res), true); }
        chargerVersements();
      }, function () { dire('adidyFandoavanaMessage', 'Tsy tratra ny serveur.', true); });
    }
  }

  // ---------- Les boutons ----------

  $('adidyAjouter').addEventListener('click', enregistrerAdidy);
  $('adidyAnnuler').addEventListener('click', function () { viderFormulaire(); dire('adidyMessage', ''); });
  $('adidyListe').addEventListener('click', function (e) {
    const ovay = e.target.closest('[data-adidy-ovay]');
    const fafao = e.target.closest('[data-adidy-fafao]');
    if (ovay) corriger(ovay.dataset.adidyOvay);
    else if (fafao) supprimerAdidy(fafao.dataset.adidyFafao);
  });
  $('adidySafidy').addEventListener('change', function () { ajusterPeriode(); chargerVersements(); });
  $('adidyVolana').addEventListener('change', chargerVersements);
  $('adidyTaona').addEventListener('change', chargerVersements);
  $('adidyOlonaListe').addEventListener('change', function (e) {
    const case_ = e.target.closest('input[data-olona]');
    if (case_) basculer(case_.dataset.olona, case_.checked);
  });

  // Appelée par common.js quand l'onglet s'ouvre.
  window.renderAdidy = function () {
    if (!chargees) {
      $('adidyVolana').value = moisCourant();
      $('adidyTaona').value = new Date().getFullYear();
      chargees = true;
    }
    dire('adidyMessage', '');
    return Promise.all([chargerAdidy(), chargerPersonnes()]).then(chargerVersements);
  };
})();
