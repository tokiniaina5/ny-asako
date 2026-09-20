// ============================================================
// Partager une annonce à tous les clients, et non cinq par cinq
//
// La feuille de partage du téléphone ouvre WhatsApp, et WhatsApp décide
// ensuite : sa fenêtre « Envoyer à » coche les destinataires un par un et en
// limite le nombre. Cette fenêtre-là ne nous appartient pas — aucun code du
// site ne la commande, et rien ici ne peut y ajouter un « tout cocher ».
//
// Ce qui nous appartient, c'est la liste : les clients inscrits (table
// client_signups) avec leur numéro. On la montre entière, on coche tout d'un
// bouton, sans plafond, puis on ouvre la conversation de chacun avec le
// message déjà écrit. Il reste à appuyer sur « Envoyer » dans WhatsApp —
// envoyer à la place de quelqu'un ne se fait pas depuis une page web.
//
// Une ouverture par appui : le navigateur bloque les fenêtres qu'on ouvre
// sans que la main l'ait demandé. D'où la file, un client à la fois.
//
// wa.me ne porte que du texte. Une annonce avec photo part donc sans sa
// photo ; le lien, lui, la montre. C'est écrit dans la fenêtre pour qu'on ne
// le découvre pas après coup.
// ============================================================
(function () {
  'use strict';

  function echap(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // wa.me n'accepte qu'un numéro international. « 0343705834 » devient
  // « 261343705834 » (contact.js fait de même).
  function numeroInternational(brut) {
    var d = String(brut || '').replace(/[^\d]/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.length === 10 && d.charAt(0) === '0') d = '261' + d.slice(1);
    return d;
  }

  function lireLesClients() {
    var sb = window.__sb;
    if (!sb) return Promise.resolve([]);
    return sb.from('client_signups').select('name,email,phone,created_at')
      .order('created_at', { ascending: false })
      .then(function (res) {
        var lignes = (res && !res.error && res.data) || [];
        // Un même numéro inscrit deux fois ne fait qu'un destinataire : on
        // garde le plus récent, qui porte le nom le plus à jour.
        var vus = {};
        var gardes = [];
        lignes.forEach(function (c) {
          var num = numeroInternational(c.phone);
          if (!num || vus[num]) return;
          vus[num] = 1;
          gardes.push({ nom: String(c.name || '').trim() || c.email || num, numero: num });
        });
        return gardes;
      }, function () { return []; });
  }

  window.__zaraoAminyRehetra = function (opts) {
    var texte = String((opts && opts.texte) || '').trim();
    var rohy = String((opts && opts.rohy) || '').trim();
    var hafatra = (texte + (rohy ? '\n' + rohy : '')).trim();

    var ancien = document.getElementById('zaraRehetra');
    if (ancien) ancien.remove();

    var page = document.createElement('div');
    page.id = 'zaraRehetra';
    page.setAttribute('role', 'dialog');
    page.style.cssText = 'position:fixed; inset:0; z-index:9400; background:var(--bg); color:var(--text); overflow-y:auto;';
    page.innerHTML =
      '<div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; ' +
        'padding:0.9rem 1rem; border-bottom:1px solid var(--line); background:var(--panel); position:sticky; top:0;">' +
        '<strong style="font-size:0.95rem;">📢 Zarao amin\'ny client rehetra</strong>' +
        '<button type="button" class="btn btn-sm" data-hidio style="width:auto;">Hanafoana</button>' +
      '</div>' +
      '<div style="max-width:760px; margin:0 auto; padding:1.2rem 16px 3rem;">' +
        '<div class="panel">' +
          '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.9rem;">' +
            'Ireto ny client rehetra manana nomerao. Marika izay tianao — <strong style="color:var(--text);">tsy misy fetra ny isa</strong> — ' +
            'dia hisokatra tsirairay ny resaka ao amin\'ny WhatsApp, feno ny hafatra. Ianao no manindry « Envoyer » ao.' +
          '</p>' +
          '<p style="font-size:0.74rem; color:var(--muted); line-height:1.5; margin:0 0 0.9rem;">' +
            '⚠️ Ny sary tsy mandeha amin\'ity lalana ity : ny lahatsoratra sy ny rohy ihany. Ny rohy no mampiseho ny sary.' +
          '</p>' +
          '<div class="field">' +
            '<label for="zrSivana">Tadiavo</label>' +
            '<input type="text" id="zrSivana" data-sivana placeholder="Anarana na nomerao" autocomplete="off">' +
          '</div>' +
          '<div style="display:flex; align-items:center; justify-content:space-between; gap:0.8rem; flex-wrap:wrap; ' +
            'padding:0.5rem 0; border-bottom:1px solid var(--line); margin-bottom:0.4rem;">' +
            '<label style="display:flex; align-items:center; gap:0.5rem; font-size:0.84rem; cursor:pointer;">' +
              '<input type="checkbox" data-daholo> <strong>Marika daholo</strong></label>' +
            '<span data-isa style="font-size:0.78rem; color:var(--muted);"></span>' +
          '</div>' +
          '<div data-liste style="max-height:46vh; overflow-y:auto;"></div>' +
          '<p class="empty-hint" data-vide style="display:none;">Mbola tsy misy client manana nomerao.</p>' +
          '<button type="button" class="btn btn-primary" data-alefa style="margin-top:0.9rem;">📨 Alefa</button>' +
        '</div>' +
        // La file : un client à la fois, un appui par conversation.
        '<div class="panel" data-file style="display:none;">' +
          '<h3 data-file-titre>Fandefasana</h3>' +
          '<p data-file-qui style="font-size:0.9rem; margin:0 0 0.9rem;"></p>' +
          '<div style="display:flex; gap:0.6rem; flex-wrap:wrap;">' +
            '<button type="button" class="btn btn-primary btn-sm" data-sokafy style="width:auto;">📨 Sokafy ny WhatsApp</button>' +
            '<button type="button" class="btn btn-sm" data-dingana style="width:auto;">⏭ Dinganina</button>' +
            '<button type="button" class="btn btn-sm" data-ajanona style="width:auto;">✖ Ajanony</button>' +
          '</div>' +
          '<p data-file-vita style="font-size:0.78rem; color:var(--muted); margin:0.9rem 0 0;"></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(page);

    var fermer = function () { page.remove(); };
    page.querySelector('[data-hidio]').addEventListener('click', fermer);

    var boite = page.querySelector('[data-liste]');
    var vide = page.querySelector('[data-vide]');
    var isa = page.querySelector('[data-isa]');
    var daholo = page.querySelector('[data-daholo]');
    var sivana = page.querySelector('[data-sivana]');
    var clients = [];

    function visibles() {
      var q = String(sivana.value || '').trim().toLowerCase();
      return clients.filter(function (c) {
        if (!q) return true;
        return (c.nom + ' ' + c.numero).toLowerCase().indexOf(q) >= 0;
      });
    }
    function coches() {
      return clients.filter(function (c) { return c.coche; });
    }
    function direLIsa() {
      isa.textContent = coches().length + ' / ' + clients.length + ' voamarika';
      var vus = visibles();
      daholo.checked = vus.length > 0 && vus.every(function (c) { return c.coche; });
    }
    function dessiner() {
      var vus = visibles();
      boite.innerHTML = vus.map(function (c, i) {
        return '<label class="list-row" style="cursor:pointer;">' +
          '<span style="display:flex; align-items:center; gap:0.6rem;">' +
            '<input type="checkbox" data-i="' + clients.indexOf(c) + '"' + (c.coche ? ' checked' : '') + '>' +
            '<span>' + echap(c.nom) + '</span></span>' +
          '<span style="color:var(--muted); white-space:nowrap;">+' + echap(c.numero) + '</span>' +
        '</label>';
      }).join('');
      boite.querySelectorAll('input[type="checkbox"]').forEach(function (b) {
        b.addEventListener('change', function () {
          clients[Number(b.dataset.i)].coche = b.checked;
          direLIsa();
        });
      });
      direLIsa();
    }

    // « Marika daholo » ne coche que ce qu'on voit : une recherche en cours,
    // cocher tout le carnet à son insu serait une mauvaise surprise.
    daholo.addEventListener('change', function () {
      var vus = visibles();
      vus.forEach(function (c) { c.coche = daholo.checked; });
      dessiner();
    });
    sivana.addEventListener('input', dessiner);

    lireLesClients().then(function (liste) {
      clients = liste.map(function (c) { c.coche = true; return c; });
      vide.style.display = clients.length ? 'none' : '';
      dessiner();
    });

    // ---------- La file ----------
    var file = page.querySelector('[data-file]');
    var fileTitre = page.querySelector('[data-file-titre]');
    var fileQui = page.querySelector('[data-file-qui]');
    var fileVita = page.querySelector('[data-file-vita]');
    var attente = [];
    var rang = 0;
    var nalefa = 0;

    function montrerLeRang() {
      if (rang >= attente.length) {
        fileTitre.textContent = '✓ Vita';
        fileQui.textContent = nalefa + ' resaka nosokafana amin\'ny ' + attente.length + '.';
        page.querySelector('[data-sokafy]').style.display = 'none';
        page.querySelector('[data-dingana]').style.display = 'none';
        page.querySelector('[data-ajanona]').textContent = 'Hidio';
        return;
      }
      var c = attente[rang];
      fileTitre.textContent = 'Fandefasana ' + (rang + 1) + ' / ' + attente.length;
      fileQui.innerHTML = '<strong>' + echap(c.nom) + '</strong> · +' + echap(c.numero);
      fileVita.textContent = nalefa ? nalefa + ' efa nosokafana.' : '';
    }

    page.querySelector('[data-alefa]').addEventListener('click', function () {
      attente = coches();
      if (!attente.length) { alert('Tsy misy voamarika.'); return; }
      rang = 0;
      nalefa = 0;
      file.style.display = '';
      montrerLeRang();
      file.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    page.querySelector('[data-sokafy]').addEventListener('click', function () {
      var c = attente[rang];
      if (!c) return;
      window.open('https://wa.me/' + c.numero + '?text=' + encodeURIComponent(hafatra), '_blank');
      nalefa++;
      rang++;
      montrerLeRang();
    });
    page.querySelector('[data-dingana]').addEventListener('click', function () {
      rang++;
      montrerLeRang();
    });
    page.querySelector('[data-ajanona]').addEventListener('click', fermer);
  };
})();
