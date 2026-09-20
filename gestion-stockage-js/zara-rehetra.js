// ============================================================
// Partager une annonce à tous les clients, et non cinq par cinq
//
// La feuille de partage du téléphone ouvre WhatsApp, et WhatsApp décide
// ensuite : sa fenêtre « Envoyer à » coche les destinataires un par un et en
// limite le nombre. Cette fenêtre-là ne nous appartient pas — aucun code du
// site ne la commande, et rien ici ne peut y ajouter un « tout cocher ».
//
// Ce qui nous appartient, c'est la liste : les clients inscrits (table
// client_signups) avec leur numéro, et les réseaux. On coche tout d'un
// bouton, sans plafond, puis chaque envoi s'ouvre à son tour, le message
// déjà écrit. Il reste à appuyer sur « Envoyer » dans l'application —
// envoyer à la place de quelqu'un ne se fait pas depuis une page web.
//
// Une ouverture par appui : le navigateur bloque les fenêtres qu'on ouvre
// sans que la main l'ait demandé. D'où la file, un envoi à la fois.
//
// Deux natures d'envoi, et il vaut mieux le savoir avant :
//   — WhatsApp par numéro (wa.me/<numéro>) va à UNE personne, la file en fait
//     donc le tour ;
//   — Facebook, Telegram, Threads, X publient UNE fois, pour tout le monde :
//     ils n'ont pas d'adresse par personne. Les cocher n'envoie pas à chaque
//     client, cela publie.
//   — Instagram, TikTok, WeChat n'offrent aucune adresse qui écrive le
//     message d'avance : on le copie, l'application s'ouvre, on colle.
//
// wa.me et les autres liens ne portent que du texte. Une annonce avec photo
// part donc sans sa photo ; le lien, lui, la montre. C'est écrit dans la
// fenêtre pour qu'on ne le découvre pas après coup.
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

  function copier(texte) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texte).catch(function () {});
    }
  }

  // Les mêmes réseaux que le menu « ↗️ Partager » (inviter.js), Telegram en
  // plus. « copie » : pas d'adresse qui écrive le message, on colle soi-même.
  var RESEAUX = [
    { cle: 'whatsapp', nom: 'WhatsApp (groupe/status)', couleur: '#25D366', url: function (t, l) {
      return 'https://wa.me/?text=' + encodeURIComponent(t + '\n' + l); } },
    { cle: 'telegram', nom: 'Telegram', couleur: '#29A9EB', url: function (t, l) {
      return 'https://t.me/share/url?url=' + encodeURIComponent(l) + '&text=' + encodeURIComponent(t); } },
    { cle: 'facebook', nom: 'Facebook', couleur: '#1877F2', url: function (t, l) {
      return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(l); } },
    { cle: 'threads', nom: 'Threads', couleur: '#e7e9ea', url: function (t, l) {
      return 'https://www.threads.net/intent/post?text=' + encodeURIComponent(t + '\n' + l); } },
    { cle: 'x', nom: 'X (Twitter)', couleur: '#e7e9ea', url: function (t, l) {
      return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(t) + '&url=' + encodeURIComponent(l); } },
    { cle: 'instagram', nom: 'Instagram', couleur: '#E1306C', copie: true, ouvrir: 'https://www.instagram.com/' },
    { cle: 'tiktok', nom: 'TikTok', couleur: '#e7e9ea', copie: true, ouvrir: 'https://www.tiktok.com/' },
    { cle: 'wechat', nom: 'WeChat', couleur: '#07C160', copie: true }
  ];

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
        var vusMail = {};
        var gardes = [];
        var mails = 0;
        lignes.forEach(function (c) {
          var mail = String(c.email || '').trim().toLowerCase();
          if (mail.indexOf('@') > 0 && !vusMail[mail]) { vusMail[mail] = 1; mails++; }
          var num = numeroInternational(c.phone);
          if (!num || vus[num]) return;
          vus[num] = 1;
          gardes.push({ nom: String(c.name || '').trim() || c.email || num, numero: num });
        });
        return { clients: gardes, mails: mails };
      }, function () { return { clients: [], mails: 0 }; });
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
        '<strong style="font-size:0.95rem;">📢 Zarao amin\'ny rehetra</strong>' +
        '<button type="button" class="btn btn-sm" data-hidio style="width:auto;">Hanafoana</button>' +
      '</div>' +
      '<div style="max-width:760px; margin:0 auto; padding:1.2rem 16px 3rem;">' +
        // Tout d'un coup : les clients et les réseaux ensemble.
        '<div class="panel" style="display:flex; align-items:center; justify-content:space-between; gap:0.8rem; flex-wrap:wrap;">' +
          '<label style="display:flex; align-items:center; gap:0.55rem; font-size:0.9rem; cursor:pointer;">' +
            '<input type="checkbox" data-tout checked> <strong>Marika daholo</strong>' +
          '</label>' +
          '<span data-somary style="font-size:0.78rem; color:var(--muted);"></span>' +
        '</div>' +

        // 1) Les clients, un par un : c'est le seul envoi qui s'adresse à
        //    quelqu'un en particulier.
        '<div class="panel">' +
          '<h3>👥 Client tsirairay (WhatsApp)</h3>' +
          '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.9rem;">' +
            'Ireto ny client rehetra manana nomerao — <strong style="color:var(--text);">tsy misy fetra ny isa</strong>. ' +
            'Hisokatra tsirairay ny resaka, feno ny hafatra ; ianao no manindry « Envoyer » ao.' +
          '</p>' +
          '<div class="field">' +
            '<label for="zrSivana">Tadiavo</label>' +
            '<input type="text" id="zrSivana" data-sivana placeholder="Anarana na nomerao" autocomplete="off">' +
          '</div>' +
          '<div style="display:flex; align-items:center; justify-content:space-between; gap:0.8rem; flex-wrap:wrap; ' +
            'padding:0.5rem 0; border-bottom:1px solid var(--line); margin-bottom:0.4rem;">' +
            '<label style="display:flex; align-items:center; gap:0.5rem; font-size:0.84rem; cursor:pointer;">' +
              '<input type="checkbox" data-daholo> <strong>Marika ny client rehetra</strong></label>' +
            '<span data-isa style="font-size:0.78rem; color:var(--muted);"></span>' +
          '</div>' +
          '<div data-liste style="max-height:40vh; overflow-y:auto;"></div>' +
          '<p class="empty-hint" data-vide style="display:none;">Mbola tsy misy client manana nomerao.</p>' +
        '</div>' +

        // 2) Les réseaux : une publication, et non un envoi par client.
        '<div class="panel">' +
          '<h3>🌐 Tambajotra</h3>' +
          '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.9rem;">' +
            'Ireto dia <strong style="color:var(--text);">indray mandeha ihany</strong> : mamoaka ho hitan\'ny olona rehetra izy, ' +
            'fa tsy mandefa isaky ny client. Ny Instagram, TikTok ary WeChat tsy mandray hafatra voasoratra mialoha : ' +
            'adika ny hafatra, dia apetakao ao.' +
          '</p>' +
          '<div style="display:flex; align-items:center; justify-content:space-between; gap:0.8rem; flex-wrap:wrap; ' +
            'padding:0.5rem 0; border-bottom:1px solid var(--line); margin-bottom:0.4rem;">' +
            '<label style="display:flex; align-items:center; gap:0.5rem; font-size:0.84rem; cursor:pointer;">' +
              '<input type="checkbox" data-reseaux-daholo> <strong>Marika ny tambajotra rehetra</strong></label>' +
            '<span data-reseaux-isa style="font-size:0.78rem; color:var(--muted);"></span>' +
          '</div>' +
          '<div data-reseaux></div>' +
        '</div>' +

        // 3) L'email : le seul qui parte vraiment, sans que personne
    //    n'appuie sur « Envoyer » à l'autre bout.
        '<div class="panel">' +
          '<h3>📧 Mailaka</h3>' +
          '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.9rem;">' +
            'Ity irery no <strong style="color:var(--text);">tena mandeha any amin\'ny client</strong> : ' +
            'ny serveur no mandefa azy, ka mahazo ny hafatra ao anaty boaty mailaka izy ireo, tsy misy tsindriana. ' +
            'Miafina ny adiresy : tsy mifampahita ny client.' +
          '</p>' +
          '<label class="list-row" style="cursor:pointer;">' +
            '<span style="display:flex; align-items:center; gap:0.6rem;">' +
              '<input type="checkbox" data-mailaka checked> <strong>Alefa amin\'ny client rehetra manana email</strong></span>' +
            '<span data-mailaka-isa style="color:var(--muted); font-size:0.74rem; white-space:nowrap;"></span>' +
          '</label>' +
        '</div>' +

        '<button type="button" class="btn btn-primary" data-alefa>📨 Alefa</button>' +

        // La file : un envoi à la fois, un appui par envoi.
        '<div class="panel" data-file style="display:none;">' +
          '<h3 data-file-titre>Fandefasana</h3>' +
          '<p data-file-qui style="font-size:0.9rem; margin:0 0 0.9rem;"></p>' +
          '<div style="display:flex; gap:0.6rem; flex-wrap:wrap;">' +
            '<button type="button" class="btn btn-primary btn-sm" data-sokafy style="width:auto;">📨 Sokafy</button>' +
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
    var boiteR = page.querySelector('[data-reseaux]');
    var isaR = page.querySelector('[data-reseaux-isa]');
    var daholoR = page.querySelector('[data-reseaux-daholo]');
    var tout = page.querySelector('[data-tout]');
    var somary = page.querySelector('[data-somary]');

    var clients = [];
    var mailaka = page.querySelector('[data-mailaka]');
    var mailakaIsa = page.querySelector('[data-mailaka-isa]');
    var reseaux = RESEAUX.map(function (r) {
      var copie = {};
      Object.keys(r).forEach(function (k) { copie[k] = r[k]; });
      copie.coche = true;
      return copie;
    });

    function visibles() {
      var q = String(sivana.value || '').trim().toLowerCase();
      return clients.filter(function (c) {
        if (!q) return true;
        return (c.nom + ' ' + c.numero).toLowerCase().indexOf(q) >= 0;
      });
    }
    function cochesC() { return clients.filter(function (c) { return c.coche; }); }
    function cochesR() { return reseaux.filter(function (r) { return r.coche; }); }

    function direLIsa() {
      isa.textContent = cochesC().length + ' / ' + clients.length + ' voamarika';
      isaR.textContent = cochesR().length + ' / ' + reseaux.length + ' voamarika';
      var vus = visibles();
      daholo.checked = vus.length > 0 && vus.every(function (c) { return c.coche; });
      daholoR.checked = reseaux.every(function (r) { return r.coche; });
      tout.checked = daholoR.checked && mailaka.checked &&
        (clients.length === 0 || clients.every(function (c) { return c.coche; }));
      somary.textContent = cochesC().length + ' client + ' + cochesR().length + ' tambajotra' +
        (mailaka.checked ? ' + mailaka' : '');
    }

    function dessiner() {
      boite.innerHTML = visibles().map(function (c) {
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

    function dessinerReseaux() {
      boiteR.innerHTML = reseaux.map(function (r, i) {
        return '<label class="list-row" style="cursor:pointer;">' +
          '<span style="display:flex; align-items:center; gap:0.6rem;">' +
            '<input type="checkbox" data-r="' + i + '"' + (r.coche ? ' checked' : '') + '>' +
            '<span style="color:' + r.couleur + ';">' + echap(r.nom) + '</span></span>' +
          '<span style="color:var(--muted); font-size:0.74rem; white-space:nowrap;">' +
            (r.copie ? 'adika ny hafatra' : 'indray mandeha') + '</span>' +
        '</label>';
      }).join('');
      boiteR.querySelectorAll('input[type="checkbox"]').forEach(function (b) {
        b.addEventListener('change', function () {
          reseaux[Number(b.dataset.r)].coche = b.checked;
          direLIsa();
        });
      });
      direLIsa();
    }

    // « Marika daholo » ne coche que ce qu'on voit : une recherche en cours,
    // cocher tout le carnet à son insu serait une mauvaise surprise.
    daholo.addEventListener('change', function () {
      visibles().forEach(function (c) { c.coche = daholo.checked; });
      dessiner();
    });
    daholoR.addEventListener('change', function () {
      reseaux.forEach(function (r) { r.coche = daholoR.checked; });
      dessinerReseaux();
    });
    // Celui du haut prend les deux d'un seul geste : c'est ce qu'on veut
    // neuf fois sur dix, et c'est pour cela qu'il est en premier.
    tout.addEventListener('change', function () {
      clients.forEach(function (c) { c.coche = tout.checked; });
      reseaux.forEach(function (r) { r.coche = tout.checked; });
      mailaka.checked = tout.checked;
      dessiner();
      dessinerReseaux();
    });
    sivana.addEventListener('input', dessiner);
    mailaka.addEventListener('change', direLIsa);

    dessinerReseaux();
    lireLesClients().then(function (res) {
      mailakaIsa.textContent = res.mails + ' email';
      var liste = res.clients;
      clients = liste.map(function (c) { c.coche = true; return c; });
      vide.style.display = clients.length ? 'none' : '';
      dessiner();
    });

    // ---------- La file ----------
    var file = page.querySelector('[data-file]');
    var fileTitre = page.querySelector('[data-file-titre]');
    var fileQui = page.querySelector('[data-file-qui]');
    var fileVita = page.querySelector('[data-file-vita]');
    var bSokafy = page.querySelector('[data-sokafy]');
    var bDingana = page.querySelector('[data-dingana]');
    var bAjanona = page.querySelector('[data-ajanona]');
    var attente = [];
    var rang = 0;
    var nalefa = 0;

    function montrerLeRang() {
      if (rang >= attente.length) {
        fileTitre.textContent = '✓ Vita';
        fileQui.textContent = nalefa + ' nosokafana amin\'ny ' + attente.length + '.';
        bSokafy.style.display = 'none';
        bDingana.style.display = 'none';
        bAjanona.textContent = 'Hidio';
        return;
      }
      var e = attente[rang];
      fileTitre.textContent = 'Fandefasana ' + (rang + 1) + ' / ' + attente.length;
      bSokafy.disabled = false;
      bSokafy.textContent = e.mail ? '📧 Alefa ny mailaka' : '📨 Sokafy';
      if (e.mail) {
        fileQui.innerHTML = '<strong>📧 Mailaka amin\'ny client rehetra</strong>' +
          ' <span style="color:var(--muted); font-size:0.8rem;">— ny serveur no mandefa, tsy azo averina</span>';
        fileVita.textContent = nalefa ? nalefa + ' efa nosokafana.' : '';
        return;
      }
      fileQui.innerHTML = e.client
        ? '<strong>' + echap(e.client.nom) + '</strong> · +' + echap(e.client.numero)
        : '<strong style="color:' + e.reseau.couleur + ';">' + echap(e.reseau.nom) + '</strong>' +
          (e.reseau.copie ? ' <span style="color:var(--muted); font-size:0.8rem;">— hadika ny hafatra, apetaho ao</span>' : '');
      fileVita.textContent = nalefa ? nalefa + ' efa nosokafana.' : '';
    }

    page.querySelector('[data-alefa]').addEventListener('click', function () {
      attente = cochesC().map(function (c) { return { client: c }; })
        .concat(cochesR().map(function (r) { return { reseau: r }; }))
        .concat(mailaka.checked ? [{ mail: true }] : []);
      if (!attente.length) { alert('Tsy misy voamarika.'); return; }
      rang = 0;
      nalefa = 0;
      bSokafy.style.display = '';
      bDingana.style.display = '';
      bAjanona.textContent = '✖ Ajanony';
      file.style.display = '';
      montrerLeRang();
      file.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    bSokafy.addEventListener('click', function () {
      var e = attente[rang];
      if (!e) return;
      // Une annonce envoyée à tout le carnet ne se rattrape pas : on
      // demande, et on dit combien de personnes la recevront.
      if (e.mail) {
        if (!confirm('Halefa any amin\'ny client rehetra manana email ny hafatra. Tsy azo averina. Hitohy?')) return;
        if (!window.__sb || !window.__sb.functions) {
          fileVita.textContent = 'Tsy tafiditra ny serveur.';
          return;
        }
        bSokafy.disabled = true;
        fileVita.textContent = 'Mandefa…';
        window.__sb.functions.invoke('annonce-mailaka', {
          body: { texte: texte, rohy: rohy, sujet: (texte.split('\n')[0] || '').slice(0, 80) }
        }).then(function (res) {
          var d = (res && res.data) || {};
          if (d.sent) {
            nalefa++;
            rang++;
            montrerLeRang();
            fileVita.textContent = '✓ ' + d.sent + ' mailaka lasa' + (d.error ? ' (' + d.error + ')' : '') + '.';
            return;
          }
          bSokafy.disabled = false;
          fileVita.textContent = 'Tsy lasa : ' + (d.error || (res && res.error && res.error.message) || 'antony tsy fantatra');
        }, function (err) {
          bSokafy.disabled = false;
          fileVita.textContent = 'Tsy tratra ny fonction : ' + ((err && err.message) || 'réseau');
        });
        return;
      }
      if (e.client) {
        window.open('https://wa.me/' + e.client.numero + '?text=' + encodeURIComponent(hafatra), '_blank');
      } else if (e.reseau.copie) {
        copier(hafatra);
        if (e.reseau.ouvrir) window.open(e.reseau.ouvrir, '_blank');
      } else {
        window.open(e.reseau.url(texte, rohy), '_blank');
      }
      nalefa++;
      rang++;
      montrerLeRang();
    });
    bDingana.addEventListener('click', function () {
      rang++;
      montrerLeRang();
    });
    bAjanona.addEventListener('click', fermer);
  };
})();
