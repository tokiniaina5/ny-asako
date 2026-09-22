// ---------------- CONNEXIONS ----------------
  function renderLogins(){
    const logins = loadLogins();
    const tbody = document.getElementById('loginsTableBody');
    tbody.innerHTML = '';
    document.getElementById('loginsEmptyHint').style.display = logins.length ? 'none' : 'block';
    logins.forEach(function(l){
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + escapeHtml(l.name) + '</td><td>' + escapeHtml(l.email) + '</td><td>' + escapeHtml(l.date) + '</td>';
      tbody.appendChild(tr);
    });

    // "Visiteurs du site", "Connexions" et "Code maître" ne sont visibles que pour le propriétaire de l'app
    const isAdmin = currentUser && currentUser.email &&
      currentUser.email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase();
    document.getElementById('masterCodePanel').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('adminVisitsPanel').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('adminLoginsPanel').style.display = isAdmin ? 'block' : 'none';
    // l'entrée de menu « Espace admin » n'existe que pour le propriétaire
    const navAdmin = document.getElementById('navAdmin');
    if(navAdmin) navAdmin.style.display = isAdmin ? 'flex' : 'none';
    // Administratif Fokontany et Administratif Commun : au propriétaire seul.
    // Une classe sur la racine et non un style par élément : la recherche du
    // menu et les icônes épinglées remettent les leurs, pas celle-ci
    // (components.css). isOwnerEmail refuse aussi l'employé entré par son lien.
    document.documentElement.classList.toggle('est-proprietaire',
      !!(currentUser && currentUser.email && isOwnerEmail(currentUser.email)));
    document.getElementById('contactAdminPanel').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('unlockRequestsPanel').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('signupsPanel').style.display = isAdmin ? 'block' : 'none';
    if(isAdmin){ renderSiteVisits(); renderClientCodesAdmin(); renderUnlockRequests(); renderSignups(); }
    renderProfileForm();
  }

  function renderProfileForm(){
    if(!currentUser) return;
    document.getElementById('profileName').value = currentUser.name || '';
    document.getElementById('profileCompany').value = currentUser.company || '';
    document.getElementById('profileEmail').value = currentUser.email || '';
    document.getElementById('profilePhone').value = currentUser.phone || '';
    document.getElementById('profileNif').value = currentUser.nif || '';
    document.getElementById('profileStat').value = currentUser.stat || '';
    const savedProfile = (typeof findProfile === 'function') ? findProfile(currentUser.name || '') : null;
    const codeInput = document.getElementById('profileAccessCode');
    // avec Supabase le mot de passe n’est pas conservé ici : le champ reste vide
    const hasAuth = !!(window.__sb && window.__sb.auth);
    if(codeInput) codeInput.value = (!hasAuth && savedProfile && savedProfile.accessCode) ? savedProfile.accessCode : '';
    updateProfilePhotoPreview(currentUser.logo || null);
    if(typeof renderIdentityForm === 'function') renderIdentityForm();
  }

  function updateProfilePhotoPreview(src){
    const img = document.getElementById('profilePhotoPreview');
    const placeholder = document.getElementById('profilePhotoPlaceholder');
    if(!img || !placeholder) return;
    if(src){
      img.src = src;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      img.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  }

  const profileLogoInput = document.getElementById('profileLogo');
  if(profileLogoInput){
    profileLogoInput.addEventListener('change', function(){
      const file = profileLogoInput.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = function(ev){ updateProfilePhotoPreview(ev.target.result); };
      reader.readAsDataURL(file);
    });
  }

  function shortUserAgent(ua){
    if(!ua) return '—';
    if(/Mobi|Android/i.test(ua)) return 'Mobile';
    if(/iPad|Tablet/i.test(ua)) return 'Tablette';
    return 'Ordinateur';
  }

  function renderSiteVisits(){
    const tbody = document.getElementById('siteVisitsTableBody');
    const emptyHint = document.getElementById('siteVisitsEmptyHint');
    if(!tbody || !window.__sb){ return; }
    window.__sb.from('site_visits')
      .select('path,referrer,user_agent,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(function(res){
        if(!res || !res.data){ return; }
        tbody.innerHTML = '';
        emptyHint.style.display = res.data.length ? 'none' : 'block';
        res.data.forEach(function(v){
          const tr = document.createElement('tr');
          const d = v.created_at ? new Date(v.created_at).toLocaleString('fr-FR') : '—';
          tr.innerHTML =
            '<td>' + d + '</td>' +
            '<td>' + escapeHtml(v.path || '—') + '</td>' +
            '<td>' + escapeHtml(v.referrer || 'Direct') + '</td>' +
            '<td>' + shortUserAgent(v.user_agent) + '</td>';
          tbody.appendChild(tr);
        });
      }, function(){});
  }

  document.getElementById('clearLoginsBtn').addEventListener('click', function(){
    if(confirm("Vider tout l'historique des connexions ?")){
      saveLogins([]);
      renderLogins();
    }
  });

  // ---------------- CODES DE DÉVERROUILLAGE PAR CLIENT (admin) ----------------
  // Ouvre le client mail de l'admin, adressé au client, prérempli avec son code.
  function sendCodeToClientByMail(email, code){
    const subject = encodeURIComponent('Votre code de déverrouillage — Ny asako');
    const body = encodeURIComponent(
      'Bonjour,\n\n' +
      'Voici votre code de déverrouillage pour réactiver votre compte Ny asako :\n\n' +
      'Code : ' + code + '\n\n' +
      'Ce code est valable 30 minutes et accepte 3 essais. Passé ce délai, contactez-nous pour en recevoir un nouveau.\n\n' +
      'Merci !'
    );
    window.location.href = 'mailto:' + email + '?subject=' + subject + '&body=' + body;
  }

  function renderClientCodesAdmin(){
    const tbody = document.getElementById('clientCodesTableBody');
    const emptyHint = document.getElementById('clientCodesEmptyHint');
    if(!tbody) return;
    const codes = loadClientCodes();
    const emails = Object.keys(codes);
    tbody.innerHTML = '';
    emptyHint.style.display = emails.length ? 'none' : 'block';
    emails.forEach(function(email){
      const entry = codes[email];
      const generatedAt = new Date(entry.generatedAt);
      const remainingMs = CODE_VALID_MS - (Date.now() - generatedAt.getTime());
      const remainingLabel = remainingMs > 0 ? Math.ceil(remainingMs / 60000) + ' min' : 'Expiré';
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(email) + '</td>' +
        '<td style="font-family:var(--font-mono); font-weight:600;">' + escapeHtml(entry.code) + '</td>' +
        '<td>' + escapeHtml(generatedAt.toLocaleString('fr-FR')) + '</td>' +
        '<td>' + remainingLabel + '</td>' +
        '<td>' + (entry.attempts || 0) + '/' + CODE_MAX_ATTEMPTS + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-primary btn-sm send-client-code-btn" data-email="' + escapeHtml(email) + '" data-code="' + escapeHtml(entry.code) + '" style="margin-right:0.4rem;">Envoyer</button>' +
          '<button type="button" class="btn btn-red btn-sm clear-client-code-btn" data-email="' + escapeHtml(email) + '">Supprimer</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.send-client-code-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        sendCodeToClientByMail(btn.getAttribute('data-email'), btn.getAttribute('data-code'));
      });
    });
    tbody.querySelectorAll('.clear-client-code-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        clearClientCode(btn.getAttribute('data-email'));
        renderClientCodesAdmin();
      });
    });
  }

  // ---------------- COMMUNAUTÉ CLIENTS & ACHATS INTERNATIONAUX ----------------
  const DEFAULT_MARKETPLACES = [
    { name: 'Alibaba', url: 'https://www.alibaba.com' },
    { name: 'AliExpress', url: 'https://www.aliexpress.com' }
  ];

  function addMarketplaceBtn(row, name, url){
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'btn btn-sm';
    a.textContent = '🔗 ' + name;
    row.appendChild(a);
  }

  function renderMarketplaceLinks(){
    const row = document.getElementById('marketplaceLinks');
    if(!row) return;
    row.innerHTML = '';
    DEFAULT_MARKETPLACES.forEach(function(m){ addMarketplaceBtn(row, m.name, m.url); });
    if(window.__sb){
      window.__sb.from('marketplace_links').select('name,url').order('created_at', { ascending: true })
        .then(function(res){
          if(res && res.data){ res.data.forEach(function(m){ addMarketplaceBtn(row, m.name, m.url); }); }
        }, function(){});
    }
  }

  const addMarketBtn = document.getElementById('addMarketBtn');
  if(addMarketBtn){
    addMarketBtn.addEventListener('click', function(){
      const name = document.getElementById('newMarketName').value.trim();
      const url = document.getElementById('newMarketUrl').value.trim();
      if(!name || !url) return;
      if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
      window.__sb.from('marketplace_links').insert({ name: name, url: url }).then(function(){
        document.getElementById('newMarketName').value = '';
        document.getElementById('newMarketUrl').value = '';
        renderMarketplaceLinks();
      }, function(){ alert("Tsy voaray ny fanampiana rohy."); });
    });
  }

  // Le portrait complet pèse des dizaines de kilo-octets. Recopié sur chaque
  // publication, il alourdirait le fil d'autant de fois qu'il y a de billets,
  // pour finir affiché dans un rond de 42 pixels. On en garde une vignette.
  const TAILLE_VIGNETTE = 96;
  function vignette(source){
    return new Promise(function(resoudre){
      if(!source) return resoudre(null);
      const img = new Image();
      img.onload = function(){
        try{
          const c = document.createElement('canvas');
          c.width = TAILLE_VIGNETTE; c.height = TAILLE_VIGNETTE;
          const ctx = c.getContext('2d');
          // Recadrage au centre sur le plus petit côté : le visage reste au
          // milieu, et rien n'est étiré.
          const cote = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote,
                             0, 0, TAILLE_VIGNETTE, TAILLE_VIGNETTE);
          resoudre(c.toDataURL('image/jpeg', 0.72));
        }catch(e){ resoudre(null); }
      };
      // Une image illisible ne doit pas empêcher de publier.
      img.onerror = function(){ resoudre(null); };
      img.src = source;
    });
  }

  function initials(name){
    if(!name) return '?';
    const parts = name.trim().split(/\s+/);
    const chars = parts.length > 1 ? (parts[0][0] + parts[1][0]) : parts[0].slice(0,2);
    return chars.toUpperCase();
  }

  // Une vidéo ne se devine qu'à son adresse : « data:video/… » pour ce qui
  // vit dans la ligne, une extension pour ce qui vit au bucket. Les photos,
  // elles, restent des « data:image/… ».
  function estVideo(src){
    var s = String(src || '');
    return /^data:video\//i.test(s) || /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(s);
  }

  function parseNewsImages(raw){
    if(!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) return parsed;
      return [raw];
    } catch(e){
      return [raw]; // ancien format : une seule image en texte brut
    }
  }

  // Ny sary/video an'ilay post dia data: URL voatahiry ao amin'ny "image".
  // Ovaina ho File mba ho azo alefa marina amin'ny feuille de partage.
  function postMediaToFiles(sources){
    return Promise.all(sources.slice(0, 10).map(function(src, i){
      return fetch(src).then(function(r){ return r.blob(); }).then(function(blob){
        const type = blob.type || 'image/png';
        const ext = (type.split('/')[1] || 'png').split('+')[0];
        return new File([blob], 'post-' + (i + 1) + '.' + ext, { type: type });
      });
    }));
  }

  // Fizarana ny post ao amin'ny Accueil. Amin'ny telefaonina, ny SARY na VIDEO
  // mihitsy no alefa amin'ny feuille de partage, ka hitan'ny olona rehetra any
  // amin'ilay tambajotra nofidina. Raha tsy misy media na tsy tohanan'ny
  // navigateur izany, dia ny lahatsoratra sy ny rohy no zaraina.
  // Le lien d'une annonce mène à la boutique, et non à « Connexion » : on
  // montre la marchandise avant de demander un compte. Celui qui n'en veut
  // pas ne s'inscrit pas, et celui qui en veut trouve le bouton.
  //
  // Le parrainage suit dans « ref » — celui qui partage garde son filleul,
  // même si le chemin passe maintenant par la boutique — et « a » désigne
  // l'annonce, pour qu'on tombe dessus et non sur le fil entier.
  function lienDeLAnnonce(n){
    if(n.link && /^https?:\/\//i.test(n.link)) return n.link;
    const base = appShareLink();
    let racine = base.split('?')[0].replace(/confirmation\/?$/, '');
    if(!/\/$/.test(racine)) racine += '/';
    let ref = '';
    const m = base.match(/[?&]ref=([^&]*)/);
    if(m) ref = m[1];
    const bouts = [];
    if(ref) bouts.push('ref=' + ref);
    if(n.id) bouts.push('a=' + encodeURIComponent(n.id));
    return racine + 'botika/' + (bouts.length ? '?' + bouts.join('&') : '');
  }

  function sharePost(n){
    const parts = [];
    if(n.client_name) parts.push(n.client_name + ' :');
    if(n.message) parts.push(n.message);
    if(n.price) parts.push('(' + formatAr(n.price) + ')');
    const text = parts.join(' ').trim() || 'Vaovao ao amin\'ny asako';
    const link = lienDeLAnnonce(n);

    function shareTextOnly(){
      if(typeof shareContent === 'function'){
        shareContent({ title: 'Ny asako', text: text, url: link });
      } else {
        copyToClipboardSilently(text + '\n' + link);
        alert('Voadika ny hafatra.');
      }
    }

    const media = parseNewsImages(n.image);
    if(!media.length || !navigator.canShare || !navigator.share){
      shareTextOnly();
      return;
    }
    postMediaToFiles(media).then(function(files){
      if(!navigator.canShare({ files: files })){
        shareTextOnly();
        return;
      }
      navigator.share({ text: text + '\n' + link, files: files }).catch(function(err){
        // AbortError = nofoanan'ny mpampiasa ny fizarana : tsy misy atao.
        if(err && err.name === 'AbortError') return;
        shareTextOnly();
      });
    }, shareTextOnly);
  }

  // Le même message que « Partager », mais adressé à la liste des clients
  // plutôt qu'à la fenêtre de WhatsApp, qui n'en accepte qu'une poignée.
  function shareToutLeMonde(n){
    if(typeof window.__zaraoAminyRehetra !== 'function') return;
    const parts = [];
    if(n.client_name) parts.push(n.client_name + ' :');
    if(n.message) parts.push(n.message);
    if(n.price) parts.push('(' + formatAr(n.price) + ')');
    const text = parts.join(' ').trim() || 'Vaovao ao amin\'ny asako';
    const link = lienDeLAnnonce(n);
    window.__zaraoAminyRehetra({ texte: text, rohy: link });
  }

  // Ouvre « Acheter » avec ce que l'annonce dit déjà : le nom, le prix, le
  // vendeur. Il ne reste qu'à confirmer la quantité — recopier ces trois
  // choses de mémoire est le meilleur moyen de se tromper de prix.
  function buyFromPost(post){
    if(typeof showDashView === 'function') showDashView('acheter');
    if(typeof populateAcheterItemSelect === 'function') populateAcheterItemSelect();

    const select = document.getElementById('acheterItemSelect');
    const nom = document.getElementById('acheterItemName');
    const prix = document.getElementById('acheterPrice');
    const fournisseur = document.getElementById('acheterSupplier');
    const qty = document.getElementById('acheterQty');
    const statut = document.getElementById('acheterStatus');

    // Le libellé de l'annonce sert de nom d'article, sur sa première ligne.
    const titre = (post.message || '').split('\n')[0].trim().slice(0, 60);

    // Si l'article existe déjà en stock, on le complète plutôt que d'en créer
    // un jumeau qui compterait à part.
    const existant = items.find(function(it){
      return titre && it.name.trim().toLowerCase() === titre.toLowerCase();
    });

    if(select) select.value = existant ? existant.id : '';
    if(select) select.dispatchEvent(new Event('change'));
    if(!existant && nom) nom.value = titre;
    if(prix && post.price) prix.value = post.price;
    if(fournisseur) fournisseur.value = post.client_name || '';
    if(qty) qty.value = 1;
    if(statut){
      statut.textContent = existant
        ? 'Entana efa ao amin\'ny stock : ampio ny isa, dia tsindrio « Acheter ».'
        : 'Feno ho anao avy amin\'ny fanambarana. Jereo ny isa, dia tsindrio « Acheter ».';
    }
    if(nom || select) (existant ? qty : nom || qty).focus();
  }

  // Une table absente et un réseau coupé ne se réparent pas de la même façon :
  // dire lequel des deux, c'est éviter de chercher au mauvais endroit.
  function feedErrorText(error){
    const brut = (error && (error.message || error.hint)) || '';
    if(/does not exist|schema cache|PGRST205|404/i.test(brut)){
      return 'Tsy mbola voaforona ao amin\'ny serveur ny latabatra ilaina. ' +
        'Alefaso ao amin\'ny Supabase > SQL Editor ny « supabase-commentaires.sql » sy « supabase-jaime.sql ».';
    }
    if(/JWT|not authenticated|permission|policy|row-level/i.test(brut)){
      return 'Midira aloha vao afaka mandefa.';
    }
    return brut || 'Tsy nety : jereo ny fifandraisanao.';
  }

  // ---------------- « J'AIME » ----------------
  // Ce que le serveur dit des « j'aime » du fil affiché : combien, et si
  // celui qui regarde en fait partie.
  let likeState = {};

  function myLikeEmail(){
    return (currentUser && currentUser.email) ? currentUser.email.trim().toLowerCase() : '';
  }

  function paintLike(el, newsId){
    const info = likeState[newsId] || { count: 0, mine: false };
    // Le bouton dit ce qu'il fait ; le nombre vit au-dessus, sur sa propre
    // ligne, et disparaît quand il n'y a rien à compter.
    el.textContent = '👍 J\'aime';
    el.classList.toggle('liked', !!info.mine);

    const post = el.closest('.fb-post');
    const compte = post && post.querySelector('[data-like-count]');
    if(compte){
      compte.style.display = info.count ? 'flex' : 'none';
      const qui = info.mine
        ? (info.count === 1 ? 'Ianao' : 'Ianao sy ' + (info.count - 1) + ' hafa')
        : info.count;
      compte.innerHTML = '<span class="fb-like-bubble">👍</span><span>' + escapeHtml(String(qui)) + '</span>';
    }
  }

  function setupLike(el, newsId){
    paintLike(el, newsId);
    el.addEventListener('click', function(){ toggleLike(el, newsId); });
  }

  function loadLikes(ids){
    if(!ids.length || !window.__sb) return;
    window.__sb.from('client_news_likes')
      .select('news_id,author_email')
      .in('news_id', ids)
      .then(function(res){
        const rows = (res && res.data) || [];
        const moi = myLikeEmail();
        likeState = {};
        rows.forEach(function(r){
          const info = likeState[r.news_id] || (likeState[r.news_id] = { count: 0, mine: false });
          info.count++;
          if(moi && (r.author_email || '').toLowerCase() === moi) info.mine = true;
        });
        document.querySelectorAll('#communityNewsList [data-like]').forEach(function(el){
          const post = el.closest('.fb-post');
          if(post && post.dataset.newsId) paintLike(el, post.dataset.newsId);
        });
      }, function(){});
  }

  function toggleLike(el, newsId){
    const moi = myLikeEmail();
    if(!moi || !window.__sb){ alert('Midira aloha vao afaka mankasitraka.'); return; }

    const info = likeState[newsId] || (likeState[newsId] = { count: 0, mine: false });
    // On peint tout de suite, puis on corrige si le serveur refuse : un clic
    // qui n'a l'air de rien faire pendant une seconde donne envie de cliquer
    // encore, et de compter deux fois.
    const avant = { count: info.count, mine: info.mine };
    info.mine = !avant.mine;
    info.count = Math.max(0, avant.count + (info.mine ? 1 : -1));
    paintLike(el, newsId);

    const table = window.__sb.from('client_news_likes');
    const action = avant.mine
      ? table.delete().eq('news_id', newsId).eq('author_email', moi)
      : table.insert({ news_id: newsId, author_email: moi,
          author_name: (currentUser && currentUser.name) || 'Client' });

    action.then(function(res){
      if(res && res.error){
        likeState[newsId] = avant;
        paintLike(el, newsId);
      }
    }, function(){
      likeState[newsId] = avant;
      paintLike(el, newsId);
    });
  }

  // ---------------- LES COMMENTAIRES, OUVERTS D'OFFICE ----------------
  //
  // Ils attendaient derrière « Commenter ». Un billet en portait trois, et
  // rien ne le disait : la conversation existait pour ceux qui avaient pensé
  // à toucher le mot. Les autres passaient devant un fil qui paraissait muet.
  // Ils sont donc à l'écran, sous leur billet, comme la réponse qu'ils sont.
  //
  // Ce qui les gardait repliés, c'était le coût : trente billets qui iraient
  // chacun chercher leurs lignes, puis les relire toutes les quatre secondes,
  // feraient trente requêtes là où une suffit — et trente canaux temps réel
  // là où un seul porte la table entière. On ne replie donc pas les boîtes :
  // on les sert ensemble. Une requête pour tout le fil, un minuteur, un
  // canal, et chaque boîte reçoit sa part.
  //
  // Sans temps réel, c'est la relecture qui porte tout : quatre secondes.
  // Avec lui, elle n'est plus qu'un filet — le canal fait le travail, et elle
  // rattrape ce qu'il aurait laissé passer.
  const COMMENTAIRES_RAFRAICHI_MS = 4000;
  const COMMENTAIRES_FILET_MS = 25000;
  // Au-delà, ce n'est plus un fil qu'on lit mais une page qu'on fait ramer.
  const COMMENTAIRES_MAX = 1000;

  let boitesCommentaires = {};
  let minuteurCommentaires = null;
  let canalCommentaires = null;
  let realtimeCommentairesProuve = false;

  function oublierLesCommentaires(){
    boitesCommentaires = {};
    if(minuteurCommentaires){ clearInterval(minuteurCommentaires); minuteurCommentaires = null; }
    if(canalCommentaires){
      try { window.__sb.removeChannel(canalCommentaires); } catch(e){}
      canalCommentaires = null;
    }
    realtimeCommentairesProuve = false;
  }

  // « discret » : c'est la relecture automatique qui appelle. Une panne de
  // réseau passagère ne doit pas effacer ce qui est lisible à l'écran.
  function chargerLesCommentaires(discret){
    const ids = Object.keys(boitesCommentaires);
    if(!ids.length || !window.__sb) return;
    window.__sb.from('client_news_comments')
      .select('news_id,author_name,message,created_at')
      .in('news_id', ids)
      .order('created_at', { ascending: true })
      .limit(COMMENTAIRES_MAX)
      .then(function(res){
        if(res && res.error){
          if(!discret) ids.forEach(function(id){ boitesCommentaires[id].poser(null, res.error); });
          return;
        }
        const parBillet = {};
        ((res && res.data) || []).forEach(function(c){
          (parBillet[c.news_id] || (parBillet[c.news_id] = [])).push(c);
        });
        ids.forEach(function(id){
          if(boitesCommentaires[id]) boitesCommentaires[id].poser(parBillet[id] || []);
        });
      }, function(err){
        if(!discret) ids.forEach(function(id){ boitesCommentaires[id].poser(null, err); });
      });
  }

  function poserLeMinuteurDesCommentaires(periode){
    if(minuteurCommentaires) clearInterval(minuteurCommentaires);
    minuteurCommentaires = setInterval(function(){
      // Plus une seule boîte à l'écran : le fil a été redessiné, ou l'on est
      // parti ailleurs. Sans ce garde-fou, chaque affichage laisserait
      // derrière lui une interrogation régulière pour personne.
      const vivante = Object.keys(boitesCommentaires).some(function(id){
        return boitesCommentaires[id].box.isConnected;
      });
      if(!vivante){ oublierLesCommentaires(); return; }
      chargerLesCommentaires(true);
    }, periode);
  }

  // Le temps réel : le serveur prévient dès que la ligne entre, et le
  // commentaire paraît à la seconde.
  //
  // La relecture régulière ne disparaît pas pour autant — elle ralentit, mais
  // seulement quand le canal a FAIT SES PREUVES. Être abonné ne prouve rien :
  // le canal s'ouvre très bien sur une table absente de la publication, dit
  // « SUBSCRIBED », et ne délivre jamais rien. Ralentir sur cette promesse-là
  // rendrait le fil plus lent qu'avant. C'est donc le premier message reçu
  // qui l'autorise.
  function ecouterLesCommentaires(){
    if(canalCommentaires || !window.__sb || !window.__sb.channel) return;
    try {
      canalCommentaires = window.__sb
        .channel('commentaires-du-fil')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'client_news_comments'
        }, function(){
          if(!realtimeCommentairesProuve){
            realtimeCommentairesProuve = true;
            poserLeMinuteurDesCommentaires(COMMENTAIRES_FILET_MS);
          }
          chargerLesCommentaires(true);
        })
        .subscribe(function(){});
    } catch(e){ canalCommentaires = null; }
  }

  // Une fois toutes les boîtes en place : une lecture, un minuteur, un canal.
  function veillerSurLesCommentaires(){
    if(!Object.keys(boitesCommentaires).length) return;
    chargerLesCommentaires(false);
    poserLeMinuteurDesCommentaires(COMMENTAIRES_RAFRAICHI_MS);
    ecouterLesCommentaires();
  }

  function openComments(newsId, box, avecFocus){
    if(!newsId || !window.__sb){
      box.innerHTML = '<div class="fb-comment-empty">Tsy misy fifandraisana amin\'ny serveur.</div>';
      return;
    }
    box.innerHTML = '<div class="fb-comment-empty">Mamaky…</div>';

    const liste = document.createElement('div');
    const saisie = document.createElement('div');
    saisie.className = 'fb-comment-form';
    saisie.innerHTML =
      '<input type="text" class="fb-comment-input" placeholder="Soraty ny hevitrao…">' +
      '<button type="button" class="btn btn-sm fb-comment-send" style="width:auto;">Alefa</button>';

    // Ce qui est déjà à l'écran, en une ligne. Redessiner à l'identique
    // toutes les quatre secondes ferait sauter la sélection de qui relit, et
    // clignoter la liste pour rien.
    let empreinte = null;

    function signature(rows){
      return rows.map(function(c){
        return (c.created_at || '') + '|' + (c.author_name || '') + '|' + (c.message || '');
      }).join('\n');
    }

    function dessiner(rows){
      liste.innerHTML = '';
      // Ouvertes d'office, les boîtes vides diraient trente fois la même
      // chose sous trente billets. Le champ, juste en dessous, invite mieux
      // que la phrase qui l'annonçait.
      if(!rows.length) return;
      rows.forEach(function(c){
        const ligne = document.createElement('div');
        ligne.className = 'fb-comment';
        ligne.innerHTML =
          '<strong>' + escapeHtml(c.author_name || 'Client') + '</strong> ' +
          escapeHtml(c.message || '') +
          '<span class="fb-comment-date">' +
            (c.created_at ? new Date(c.created_at).toLocaleString('fr-FR') : '') +
          '</span>';
        liste.appendChild(ligne);
      });
    }

    // La part de cette boîte dans la lecture commune. Elle ne demande plus
    // rien d'elle-même : on la sert.
    function poser(rows, err){
      if(err){
        liste.innerHTML = '<div class="fb-comment-empty">' + escapeHtml(feedErrorText(err)) + '</div>';
        return;
      }
      const sig = signature(rows);
      if(sig === empreinte) return;
      empreinte = sig;
      dessiner(rows);
    }

    box.innerHTML = '';
    liste.innerHTML = '<div class="fb-comment-empty">Mamaky…</div>';
    box.appendChild(liste);
    box.appendChild(saisie);
    boitesCommentaires[newsId] = { poser: poser, box: box };

    const champ = saisie.querySelector('.fb-comment-input');
    const bouton = saisie.querySelector('.fb-comment-send');

    function envoyer(){
      const texte = champ.value.trim();
      if(!texte) return;
      bouton.disabled = true;

      // Le sien s'affiche tout de suite, en pâle. Attendre l'aller-retour
      // pour voir ce qu'on vient d'écrire donne l'impression que rien n'est
      // parti — et l'on écrit deux fois.
      const vide = liste.querySelector('.fb-comment-empty');
      if(vide) vide.remove();
      const provisoire = document.createElement('div');
      provisoire.className = 'fb-comment';
      provisoire.style.opacity = '0.55';
      provisoire.innerHTML =
        '<strong>' + escapeHtml((currentUser && currentUser.name) || 'Client') + '</strong> ' +
        escapeHtml(texte) +
        '<span class="fb-comment-date">Mandefa…</span>';
      liste.appendChild(provisoire);
      champ.value = '';

      window.__sb.from('client_news_comments').insert({
        news_id: newsId,
        author_name: (currentUser && currentUser.name) || 'Client',
        author_email: (currentUser && currentUser.email) || null,
        message: texte
      }).then(function(res){
        bouton.disabled = false;
        if(res && res.error){
          // Rendu à son auteur : le texte revient dans le champ plutôt que
          // de disparaître avec le message d'erreur.
          provisoire.remove();
          champ.value = texte;
          montrerErreur(res.error);
          return;
        }
        // La relecture remplace le pâle par le vrai, daté par le serveur.
        empreinte = null;
        chargerLesCommentaires(true);
      }, function(err){
        bouton.disabled = false;
        provisoire.remove();
        champ.value = texte;
        montrerErreur(err);
      });
    }

    // L'erreur se pose sous le champ, là où le regard est déjà : une fenêtre
    // d'alerte se ferme d'un réflexe, sans être lue.
    function montrerErreur(err){
      let ligne = saisie.nextElementSibling;
      if(!ligne || !ligne.classList.contains('fb-comment-error')){
        ligne = document.createElement('div');
        ligne.className = 'fb-comment-error';
        saisie.parentNode.appendChild(ligne);
      }
      ligne.textContent = feedErrorText(err);
    }

    bouton.addEventListener('click', envoyer);
    champ.addEventListener('keydown', function(e){ if(e.key === 'Enter') envoyer(); });
    // Les boîtes s'ouvrent maintenant toutes seules, et trente champs qui se
    // disputeraient le curseur emporteraient la page avec eux. Seul celui
    // qu'on a demandé — le mot « Commenter » — prend la main.
    if(avecFocus) champ.focus();
  }

  // ---------------- LE DIRECT DANS LE FIL ----------------
  //
  // Le billet d'un direct porte l'adresse de celui qui diffuse, au bout de
  // son lien : « …?live=<email>&name=<nom> ». Ce lien ouvrait l'application
  // dans un second onglet, qui se chargeait en entier pour aboutir au même
  // endroit — alors qu'on y était déjà. On entre maintenant d'ici, d'un
  // bouton : c'est la même fonction que le bandeau rouge appelle (joinLive).
  function lireLeLienDuLive(lien){
    if(!lien) return null;
    try {
      const u = new URL(lien, window.location.href);
      const email = u.searchParams.get('live');
      if(!email) return null;
      return { email: email.trim().toLowerCase(), name: u.searchParams.get('name') || '' };
    } catch(e){ return null; }
  }

  // Celui qui diffusait est-il encore là ? La présence le dit tout de suite ;
  // tant qu'elle n'a rien chargé — et elle porte toujours au moins nous-même
  // — on s'en remet à l'heure du billet.
  function leLiveEstEnCours(email){
    if(typeof presenceState !== 'object' || !presenceState) return true;
    if(!Object.keys(presenceState).length) return true;
    const p = presenceState[email];
    return !!(p && p.live);
  }

  // ---------------- L'APERÇU D'UN LIEN PARTAGÉ ----------------
  //
  // Un billet qui ne porte qu'une adresse ne dit rien de ce qu'il y a au bout.
  // « https://www.alibaba.com/ » — et puis ? Personne ne touche une adresse
  // nue ; on touche une image. C'est la fonction « apercu » qui va la
  // chercher : le navigateur ne peut pas lire une page d'un autre domaine
  // (CORS), le serveur le peut.
  //
  // Ce qu'on rapporte, c'est ce que le site publie pour être partagé — une
  // image, un titre, une phrase — et non sa liste de marchandises : les
  // grands sites ne la donnent pas, la construisent dans le navigateur de
  // leur visiteur, et refusent qui n'est pas une personne.
  //
  // Un aperçu ne change pas d'une heure à l'autre : il est gardé sur
  // l'appareil une semaine. Sans cela, trente billets redemanderaient trente
  // aperçus à chaque fois que le fil se redessine — et il se redessine
  // souvent.
  // Le lien est rarement dans la case prévue pour lui : un partage venu du
  // dehors (zara-miditra.js) dépose l'adresse dans le texte, là où la
  // personne l'aurait collée elle-même. On la cherche donc dans les deux.
  function premierLien(texte){
    const m = String(texte || '').match(/https?:\/\/[^\s<>"']+/i);
    if(!m) return '';
    // Une adresse en fin de phrase emporte la ponctuation qui la suit.
    return m[0].replace(/[),.;:!?]+$/, '');
  }

  const APERCU_CLE = 'stockmanager_apercus';
  const APERCU_DUREE = 7 * 24 * 60 * 60 * 1000;
  // Un aperçu VIDE, lui, ne se garde pas la semaine : c'est une page qui
  // s'est refusée un instant, ou la fonction qui n'était pas encore déployée.
  // Gardé sept jours, ce raté-là survivrait au remède.
  const APERCU_VIDE_DUREE = 60 * 60 * 1000;
  let apercusEnCours = 0;

  function lireLesApercus(){
    try { return JSON.parse(localStorage.getItem(APERCU_CLE)) || {}; }
    catch(e){ return {}; }
  }
  function garderLApercu(url, apercu){
    try {
      const tous = lireLesApercus();
      tous[url] = { apercu: apercu, le: Date.now() };
      // Le fil ne garde que sept jours : au-delà de deux cents aperçus, ce
      // sont des liens que plus personne ne verra passer.
      const cles = Object.keys(tous);
      if(cles.length > 200){
        cles.sort(function(a, b){ return (tous[a].le || 0) - (tous[b].le || 0); });
        cles.slice(0, cles.length - 200).forEach(function(k){ delete tous[k]; });
      }
      localStorage.setItem(APERCU_CLE, JSON.stringify(tous));
    } catch(e){}
  }
  function apercuGarde(url){
    const ligne = lireLesApercus()[url];
    if(!ligne) return null;
    const a = ligne.apercu || {};
    const duree = (a.titre || a.image) ? APERCU_DUREE : APERCU_VIDE_DUREE;
    if((Date.now() - (ligne.le || 0)) > duree) return null;
    return a;
  }

  function dessinerLApercu(cadre, apercu){
    const url = cadre.getAttribute('data-apercu');
    const site = (apercu && apercu.site) || (function(){
      try { return new URL(url).hostname.replace(/^www\./, ''); } catch(e){ return url; }
    })();
    const titre = (apercu && apercu.titre) || '';
    const texte = (apercu && apercu.description) || '';
    const image = (apercu && apercu.image) || '';
    cadre.innerHTML =
      (image
        ? '<img src="' + escapeHtml(image) + '" alt="" loading="lazy" ' +
          'style="width:100%; max-height:220px; object-fit:cover; display:block; background:var(--panel-2);">'
        : '') +
      '<div style="padding:0.6rem 0.7rem;">' +
        '<div style="font-size:0.7rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em;">' +
          escapeHtml(site) + '</div>' +
        (titre ? '<div style="font-weight:600; line-height:1.3; margin-top:0.15rem;">' + escapeHtml(titre) + '</div>' : '') +
        (texte ? '<div style="font-size:0.8rem; color:var(--muted); line-height:1.4; margin-top:0.25rem;">' +
          escapeHtml(texte) + '</div>' : '') +
      '</div>';
    // L'image d'un site qui la refuse à l'affichage laisserait un cadre gris.
    const img = cadre.querySelector('img');
    if(img) img.addEventListener('error', function(){ img.remove(); });
  }

  // Les aperçus manquants, un à la fois : trente appels lancés ensemble
  // feraient attendre les trente.
  function chercherLesApercus(){
    const cadre = document.querySelector('#communityNewsList [data-apercu][data-apercu-attendu]');
    if(!cadre) return;
    if(apercusEnCours) return;
    const url = cadre.getAttribute('data-apercu');
    cadre.removeAttribute('data-apercu-attendu');

    const fini = function(apercu){
      apercusEnCours = 0;
      // Le fil a pu être redessiné entre-temps : on sert tous les cadres qui
      // portent cette adresse, et non celui d'avant, qui n'existe plus.
      const vise = (window.CSS && CSS.escape) ? CSS.escape(url) : url.replace(/["\\]/g, '\\$&');
      document.querySelectorAll('#communityNewsList [data-apercu="' + vise + '"]')
        .forEach(function(c){ dessinerLApercu(c, apercu); });
      chercherLesApercus();
    };

    if(!window.__sb || !window.__sb.functions || !window.__sb.functions.invoke){
      fini(null);
      return;
    }
    apercusEnCours = 1;
    window.__sb.functions.invoke('apercu', { body: { url: url } }).then(function(res){
      const a = (res && res.data && !res.data.error) ? res.data : null;
      // Gardé même vide : une page qui se refuse aujourd'hui se refusera
      // toute la semaine, et l'on ne va pas le redemander à chaque passage.
      garderLApercu(url, a || { site: '', titre: '', description: '', image: '' });
      fini(a);
    }, function(){ fini(null); });
  }

  // Le direct se regarde dans le billet, là où on l'a trouvé. Il partait dans
  // la page « Live direct » — la bonne page, mais pas celle qu'on regardait,
  // et le fil se refermait derrière soi.
  //
  // Le raccordement au diffuseur reste unique : joinLive fait le travail une
  // fois, et le billet n'est qu'un écran de plus sur le même flux
  // (brancherUnEcranDuLive). Regarder depuis le fil ou depuis la page Live,
  // c'est la même image et le même coût pour celui qui diffuse.
  //
  // Un appui, et non tout seul : une image qui part d'elle-même chez chacun,
  // c'est le téléphone du diffuseur qui s'épuise à nourrir des écrans que
  // personne ne regarde. Et le son ne partirait pas de toute façon — aucun
  // navigateur ne laisse une vidéo s'ouvrir avec le son sans qu'on l'ait
  // demandé.
  function montrerLeLiveDansLeBillet(div, leLive, nom){
    const bouton = div.querySelector('[data-live-join]');
    let cadre = div.querySelector('[data-live-video]');
    if(!cadre){
      cadre = document.createElement('div');
      cadre.setAttribute('data-live-video', '');
      cadre.style.cssText = 'margin-top:0.6rem;';
      cadre.innerHTML =
        '<video autoplay playsinline controls ' +
          'style="width:100%; border-radius:10px; background:#000; display:block;"></video>' +
        '<div data-live-etat class="fb-comment-empty">Mampifandray amin\'ny Live…</div>';
      if(bouton) bouton.insertAdjacentElement('afterend', cadre);
      else div.appendChild(cadre);
      const video = cadre.querySelector('video');
      // L'image est là : le mot d'attente n'a plus rien à dire.
      video.addEventListener('playing', function(){
        const etat = cadre.querySelector('[data-live-etat]');
        if(etat) etat.remove();
      });
    }
    cadre.style.display = '';

    const video = cadre.querySelector('video');
    if(typeof brancherUnEcranDuLive === 'function') brancherUnEcranDuLive(video);
    // Déjà raccordé à ce direct-là — depuis la page Live, ou depuis un autre
    // billet : il n'y a qu'à montrer, surtout pas à rejoindre une seconde fois.
    if(typeof liveRegardeMaintenant !== 'function' || liveRegardeMaintenant() !== leLive.email){
      joinLive(leLive.email, nom);
    }
    video.play().catch(function(){});

    if(bouton){
      bouton.textContent = '⏹️ Ajanony ny fijerena';
      bouton.__enCours = true;
    }
  }

  function refermerLeLiveDuBillet(div){
    const cadre = div.querySelector('[data-live-video]');
    if(cadre) cadre.remove();
    const bouton = div.querySelector('[data-live-join]');
    if(bouton){
      bouton.textContent = '▶️ Jereo ny Live eto';
      bouton.__enCours = false;
    }
  }

  // Le direct s'est arrêté, ou l'on a quitté : live.js appelle ici pour que
  // les billets ne gardent pas un écran noir.
  window.__refermerLesLivesDuFil = function(){
    document.querySelectorAll('#communityNewsList [data-live-email]').forEach(refermerLeLiveDuBillet);
  };

  // Un direct s'arrête sans prévenir le fil : le billet reste, et continue de
  // dire « en ce moment ». On repasse donc sur les billets déjà affichés à
  // chaque changement de présence, plutôt que de recharger tout le fil.
  function majBilletsLive(){
    document.querySelectorAll('#communityNewsList [data-live-email]').forEach(function(div){
      const encore = leLiveEstEnCours(div.getAttribute('data-live-email')) &&
        div.getAttribute('data-live-fini') !== '1';
      const badge = div.querySelector('.fb-type-badge');
      if(badge){
        badge.className = 'fb-type-badge' + (encore ? ' live' : '');
        badge.textContent = encore ? '🔴 LIVE DIRECT' : '⚫ Live tapitra';
      }
      div.classList.toggle('fb-post-live', encore);
      const bouton = div.querySelector('[data-live-join]');
      if(bouton) bouton.style.display = encore ? '' : 'none';
      // Terminé : l'écran du billet se referme avec lui, plutôt que de
      // rester noir sous un billet qui dit « tapitra ».
      if(!encore) refermerLeLiveDuBillet(div);
    });
  }
  window.__majBilletsLive = majBilletsLive;

  function renderCommunityNews(){
    const list = document.getElementById('communityNewsList');
    const emptyHint = document.getElementById('communityNewsEmpty');
    if(!list) return;
    if(!window.__sb){ list.innerHTML=''; emptyHint.style.display = 'block'; return; }
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // La colonne author_photo peut ne pas exister encore : tant que le script
    // SQL n'a pas été passé, la demander ferait échouer la requête entière et
    // le fil resterait vide. On la redemande alors sans elle.
    const COLONNES = 'id,client_name,network,message,link,type,price,image,created_at';
    function lireLeFil(avecPhoto){
      return window.__sb.from('client_news')
        .select(COLONNES + (avecPhoto ? ',author_photo' : ''))
        .gte('created_at', oneWeekAgo)
        .order('created_at', { ascending: false }).limit(30);
    }
    lireLeFil(true)
      .then(function(res){
        if(res && res.error) return lireLeFil(false);
        return res;
      })
      .then(function(res){
        // Le fil est redessiné : les boîtes d'avant n'existent plus, et la
        // lecture commune ne doit pas continuer de les servir.
        oublierLesCommentaires();
        list.innerHTML = '';
        const rows = (res && res.data) || [];
        emptyHint.style.display = rows.length ? 'none' : 'block';
        rows.forEach(function(n){
          const div = document.createElement('div');
          const type = n.type || 'vaovao';
          // Un direct ne dure pas, et personne ne peut effacer son billet
          // depuis le navigateur. Passé deux heures il reste — c'est la trace
          // de ce qui a eu lieu — mais il cesse de dire « en ce moment », et
          // perd son rouge : le lien, lui, ne mène plus à rien.
          const liveFini = type === 'live' && n.created_at &&
            (Date.now() - new Date(n.created_at).getTime()) > 2 * 60 * 60 * 1000;
          // Le direct de quelqu'un qui n'est plus en train de diffuser est
          // fini, quelle que soit l'heure du billet : deux heures, c'était
          // faute de savoir. La présence le sait.
          const leLive = type === 'live' ? lireLeLienDuLive(n.link) : null;
          const lienDuBillet = leLive ? '' : (String(n.link || '').trim() || premierLien(n.message));
          const liveEnCours = type === 'live' && !liveFini &&
            (!leLive || leLiveEstEnCours(leLive.email));
          div.className = 'fb-post' +
            (liveEnCours ? ' fb-post-live' : type === 'entana' ? ' fb-post-entana' : '');
          if(leLive){
            div.setAttribute('data-live-email', leLive.email);
            if(liveFini) div.setAttribute('data-live-fini', '1');
          }
          // Le décompte des « j'aime » arrive après le fil : c'est par cet
          // identifiant qu'il retrouve la publication à laquelle il appartient.
          if(n.id) div.dataset.newsId = n.id;
          const d = n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : '';
          const typeBadge = type === 'live'
            ? (liveEnCours
              ? '<span class="fb-type-badge live">🔴 LIVE DIRECT</span>'
              : '<span class="fb-type-badge">⚫ Live tapitra</span>')
            : (type === 'entana' ? '<span class="fb-type-badge entana">🛒 Entana amidy</span>' : '');
          const medias = parseNewsImages(n.image);
          // « preload=metadata » : de quoi montrer la première image, et rien
          // de plus. Trente billets qui se chargeraient en entier, c'est le
          // fil qui ne s'ouvre plus.
          const baliseMedia = function(src, style){
            return estVideo(src)
              ? '<video src="' + escapeHtml(src) + '" controls preload="metadata" playsinline ' +
                'style="' + style + '"></video>'
              : '<img src="' + escapeHtml(src) + '" alt="" style="' + style + '">';
          };
          let imagesHtml = '';
          if(medias.length === 1){
            imagesHtml = baliseMedia(medias[0], 'max-width:100%; border-radius:10px; margin-top:0.6rem; display:block;');
          } else if(medias.length > 1){
            const cols = medias.length === 2 ? '1fr 1fr' : (medias.length === 3 ? '1fr 1fr 1fr' : '1fr 1fr');
            imagesHtml = '<div style="display:grid; grid-template-columns:' + cols + '; gap:4px; margin-top:0.6rem;">' +
              medias.map(function(src){
                return baliseMedia(src, 'width:100%; height:140px; object-fit:cover; border-radius:8px; display:block;');
              }).join('') +
              '</div>';
          }
          div.innerHTML =
            '<div class="fb-post-head">' +
              // La photo que l'auteur a jointe à SON billet, et rien d'autre :
              // aller la chercher ailleurs d'après le nom affiché la donnerait
              // à une homonyme. Sans photo, les initiales.
              '<div class="fb-avatar">' + (n.author_photo
                ? '<img src="' + escapeHtml(n.author_photo) + '" alt="' + escapeHtml(n.client_name || '') + '">'
                : escapeHtml(initials(n.client_name))) + '</div>' +
              '<div>' +
                '<div class="fb-post-name">' + escapeHtml(n.client_name || 'Client') + '</div>' +
                '<div class="fb-post-meta">' + typeBadge + '<span class="fb-network-badge">' + escapeHtml(n.network || 'Autre') + '</span><span>' + d + '</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="fb-post-body">' + escapeHtml(n.message || '') + '</div>' +
            imagesHtml +
            (n.price ? '<div class="fb-post-price">' + formatAr(n.price) + '</div>' : '') +
            // Un direct n'affiche pas son adresse : elle est longue, illisible,
            // et ne sert qu'à la machine. À sa place, le bouton qui entre —
            // caché dès que le direct s'arrête, car il ne mènerait à rien.
            // Un lien ordinaire, lui, devient une carte : l'image et le titre
            // que le site publie pour être partagé.
            (leLive
              ? '<button type="button" class="btn btn-red btn-sm" data-live-join ' +
                'style="width:auto; margin-top:0.6rem;' + (liveEnCours ? '' : ' display:none;') +
                '">▶️ Jereo ny Live eto</button>'
              : (lienDuBillet
                ? '<a href="' + escapeHtml(lienDuBillet) + '" target="_blank" rel="noopener" ' +
                  'data-apercu="' + escapeHtml(lienDuBillet) + '" data-apercu-attendu ' +
                  'style="display:block; margin-top:0.6rem; border:1px solid var(--line); ' +
                  'border-radius:10px; overflow:hidden; text-decoration:none; color:inherit;"></a>'
                : '')) +
            '<div class="fb-post-actions">' +
            '<span class="fb-like-action" data-like style="cursor:pointer;">👍 J\'aime</span>' +
            '<span class="fb-comment-action" data-comment style="cursor:pointer;">💬 Commenter</span>' +
            // L'achat part de l'annonce elle-même : c'est là qu'on voit la
            // marchandise et son prix, pas dans un onglet qu'il faut aller
            // chercher ensuite en retapant tout de tête.
            (type === 'entana'
              ? '<span class="fb-buy-action" data-buy style="cursor:pointer; color:var(--cyan);">🛒 Acheter</span>'
              : '') +
            '<span class="fb-share-action" data-share style="cursor:pointer;">↗️ Partager</span>' +
            // La feuille de WhatsApp coche cinq personnes et s'arrête là.
            // Celui-ci passe par la liste des clients (zara-rehetra.js) :
            // tout cocher d'un coup, sans plafond.
            '<span class="fb-share-action" data-share-all style="cursor:pointer;">📢 Rehetra</span></div>' +
            '<div class="fb-comments" data-comments style="display:none;"></div>';
          // La ligne du compte se glisse juste avant la rangée des actions.
          const actionsRow = div.querySelector('.fb-post-actions');
          const compteLigne = document.createElement('div');
          compteLigne.className = 'fb-like-count';
          compteLigne.setAttribute('data-like-count', '');
          compteLigne.style.display = 'none';
          if(actionsRow) div.insertBefore(compteLigne, actionsRow);
          const shareEl = div.querySelector('[data-share]');
          if(shareEl){
            shareEl.addEventListener('click', function(){ sharePost(n); });
          }
          const shareAllEl = div.querySelector('[data-share-all]');
          if(shareAllEl){
            shareAllEl.addEventListener('click', function(){ shareToutLeMonde(n); });
          }
          // La carte du lien : le nom du site tout de suite — un cadre vide
          // n'annonce rien — puis l'image et le titre quand ils arrivent.
          const cadreApercu = div.querySelector('[data-apercu]');
          if(cadreApercu){
            const garde = apercuGarde(lienDuBillet);
            dessinerLApercu(cadreApercu, garde);
            if(garde) cadreApercu.removeAttribute('data-apercu-attendu');
          }
          const buyEl = div.querySelector('[data-buy]');
          if(buyEl){
            buyEl.addEventListener('click', function(){ buyFromPost(n); });
          }
          // Le direct se regarde ici même. Sans joinLive — la page publique de
          // la Botika n'a pas le WebRTC — il reste le lien d'origine.
          const liveEl = div.querySelector('[data-live-join]');
          if(liveEl && leLive){
            liveEl.addEventListener('click', function(){
              if(typeof joinLive !== 'function'){
                if(n.link) window.open(n.link, '_blank');
                return;
              }
              if(liveEl.__enCours){
                if(typeof leaveLive === 'function') leaveLive();
                refermerLeLiveDuBillet(div);
                return;
              }
              montrerLeLiveDansLeBillet(div, leLive, leLive.name || n.client_name || '');
            });
          }
          const likeEl = div.querySelector('[data-like]');
          if(likeEl) setupLike(likeEl, n.id);
          const commentEl = div.querySelector('[data-comment]');
          const commentsBox = div.querySelector('[data-comments]');
          if(commentEl && commentsBox && n.id){
            // La boîte est là dès l'affichage : les commentaires sont la
            // suite du billet, pas une annexe qu'il faut penser à déplier.
            commentsBox.style.display = 'block';
            openComments(n.id, commentsBox, false);
            // Le mot ne déplie donc plus rien — il mène au champ, qui est ce
            // qu'on cherchait en le touchant.
            commentEl.addEventListener('click', function(){
              commentsBox.style.display = 'block';
              const champ = commentsBox.querySelector('.fb-comment-input');
              if(champ){ champ.focus(); champ.scrollIntoView({ block: 'nearest' }); }
            });
          }
          list.appendChild(div);
        });
        // Une lecture pour tout le fil, un minuteur, un canal — une fois
        // toutes les boîtes en place.
        veillerSurLesCommentaires();
        // Puis les aperçus qui manquent, un à la fois.
        chercherLesApercus();
        // Un seul appel pour tout le fil : trente publications qui iraient
        // chacune compter ses « j'aime » feraient trente requêtes.
        loadLikes(rows.map(function(n){ return n.id; }).filter(Boolean));
      }, function(){ list.innerHTML=''; emptyHint.style.display = 'block'; });
  }

  let pendingNewsImages = [];
  const MAX_NEWS_IMAGES = 6;
  // La vidéo ne se réduit pas dans le navigateur comme une photo : on ne peut
  // que refuser ce qui est trop lourd. Le bucket refuse la même chose de son
  // côté — c'est lui qui fait foi, la page ne fait qu'éviter un envoi perdu.
  const BUCKET_VIDEO = 'annonce-video';
  const MAX_VIDEO_MO = 25;
  let videoEnCours = false;

  const newsImageInput = document.getElementById('newsImage');
  const newsImagePreviewWrap = document.getElementById('newsImagePreviewWrap');

  function renderNewsImagePreviews(){
    if(!newsImagePreviewWrap) return;
    newsImagePreviewWrap.innerHTML = '';
    if(!pendingNewsImages.length && !videoEnCours){
      newsImagePreviewWrap.style.display = 'none';
      return;
    }
    newsImagePreviewWrap.style.display = 'flex';
    pendingNewsImages.forEach(function(src, idx){
      const thumb = document.createElement('div');
      thumb.style.cssText = 'position:relative; width:100px; height:100px;';
      const cadre = 'width:100%; height:100%; object-fit:cover; border-radius:10px; display:block; border:1px solid var(--line);';
      // La vignette d'une vidéo, c'est sa première image — et un repère pour
      // qu'on ne la prenne pas pour une photo.
      const apercu = estVideo(src)
        ? '<video src="' + src + '" muted playsinline preload="metadata" style="' + cadre + '"></video>' +
          '<span style="position:absolute; left:6px; bottom:4px; color:#fff; font-size:0.8rem; ' +
          'text-shadow:0 1px 3px rgba(0,0,0,0.8);">\u25b6 video</span>'
        : '<img src="' + src + '" style="' + cadre + '">';
      thumb.innerHTML = apercu +
        '<button type="button" data-idx="' + idx + '" title="Esory" ' +
        'style="position:absolute; top:-8px; right:-8px; background:#e5484d; color:#fff; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; line-height:1;">\u2715</button>';
      newsImagePreviewWrap.appendChild(thumb);
    });
    // L'envoi d'une vidéo prend le temps qu'il prend : sans rien à l'écran,
    // on croit que le bouton n'a pas répondu et on recommence.
    if(videoEnCours){
      const attente = document.createElement('div');
      attente.style.cssText = 'width:100px; height:100px; border:1px dashed var(--line); border-radius:10px; ' +
        'display:flex; align-items:center; justify-content:center; text-align:center; ' +
        'font-size:0.68rem; color:var(--muted); padding:0.3rem; box-sizing:border-box;';
      attente.textContent = 'Mandefa ny video\u2026';
      newsImagePreviewWrap.appendChild(attente);
    }
    newsImagePreviewWrap.querySelectorAll('button[data-idx]').forEach(function(btn){
      btn.addEventListener('click', function(){
        pendingNewsImages.splice(Number(btn.getAttribute('data-idx')), 1);
        renderNewsImagePreviews();
      });
    });
  }

  function clearNewsImages(){
    pendingNewsImages = [];
    if(newsImageInput) newsImageInput.value = '';
    renderNewsImagePreviews();
  }

  function resizeImageFile(file, callback){
    const reader = new FileReader();
    reader.onload = function(ev){
      const img = new Image();
      img.onload = function(){
        const maxSide = 900;
        let w = img.width, h = img.height;
        if(w > maxSide || h > maxSide){
          const ratio = Math.min(maxSide / w, maxSide / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  if(newsImageInput){
    newsImageInput.addEventListener('change', function(){
      const files = Array.from(newsImageInput.files || []);
      if(!files.length) return;
      const room = MAX_NEWS_IMAGES - pendingNewsImages.length;
      if(room <= 0){
        alert('Feno ' + MAX_NEWS_IMAGES + ' sary ny isan-tokony hafarana indray mandeha.');
        newsImageInput.value = '';
        return;
      }
      files.slice(0, room).forEach(function(file){
        resizeImageFile(file, function(dataUrl){
          pendingNewsImages.push(dataUrl);
          renderNewsImagePreviews();
        });
      });
      newsImageInput.value = '';
    });
  }

  // La vidéo ne voyage pas dans la ligne : elle part au bucket, et l'annonce
  // ne garde que son adresse. Une seule par annonce — c'est déjà beaucoup à
  // charger pour qui lit le fil sur son téléphone.
  const newsVideoInput = document.getElementById('newsVideo');
  if(newsVideoInput){
    newsVideoInput.addEventListener('change', function(){
      const file = (newsVideoInput.files || [])[0];
      newsVideoInput.value = '';
      if(!file) return;
      if(videoEnCours){ alert('Miandrasa : mbola mandeha ny video teo aloha.'); return; }
      if(pendingNewsImages.some(estVideo)){
        alert('Video iray ihany isaky ny fanambarana. Esory aloha ilay teo aloha.');
        return;
      }
      if(pendingNewsImages.length >= MAX_NEWS_IMAGES){
        alert('Feno ' + MAX_NEWS_IMAGES + ' ny isan-tokony.');
        return;
      }
      const mo = file.size / 1048576;
      if(mo > MAX_VIDEO_MO){
        alert('Lehibe loatra ny video : ' + mo.toFixed(1) + ' Mo. ' +
          MAX_VIDEO_MO + ' Mo no farany ambony. Fohezo na ahenao ny hatsarany.');
        return;
      }
      if(!window.__sb || !window.__sb.storage){
        alert('Tsy tafiditra ny serveur : tsy afaka mandefa video.');
        return;
      }
      videoEnCours = true;
      renderNewsImagePreviews();

      const ext = (String(file.name || '').split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4';
      const nom = (window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + '-' + Math.random().toString(36).slice(2)) + '.' + ext;

      const fini = function(message){
        videoEnCours = false;
        renderNewsImagePreviews();
        if(message) alert(message);
      };

      window.__sb.storage.from(BUCKET_VIDEO)
        .upload(nom, file, { contentType: file.type || 'video/mp4', upsert: false })
        .then(function(res){
          if(res && res.error){
            fini('Tsy lasa ny video : ' + (res.error.message || 'tsy fantatra') +
              '\n\nRaha « Bucket not found » no hitanao, dia mbola tsy nalefa ny ' +
              '« supabase-annonce-video.sql ».');
            return;
          }
          const pub = window.__sb.storage.from(BUCKET_VIDEO).getPublicUrl(nom);
          const url = pub && pub.data && pub.data.publicUrl;
          if(!url){ fini('Tsy hita ny adiresin\'ny video.'); return; }
          pendingNewsImages.push(url);
          fini('');
        }, function(err){
          fini('Tsy lasa ny video : ' + ((err && err.message) || 'réseau'));
        });
    });
  }

  // Le champ du prix n'apparaît que si l'on annonce une marchandise : il n'a
  // rien à faire devant quelqu'un qui écrit une nouvelle ordinaire.
  const newsIsGoods = document.getElementById('newsIsGoods');
  const newsPrice = document.getElementById('newsPrice');
  if(newsIsGoods && newsPrice){
    newsIsGoods.addEventListener('change', function(){
      newsPrice.style.display = newsIsGoods.checked ? 'inline-block' : 'none';
      // :has() suffit aux navigateurs récents ; la classe assure les autres,
      // sans quoi l'icône ne montrerait rien de son état.
      const etiquette = document.getElementById('newsIsGoodsLabel');
      if(etiquette) etiquette.classList.toggle('actif', newsIsGoods.checked);
      if(newsIsGoods.checked) newsPrice.focus();
    });
  }

  const postNewsBtn = document.getElementById('postNewsBtn');
  if(postNewsBtn){
    postNewsBtn.addEventListener('click', function(){
      const message = document.getElementById('newsMessage').value.trim();
      // Publier maintenant, c'est publier sans la vidéo qui est en route.
      if(videoEnCours){ alert('Miandrasa kely : mbola mandeha ny video.'); return; }
      if(!message && !pendingNewsImages.length){ alert('Soraty ny vaovao na alao sary aloha.'); return; }
      if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
      const clientName = (currentUser && currentUser.name) || 'Client';
      // La vignette est calculée avant l'envoi : le billet part avec le visage
      // de son auteur, seul moyen d'en être sûr chez les autres.
      vignette(currentUser && currentUser.logo).then(function(photo){
      const billet = {
        client_name: clientName, network: 'Autre', message: message, link: '',
        // Une annonce marquée « entana amidy » porte son prix, et c'est elle
        // qui fera apparaître le bouton Acheter chez les autres.
        type: (newsIsGoods && newsIsGoods.checked) ? 'entana' : 'vaovao',
        price: (newsIsGoods && newsIsGoods.checked && newsPrice && newsPrice.value) ? Number(newsPrice.value) : null,
        image: pendingNewsImages.length ? JSON.stringify(pendingNewsImages) : null
      };
      const avecAuteur = Object.assign({}, billet, {
        author_email: (currentUser && currentUser.email) || null,
        author_photo: photo
      });
      // Tant que le script SQL n'a pas été passé, ces deux colonnes n'existent
      // pas et l'envoi entier serait refusé : le message doit partir quand même,
      // sans le visage.
      window.__sb.from('client_news').insert(avecAuteur)
        .then(function(res){ return (res && res.error) ? window.__sb.from('client_news').insert(billet) : res; })
        .then(function(){
        document.getElementById('newsMessage').value = '';
        if(newsIsGoods){ newsIsGoods.checked = false; }
        if(newsPrice){ newsPrice.value = ''; newsPrice.style.display = 'none'; }
        clearNewsImages();
        renderCommunityNews();
      }, function(){ alert("Tsy voaray ny fanambarana."); });
      });
    });
  }

  function renderCommunityPanel(){
    const avatar = document.getElementById('composerAvatar');
    if(avatar){
      // La photo du profil quand elle existe ; les initiales sinon, pour ne
      // pas laisser un rond vide à qui n’en a pas déposé.
      const photo = currentUser && currentUser.logo;
      if(photo){
        avatar.innerHTML = '';
        const img = document.createElement('img');
        img.src = photo;
        img.alt = currentUser.name || '';
        avatar.appendChild(img);
      } else {
        avatar.textContent = initials(currentUser && currentUser.name);
      }
    }
    renderCommunityNews();
    renderMarketplaceLinks();
    const marketAdmin = document.getElementById('marketplaceAdminForm');
    if(marketAdmin){
      const isAdmin = currentUser && currentUser.email &&
        currentUser.email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase();
      marketAdmin.style.display = isAdmin ? 'block' : 'none';
    }
  }

  document.getElementById('generateManualCodeBtn').addEventListener('click', function(){
    const email = document.getElementById('manualCodeEmailInput').value.trim();
    const status = document.getElementById('manualCodeStatus');
    if(!email){ status.textContent = 'Veuillez saisir un email.'; return; }
    const code = generateClientCode(email);
    status.textContent = 'Code ' + code + ' généré pour ' + email + ' ✓';
    document.getElementById('manualCodeEmailInput').value = '';
    renderClientCodesAdmin();
  });
  // ---------------- DEMANDES DE DÉBLOCAGE (propriétaire) ----------------
  // Un client qui a oublié son mot de passe règle 20 000 Ar sur le PayPal du
  // propriétaire puis envoie sa demande. Ici le propriétaire vérifie la
  // réception du paiement, confirme, et un code est généré : il le copie et
  // l'envoie au client, qui le saisit sur l'écran de connexion.
  const UNLOCK_SEEN_KEY = 'stockmanager_unlock_seen';

  function loadSeenUnlockIds(){
    try { return JSON.parse(localStorage.getItem(UNLOCK_SEEN_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveSeenUnlockIds(ids){
    try { localStorage.setItem(UNLOCK_SEEN_KEY, JSON.stringify(ids.slice(0, 200))); } catch(e){}
  }

  // Une demande en attente veut dire : « ce client dit avoir envoyé l'argent ».
  // Le propriétaire est prévenu nommément, avec le compte à aller vérifier.
  function notifyNewUnlockRequests(rows){
    const seen = loadSeenUnlockIds();
    const fresh = rows.filter(function(r){ return r.status === 'pending' && seen.indexOf(r.id) < 0; });
    if(!fresh.length) return;
    fresh.forEach(function(r){
      pushNotification('info', (r.name || r.email) + ' a payé ' +
        (Number(r.amount) || 20000).toLocaleString('fr-FR') + ' Ar par ' + paymentMethodLabel(r.payment_method) +
        ' (réf. ' + (r.paypal_reference || '—') + ') pour être débloqué. Vérifiez l\'arrivée de l\'argent sur votre compte, ' +
        'puis Paramètres > Demandes de déblocage.');
    });
    saveSeenUnlockIds(fresh.map(function(r){ return r.id; }).concat(seen));
  }

  // Encaissements que PayPal a confirmés tout seuls : le solde du propriétaire
  // a réellement monté. Il l'apprend sans avoir rien à vérifier.
  const UNLOCK_PAID_SEEN_KEY = 'stockmanager_unlock_paid_seen';

  function loadSeenPaidIds(){
    try { return JSON.parse(localStorage.getItem(UNLOCK_PAID_SEEN_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveSeenPaidIds(ids){
    try { localStorage.setItem(UNLOCK_PAID_SEEN_KEY, JSON.stringify(ids.slice(0, 200))); } catch(e){}
  }

  function notifyAutoConfirmedUnlocks(rows){
    const seen = loadSeenPaidIds();
    const fresh = rows.filter(function(r){
      return r.auto_confirmed && r.status !== 'pending' && seen.indexOf(r.id) < 0;
    });
    if(!fresh.length) return;
    fresh.forEach(function(r){
      // Un déblocage payé avec le portefeuille ne fait entrer aucune somme :
      // ce sont des crédits qui changent de main. Le dire comme tel, plutôt
      // que d'annoncer un argent qui n'est jamais arrivé.
      if(r.payment_method === 'wallet'){
        pushNotification('parrainage', '💰 ' + (r.name || r.email) + ' s\'est débloqué avec ' +
          ((Number(r.amount) || 0) * AR_PER_CREDIT).toLocaleString('fr-FR') +
          ' Ar de son portefeuille — ils sont passés au vôtre.');
        return;
      }
      const recu = r.paid_amount
        ? Number(r.paid_amount).toLocaleString('fr-FR') + ' ' + (r.paid_currency || '')
        : (Number(r.amount) || 20000).toLocaleString('fr-FR') + ' Ar';
      // « parrainage » : l'argent qui entre, que la boutique partage avec ses
      // employés (common.js), et non une simple information.
      pushNotification('parrainage', '💰 Argent reçu sur votre PayPal : ' + recu.trim() + ' de ' +
        (r.name || r.email) + '. Son accès a été rétabli automatiquement, il est prévenu de son côté.');
    });
    saveSeenPaidIds(fresh.map(function(r){ return r.id; }).concat(seen));
  }

  // Prévenu dès l'ouverture de l'application, sans passer par Paramètres.
  function checkPendingUnlockRequests(){
    if(!window.__sb) return;
    if(!(typeof isOwnerEmail === 'function' && currentUser && isOwnerEmail(currentUser.email))) return;
    window.__sb.from('unlock_requests')
      .select('id,name,email,amount,paypal_reference,payment_method,status,paid_amount,paid_currency,paid_amount_ar,auto_confirmed')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(function(res){
        const rows = (res && res.data) || [];
        notifyNewUnlockRequests(rows);
        notifyAutoConfirmedUnlocks(rows);
      }, function(){});
  }

  function unlockStatusLabel(status){
    if(status === 'confirmed') return '<span style="color:var(--cyan);">Confirmé — accès rétabli</span>';
    if(status === 'used') return '<span style="color:var(--muted);">Accès repris par le client</span>';
    return '<span style="color:var(--amber);">En attente de confirmation</span>';
  }

  function renderUnlockRequests(){
    const list = document.getElementById('unlockRequestsList');
    const empty = document.getElementById('unlockRequestsEmpty');
    if(!list) return;
    if(!window.__sb){
      list.innerHTML = '';
      if(empty){ empty.style.display = 'block'; empty.textContent = 'Serveur injoignable : impossible de charger les demandes.'; }
      return;
    }
    window.__sb.from('unlock_requests')
      .select('id,name,email,phone,message,amount,paypal_reference,payment_method,status,created_at,paid_amount,paid_currency,paid_amount_ar,auto_confirmed')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(function(res){
        const rows = (res && res.data) ? res.data : [];
        list.innerHTML = '';
        if(empty) empty.style.display = rows.length ? 'none' : 'block';

        notifyNewUnlockRequests(rows);

        rows.forEach(function(row){
          const card = document.createElement('div');
          card.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.8rem 0.9rem; margin-bottom:0.7rem; background:var(--panel-2);';
          card.innerHTML =
            '<div style="font-size:0.86rem; color:var(--text);"><strong>' + escapeAdminHtml(row.name || '—') + '</strong></div>' +
            '<div style="font-size:0.76rem; color:var(--muted); line-height:1.6; margin-top:0.3rem;">' +
              'Email : ' + escapeAdminHtml(row.email || '—') + '<br>' +
              'Téléphone : ' + escapeAdminHtml(row.phone || '—') + '<br>' +
              'Message : ' + escapeAdminHtml(row.message || '—') + '<br>' +
              'Montant : <strong style="color:var(--text);">' +
                (row.payment_method === 'wallet'
                  ? ((Number(row.amount) || 0) * AR_PER_CREDIT).toLocaleString('fr-FR') + ' Ar (portefeuille)'
                  : (row.amount || 20000).toLocaleString('fr-FR') + ' Ar') + '</strong><br>' +
              'Payé par : <strong style="color:var(--text);">' + escapeAdminHtml(paymentMethodLabel(row.payment_method)) + '</strong><br>' +
              'Référence : ' + escapeAdminHtml(row.paypal_reference || '—') + '<br>' +
              'Reçue le : ' + new Date(row.created_at).toLocaleString('fr-FR') + '<br>' +
              // Ce que PayPal a réellement fait entrer, quand il l'a annoncé.
              (row.paid_amount
                ? 'Encaissé sur PayPal : <strong style="color:var(--cyan);">' +
                  Number(row.paid_amount).toLocaleString('fr-FR') + ' ' + escapeAdminHtml(row.paid_currency || '') +
                  '</strong>' +
                  // Converti en ariary, seule façon de le comparer aux 20 000 Ar.
                  (row.paid_amount_ar ? ' ≈ ' + Number(row.paid_amount_ar).toLocaleString('fr-FR') + ' Ar' : '') +
                  (row.auto_confirmed ? ' — déblocage automatique' : ' — somme insuffisante, à vérifier') + '<br>'
                : '') +
              'État : ' + unlockStatusLabel(row.status) +
            '</div>';

          const actions = document.createElement('div');
          actions.style.cssText = 'display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.7rem; align-items:center;';
          if(row.status === 'pending'){
            const confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.className = 'btn btn-primary btn-sm';
            confirmBtn.style.width = 'auto';
            // Rien ne part avant que l'argent soit sur le compte : c'est cette
            // vérification-là, faite par le propriétaire, qui déclenche tout.
            confirmBtn.textContent = '💰 Argent reçu sur mon compte — débloquer';
            confirmBtn.addEventListener('click', function(){
              const comptes = { card: 'votre compte bancaire', bank: 'votre compte bancaire',
                mobile: 'votre compte Mobile Money' };
              const ou = comptes[row.payment_method] || 'votre compte PayPal';
              if(!confirm('Avez-vous bien vu les ' + (row.amount || 20000).toLocaleString('fr-FR') +
                ' Ar arriver sur ' + ou + ' ?\n\nLe déblocage et les notifications partent immédiatement.')) return;
              confirmBtn.disabled = true;
              confirmUnlockRequest(row, card, confirmBtn);
            });
            actions.appendChild(confirmBtn);
          }
          card.appendChild(actions);
          list.appendChild(card);
        });
      }, function(){
        list.innerHTML = '';
        if(empty){ empty.style.display = 'block'; empty.textContent = 'Chargement impossible : vérifiez votre réseau.'; }
      });
  }

  function escapeAdminHtml(str){
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // Le code n'est stocké nulle part en clair : seul son empreinte (SHA-256)
  // part sur le serveur, le code lui-même n'existe que sur cet écran.
  // Aucun code n'est généré ni transmis : la confirmation rouvre directement
  // l'accès sur l'appareil qui a envoyé la demande (identifié par son jeton).
  function confirmUnlockRequest(row, card, btn){
    window.__sb.from('unlock_requests').update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }).eq('id', row.id).then(function(res){
      if(res && res.error){
        btn.disabled = false;
        alert('Confirmation impossible : ' + (res.error.message || 'erreur serveur'));
        return;
      }
      const box = document.createElement('div');
      box.style.cssText = 'margin-top:0.7rem; border-top:1px solid var(--line); padding-top:0.7rem; font-size:0.78rem; color:var(--cyan); line-height:1.5;';
      box.textContent = 'Argent reçu et déblocage envoyé ✓ Le client retrouve son accès directement sur son appareil, ' +
        'sans code à transmettre, et il est prévenu à sa prochaine ouverture même s\'il a fermé la page.';
      card.appendChild(box);
      btn.remove();
      // L'argent qui entre : partagé avec les employés, comme le portefeuille.
      pushNotification('parrainage', 'Argent reçu (' + paymentMethodLabel(row.payment_method) + ') pour ' +
        (row.name || row.email) + ' — accès rétabli, le client est prévenu.');
    }, function(){
      btn.disabled = false;
      alert('Confirmation impossible : vérifiez votre réseau.');
    });
  }

  const refreshUnlockRequestsBtn = document.getElementById('refreshUnlockRequestsBtn');
  if(refreshUnlockRequestsBtn){
    refreshUnlockRequestsBtn.addEventListener('click', renderUnlockRequests);
  }

  // ---------------- NOUVELLES INSCRIPTIONS (propriétaire) ----------------
  const SIGNUPS_SEEN_KEY = 'stockmanager_signups_seen';

  function loadSeenSignupIds(){
    try { return JSON.parse(localStorage.getItem(SIGNUPS_SEEN_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveSeenSignupIds(ids){
    try { localStorage.setItem(SIGNUPS_SEEN_KEY, JSON.stringify(ids.slice(0, 300))); } catch(e){}
  }

  function renderSignups(){
    const body = document.getElementById('signupsTableBody');
    const empty = document.getElementById('signupsEmpty');
    if(!body) return;
    if(!window.__sb){
      body.innerHTML = '';
      if(empty){ empty.style.display = 'block'; empty.textContent = 'Serveur injoignable : impossible de charger les inscriptions.'; }
      return;
    }
    window.__sb.from('client_signups')
      .select('id,name,email,phone,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(function(res){
        const rows = (res && res.data) ? res.data : [];
        body.innerHTML = '';
        if(empty) empty.style.display = rows.length ? 'none' : 'block';

        const seen = loadSeenSignupIds();
        const fresh = rows.filter(function(r){ return seen.indexOf(r.id) < 0; });
        if(fresh.length && seen.length){
          pushNotification('info', fresh.length + ' nouvelle(s) inscription(s) à Ny asako.');
        }
        if(fresh.length){
          saveSeenSignupIds(fresh.map(function(r){ return r.id; }).concat(seen));
        }

        rows.forEach(function(row){
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + new Date(row.created_at).toLocaleString('fr-FR') + '</td>' +
            '<td>' + escapeAdminHtml(row.name || '—') + '</td>' +
            '<td>' + escapeAdminHtml(row.email || '—') + '</td>' +
            '<td>' + escapeAdminHtml(row.phone || '—') + '</td>';
          body.appendChild(tr);
        });
      }, function(){
        body.innerHTML = '';
        if(empty){ empty.style.display = 'block'; empty.textContent = 'Chargement impossible : vérifiez votre réseau.'; }
      });
  }

  const refreshSignupsBtn = document.getElementById('refreshSignupsBtn');
  if(refreshSignupsBtn){
    refreshSignupsBtn.addEventListener('click', renderSignups);
  }
