// Portefeuille en ariary : solde, conversion internationale, retraits.
//
// Tout ce qui touche à de l'argent passe par ici, jamais par le navigateur.
// Une page peut être modifiée par celui qui la regarde ; un solde qu'elle
// calculerait elle-même serait un solde qu'elle pourrait s'inventer.
//
// Le solde n'est pas stocké : il se déduit de ce qui est déjà en base —
// parrainages gagnés, moins les retraits (demandés ou envoyés), moins les
// déblocages payés avec le portefeuille. Rien à tenir à jour, rien à
// désynchroniser, et aucun chiffre à falsifier.
//
// Déploiement : voir LISEZ-MOI-SUPABASE.txt, section "Portefeuille".
// À déployer AVEC vérification du jeton (pas de --no-verify-jwt) : c'est ce
// qui garantit que la personne qui retire est bien celle qu'elle prétend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Ce que rapporte un parrainage. Une seule définition, côté serveur : si
// elle vivait dans la page, chacun pourrait décider de sa propre valeur.
//
// Deux tarifs. Le propriétaire invite pour faire venir des clients à
// l'application entière, pas pour se faire un pécule : ses invitations
// valent davantage. Celles d'un client valent le tarif ordinaire.
//
// Ce chiffre-là ne sert QU'À CE QUE LES INVITATIONS RAPPORTENT. Il ne doit
// jamais servir à chiffrer une dépense — voir « spent » plus bas, qui garde
// exprès le tarif de base.
const AR_PER_REFERRAL = Number(Deno.env.get("AR_PER_REFERRAL") ?? "1000");
const AR_PER_REFERRAL_OWNER = Number(Deno.env.get("AR_PER_REFERRAL_OWNER") ?? "5000");

function tarifParrainage(email: string): number {
  const proprio = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  return proprio && email === proprio ? AR_PER_REFERRAL_OWNER : AR_PER_REFERRAL;
}
const MIN_PAYOUT_AR = Number(Deno.env.get("MIN_PAYOUT_AR") ?? "10000");

// L'argent sort par le canal que la personne indique. La liste n'a pas à être
// fermée : elle le serait pour rien, puisque c'est un humain qui exécute
// l'envoi et qu'un canal inconnu s'accompagne de ses consignes.
const METHODS = new Set(["paypal", "card", "mobile", "cash", "wallet", "merchant"]);
// Payer un achat, c'est envoyer chez un marchand plutôt que chez le client :
// seule la destination change, la somme sort du solde de la même façon.
const PURCHASE_METHODS = new Set(["merchant"]);

// Ce qui s'achète à l'intérieur de l'application, et à quel prix. Les prix
// vivent ici et nulle part ailleurs : dans la page, chacun pourrait décider
// de payer son abonnement un ariary.
const SITE_ITEMS: Record<string, { label: string; priceAr: number; days?: number; grant?: string }> = {
  sub_month: { label: "Abonnement mensuel", priceAr: 15000, days: 30 },
  sub_year: { label: "Abonnement annuel", priceAr: 150000, days: 365 },
  trial_day: { label: "Un jour d'essai en plus", priceAr: 10000, grant: "trial_day" },
  booster: { label: "Booster — direct Facebook 24 h", priceAr: 5000, grant: "booster" },
  sub_days: { label: "7 jours mis de côté pour l'abonnement", priceAr: 20000, grant: "sub_days" },
};

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

// Combien d'unités de la devise demandée vaut 1 ariary.
async function rateFromAr(currency: string): Promise<number> {
  if (!currency || currency === "MGA") return 1;
  const fixed = Number(Deno.env.get(`RATE_${currency}_MGA`) ?? "0");
  if (fixed > 0) return 1 / fixed;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/MGA");
    if (!res.ok) return 0;
    const data = await res.json();
    const rate = Number(data?.rates?.[currency] ?? 0);
    return rate > 0 ? rate : 0;
  } catch {
    return 0;
  }
}

