// Taratasy : fanamarinam-ponenana, sy fanamarinana fifindra-monina.
//
// Le papier se prépare ici, il ne s'y délivre pas : il ne vaut que signé et
// cacheté par l'autorité compétente. Ce que cette page fait, c'est écrire
// sans faute ce qui doit y figurer, garder ce qui a été remis, et pouvoir le
// réimprimer à l'identique.
//
// Les personnes viennent du registre des CIN / passeports : on ne tient pas
// deux listes de gens (pieces-identite.js).
//
// Tout vit dans Supabase (supabase/sql/supabase-taratasy.sql).

(function () {
  if (!document.getElementById('tarListe')) return;

  function $(id) { return document.getElementById(id); }

  const TITRES = {
    fonenana: 'FANAMARINAM-PONENANA',
    fifindramonina: 'FANAMARINANA FIFINDRA-MONINA'
  };
  const NOMS = {
    fonenana: 'Fanamarinam-ponenana',
    fifindramonina: 'Fifindra-monina'
  };

  let taratasy = [];
  let personnes = [];

  function sb() {
    if (typeof MODE_MPIASA !== 'undefined' && MODE_MPIASA) return null;
    return window.__sb || null;
  }
  function monEmail() {
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    return (u && u.email) ? String(u.email).trim().toLowerCase() : '';
  }
  function moi() {
    return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : {};
  }
  function echapper(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function dateFr(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
  }
  function aujourdhui() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dire(texte, erreur) {
    const el = $('tarMessage');
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--cyan)';
  }
  function expliquer(res) {
    const e = res && res.error;
    if (!e) return '';
    const m = String(e.message || '');
    if (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(m)) {
      return 'Mbola tsy misy ny table « taratasy » ao amin\'ny Supabase.';
    }
    if (/row-level security/i.test(m)) return 'Nolavina : mivoaha dia midira indray.';
    return 'Tsy nety : ' + m;
  }

  // ---------- Ce que le formulaire montre ----------

  function karazanaChoisie() {
    return $('tarKarazana').value === 'fifindramonina' ? 'fifindramonina' : 'fonenana';
  }
  function ajusterChamps() {
    const depart = karazanaChoisie() === 'fifindramonina';
    $('tarFonenanaChamp').style.display = depart ? 'none' : '';
    $('tarTalohaChamp').style.display = depart ? '' : 'none';
    $('tarVaovaoChamp').style.display = depart ? '' : 'none';
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
          const cle = String(p.anarana || '').trim().toLowerCase().replace(/\s+/g, ' ');
          if (!cle) return;
          // La CIN l'emporte sur le passeport : c'est elle qu'on porte sur un
          // papier de résidence.
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
    const choix = $('tarOlona');
    const avant = choix.value;
    choix.innerHTML = '<option value="">— Safidio ny olona —</option>' + personnes.map(function (p) {
      return '<option value="' + echapper(p.cle) + '">' + echapper(p.anarana) + '</option>';
    }).join('');
    if (avant) choix.value = avant;
  }

  function prendreLaPersonne() {
    const p = personnes.filter(function (x) { return x.cle === $('tarOlona').value; })[0];
    if (!p) return;
    $('tarAnarana').value = p.anarana;
    if (p.karazana === 'cin') $('tarCin').value = p.laharana || '';
  }

  // ---------- Le papier ----------

  function laharanaSuivant() {
    const annee = new Date().getFullYear();
    const dejaCetteAnnee = taratasy.filter(function (t) {
      return String(t.daty || '').slice(0, 4) === String(annee);
    }).length;
    return 'TAR-' + annee + '-' + String(dejaCetteAnnee + 1).padStart(3, '0');
  }

  function lireFormulaire() {
    return {
      karazana: karazanaChoisie(),
      laharana: $('tarLaharana').value.trim() || laharanaSuivant(),
      anarana: $('tarAnarana').value.trim(),
      laharana_cin: $('tarCin').value.trim() || null,
      teraka_daty: $('tarTerakaDaty').value || null,
      teraka_toerana: $('tarTerakaToerana').value.trim() || null,
      fonenana: $('tarFonenana').value.trim() || null,
      fonenana_taloha: $('tarTaloha').value.trim() || null,
      fonenana_vaovao: $('tarVaovao').value.trim() || null,
      daty: $('tarDaty').value || aujourdhui(),
      fanamarihana: $('tarNote').value.trim() || null
    };
  }

  // Le texte du papier, ligne à ligne. Écrit ici et non dans le PDF : le même
  // texte sert à l'aperçu comme à l'impression.
  function corpsDuTexte(t) {
    const nom = t.anarana || '—';
    const cin = t.laharana_cin ? ', manana karapanondrom-pirenena laharana ' + t.laharana_cin : '';
    const teraka = t.teraka_daty
      ? ', teraka ny ' + dateFr(t.teraka_daty) + (t.teraka_toerana ? ' tao ' + t.teraka_toerana : '')
      : (t.teraka_toerana ? ', teraka tao ' + t.teraka_toerana : '');

    if (t.karazana === 'fifindramonina') {
      return [
        'Izaho manao sonia eto ambany dia manamarina fa ' + nom + teraka + cin + ',',
        'dia nifindra monina avy tao ' + (t.fonenana_taloha || '—') + ' ho ao ' + (t.fonenana_vaovao || '—') + '.',
        '',
        'Natao ity taratasy ity mba hanamarinana izany, ary hampiasainy amin\'izay ilana azy.'
      ];
    }
    return [
      'Izaho manao sonia eto ambany dia manamarina fa ' + nom + teraka + cin + ',',
      'dia tena monina ao ' + (t.fonenana || '—') + '.',
      '',
      'Natao ity taratasy ity mba hanamarinana izany, ary hampiasainy amin\'izay ilana azy.'
    ];
  }

  function fabriquerPdf(t) {
    if (!window.jspdf) { dire('Tsy tafiditra ny bibliotheka PDF.', true); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const marge = 20;
    const largeur = 210 - marge * 2;
    const u = moi();

    // L'en-tête : qui délivre. Le nom de la boutique, ou celui du compte.
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(String(u.company || u.name || ''), marge, 22);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    if (u.phone) doc.text(String(u.phone), marge, 28);
    if (u.email) doc.text(String(u.email), marge, 33);

    doc.setFontSize(9);
    doc.text('Laharana : ' + (t.laharana || '—'), 210 - marge, 22, { align: 'right' });
    doc.text('Daty : ' + dateFr(t.daty), 210 - marge, 28, { align: 'right' });

    doc.setLineWidth(0.4);
    doc.line(marge, 40, 210 - marge, 40);

    doc.setFontSize(17);
    doc.setFont(undefined, 'bold');
    doc.text(TITRES[t.karazana], 105, 56, { align: 'center' });

    doc.setFont(undefined, 'normal');
    doc.setFontSize(11.5);
    let y = 76;
    corpsDuTexte(t).forEach(function (ligne) {
      if (!ligne) { y += 6; return; }
      doc.splitTextToSize(ligne, largeur).forEach(function (bout) {
        doc.text(bout, marge, y);
        y += 7;
      });
    });

    if (t.fanamarihana) {
      y += 4;
      doc.setFontSize(10);
      doc.splitTextToSize('Fanamarihana : ' + t.fanamarihana, largeur).forEach(function (bout) {
        doc.text(bout, marge, y);
        y += 6;
      });
      doc.setFontSize(11.5);
    }

    // La place de la signature et du cachet : le papier ne vaut que par eux.
    const bas = Math.max(y + 24, 210);
    doc.setFontSize(10);
    doc.text('Natao ny ' + dateFr(t.daty), 210 - marge, bas, { align: 'right' });
    doc.text('Sonia sy kase', 210 - marge, bas + 8, { align: 'right' });
    doc.setLineWidth(0.2);
    doc.line(210 - marge - 60, bas + 30, 210 - marge, bas + 30);

    const nomFichier = (NOMS[t.karazana] + '-' + (t.anarana || '') + '-' + (t.laharana || ''))
      .replace(/[^A-Za-z0-9\-]+/g, '-') + '.pdf';
    doc.save(nomFichier);
  }

  // ---------- La liste ----------

  function charger() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) {
      taratasy = [];
      afficher();
      dire(client ? 'Midira aloha.' : 'Tsy azo ampiasaina eto ity pejy ity.', true);
      return Promise.resolve();
    }
    return client.from('taratasy').select('*').eq('owner_email', email).order('daty', { ascending: false })
      .then(function (res) {
        if (res.error) { dire(expliquer(res), true); return; }
        taratasy = res.data || [];
        afficher();
      }, function () {
        dire('Tsy tratra ny serveur : jereo ny réseau.', true);
      });
  }

  function afficher() {
    $('tarListe').innerHTML = taratasy.map(function (t) {
      return '<tr>' +
        '<td style="white-space:nowrap;">' + dateFr(t.daty) + '</td>' +
        '<td>' + echapper(NOMS[t.karazana] || t.karazana) + '</td>' +
        '<td>' + echapper(t.anarana) + '</td>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + echapper(t.laharana || '—') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm" data-tar-pdf="' + echapper(t.id) + '">PDF</button> ' +
          '<button type="button" class="btn btn-red btn-sm" data-tar-fafao="' + echapper(t.id) + '">Fafana</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    $('tarVide').style.display = taratasy.length ? 'none' : '';
    if (!$('tarLaharana').value) $('tarLaharana').placeholder = laharanaSuivant();
  }

  function vider() {
    ['tarAnarana', 'tarCin', 'tarTerakaDaty', 'tarTerakaToerana', 'tarFonenana', 'tarTaloha', 'tarVaovao', 'tarLaharana', 'tarNote']
      .forEach(function (id) { $(id).value = ''; });
    $('tarOlona').value = '';
    $('tarDaty').value = aujourdhui();
    afficher();
  }

  function delivrer() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { dire('Midira aloha.', true); return; }
    const t = lireFormulaire();
    if (!t.anarana) { dire('Soraty ny anaran\'ilay olona.', true); return; }
    if (t.karazana === 'fifindramonina') {
      if (!t.fonenana_taloha || !t.fonenana_vaovao) { dire('Soraty ny fonenana taloha sy ny vaovao.', true); return; }
    } else if (!t.fonenana) {
      dire('Soraty ny fonenana.', true); return;
    }

    dire('Mitahiry…');
    client.from('taratasy').insert(Object.assign({ owner_email: email }, t)).then(function (res) {
      if (res.error) { dire(expliquer(res), true); return; }
      // Le PDF part du formulaire et non de la ligne relue : la personne
      // l'attend maintenant, et non après un aller-retour au serveur.
      fabriquerPdf(t);
      dire('Vita ny taratasy, ary voatahiry.');
      vider();
      charger();
    }, function () {
      dire('Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  function supprimer(id) {
    const client = sb();
    const t = taratasy.filter(function (x) { return x.id === id; })[0];
    if (!client || !t) return;
    if (!window.confirm('Fafana ve ny taratasin\'i ' + t.anarana + ' (' + (t.laharana || '—') + ') ?')) return;
    client.from('taratasy').delete().eq('id', id).then(function (res) {
      if (res.error) { dire(expliquer(res), true); return; }
      dire('Voafafa.');
      charger();
    }, function () {
      dire('Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  // ---------- Les boutons ----------

  $('tarKarazana').addEventListener('change', ajusterChamps);
  $('tarOlona').addEventListener('change', prendreLaPersonne);
  $('tarVokatra').addEventListener('click', delivrer);
  $('tarListe').addEventListener('click', function (e) {
    const pdf = e.target.closest('[data-tar-pdf]');
    const fafao = e.target.closest('[data-tar-fafao]');
    if (pdf) {
      const t = taratasy.filter(function (x) { return x.id === pdf.dataset.tarPdf; })[0];
      if (t) fabriquerPdf(t);
    } else if (fafao) {
      supprimer(fafao.dataset.tarFafao);
    }
  });

  window.renderTaratasy = function () {
    dire('');
    ajusterChamps();
    if (!$('tarDaty').value) $('tarDaty').value = aujourdhui();
    return Promise.all([charger(), chargerPersonnes()]);
  };
})();
