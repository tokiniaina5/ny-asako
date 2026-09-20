// Livre de famille : le livret, et ceux qui y sont inscrits.
//
// Le livret ne tient pas une seconde liste de gens : ses membres sont ceux du
// registre des CIN / passeports (pieces-identite.js), rattachés par leur nom —
// comme les adidy et les taratasy le font déjà.
//
// Le mariage des parents est porté par le livret : c'est de lui que la famille
// date, et c'est ce qui sépare un livre de famille d'une simple liste.
//
// Tout vit dans Supabase (supabase/sql/supabase-fianakaviana.sql).

(function () {
  if (!document.getElementById('famListe')) return;

  function $(id) { return document.getElementById(id); }

  const ANDRAIKITRA = { ray: 'Ray', reny: 'Reny', zanaka: 'Zanaka', hafa: 'Hafa' };
  // L'ordre du livret : les parents d'abord, les enfants ensuite.
  const RANG = { ray: 0, reny: 1, zanaka: 2, hafa: 3 };

  let familles = [];
  let personnes = [];
  let mpikambana = [];
  let ouvert = null;      // le livret ouvert
  let enEdition = null;   // le livret qu'on corrige

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
  function cleOlona(nom) {
    return String(nom || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }
  function dateFr(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
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
      return 'Mbola tsy misy ny table « fianakaviana » ao amin\'ny Supabase (supabase-fianakaviana.sql).';
    }
    if (e.code === '23505') return 'Efa ao amin\'ity livre ity io olona io.';
    if (/row-level security/i.test(m)) return 'Nolavina : mivoaha dia midira indray.';
    return 'Tsy nety : ' + m;
  }

  // ---------- Les livrets ----------

  function charger() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) {
      familles = [];
      afficher();
      dire('famMessage', client ? 'Midira aloha.' : 'Tsy azo ampiasaina eto ity pejy ity.', true);
      return Promise.resolve();
    }
    return client.from('fianakaviana').select('*').eq('owner_email', email)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { dire('famMessage', expliquer(res), true); return; }
        familles = res.data || [];
        return chargerLesMembres().then(afficher);
      }, function () {
        dire('famMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
      });
  }

  // Tous les membres d'un coup : le tableau en compte le nombre par livret.
  function chargerLesMembres() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { mpikambana = []; return Promise.resolve(); }
    return client.from('fianakaviana_mpikambana').select('*').eq('owner_email', email)
      .then(function (res) { mpikambana = (res.error ? [] : (res.data || [])); },
        function () { mpikambana = []; });
  }

  function membresDe(id) {
    return mpikambana.filter(function (m) { return m.fianakaviana_id === id; })
      .sort(function (a, b) {
        const ra = RANG[a.andraikitra] === undefined ? 9 : RANG[a.andraikitra];
        const rb = RANG[b.andraikitra] === undefined ? 9 : RANG[b.andraikitra];
        if (ra !== rb) return ra - rb;
        return String(a.anarana).localeCompare(String(b.anarana), 'fr');
      });
  }

  function afficher() {
    $('famListe').innerHTML = familles.map(function (f) {
      const n = membresDe(f.id).length;
      const mariage = f.fanambadiana_daty
        ? dateFr(f.fanambadiana_daty) + (f.fanambadiana_toerana ? ' — ' + echapper(f.fanambadiana_toerana) : '')
        : '—';
      return '<tr>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + echapper(f.laharana || '—') + '</td>' +
        '<td>' + echapper(f.anarana) + '</td>' +
        '<td style="color:var(--muted);">' + echapper(f.fonenana || '—') + '</td>' +
        '<td style="white-space:nowrap;">' + mariage + '</td>' +
        '<td style="text-align:center;">' + n + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm" data-fam-sokafy="' + echapper(f.id) + '">📖 Sokafy</button> ' +
          '<button type="button" class="btn btn-sm" data-fam-ovay="' + echapper(f.id) + '">Ovaina</button> ' +
          '<button type="button" class="btn btn-red btn-sm" data-fam-fafao="' + echapper(f.id) + '">Fafana</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    $('famVide').style.display = familles.length ? 'none' : '';
    montrerLouvert();
  }

  function lireFormulaire() {
    return {
      laharana: $('famLaharana').value.trim() || null,
      anarana: $('famAnarana').value.trim(),
      fonenana: $('famFonenana').value.trim() || null,
      fanambadiana_daty: $('famDaty').value || null,
      fanambadiana_toerana: $('famToerana').value.trim() || null,
      fanamarihana: $('famNote').value.trim() || null
    };
  }

  function vider() {
    ['famLaharana', 'famAnarana', 'famFonenana', 'famDaty', 'famToerana', 'famNote']
      .forEach(function (id) { $(id).value = ''; });
    enEdition = null;
    $('famTehirizo').textContent = '💾 Tehirizo';
  }

  function enregistrer() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { dire('famMessage', 'Midira aloha.', true); return; }
    const f = lireFormulaire();
    if (!f.anarana) { dire('famMessage', 'Soraty ny anaran\'ny fianakaviana.', true); return; }
    dire('famMessage', 'Mitahiry…');
    const suite = enEdition
      ? client.from('fianakaviana').update(Object.assign({ updated_at: new Date().toISOString() }, f)).eq('id', enEdition)
      : client.from('fianakaviana').insert(Object.assign({ owner_email: email }, f));
    suite.then(function (res) {
      if (res.error) { dire('famMessage', expliquer(res), true); return; }
      dire('famMessage', enEdition ? 'Voaova.' : 'Voatahiry.');
      vider();
      charger();
    }, function () { dire('famMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true); });
  }

  function corriger(id) {
    const f = familles.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    enEdition = id;
    $('famLaharana').value = f.laharana || '';
    $('famAnarana').value = f.anarana || '';
    $('famFonenana').value = f.fonenana || '';
    $('famDaty').value = f.fanambadiana_daty ? String(f.fanambadiana_daty).slice(0, 10) : '';
    $('famToerana').value = f.fanambadiana_toerana || '';
    $('famNote').value = f.fanamarihana || '';
    $('famTehirizo').textContent = '💾 Tehirizo ny fanovana';
    dire('famMessage', 'Ovaina ny livre « ' + f.anarana + ' ».');
  }

  function supprimer(id) {
    const client = sb();
    const f = familles.filter(function (x) { return x.id === id; })[0];
    if (!client || !f) return;
    if (!window.confirm('Fafana ve ny livre de famille « ' + f.anarana + ' » sy ny mpianakavy voasoratra ao ?')) return;
    client.from('fianakaviana').delete().eq('id', id).then(function (res) {
      if (res.error) { dire('famMessage', expliquer(res), true); return; }
      if (ouvert === id) ouvert = null;
      dire('famMessage', 'Voafafa.');
      charger();
    }, function () { dire('famMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true); });
  }

  // ---------- Le livret ouvert, et ses membres ----------

  function montrerLouvert() {
    const boite = $('famOuvert');
    const f = familles.filter(function (x) { return x.id === ouvert; })[0];
    if (!f) { boite.style.display = 'none'; return; }
    boite.style.display = '';
    $('famOuvertTitre').textContent = '👪 ' + f.anarana + (f.laharana ? ' — ' + f.laharana : '');
    const liste = membresDe(f.id);
    $('famMpikambana').innerHTML = liste.map(function (m) {
      return '<tr>' +
        '<td>' + echapper(m.anarana) + '</td>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + echapper(m.laharana_cin || '—') + '</td>' +
        '<td>' + echapper(ANDRAIKITRA[m.andraikitra] || m.andraikitra) + '</td>' +
        '<td><button type="button" class="btn btn-red btn-sm" data-mp-fafao="' + echapper(m.id) + '">Esorina</button></td>' +
      '</tr>';
    }).join('');
    $('famMpikambanaVide').style.display = liste.length ? 'none' : '';
  }

  function chargerPersonnes() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { personnes = []; return Promise.resolve(); }
    return client.from('pieces_identite').select('anarana,laharana,karazana').eq('owner_email', email)
      .then(function (res) {
        if (res.error) { personnes = []; return; }
        const vues = {};
        (res.data || []).forEach(function (p) {
          const cle = cleOlona(p.anarana);
          if (!cle) return;
          // La CIN l'emporte sur le passeport : c'est elle qu'on porte sur un livret.
          if (!vues[cle] || (p.karazana === 'cin' && vues[cle].karazana !== 'cin')) {
            vues[cle] = { cle: cle, anarana: String(p.anarana).trim(), laharana: p.laharana || '', karazana: p.karazana };
          }
        });
        personnes = Object.keys(vues).map(function (c) { return vues[c]; })
          .sort(function (a, b) { return a.anarana.localeCompare(b.anarana, 'fr'); });
        remplirLeChoix();
      }, function () { personnes = []; });
  }

  function remplirLeChoix() {
    const choix = $('famOlona');
    const avant = choix.value;
    choix.innerHTML = '<option value="">— Safidio ny olona —</option>' + personnes.map(function (p) {
      return '<option value="' + echapper(p.cle) + '">' + echapper(p.anarana) + '</option>';
    }).join('');
    if (avant) choix.value = avant;
  }

  function ampio() {
    const client = sb();
    const email = monEmail();
    if (!client || !email || !ouvert) return;
    const p = personnes.filter(function (x) { return x.cle === $('famOlona').value; })[0];
    if (!p) { dire('famOuvertMessage', 'Safidio aloha ny olona.', true); return; }
    dire('famOuvertMessage', 'Mitahiry…');
    client.from('fianakaviana_mpikambana').insert({
      owner_email: email,
      fianakaviana_id: ouvert,
      anarana: p.anarana,
      laharana_cin: p.karazana === 'cin' ? (p.laharana || null) : null,
      andraikitra: $('famAndraikitra').value
    }).then(function (res) {
      if (res.error) { dire('famOuvertMessage', expliquer(res), true); return; }
      dire('famOuvertMessage', 'Voasoratra ao amin\'ny livre.');
      $('famOlona').value = '';
      charger();
    }, function () { dire('famOuvertMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true); });
  }

  function esorina(id) {
    const client = sb();
    const m = mpikambana.filter(function (x) { return x.id === id; })[0];
    if (!client || !m) return;
    if (!window.confirm('Esorina ao amin\'ny livre ve i ' + m.anarana + ' ?')) return;
    client.from('fianakaviana_mpikambana').delete().eq('id', id).then(function (res) {
      if (res.error) { dire('famOuvertMessage', expliquer(res), true); return; }
      dire('famOuvertMessage', 'Voaesotra.');
      charger();
    }, function () { dire('famOuvertMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true); });
  }

  // ---------- Les boutons ----------

  $('famTehirizo').addEventListener('click', enregistrer);
  $('famAnnuler').addEventListener('click', function () { vider(); dire('famMessage', ''); });
  $('famAmpio').addEventListener('click', ampio);
  $('famListe').addEventListener('click', function (e) {
    const sokafy = e.target.closest('[data-fam-sokafy]');
    const ovay = e.target.closest('[data-fam-ovay]');
    const fafao = e.target.closest('[data-fam-fafao]');
    if (sokafy) {
      ouvert = ouvert === sokafy.dataset.famSokafy ? null : sokafy.dataset.famSokafy;
      dire('famOuvertMessage', '');
      montrerLouvert();
    } else if (ovay) corriger(ovay.dataset.famOvay);
    else if (fafao) supprimer(fafao.dataset.famFafao);
  });
  $('famMpikambana').addEventListener('click', function (e) {
    const fafao = e.target.closest('[data-mp-fafao]');
    if (fafao) esorina(fafao.dataset.mpFafao);
  });

  // Appelée quand l'onglet s'ouvre (common.js, fokontany-app.js).
  window.renderFianakaviana = function () {
    dire('famMessage', '');
    return Promise.all([charger(), chargerPersonnes()]);
  };
})();