// ============================================================
// L'ENVOI AUTOMATIQUE
//
// Un retrait était une demande : la ligne entrait en « pending », le
// propriétaire allait envoyer l'argent lui-même, puis la marquait « sent ».
// Un canal dont les clefs sont posées en secrets s'exécute maintenant tout
// seul, à la seconde où la demande est faite.
//
// Un canal sans clefs ne change pas d'un iota : il reste une demande que
// quelqu'un exécute. C'est le défaut, et il le reste.
//
// Trois règles, et elles ne se négocient pas :
//
//   1. On n'invente jamais un succès. Si la réponse du fournisseur ne dit
//      pas clairement que l'argent est parti, la ligne reste « pending » et
//      un humain tranche. Marquer « sent » à tort, c'est perdre la somme ;
//      marquer « refused » à tort, c'est la rendre deux fois.
//
//   2. L'identifiant de la ligne sert de clef au fournisseur. Rejouer le
//      même retrait lui présente la même clef, et c'est LUI qui refuse le
//      doublon — une garantie qui ne dépend pas de notre code.
//
//   3. La ligne existe en base AVANT qu'on tente quoi que ce soit. Si
//      l'envoi part et que notre réponse se perd, la trace est déjà là :
//      c'est ce qui permet de retrouver l'argent plutôt que de le chercher.
// ============================================================

type Envoi =
  | { etat: "envoye"; ref: string; brut: unknown }
  | { etat: "refuse"; raison: string; brut: unknown }
  | { etat: "incertain"; raison: string; brut: unknown };

// ---- PayPal Payouts ----
// Secrets attendus, et rien dans le code :
//   PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV ("sandbox" ou "live").
// Sans les deux premiers, le canal reste manuel.
function paypalConfigure(): boolean {
  return !!(Deno.env.get("PAYPAL_CLIENT_ID") && Deno.env.get("PAYPAL_SECRET"));
}

function paypalBase(): string {
  return (Deno.env.get("PAYPAL_ENV") ?? "sandbox").toLowerCase() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function paypalJeton(): Promise<string | null> {
  const cle = btoa(
    (Deno.env.get("PAYPAL_CLIENT_ID") ?? "") + ":" + (Deno.env.get("PAYPAL_SECRET") ?? ""),
  );
  try {
    const res = await fetch(paypalBase() + "/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + cle,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}

async function paypalEnvoyer(
  idLigne: string,
  destination: string,
  montant: number,
  devise: string,
): Promise<Envoi> {
  // PayPal ne connaît pas l'ariary. Partir dans une devise qu'il refuse,
  // c'est un retrait qui échoue à l'arrivée sans qu'on sache pourquoi.
  if (!devise || devise === "MGA") {
    return {
      etat: "refuse",
      raison: "PayPal n'accepte pas l'ariary : choisissez une devise d'arrivée (EUR, USD…).",
      brut: null,
    };
  }
  if (!(montant > 0)) {
    return {
      etat: "refuse",
      raison: "conversion indisponible : le taux du jour n'a pas été trouvé.",
      brut: null,
    };
  }

  const jeton = await paypalJeton();
  if (!jeton) {
    return { etat: "incertain", raison: "PayPal n'a pas rendu de jeton.", brut: null };
  }

  // « sender_batch_id » est la clef : PayPal refuse deux fois la même. C'est
  // ce qui empêche un même retrait de partir deux fois, même si notre appel
  // est rejoué.
  const corps = {
    sender_batch_header: {
      sender_batch_id: idLigne,
      email_subject: "Ny asako — retrait",
      email_message: "Votre retrait depuis Ny asako.",
    },
    items: [{
      recipient_type: "EMAIL",
      amount: { value: montant.toFixed(2), currency: devise },
      receiver: destination,
      sender_item_id: idLigne,
    }],
  };

  let res: Response;
  try {
    res = await fetch(paypalBase() + "/v1/payments/payouts", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + jeton,
        "Content-Type": "application/json",
        // Deuxième garde-fou, du côté de la requête cette fois.
        "PayPal-Request-Id": idLigne,
      },
      body: JSON.stringify(corps),
    });
  } catch (e) {
    // Le réseau a lâché : on ne sait pas si PayPal a reçu la demande. C'est
    // exactement le cas où l'on ne décide rien.
    return { etat: "incertain", raison: "réseau : " + String(e), brut: null };
  }

  let brut: unknown = null;
  try {
    brut = await res.json();
  } catch {
    brut = null;
  }
  const rep = brut as Record<string, unknown> | null;

  if (res.status === 201 || res.status === 200) {
    const entete = (rep?.batch_header ?? {}) as Record<string, unknown>;
    const ref = String(entete.payout_batch_id ?? "");
    if (!ref) {
      return { etat: "incertain", raison: "PayPal a répondu sans référence.", brut };
    }
    return { etat: "envoye", ref, brut };
  }

  // Clef déjà vue : le retrait est DÉJÀ parti lors d'une tentative
  // précédente. Ce n'est pas un échec — c'est la preuve que la règle 2 a
  // joué, et il ne faut surtout pas renvoyer.
  const nom = String(rep?.name ?? "");
  if (res.status === 400 && nom.indexOf("DUPLICATE") >= 0) {
    return { etat: "envoye", ref: idLigne, brut };
  }

  // 4xx : PayPal a compris et refuse (adresse invalide, solde marchand
  // insuffisant…). 5xx : c'est chez lui que ça cloche, on ne conclut pas.
  const raison = String(rep?.message ?? rep?.name ?? ("HTTP " + res.status));
  if (res.status >= 500) return { etat: "incertain", raison, brut };
  return { etat: "refuse", raison, brut };
}

// ---- L'aiguillage ----
// Rendre null, c'est dire « ce canal n'est pas automatique » : la demande
// suit alors l'ancien chemin, sans rien tenter.
async function executerLeRetrait(
  methode: string,
  idLigne: string,
  destination: string,
  montantSortie: number | null,
  devise: string,
): Promise<{ fournisseur: string; envoi: Envoi } | null> {
  if (methode === "paypal" && paypalConfigure()) {
    return {
      fournisseur: "paypal",
      envoi: await paypalEnvoyer(idLigne, destination, Number(montantSortie ?? 0), devise),
    };
  }
  // MVola, Orange Money, Airtel Money : leurs interfaces existent, mais
  // elles répondent « reçu » et se concluent plus tard, par une seconde
  // question. Les écrire sans pouvoir les éprouver sur un compte marchand
  // réel reviendrait à confier de l'argent à du code que personne n'a jamais
  // vu fonctionner. Elles restent manuelles jusque-là.
  return null;
}

type Admin = ReturnType<typeof createClient>;

// ---- Le solde, déduit de la base ----
async function balanceFor(admin: Admin, email: string): Promise<number> {
  // 1) ce que les parrainages ont rapporté, sur toutes les installations
  //    rattachées à ce compte
  const { data: owners } = await admin.from("wallet_owners")
    .select("install_id").eq("email", email);
  const installs = (owners ?? []).map((o: { install_id: string }) => o.install_id);

  let earned = 0;
  if (installs.length) {
    const { count } = await admin.from("referrals")
      .select("id", { count: "exact", head: true })
      .in("inviter_id", installs);
    earned = (count ?? 0) * tarifParrainage(email);
  }

  // 2) ce qui est parti ou est réservé pour partir
  const { data: payouts } = await admin.from("wallet_payouts")
    .select("amount_ar,status").eq("email", email).in("status", ["pending", "sent"]);
  const withdrawn = (payouts ?? []).reduce(
    (sum: number, p: { amount_ar: number }) => sum + (Number(p.amount_ar) || 0), 0);

  // 3) ce qui a servi à rouvrir un accès. « amount » y est compté en
  //    crédits, et un crédit vaut AR_PER_REFERRAL — le tarif de BASE, pas
  //    celui de celui qui regarde. Un déblocage coûte vingt mille ariary à
  //    tout le monde ; le passer au tarif du propriétaire le ferait coûter
  //    cent mille au seul qui n'en paie jamais.
  const { data: unlocks } = await admin.from("unlock_requests")
    .select("amount").eq("email", email).eq("payment_method", "wallet");
  const spent = (unlocks ?? []).reduce(
    (sum: number, u: { amount: number }) => sum + (Number(u.amount) || 0) * AR_PER_REFERRAL, 0);

  // 4) ce qui est entré du dehors. Les versements confirmés seulement :
  //    un versement annoncé et pas encore vérifié ne vaut rien, sans quoi
  //    l'annonce suffirait à dépenser.
  const { data: depots } = await admin.from("wallet_deposits")
    .select("amount_ar").eq("email", email).eq("status", "confirme");
  const deposited = (depots ?? []).reduce(
    (sum: number, d: { amount_ar: number }) => sum + (Number(d.amount_ar) || 0), 0);

  return Math.max(0, earned + deposited - withdrawn - spent);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ownerEmail = norm(Deno.env.get("OWNER_EMAIL"));
  if (!supabaseUrl || !serviceKey) return json({ error: "configuration incomplète" }, 500);

  // Qui appelle ? C'est le jeton qui le dit, pas le corps de la requête :
  // sinon n'importe qui retirerait au nom de n'importe qui.
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "non authentifié" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  const email = norm(caller?.user?.email);
  if (callerError || !email) return json({ error: "session invalide" }, 401);
  const isOwner = !!ownerEmail && email === ownerEmail;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  const action = String(body.action ?? "");

  // ---- Rattacher cette installation au compte, puis rendre l'état ----
  if (action === "state") {
    const installId = String(body.installId ?? "").trim();
    if (installId) {
      // Le premier qui rattache garde : on n'écrase jamais un rattachement
      // existant, sinon il suffirait de connaître l'identifiant d'un
      // appareil pour s'en approprier les gains.
      const { data: existing } = await admin.from("wallet_owners")
        .select("email").eq("install_id", installId).maybeSingle();
      if (!existing) {
        await admin.from("wallet_owners").insert({ install_id: installId, email: email });
      }
    }

    const balance = await balanceFor(admin, email);
    const { data: mine } = await admin.from("wallet_payouts")
      .select("id,amount_ar,method,kind,destination,link,instructions,currency,amount_out,status,note,created_at,settled_at,auto_provider,auto_ref")
      .eq("email", email).order("created_at", { ascending: false }).limit(20);

    let queue = null;
    if (isOwner) {
      const { data: pending } = await admin.from("wallet_payouts")
        .select("id,email,name,amount_ar,method,kind,destination,link,instructions,currency,amount_out,rate,status,created_at")
        .eq("status", "pending").order("created_at", { ascending: true }).limit(50);
      queue = pending ?? [];
    }

    // Ce qui est entré, avec son état : un versement en attente doit se voir,
    // sinon la personne qui vient de payer croit que rien n'est arrivé.
    const { data: depots } = await admin.from("wallet_deposits")
      .select("id,amount_ar,provider,provider_ref,status,note,created_at,confirmed_at")
      .eq("email", email).order("created_at", { ascending: false }).limit(20);

    return json({
      balanceAr: balance, arPerReferral: tarifParrainage(email), minPayoutAr: MIN_PAYOUT_AR,
      payouts: mine ?? [], deposits: depots ?? [], queue, isOwner, items: SITE_ITEMS,
    });
  }

  // ---- Acheter à l'intérieur de l'application ----
  // Rien ne part au dehors : la somme quitte le solde et le droit est acquis
  // sur-le-champ. La demande est enregistrée comme déjà réglée, pour que le
  // solde en tienne compte et que l'achat laisse une trace.
  if (action === "spend") {
    const itemId = String(body.item ?? "");
    const item = SITE_ITEMS[itemId];
    if (!item) return json({ error: "article inconnu" }, 400);

    const balance = await balanceFor(admin, email);
    if (item.priceAr > balance) {
      return json({
        error: `Votre solde est de ${balance.toLocaleString("fr-FR")} Ar, il en faut ` +
          `${item.priceAr.toLocaleString("fr-FR")} Ar.`,
      }, 400);
    }

    const { data, error } = await admin.from("wallet_payouts").insert({
      email: email, name: String(body.name ?? "").trim(),
      amount_ar: item.priceAr, method: "site", kind: "insite",
      destination: item.label, currency: "MGA", amount_out: item.priceAr, rate: 1,
      status: "sent", settled_at: new Date().toISOString(),
    }).select("id").single();

    if (error) return json({ error: error.message }, 500);
    return json({
      bought: itemId, label: item.label, priceAr: item.priceAr, days: item.days ?? 0,
      grant: item.grant ?? null,
      balanceAr: balance - item.priceAr, receipt: data.id,
    });
  }

  // ---- Conversion, pour afficher le solde dans une autre devise ----
  if (action === "rate") {
    const currency = String(body.currency ?? "").toUpperCase();
    const rate = await rateFromAr(currency);
    return json({ currency, rate });
  }

  // ---- Demander un retrait ----
  if (action === "payout") {
    const amount = Math.floor(Number(body.amountAr ?? 0));
    const method = String(body.method ?? "");
    const destination = String(body.destination ?? "").trim();
    const currency = String(body.currency ?? "MGA").toUpperCase();
    const name = String(body.name ?? "").trim();
    const link = String(body.link ?? "").trim().slice(0, 500);
    const instructions = String(body.instructions ?? "").trim().slice(0, 2000);
    const kind = PURCHASE_METHODS.has(method) ? "purchase" : "payout";

    if (!METHODS.has(method)) return json({ error: "moyen de retrait inconnu" }, 400);
    if (!destination) return json({ error: "indiquez où envoyer l'argent" }, 400);
    // Un canal que l'application ne connaît pas ne se devine pas : sans la
    // marche à suivre, la somme partirait au hasard.
    if ((method === "wallet" || method === "merchant" || method === "cash") && !instructions) {
      return json({ error: "expliquez comment procéder : sans consigne, l'envoi ne peut pas se faire." }, 400);
    }
    if (!(amount > 0)) return json({ error: "montant invalide" }, 400);
    if (amount < MIN_PAYOUT_AR) {
      return json({ error: `Le retrait minimum est de ${MIN_PAYOUT_AR.toLocaleString("fr-FR")} Ar.` }, 400);
    }

    const balance = await balanceFor(admin, email);
    if (amount > balance) {
      return json({ error: `Votre solde est de ${balance.toLocaleString("fr-FR")} Ar.` }, 400);
    }

    const rate = await rateFromAr(currency);
    const amountOut = rate > 0 ? Number((amount * rate).toFixed(2)) : null;

    const { data, error } = await admin.from("wallet_payouts").insert({
      email: email, name: name, amount_ar: amount, method: method, kind: kind,
      destination: destination, link: link || null, instructions: instructions || null,
      currency: currency, amount_out: amountOut, rate: rate || null,
      status: "pending",
    }).select("id,amount_ar,currency,amount_out").single();

    if (error) return json({ error: error.message }, 500);

    // La ligne existe avant qu'on tente quoi que ce soit : si l'envoi part et
    // que notre réponse se perd, la trace est déjà en base.
    const tentative = await executerLeRetrait(
      method,
      String(data.id),
      destination,
      amountOut,
      currency,
    );

    let etatFinal = "pending";
    let motAuClient = "";

    if (tentative) {
      const e = tentative.envoi;
      const commun = {
        auto_provider: tentative.fournisseur,
        auto_attempts: 1,
        auto_raw: e.brut ?? null,
      };
      const maintenant = new Date().toISOString();

      if (e.etat === "envoye") {
        etatFinal = "sent";
        // Le filtre sur 'pending' rend l'écriture sans effet si la ligne a
        // déjà été tranchée entre-temps : deux chemins ne la marquent pas deux fois.
        await admin.from("wallet_payouts").update({
          ...commun,
          auto_ref: e.ref,
          status: "sent",
          note: "Envoyé automatiquement (" + tentative.fournisseur + ") — réf. " + e.ref,
          settled_at: maintenant,
        }).eq("id", data.id).eq("status", "pending");
        motAuClient = "Lasa ho azy ny vola.";
      } else if (e.etat === "refuse") {
        // Refusé pour une raison comprise : le solde revient, et on dit
        // laquelle — un refus sans motif ne se corrige pas.
        etatFinal = "refused";
        await admin.from("wallet_payouts").update({
          ...commun,
          status: "refused",
          note: "Refusé par " + tentative.fournisseur + " : " + e.raison,
          settled_at: maintenant,
        }).eq("id", data.id).eq("status", "pending");
        motAuClient = "Tsy lasa : " + e.raison;
      } else {
        // On ne sait pas. On ne décide donc rien : la ligne reste en attente,
        // avec ce qu'on sait écrit dessus, et le propriétaire tranche.
        await admin.from("wallet_payouts").update({
          ...commun,
          note: "À vérifier chez " + tentative.fournisseur + " : " + e.raison,
        }).eq("id", data.id).eq("status", "pending");
        motAuClient = "Mbola tsy voamarina : hojeren'ny tompon'ny appli.";
      }
    }

    // Le solde est déjà amputé : un retrait en attente compte comme parti,
    // sinon la même somme pourrait être demandée deux fois. Un refus, lui,
    // la rend — « balanceFor » ne compte que 'pending' et 'sent'.
    const soldeApres = etatFinal === "refused" ? balance : balance - amount;
    return json({
      payout: data,
      balanceAr: soldeApres,
      etat: etatFinal,
      message: motAuClient,
      auto: tentative ? { fournisseur: tentative.fournisseur, etat: tentative.envoi.etat } : null,
    });
  }

  // ---- Reprendre une demande qui n'est jamais partie ----
  // Une demande en attente est déjà retirée du solde : c'est ce qui empêche
  // de demander deux fois la même somme. Mais si elle ne part jamais — canal
  // manuel qu'on a laissé dormir, destination fautive, envie changée — la
  // somme reste dehors sans être arrivée nulle part. Elle est perdue pour
  // celui qui la possède.
  //
  // L'annulation la rend : la ligne passe en « refused », et « balanceFor »
  // ne compte que 'pending' et 'sent'.
  //
  // UNE SEULE RÈGLE, ET ELLE EST ABSOLUE : on ne rend une somme que si l'on
  // est SÛR qu'elle n'est pas partie. Une ligne qu'un canal automatique a
  // touchée a pu partir sans que la réponse nous parvienne — la rendre
  // reviendrait à la payer deux fois. Celle-là ne s'annule pas d'un bouton :
  // on va voir chez le fournisseur, et c'est le propriétaire qui tranche.
  if (action === "annuler") {
    const id = String(body.id ?? "").trim();
    if (!id) return json({ error: "demande introuvable" }, 400);

    const { data: ligne } = await admin.from("wallet_payouts")
      .select("id,email,status,auto_provider,auto_attempts,amount_ar")
      .eq("id", id).maybeSingle();

    if (!ligne) return json({ error: "demande introuvable" }, 404);

    // La sienne, ou n'importe laquelle si l'on est le propriétaire.
    const aLui = norm(ligne.email) === email;
    if (!aLui && !isOwner) return json({ error: "ce retrait n'est pas le vôtre" }, 403);

    if (ligne.status !== "pending") {
      return json({ error: "Cette demande est déjà tranchée." }, 409);
    }

    if (ligne.auto_provider || Number(ligne.auto_attempts ?? 0) > 0) {
      return json({
        error: "Un envoi a déjà été tenté chez " + String(ligne.auto_provider ?? "le fournisseur") +
          ". Vérifiez là-bas si la somme est partie avant d'annuler : sans cela, elle serait rendue " +
          "alors qu'elle est déjà arrivée.",
      }, 409);
    }

    // Le filtre sur 'pending' rend l'opération sans effet si elle vient
    // d'être tranchée ailleurs : deux clics ne rendent pas la somme deux fois.
    const { data, error } = await admin.from("wallet_payouts")
      .update({
        status: "refused",
        note: aLui ? "Annulé par son auteur — somme rendue" : "Annulé par le propriétaire — somme rendue",
        settled_at: new Date().toISOString(),
      })
      .eq("id", id).eq("status", "pending")
      .select("id,amount_ar").maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Cette demande vient d'être tranchée." }, 409);

    return json({ annule: data, balanceAr: await balanceFor(admin, email) });
  }

  // ---- Le propriétaire a envoyé l'argent, ou refuse ----
  if (action === "settle") {
    if (!isOwner) return json({ error: "réservé au propriétaire" }, 403);
    const id = String(body.id ?? "");
    const decision = String(body.decision ?? "");
    const note = String(body.note ?? "").trim();
    if (!id || (decision !== "sent" && decision !== "refused")) {
      return json({ error: "décision invalide" }, 400);
    }
    // Le filtre sur 'pending' rend l'opération sans effet si elle a déjà été
    // tranchée : deux clics ne valent pas deux envois.
    const { data, error } = await admin.from("wallet_payouts")
      .update({ status: decision, note: note || null, settled_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending")
      .select("id,email,amount_ar,status").maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "demande déjà traitée" }, 409);
    return json({ payout: data });
  }

  return json({ error: "action inconnue" }, 400);
});
