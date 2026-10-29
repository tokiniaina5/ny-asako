// Portefeuille en ariary : solde, conversion internationale, retraits.
//
// Tout ce qui touche à de l'argent passe par ici, jamais par le navigateur.
// Une page peut être modifiée par celui qui la regarde ; un solde qu'elle
// calculerait elle-même serait un solde qu'elle pourrait s'inventer.
//
// Le solde n'est pas stocké : il se déduit de ce qui est déjà en base —
// versements confirmés, ventes et transferts reçus, moins les retraits
// (demandés ou envoyés), moins les déblocages payés avec le portefeuille. Rien à tenir à jour, rien à
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

// Les déblocages payés avec le portefeuille sont inscrits en crédits ; un
// crédit vaut mille ariary.
// Le parrainage est supprimé (20/10/2026) : il ne rapporte plus rien, et ce
// qu'il avait rapporté ne compte plus dans le solde.
const AR_PER_CREDIT = 1000;
const MIN_PAYOUT_AR = Number(Deno.env.get("MIN_PAYOUT_AR") ?? "10000");
// Frais de retrait, en pourcentage, ajoutés à la somme demandée : la personne
// reçoit ce qu'elle a demandé, et son solde baisse de la somme + les frais.
const PAYOUT_FEE_PCT = Number(Deno.env.get("PAYOUT_FEE_PCT") ?? "0.5");
function fraisRetrait(montant: number): number {
  return PAYOUT_FEE_PCT > 0 ? Math.ceil(montant * PAYOUT_FEE_PCT / 100) : 0;
}

// L'argent sort vers un vrai compte, et seulement vers ceux-là :
//   wise, payoneer, skrill   portefeuilles internationaux, envoyés par le
//             propriétaire depuis son propre compte sur ces services ;
//   mobile    MVola / Orange Money / Airtel Money, en ariary ;
//   card      virement vers un compte bancaire.
// PayPal est retiré (26/09/2026 : il ne fonctionnait pas), comme les
// anciennes sorties « cash », « wallet », « merchant » : leurs lignes
// passées gardent leur nom à l'affichage, rien de neuf ne s'y ouvre.
// Depuis le 26/09/2026 au soir, seul le Mobile Money reste ouvert : c'est
// là que partent les dépôts (Papi n'envoie pas d'argent,
// le propriétaire exécute). Wise, Payoneer, Skrill et banque sont fermés.
// « merchant » (03/10/2026) : un achat dans une boutique à l'étranger
// (« Achats internationaux »), payé avec la vola tena izy seule — jamais
// avec les sommes de l'appli. Le propriétaire l'achète
// depuis le lien et le fait livrer à l'adresse donnée.
const METHODS = new Set(["mobile", "merchant", "usdt"]);
// Le retrait en USDT (26/10/2026) : le propriétaire l'envoie de son propre
// portefeuille crypto, sur le réseau choisi. L'adresse se vérifie ici :
// une adresse fausse, et l'argent part pour toujours.
const ADIRESY_USDT: Record<string, RegExp> = {
  TRC20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  BEP20: /^0x[0-9a-fA-F]{40}$/,
};
// L'envoi USDT par la machine (26/10/2026) : depuis un portefeuille propre à
// l'appli, dont la clef privée n'existe que dans les secrets Supabase —
// USDT_TRON_PRIVATE_KEY (TRC20) et USDT_BSC_PRIVATE_KEY (BEP20). Sans clef,
// le réseau reste à la main. Le portefeuille doit porter aussi de quoi payer
// le réseau : du TRX sur Tron, du BNB sur BSC.
const USDT_CONTRAT = {
  TRC20: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",          // 6 décimales
  BEP20: "0x55d398326f99059fF775485246999027B3197955",  // 18 décimales
};
// Au-delà, la machine refuse et l'on envoie à la main : une erreur de code
// ou une session volée ne vide pas le portefeuille d'un coup.
const USDT_AUTO_MAX = Number(Deno.env.get("USDT_AUTO_MAX") ?? "100");
function clefUsdt(reseau: string): string {
  const k = (Deno.env.get(reseau === "TRC20" ? "USDT_TRON_PRIVATE_KEY" : "USDT_BSC_PRIVATE_KEY") ?? "").trim();
  return k.replace(/^0x/i, "");
}

// Deux temps séparés : tant que rien n'est diffusé, un échec se rattrape
// (« diffuse: false ») ; une fois diffusé, seul l'explorateur sait la vérité.
type EnvoiUsdt = { ok: true; txid: string } | { ok: false; diffuse: boolean; erreur: string };

async function envoyerUsdt(reseau: string, adresse: string, montant: number): Promise<EnvoiUsdt> {
  const clef = clefUsdt(reseau);
  if (!/^[0-9a-fA-F]{64}$/.test(clef)) return { ok: false, diffuse: false, erreur: "clef privée absente ou invalide" };

  if (reseau === "TRC20") {
    const { TronWeb } = await import("npm:tronweb@6.0.0");
    const apiKey = Deno.env.get("TRONGRID_API_KEY") ?? "";
    const tw = new TronWeb({
      fullHost: "https://api.trongrid.io",
      headers: apiKey ? { "TRON-PRO-API-KEY": apiKey } : undefined,
      privateKey: clef,
    });
    const moi = tw.defaultAddress.base58 as string;
    const unites = BigInt(Math.round(montant * 1e6));
    let signee: { txID: string };
    try {
      const contrat = await tw.contract().at(USDT_CONTRAT.TRC20);
      const solde = BigInt(String(await contrat.balanceOf(moi).call()));
      if (solde < unites) return { ok: false, diffuse: false, erreur: `USDT tsy ampy ao amin'ny wallet (${Number(solde) / 1e6} USDT)` };
      const { transaction } = await tw.transactionBuilder.triggerSmartContract(
        USDT_CONTRAT.TRC20, "transfer(address,uint256)", { feeLimit: 40_000_000 },
        [{ type: "address", value: adresse }, { type: "uint256", value: unites.toString() }], moi);
      signee = await tw.trx.sign(transaction);
    } catch (e) {
      return { ok: false, diffuse: false, erreur: String((e as Error)?.message ?? e) };
    }
    try {
      const res = await tw.trx.sendRawTransaction(signee);
      if (!res?.result) return { ok: false, diffuse: false, erreur: "Tron a refusé : " + JSON.stringify(res) };
      return { ok: true, txid: signee.txID };
    } catch (e) {
      return { ok: false, diffuse: true, erreur: String((e as Error)?.message ?? e) };
    }
  }

  const { ethers } = await import("npm:ethers@6.13.4");
  const fournisseur = new ethers.JsonRpcProvider(Deno.env.get("BSC_RPC_URL") ?? "https://bsc-dataseed.bnbchain.org");
  const wallet = new ethers.Wallet(clef, fournisseur);
  const contrat = new ethers.Contract(USDT_CONTRAT.BEP20, [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ], wallet);
  const unites = ethers.parseUnits(montant.toFixed(6), 18);
  let brute: string;
  let hash: string;
  try {
    const solde: bigint = await contrat.balanceOf(wallet.address);
    if (solde < unites) return { ok: false, diffuse: false, erreur: `USDT tsy ampy ao amin'ny wallet (${ethers.formatUnits(solde, 18)} USDT)` };
    const demande = await contrat.transfer.populateTransaction(adresse, unites);
    const pret = await wallet.populateTransaction(demande);
    brute = await wallet.signTransaction(pret);
    hash = ethers.keccak256(brute);
  } catch (e) {
    return { ok: false, diffuse: false, erreur: String((e as Error)?.message ?? e) };
  }
  try {
    await fournisseur.broadcastTransaction(brute);
    return { ok: true, txid: hash };
  } catch (e) {
    return { ok: false, diffuse: true, erreur: String((e as Error)?.message ?? e) };
  }
}

// Les portefeuilles internationaux ne connaissent pas l'ariary.
const METHODES_EN_DEVISE = new Set(["wise", "payoneer", "skrill"]);
const PURCHASE_METHODS = new Set(["merchant"]);

// Frais de dépôt, retirés de ce qui est crédité — le même taux que Papi.
const DEPOSIT_FEE_PCT = Number(Deno.env.get("DEPOSIT_FEE_PCT") ?? "0");
function fraisDepot(brut: number): number {
  return DEPOSIT_FEE_PCT > 0 ? Math.ceil(brut * DEPOSIT_FEE_PCT / 100) : 0;
}

// Ce qui s'achète à l'intérieur de l'application, et à quel prix. Les prix
// vivent ici et nulle part ailleurs : dans la page, chacun pourrait décider
// de payer son abonnement un ariary.
const SITE_ITEMS: Record<string, { label: string; priceAr: number; days?: number; grant?: string }> = {
  sub_month: { label: "Abonnement mensuel", priceAr: 15000, days: 30 },
  sub_year: { label: "Abonnement annuel", priceAr: 150000, days: 365 },
  trial_day: { label: "Un jour d'essai en plus", priceAr: 10000, grant: "trial_day" },
  // Le booster (direct Facebook 24 h) n'est plus vendu depuis le 26/10/2026.
  sub_days: { label: "7 jours mis de côté pour l'abonnement", priceAr: 20000, grant: "sub_days" },
  // Le déblocage payé par carte Visa (via Papi) : même prix que les 20 crédits.
  unlock: { label: "Déblocage du compte", priceAr: 20000, grant: "unlock" },
  // Une fois pour toutes : le droit de mettre SON lien Binance / Payoneer
  // (« Inviter des amis »). La base le lit à ce libellé exact
  // (parrainage_voaloa, supabase-parrainage.sql) : ne pas le changer seul.
  parrainage: { label: "Parrainage Binance & Payoneer", priceAr: 5000, grant: "parrainage" },
};

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

// Combien d'unités de la devise demandée vaut 1 ariary.
async function rateFromAr(currency: string): Promise<number> {
  if (!currency || currency === "MGA") return 1;
  // L'USDT suit le dollar.
  if (currency === "USDT") currency = "USD";
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

type Admin = ReturnType<typeof createClient>;

// ---- Les achats du fil (supabase-wallet-achats.sql) ----
// Comme acheteur : ce qui est tenu (« tazonina ») ou déjà passé au vendeur
// (« voaray ») a quitté le solde ; ce qui a été rendu (« naverina ») y revient.
// Comme vendeur : seul ce que l'acheteur a reçu (« voaray ») entre, et c'est
// de l'argent vraiment payé — il se retire comme un dépôt.
async function achatsFor(admin: Admin, email: string): Promise<{ depense: number; recu: number }> {
  const { data: achats } = await admin.from("wallet_achats")
    .select("amount_ar,status").eq("buyer_email", email).in("status", ["tazonina", "voaray"]);
  const depense = (achats ?? []).reduce(
    (sum: number, a: { amount_ar: number }) => sum + (Number(a.amount_ar) || 0), 0);
  // Le vendeur reçoit la vente moins la commission d'affiliation, qu'il paie
  // quand l'acheteur est venu par le lien de quelqu'un.
  const { data: ventes } = await admin.from("wallet_achats")
    .select("amount_ar,commission_ar").eq("seller_email", email).eq("status", "voaray");
  const recu = (ventes ?? []).reduce(
    (sum: number, a: { amount_ar: number; commission_ar: number }) =>
      sum + (Number(a.amount_ar) || 0) - (Number(a.commission_ar) || 0), 0);
  return { depense, recu };
}

// ---- Prévenir une boutique (notifications_boutique, type « vola ») ----
// Le patron la lit directement ; son équipe — le livreur compris — par la
// fonction mpiasa. Un échec ici ne défait pas l'achat : l'argent a bougé, la
// notification n'en est que l'écho.
async function prevenir(admin: Admin, boutique: string, message: string): Promise<void> {
  if (!boutique) return;
  try {
    await admin.from("notifications_boutique").insert({
      owner_email: boutique, auteur_nom: "Ny asako", type: "vola", message: message.slice(0, 500),
    });
  } catch { /* l'écho seul se perd */ }
}
function ar(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR") + " Ar";
}

// ---- Affiliation (supabase-affiliation.sql) ----
// Chacun partage son lien « ?aff=<ID KEY> ». La personne qui crée son compte
// par ce lien y est rattachée une fois pour toutes ; ensuite, quand elle
// achète sur le fil, celui qui a partagé touche AFF_FIXE_AR + AFF_PCT % du
// montant — pris sur la vente, payé par le vendeur. Plus de commission sur
// les abonnements depuis le 26/10/2026. À l'inscription, AFF_INSCRIPTION_AR —
// une somme de l'appli (rétablie le 26/10/2026), qui se dépense ici ou se
// change par « Avadika », avec l'accord de l'admin. Les chiffres vivent ici,
// jamais dans la page.
const AFF_INSCRIPTION_AR = Math.max(0, Number(Deno.env.get("AFF_INSCRIPTION_AR") ?? "10000"));
const AFF_FIXE_AR = Math.max(0, Number(Deno.env.get("AFF_FIXE_AR") ?? "200"));
const AFF_PCT = Math.max(0, Number(Deno.env.get("AFF_PCT") ?? "10"));
// Sur ces AFF_PCT %, AFF_ADMIN_PCT % vont à l'admin (26/10/2026) : sur 10 %,
// 8 % à celui qui a partagé, 2 % à l'admin. Le vendeur ne paie pas plus.
const AFF_ADMIN_PCT = Math.min(AFF_PCT, Math.max(0, Number(Deno.env.get("AFF_ADMIN_PCT") ?? "2")));
// Un compte se rattache dans ses premiers jours seulement : passé ce délai,
// on ne s'offre plus au premier lien venu.
const AFF_JOURS_MAX = Number(Deno.env.get("AFF_JOURS_MAX") ?? "7");

// Jamais plus que la moitié du paiement : la commission ne doit pas valoir
// mieux que de payer soi-même par un second compte.
function commission(montant: number): number {
  if (!(montant > 0)) return 0;
  const brut = AFF_FIXE_AR + Math.ceil(montant * AFF_PCT / 100);
  return Math.min(brut, Math.floor(montant / 2));
}

// « ra•••@gmail.com » : celui qui a partagé voit qui est venu, sans lire
// l'adresse entière d'un inconnu.
function masquer(email: string): string {
  const [nom, domaine] = String(email ?? "").split("@");
  if (!domaine) return "•••";
  return nom.slice(0, 2) + "•••@" + domaine;
}

// Le paiement d'une personne amenée : la commission à celui qui l'a amenée.
// « ref » est unique par paiement — un second appel retombe sur l'index
// unique et ne paie rien de plus. Un échec ne défait pas le paiement.
// Rend ce qui a été versé (0 sinon) : sur un achat du fil, c'est le vendeur
// qui le paie. « vendeur » amené par son propre lien : rien, il se paierait
// lui-même.
async function verserCommission(admin: Admin, payeur: string, montant: number, ref: string, quoi: string,
  vendeur = ""): Promise<number> {
  try {
    const { data: lien } = await admin.from("affiliations")
      .select("parrain_email").eq("filleul_email", payeur).maybeSingle();
    const parrain = norm(lien?.parrain_email);
    if (!parrain || parrain === payeur || parrain === vendeur) return 0;
    const total = commission(montant);
    if (!(total > 0)) return 0;
    // La part de l'admin, prise dans le total (jamais en plus). L'admin
    // qui a lui-même partagé le lien garde tout, sans partage.
    const proprio = norm(Deno.env.get("OWNER_EMAIL"));
    const partAdmin = proprio && parrain !== proprio
      ? Math.min(total, Math.ceil(montant * AFF_ADMIN_PCT / 100)) : 0;
    const somme = total - partAdmin;
    let verse = 0;
    if (somme > 0) {
      const { error } = await admin.from("wallet_deposits").insert({
        email: parrain, amount_ar: somme, provider: "affiliation", provider_ref: ref,
        status: "confirme", confirmed_at: new Date().toISOString(),
        note: `Commission : ${quoi} (${masquer(payeur)}, ${ar(montant)})`,
      });
      if (!error) {
        verse += somme;
        await prevenir(admin, parrain,
          `🤝 Commission ${ar(somme)} : ${masquer(payeur)} nandoa ${ar(montant)} (${quoi}).`);
      }
    }
    if (partAdmin > 0) {
      const { error } = await admin.from("wallet_deposits").insert({
        email: proprio, amount_ar: partAdmin, provider: "affiliation_admin", provider_ref: ref + ":admin",
        status: "confirme", confirmed_at: new Date().toISOString(),
        note: `Ampahany admin (${AFF_ADMIN_PCT} %) : ${quoi} (${masquer(payeur)}, ${ar(montant)})`,
      });
      if (!error) verse += partAdmin;
    }
    return verse;
  } catch { /* la commission seule se perd */ }
  return 0;
}

// Ce que la page montre dans « 🤝 Affiliation ».
async function affiliationFor(admin: Admin, email: string) {
  const { data: filleuls, error } = await admin.from("affiliations")
    .select("filleul_email,created_at").eq("parrain_email", email)
    .order("created_at", { ascending: false }).limit(100);
  // Table absente (SQL pas encore passé) : rien à montrer.
  if (error) return null;
  const { data: gains } = await admin.from("wallet_deposits")
    .select("amount_ar,provider,note,created_at").eq("email", email).eq("status", "confirme")
    .in("provider", ["affiliation", "affiliation_inscription"])
    .order("created_at", { ascending: false }).limit(500);
  let totalReel = 0;
  let totalAppli = 0;
  for (const g of (gains ?? []) as Array<{ amount_ar: number; provider: string }>) {
    if (g.provider === "affiliation") totalReel += Number(g.amount_ar) || 0;
    else totalAppli += Number(g.amount_ar) || 0;
  }
  return {
    filleuls: ((filleuls ?? []) as Array<{ filleul_email: string; created_at: string }>)
      .map((f) => ({ qui: masquer(f.filleul_email), created_at: f.created_at })),
    nbFilleuls: (filleuls ?? []).length,
    totalReel, totalAppli,
    gains: (gains ?? []).slice(0, 20),
    taux: { inscriptionAr: AFF_INSCRIPTION_AR, fixeAr: AFF_FIXE_AR, pct: AFF_PCT - AFF_ADMIN_PCT, adminPct: AFF_ADMIN_PCT },
  };
}

// ---- Le solde, déduit de la base ----
async function balanceFor(admin: Admin, email: string): Promise<number> {
  // 1) ce qui est parti ou est réservé pour partir
  const { data: payouts } = await admin.from("wallet_payouts")
    .select("amount_ar,fee_ar,status").eq("email", email).in("status", ["pending", "sent"]);
  const withdrawn = (payouts ?? []).reduce(
    (sum: number, p: { amount_ar: number; fee_ar: number }) =>
      sum + (Number(p.amount_ar) || 0) + (Number(p.fee_ar) || 0), 0);

  // 2) ce qui a servi à rouvrir un accès. « amount » y est compté en
  //    crédits, et un crédit vaut AR_PER_CREDIT.
  const { data: unlocks } = await admin.from("unlock_requests")
    .select("amount").eq("email", email).eq("payment_method", "wallet");
  const spent = (unlocks ?? []).reduce(
    (sum: number, u: { amount: number }) => sum + (Number(u.amount) || 0) * AR_PER_CREDIT, 0);

  // 3) ce qui est entré du dehors. Les versements confirmés seulement :
  //    un versement annoncé et pas encore vérifié ne vaut rien, sans quoi
  //    l'annonce suffirait à dépenser.
  const { data: depots } = await admin.from("wallet_deposits")
    .select("amount_ar").eq("email", email).eq("status", "confirme");
  const deposited = (depots ?? []).reduce(
    (sum: number, d: { amount_ar: number }) => sum + (Number(d.amount_ar) || 0), 0);

  // 4) les achats du fil : payés comme acheteur, reçus comme vendeur.
  const achats = await achatsFor(admin, email);

  // 5) les transferts entre portefeuilles (et, pour le propriétaire, leurs frais).
  const transferts = await transfertsFor(admin, email);

  // 6) les commissions changées en vola tena izy : retenues tant qu'elles
  //    attendent ou une fois acceptées, le net revenant comme argent réel.
  const conv = await conversionsFor(admin, email);

  return Math.max(0, deposited + achats.recu + transferts.recu + conv.net -
    withdrawn - spent - achats.depense - transferts.envoye - conv.retenu);
}

// ---- Transferts entre portefeuilles (supabase-portefeuille-famindrana.sql) ----
// La vola tena izy passe d'un compte à l'autre par son ID KEY. L'expéditeur
// paie la somme + TRANSFER_FEE_PCT % ; les frais reviennent au propriétaire.
// Ce qui est reçu est de l'argent vraiment payé : il se retire et se dépense
// comme un dépôt.
const TRANSFER_FEE_PCT = Number(Deno.env.get("TRANSFER_FEE_PCT") ?? "0.5");
function fraisTransfert(montant: number): number {
  return TRANSFER_FEE_PCT > 0 ? Math.ceil(montant * TRANSFER_FEE_PCT / 100) : 0;
}

async function transfertsFor(admin: Admin, email: string): Promise<{ recu: number; envoye: number }> {
  // Table absente (SQL pas encore passé) : rien n'a bougé, et le solde reste juste.
  const { data: lignes, error } = await admin.from("wallet_transferts")
    .select("from_email,to_email,amount_ar,fee_ar")
    .or(`from_email.eq.${email},to_email.eq.${email}`);
  if (error) return { recu: 0, envoye: 0 };
  let recu = 0;
  let envoye = 0;
  for (const t of (lignes ?? []) as Array<{ from_email: string; to_email: string; amount_ar: number; fee_ar: number }>) {
    if (t.to_email === email) recu += Number(t.amount_ar) || 0;
    if (t.from_email === email) envoye += (Number(t.amount_ar) || 0) + (Number(t.fee_ar) || 0);
  }
  const proprio = norm(Deno.env.get("OWNER_EMAIL"));
  if (proprio && email === proprio) {
    const { data: frais } = await admin.from("wallet_transferts").select("fee_ar").gt("fee_ar", 0);
    recu += (frais ?? []).reduce((sum: number, f: { fee_ar: number }) => sum + (Number(f.fee_ar) || 0), 0);
  }
  return { recu, envoye };
}

// ---- Avadika ho vola tena izy (supabase-portefeuille-fanovana.sql) ----
// L'argent de l'appli (tout ce qui n'est pas vola tena izy : parrainage,
// fokontany, visiteurs… — depuis le 26/10/2026, plus seulement la commission)
// se change en vola tena izy, sur demande, après accord de l'admin. En
// attente, la somme est retenue ; acceptée, le net (moins les frais) devient
// de l'argent qui se retire ; refusée, elle revient. C'est l'accord de
// l'admin qui tient la porte : cet argent-là, personne ne l'a versé.
const CONV_MIN_AR = Math.max(0, Number(Deno.env.get("CONV_MIN_AR") ?? "50000"));
const CONV_MAX_MOIS_AR = Math.max(0, Number(Deno.env.get("CONV_MAX_MOIS_AR") ?? "200000"));
const CONV_FRAIS_PCT = Math.min(100, Math.max(0, Number(Deno.env.get("CONV_FRAIS_PCT") ?? "15")));

type Conversion = { id: string; montant_ar: number; frais_ar: number; net_ar: number; status: string; note: string | null; created_at: string; settled_at: string | null };
async function conversionsFor(admin: Admin, email: string): Promise<{ retenu: number; net: number; lignes: Conversion[] }> {
  // Table absente (SQL pas encore passé) : rien n'a été changé.
  const { data, error } = await admin.from("wallet_conversions")
    .select("id,montant_ar,frais_ar,net_ar,status,note,created_at,settled_at")
    .eq("email", email).order("created_at", { ascending: false }).limit(200);
  if (error) return { retenu: 0, net: 0, lignes: [] };
  let retenu = 0;
  let net = 0;
  for (const c of (data ?? []) as Conversion[]) {
    if (c.status === "en_attente" || c.status === "ekena") retenu += Number(c.montant_ar) || 0;
    if (c.status === "ekena") net += Number(c.net_ar) || 0;
  }
  return { retenu, net, lignes: (data ?? []) as Conversion[] };
}

// Ce qui peut encore se changer : ce que l'appli garde (« Avy amin'ny appli »
// dans la page). Ce qui attend déjà en est sorti : le solde le retient.
// « estAdmin » : l'admin change son propre argent sans frais ni plafond du
// mois (26/10/2026).
async function avadikaFor(admin: Admin, email: string, balance: number, estAdmin = false) {
  const conv = await conversionsFor(admin, email);
  const parts = await partsSolde(admin, email, balance);
  const azo = Math.max(0, balance - parts.papi);
  const debutMois = new Date();
  debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0);
  const ityVolana = conv.lignes
    .filter((c) => c.status !== "lavina" && Date.parse(c.created_at) >= debutMois.getTime())
    .reduce((s, c) => s + (Number(c.montant_ar) || 0), 0);
  return {
    azoAr: azo, ityVolanaAr: ityVolana,
    sisaVolanaAr: estAdmin ? azo : Math.max(0, CONV_MAX_MOIS_AR - ityVolana),
    taux: { minAr: CONV_MIN_AR, maxMoisAr: estAdmin ? null : CONV_MAX_MOIS_AR, fraisPct: estAdmin ? 0 : CONV_FRAIS_PCT },
    lisitra: conv.lignes.slice(0, 20),
  };
}

// Pour l'admin : toutes les demandes, les plus récentes d'abord.
async function conversionsTantara(admin: Admin) {
  const { data, error } = await admin.from("wallet_conversions")
    .select("id,email,montant_ar,frais_ar,net_ar,status,note,created_at,settled_at")
    .order("created_at", { ascending: false }).limit(100);
  if (error) return [];
  return data ?? [];
}

// Pour l'admin : les demandes qui attendent, avec qui et combien.
async function conversionsEnAttente(admin: Admin) {
  const { data, error } = await admin.from("wallet_conversions")
    .select("id,email,montant_ar,frais_ar,net_ar,created_at")
    .eq("status", "en_attente").order("created_at", { ascending: true }).limit(50);
  if (error) return [];
  return data ?? [];
}

// L'ID KEY du compte : tirée au hasard la première fois, puis toujours la
// même. Sans lettres qui se confondent (0/O, 1/I/L) : elle se dicte.
const ALPHABET_CLE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function tirerCle(): string {
  const octets = crypto.getRandomValues(new Uint8Array(8));
  const c = Array.from(octets, (o) => ALPHABET_CLE[o % ALPHABET_CLE.length]).join("");
  return "NA-" + c.slice(0, 4) + "-" + c.slice(4);
}
// Une clef se compare sans tirets ni espaces, en majuscules. Une clef
// automatique se reconnaît aussi sans son « NA » de tête.
function normCle(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function memeCle(stockee: string, saisie: string): boolean {
  const s = normCle(stockee);
  const n = normCle(saisie);
  return s === n || s === "NA" + n || "NA" + s === n;
}
// Clef automatique : « NA-XXXX-XXXX ». Toute autre forme a été choisie.
function estCleAuto(cle: string | null): boolean {
  return /^NA-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(cle ?? ""));
}
async function cleFor(admin: Admin, email: string): Promise<string | null> {
  const { data: deja, error } = await admin.from("wallet_cles").select("cle").eq("email", email).maybeSingle();
  if (error) return null;
  if (deja?.cle) return deja.cle;
  for (let essai = 0; essai < 5; essai++) {
    const cle = tirerCle();
    const { error: e } = await admin.from("wallet_cles").insert({ email, cle });
    if (!e) return cle;
    // Deux appels en même temps : l'autre a gagné, on reprend la sienne.
    const { data: autre } = await admin.from("wallet_cles").select("cle").eq("email", email).maybeSingle();
    if (autre?.cle) return autre.cle;
  }
  return null;
}

// ---- Ce qui peut sortir en vrai argent ----
// Le solde mêle deux choses. Les sommes que l'application inscrit d'elle-même
// (« fokontany », « visiteur », « essai ») ne sont que des chiffres :
// personne n'a rien payé, et il n'y a rien derrière. Elles se dépensent DANS
// l'application (abonnement, déblocage…), jamais au dehors.
//
// Peut sortir : ce qui est vraiment entré (versements payés chez Papi ou reçus
// en Mobile Money / PayPal). Moins ce qui est déjà sorti vers le dehors, et jamais plus que le solde lui-même.
// « affiliation » : la commission sur un paiement vraiment fait par une
// personne amenée — elle est payée avec cet argent-là, elle se retire.
// Les retraits par les anciens moyens (PayPal, carte, Wise…), faits avant que
// le solde ne se sépare en vola tena izy et argent de l'appli : ils sont
// sortis du solde (balanceFor les compte), mais pas de la vola tena izy —
// ils avaient été payés avec ce qu'on appelle aujourd'hui l'argent de l'appli
// (26/10/2026). Sans cela, ils creusaient une dette invisible qui avalait les
// premières sommes changées.
const RETRAITS_ANCIENS = new Set(["paypal", "card", "cash", "wallet", "wise", "payoneer", "skrill"]);

const PROVIDERS_REELS = ["papi", "mvola", "orange", "airtel", "paypal", "affiliation", "affiliation_admin", "avadika_frais", "usdt"];

async function retirableFor(admin: Admin, email: string, balance: number): Promise<number> {
  const { data: depots } = await admin.from("wallet_deposits")
    .select("amount_ar").eq("email", email).eq("status", "confirme").in("provider", PROVIDERS_REELS);
  const entre = (depots ?? []).reduce(
    (sum: number, d: { amount_ar: number }) => sum + (Number(d.amount_ar) || 0), 0);
  // Les achats dans l'application (« insite ») ne sortent rien au dehors.
  const { data: sorties } = await admin.from("wallet_payouts")
    .select("amount_ar,fee_ar,kind,method").eq("email", email).in("status", ["pending", "sent"]);
  const sorti = (sorties ?? [])
    .filter((p: { kind: string; method: string }) => p.kind !== "insite" && !RETRAITS_ANCIENS.has(p.method))
    .reduce((sum: number, p: { amount_ar: number; fee_ar: number }) =>
      sum + (Number(p.amount_ar) || 0) + (Number(p.fee_ar) || 0), 0);
  // Les ventes reçues sont de l'argent payé ; les achats en sont sortis.
  // Les transferts reçus aussi ; ceux envoyés en sont sortis.
  const achats = await achatsFor(admin, email);
  const transferts = await transfertsFor(admin, email);
  // Une commission changée et acceptée : son net est de la vola tena izy.
  const conv = await conversionsFor(admin, email);
  return Math.max(0, Math.min(balance,
    entre + achats.recu + transferts.recu + conv.net - sorti - achats.depense - transferts.envoye));
}

// ---- L'argent vraiment payé qui reste, pour l'abonnement ----
// L'abonnement se paie seulement avec de l'argent vraiment entré (dépôts Papi confirmés).
//
//   dépôts réels
//   − abonnements déjà payés AVEC cet argent (method « papi » ; les achats
//     d'avant, réglés avec n'importe quel solde, ne comptent pas contre lui)
//   − les retraits
// Jamais plus que le solde lui-même.
async function argentPapiFor(admin: Admin, email: string, balance: number): Promise<number> {
  return (await partsSolde(admin, email, balance)).papi;
}

// Le solde en deux parts, que la page montre à part :
//   papi     — l'argent vraiment payé qui reste (voir plus haut) ;
//   le reste — ce que l'application a inscrit d'elle-même, à dépenser ici.
async function partsSolde(admin: Admin, email: string, balance: number): Promise<{ papi: number }> {
  const { data: depots } = await admin.from("wallet_deposits")
    .select("amount_ar").eq("email", email).eq("status", "confirme").in("provider", PROVIDERS_REELS);
  const entre = (depots ?? []).reduce(
    (sum: number, d: { amount_ar: number }) => sum + (Number(d.amount_ar) || 0), 0);

  const { data: sorties } = await admin.from("wallet_payouts")
    .select("amount_ar,fee_ar,kind,method").eq("email", email).in("status", ["pending", "sent"]);
  let abonnements = 0;
  let retraits = 0;
  for (const p of (sorties ?? []) as Array<{ amount_ar: number; fee_ar: number; kind: string; method: string }>) {
    const somme = (Number(p.amount_ar) || 0) + (Number(p.fee_ar) || 0);
    if (p.kind === "insite") {
      if (p.method === "papi") abonnements += somme;
    } else if (p.kind === "purchase") {
      // Un achat à l'étranger se paie avec la vola tena izy seule.
      abonnements += somme;
    } else if (!RETRAITS_ANCIENS.has(p.method)) {
      retraits += somme;
    }
  }
  // Les ventes reçues entrent comme de l'argent payé ; les achats sortent
  // comme un retrait.
  const achats = await achatsFor(admin, email);
  retraits += achats.depense;
  // Un transfert reçu est de la vola tena izy ; un transfert envoyé en part.
  const transferts = await transfertsFor(admin, email);
  // Une commission changée et acceptée entre comme de l'argent payé.
  const conv = await conversionsFor(admin, email);
  const reste = entre + achats.recu + transferts.recu + conv.net - abonnements - transferts.envoye - retraits;
  return { papi: Math.max(0, Math.min(balance, reste)) };
}

// ---- Dépôt en USDT (29/10/2026) ----
// La personne envoie des USDT (depuis Binance…) à l'adresse de l'admin, puis
// déclare la somme et le TxID : une ligne « usdt » en attente dans
// wallet_deposits, que le solde ignore. L'admin l'accepte après que la chaîne
// a confirmé l'envoi (verifierUsdt) — ou, pour un transfert interne Binance
// que la chaîne ne voit pas, après l'avoir vu lui-même dans son historique.
// L'index unique (provider, provider_ref) empêche de déclarer deux fois le
// même TxID ; un refus libère la référence, pour redéclarer sans erreur.
const USDT_DEPOT_MIN = Math.max(0, Number(Deno.env.get("USDT_DEPOT_MIN") ?? "1"));
const USDT_DEPOT_MAX_ATTENTE = 3;
const USDT_EXPLORER: Record<string, string> = {
  TRC20: "https://tronscan.org/#/transaction/",
  BEP20: "https://bscscan.com/tx/",
};

// Les adresses de dépôt vivent dans l'app_metadata du compte admin : seule
// la clé de service l'écrit, la page ne peut pas la changer en douce.
let adiresyCache: { t: number; v: Record<string, string> } | null = null;
async function adiresyDepot(admin: Admin, ownerEmail: string): Promise<Record<string, string>> {
  if (adiresyCache && Date.now() - adiresyCache.t < 60_000) return adiresyCache.v;
  const v: Record<string, string> = {};
  if (ownerEmail) {
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const users = data?.users ?? [];
      const proprio = users.find((u) => norm(u.email) === ownerEmail);
      if (proprio) {
        const depot = (proprio.app_metadata?.usdt_depot ?? {}) as Record<string, unknown>;
        for (const reseau of Object.keys(ADIRESY_USDT)) {
          const a = String(depot[reseau] ?? "").trim();
          if (ADIRESY_USDT[reseau].test(a)) v[reseau] = a;
        }
        break;
      }
      if (users.length < 200) break;
    }
  }
  adiresyCache = { t: Date.now(), v };
  return v;
}

// Un TxID se range sous une seule forme : TRC20 en 64 hexa sans « 0x »,
// BEP20 en « 0x » + 64 hexa, en minuscules. Autre chose (« Internal
// transfer » de Binance, qui ne passe pas par la chaîne) : son identifiant
// tel quel, marqué « interne ».
function normTxid(reseau: string, saisie: unknown): { txid: string; interne: boolean } | null {
  const brut = String(saisie ?? "").trim();
  const hexa = brut.toLowerCase().replace(/^0x/, "");
  if (/^[0-9a-f]{64}$/.test(hexa)) return { txid: reseau === "BEP20" ? "0x" + hexa : hexa, interne: false };
  if (/^[A-Za-z0-9_-]{6,100}$/.test(brut)) return { txid: brut, interne: true };
  return null;
}

// Une adresse Tron (base58, « T… ») en ses 20 octets, en hexa : c'est sous
// cette forme que la chaîne range les journaux d'un transfert.
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function tronHex(adresse: string): string {
  let n = 0n;
  for (const c of adresse) {
    const i = B58.indexOf(c);
    if (i < 0) return "";
    n = n * 58n + BigInt(i);
  }
  const hex = n.toString(16).padStart(50, "0");
  return hex.startsWith("41") ? hex.slice(2, 42) : "";
}
const SIG_TRANSFER = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type VerifUsdt = { ok: true; usdt: number } | { ok: false; erreur: string };

// Ce que la chaîne dit d'un TxID : combien d'USDT il a fait arriver à
// « adresse », une fois l'envoi confirmé. Rien n'est cru sur parole.
async function verifierUsdt(reseau: string, txid: string, adresse: string): Promise<VerifUsdt> {
  try {
    if (reseau === "TRC20") {
      const apiKey = Deno.env.get("TRONGRID_API_KEY") ?? "";
      // « walletsolidity » : seulement ce qui est confirmé pour de bon.
      const res = await fetch("https://api.trongrid.io/walletsolidity/gettransactioninfobyid", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "TRON-PRO-API-KEY": apiKey } : {}) },
        body: JSON.stringify({ value: txid }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ok: false, erreur: `Tron tsy namaly (${res.status}).` };
      const info = await res.json();
      if (!info?.id) return { ok: false, erreur: "Mbola tsy hita na mbola tsy voamarina amin'ny réseau Tron io TxID io." };
      if (info.receipt?.result && info.receipt.result !== "SUCCESS") {
        return { ok: false, erreur: `Tsy nety ilay transaction tamin'ny Tron (${info.receipt.result}).` };
      }
      const contrat = tronHex(USDT_CONTRAT.TRC20);
      const dest = tronHex(adresse);
      let somme = 0n;
      for (const log of (info.log ?? []) as Array<{ address: string; topics: string[]; data: string }>) {
        const ad = String(log.address ?? "").toLowerCase();
        if ((ad.length === 42 ? ad.slice(2) : ad) !== contrat) continue;
        if (String(log.topics?.[0] ?? "").toLowerCase() !== SIG_TRANSFER) continue;
        if (String(log.topics?.[2] ?? "").toLowerCase().slice(-40) !== dest) continue;
        somme += BigInt("0x" + (log.data || "0"));
      }
      if (somme === 0n) return { ok: false, erreur: "Tsy misy USDT TRC20 tonga tamin'ny adiresy admin tao amin'io transaction io." };
      return { ok: true, usdt: Number(somme) / 1e6 };
    }

    const rpcUrl = Deno.env.get("BSC_RPC_URL") ?? "https://bsc-dataseed.bnbchain.org";
    const rpc = async (method: string, params: unknown[]) => {
      const res = await fetch(rpcUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`BSC tsy namaly (${res.status}).`);
      return (await res.json())?.result;
    };
    const recu = await rpc("eth_getTransactionReceipt", [txid]);
    if (!recu) return { ok: false, erreur: "Mbola tsy hita amin'ny réseau BSC io TxID io." };
    if (recu.status !== "0x1") return { ok: false, erreur: "Tsy nety ilay transaction tamin'ny BSC." };
    const tete = Number(BigInt(await rpc("eth_blockNumber", [])));
    if (tete - Number(BigInt(recu.blockNumber)) < 15) {
      return { ok: false, erreur: "Mbola tsy ampy fanamarinana (confirmations) amin'ny BSC : andraso kely." };
    }
    const dest = adresse.slice(2).toLowerCase();
    let somme = 0n;
    for (const log of (recu.logs ?? []) as Array<{ address: string; topics: string[]; data: string }>) {
      if (String(log.address ?? "").toLowerCase() !== USDT_CONTRAT.BEP20.toLowerCase()) continue;
      if (String(log.topics?.[0] ?? "").toLowerCase() !== "0x" + SIG_TRANSFER) continue;
      if (String(log.topics?.[2] ?? "").toLowerCase().slice(-40) !== dest) continue;
      somme += BigInt(log.data || "0x0");
    }
    if (somme === 0n) return { ok: false, erreur: "Tsy misy USDT BEP20 tonga tamin'ny adiresy admin tao amin'io transaction io." };
    // 18 décimales : on garde 6 chiffres après la virgule.
    return { ok: true, usdt: Number(somme / 10n ** 12n) / 1e6 };
  } catch (e) {
    return { ok: false, erreur: "Tsy azo jerena ny réseau : " + String((e as Error)?.message ?? e) };
  }
}

// Pour l'admin : les dépôts USDT qui attendent.
async function depotsUsdtEnAttente(admin: Admin) {
  const { data } = await admin.from("wallet_deposits")
    .select("id,email,amount_ar,provider_ref,raw,note,created_at")
    .eq("provider", "usdt").eq("status", "en_attente")
    .order("created_at", { ascending: true }).limit(50);
  return ((data ?? []) as Array<{ raw: Record<string, unknown> | null }>).map((d) => {
    const raw = d.raw ?? {};
    return { ...d, explorer: raw.interne ? null : (USDT_EXPLORER[String(raw.reseau)] ?? "") + String(raw.txid ?? "") };
  });
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
      .select("id,amount_ar,fee_ar,method,kind,destination,link,instructions,currency,amount_out,status,note,created_at,settled_at,auto_provider,auto_ref")
      .eq("email", email).order("created_at", { ascending: false }).limit(20);

    let queue = null;
    if (isOwner) {
      const { data: pending } = await admin.from("wallet_payouts")
        .select("id,email,name,amount_ar,method,kind,destination,link,instructions,currency,amount_out,rate,status,created_at,auto_provider,auto_ref,auto_attempts")
        .eq("status", "pending").order("created_at", { ascending: true }).limit(50);
      queue = pending ?? [];
    }

    // Ce qui est entré, avec son état : un versement en attente doit se voir,
    // sinon la personne qui vient de payer croit que rien n'est arrivé.
    const { data: depots } = await admin.from("wallet_deposits")
      .select("id,amount_ar,provider,provider_ref,status,note,created_at,confirmed_at")
      .eq("email", email).order("created_at", { ascending: false }).limit(20);

    // Les achats du fil, comme acheteur et comme vendeur. Le propriétaire
    // voit aussi ceux qui attendent, pour trancher s'il le faut.
    const { data: achats } = await admin.from("wallet_achats")
      .select("id,buyer_email,buyer_name,seller_email,seller_name,news_id,titre,isa,prix_ar,amount_ar,status,note,created_at,settled_at")
      .or(`buyer_email.eq.${email},seller_email.eq.${email}`)
      .order("created_at", { ascending: false }).limit(30);
    let achatsEnAttente = null;
    if (isOwner) {
      const { data: attente } = await admin.from("wallet_achats")
        .select("id,buyer_email,buyer_name,seller_email,seller_name,news_id,titre,isa,prix_ar,amount_ar,status,created_at")
        .eq("status", "tazonina").order("created_at", { ascending: true }).limit(50);
      achatsEnAttente = attente ?? [];
    }

    const retirable = await retirableFor(admin, email, balance);
    const parts = await partsSolde(admin, email, balance);

    // L'ID KEY du compte, et les derniers transferts. L'autre partie se
    // montre par sa clef, jamais par son email.
    const idKey = await cleFor(admin, email);
    const { data: lignesT } = await admin.from("wallet_transferts")
      .select("id,from_email,to_email,amount_ar,fee_ar,note,created_at")
      .or(`from_email.eq.${email},to_email.eq.${email}`)
      .order("created_at", { ascending: false }).limit(20);
    const autres = [...new Set((lignesT ?? []).map((t: { from_email: string; to_email: string }) =>
      t.from_email === email ? t.to_email : t.from_email))];
    const clesAutres: Record<string, string> = {};
    if (autres.length) {
      const { data: cles } = await admin.from("wallet_cles").select("email,cle").in("email", autres);
      for (const c of (cles ?? []) as Array<{ email: string; cle: string }>) clesAutres[c.email] = c.cle;
    }
    const transferts = ((lignesT ?? []) as Array<{ id: string; from_email: string; to_email: string; amount_ar: number; fee_ar: number; note: string | null; created_at: string }>)
      .map((t) => {
        const sortant = t.from_email === email;
        const autre = sortant ? t.to_email : t.from_email;
        return {
          id: t.id, sens: sortant ? "envoye" : "recu", amount_ar: t.amount_ar,
          fee_ar: sortant ? t.fee_ar : 0, note: t.note, created_at: t.created_at,
          cle: clesAutres[autre] ?? "—",
        };
      });

    return json({
      idKey, idKeyAuto: estCleAuto(idKey), transferts, transferFeePct: TRANSFER_FEE_PCT,
      balanceAr: balance, retirableAr: retirable, papiAr: parts.papi, minPayoutAr: MIN_PAYOUT_AR, payoutFeePct: PAYOUT_FEE_PCT,
      depositFeePct: DEPOSIT_FEE_PCT,
      // Ce qui marche vraiment sur ce serveur, pour que la page ne propose
      // pas un canal dont les clefs manquent.
      canaux: {
        depotPapi: !!Deno.env.get("PAPI_TOKEN"),
        usdtAuto: { TRC20: !!clefUsdt("TRC20"), BEP20: !!clefUsdt("BEP20"), max: USDT_AUTO_MAX },
      },
      payouts: mine ?? [], deposits: depots ?? [], queue, isOwner, items: SITE_ITEMS,
      achats: achats ?? [], achatsEnAttente, email,
      affiliation: await affiliationFor(admin, email),
      avadika: await avadikaFor(admin, email, balance, isOwner),
      avadikaTantara: isOwner ? await conversionsTantara(admin) : null,
      avadikaEnAttente: isOwner ? await conversionsEnAttente(admin) : null,
      depotUsdt: {
        adiresy: await adiresyDepot(admin, ownerEmail), minUsdt: USDT_DEPOT_MIN,
        enAttente: isOwner ? await depotsUsdtEnAttente(admin) : null,
      },
    });
  }

  // ---- Dépôt USDT : l'admin donne ses adresses (vide : le réseau se ferme) ----
  if (action === "depot_usdt_adiresy") {
    if (!isOwner) return json({ error: "réservé au propriétaire" }, 403);
    const user = caller!.user!;
    const depot: Record<string, string> = {};
    for (const reseau of Object.keys(ADIRESY_USDT)) {
      const a = String(body[reseau] ?? "").trim();
      if (!a) continue;
      if (!ADIRESY_USDT[reseau].test(a)) {
        return json({ error: `Adiresy ${reseau} diso (${reseau === "TRC20" ? "T… 34 litera" : "0x… 42 litera"}).` }, 400);
      }
      depot[reseau] = a;
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), usdt_depot: depot },
    });
    if (error) return json({ error: error.message }, 500);
    adiresyCache = null;
    return json({ adiresy: depot });
  }

  // ---- Dépôt USDT : la déclaration (montant reçu + TxID) ----
  if (action === "depot_usdt") {
    const reseau = String(body.reseau ?? "").toUpperCase();
    const adresse = (await adiresyDepot(admin, ownerEmail))[reseau];
    if (!adresse) return json({ error: "Tsy misy adiresy USDT ho an'io réseau io." }, 400);
    const tx = normTxid(reseau, body.txid);
    if (!tx) return json({ error: "TxID diso : adikao avy ao amin'ny Binance (Historique → Retrait → TxID)." }, 400);
    const usdt = Math.round((Number(body.usdt) || 0) * 1e6) / 1e6;
    if (!(usdt >= USDT_DEPOT_MIN)) return json({ error: `Farafahakeliny ${USDT_DEPOT_MIN} USDT.` }, 400);

    const { data: attente } = await admin.from("wallet_deposits").select("id")
      .eq("email", email).eq("provider", "usdt").eq("status", "en_attente");
    if ((attente ?? []).length >= USDT_DEPOT_MAX_ATTENTE) {
      return json({ error: `Efa misy dépôt USDT ${USDT_DEPOT_MAX_ATTENTE} miandry : andraso ny admin aloha.` }, 409);
    }
    const taux = await rateFromAr("USDT");
    if (!(taux > 0)) return json({ error: "Tsy azo ny taux USDT izao : andramo indray afaka kelikely." }, 503);
    const brut = Math.floor(usdt / taux);
    const frais = fraisDepot(brut);
    if (!(brut - frais > 0)) return json({ error: "Kely loatra ny vola." }, 400);

    const { data, error } = await admin.from("wallet_deposits").insert({
      email, amount_ar: brut - frais, provider: "usdt", provider_ref: `${reseau}:${tx.txid}`,
      status: "en_attente", note: `${usdt} USDT (${reseau})`,
      raw: { reseau, txid: tx.txid, interne: tx.interne, usdt, adresse, taux, brutAr: brut, fraisAr: frais },
    }).select("id,amount_ar,provider,provider_ref,status,note,created_at").single();
    if (error) {
      if (error.code === "23505") return json({ error: "Efa nampiasaina io TxID io." }, 409);
      return json({ error: error.message }, 500);
    }
    if (ownerEmail) {
      await prevenir(admin, ownerEmail,
        `💵 Dépôt USDT miandry : ${masquer(email)} — ${usdt} USDT (${reseau}) → ${ar(brut - frais)}.`);
    }
    return json({ depot: data });
  }

  // ---- Dépôt USDT : l'admin accepte ou refuse ----
  // Accepter demande que la chaîne confirme l'arrivée d'au moins la somme
  // déclarée à l'adresse de l'admin. « force » : l'admin l'a vu lui-même
  // (transfert interne Binance, ou réseau injoignable).
  if (action === "depot_usdt_vahana") {
    if (!isOwner) return json({ error: "réservé au propriétaire" }, 403);
    const id = String(body.id ?? "");
    const ekena = body.ekena === true;
    const note = String(body.note ?? "").trim().slice(0, 300);
    const { data: d } = await admin.from("wallet_deposits")
      .select("id,email,amount_ar,provider_ref,raw,note")
      .eq("id", id).eq("provider", "usdt").eq("status", "en_attente").maybeSingle();
    if (!d) return json({ error: "Efa voavaha io dépôt io." }, 409);
    const raw = (d.raw ?? {}) as Record<string, unknown>;
    const usdt = Number(raw.usdt) || 0;

    let verifie: unknown = "force";
    if (ekena && body.force !== true) {
      if (raw.interne) {
        return json({ error: "Internal transfer Binance : tsy hita amin'ny réseau. Jereo ao amin'ny historique Binance-nao.", azoTerena: true }, 409);
      }
      const v = await verifierUsdt(String(raw.reseau), String(raw.txid), String(raw.adresse));
      if (!v.ok) return json({ error: v.erreur, azoTerena: true }, 409);
      // Un millième de marge : les arrondis d'affichage, pas plus.
      if (v.usdt + 0.001 < usdt) {
        return json({ error: `${v.usdt} USDT ihany no tonga, nefa ${usdt} USDT no nambara.`, azoTerena: true }, 409);
      }
      verifie = { usdt: v.usdt, le: new Date().toISOString() };
    }

    const maj = ekena
      ? { status: "confirme", confirmed_at: new Date().toISOString(), raw: { ...raw, verifie } }
      // Refusé : la référence se libère, le même TxID pourra être redéclaré.
      : { status: "refuse", provider_ref: `${d.provider_ref}:refuse:${d.id}`, note: d.note + (note ? ` — ${note}` : "") };
    const { data: fait, error } = await admin.from("wallet_deposits").update(maj)
      .eq("id", id).eq("status", "en_attente").select("id").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!fait) return json({ error: "Efa voavaha io dépôt io." }, 409);
    await prevenir(admin, norm(d.email), ekena
      ? `✅ Dépôt USDT ekena : ${ar(d.amount_ar)} tafiditra ho vola tena izy ao amin'ny portefeuille-nao.`
      : `↩️ Dépôt USDT lavina (${usdt} USDT).` + (note ? ` (${note})` : ""));
    return json({ ok: true, enAttente: await depotsUsdtEnAttente(admin) });
  }

  // ---- Avadika ho vola tena izy : la demande ----
  // Tout se vérifie ici : minimum, plafond du mois, ce qui reste à changer.
  // La somme est retenue dès la demande, pour ne pas servir deux fois.
  if (action === "avadika") {
    const montant = Math.floor(Number(body.montantAr) || 0);
    if (montant < CONV_MIN_AR) return json({ error: `Farafahakeliny ${ar(CONV_MIN_AR)}.` }, 400);
    const balance = await balanceFor(admin, email);
    const etat = await avadikaFor(admin, email, balance, isOwner);
    if (montant > etat.azoAr) {
      return json({ error: `Ny vola azo avadika dia ${ar(etat.azoAr)} ihany.` }, 400);
    }
    if (montant > etat.sisaVolanaAr) {
      return json({ error: `Mihoatra ny fetra isam-bolana (${ar(CONV_MAX_MOIS_AR)}) : ${ar(etat.sisaVolanaAr)} sisa ity volana ity.` }, 400);
    }
    const frais = isOwner ? 0 : Math.ceil(montant * CONV_FRAIS_PCT / 100);
    const { data, error } = await admin.from("wallet_conversions").insert({
      email, montant_ar: montant, frais_ar: frais, net_ar: montant - frais, status: "en_attente",
    }).select("id,montant_ar,frais_ar,net_ar,status,created_at").single();
    if (error) return json({ error: error.message }, 500);
    if (ownerEmail) {
      await prevenir(admin, ownerEmail,
        `🔁 Fangatahana avadika ho vola tena izy : ${masquer(email)} — ${ar(montant)} (net ${ar(montant - frais)}).`);
    }
    return json({ conversion: data, balanceAr: await balanceFor(admin, email) });
  }

  // ---- Avadika : l'admin accepte ou refuse ----
  if (action === "avadika_vahana") {
    if (!isOwner) return json({ error: "réservé au propriétaire" }, 403);
    const id = String(body.id ?? "");
    const ekena = body.ekena === true;
    const note = String(body.note ?? "").trim().slice(0, 300) || null;
    // Seule une demande encore en attente se tranche, une seule fois.
    const { data, error } = await admin.from("wallet_conversions")
      .update({ status: ekena ? "ekena" : "lavina", note, settled_at: new Date().toISOString() })
      .eq("id", id).eq("status", "en_attente")
      .select("id,email,montant_ar,frais_ar,net_ar,status").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Efa voavaha io fangatahana io." }, 409);
    // Acceptée : les frais reviennent à l'admin, en vola tena izy (29/10/2026).
    // L'index unique (provider, provider_ref) empêche de les verser deux fois.
    const frais = Number(data.frais_ar) || 0;
    if (ekena && frais > 0 && ownerEmail && norm(data.email) !== ownerEmail) {
      await admin.from("wallet_deposits").insert({
        email: ownerEmail, amount_ar: frais, provider: "avadika_frais", provider_ref: data.id,
        status: "confirme", confirmed_at: new Date().toISOString(),
        note: `Frais avadika (${CONV_FRAIS_PCT} %) : ${masquer(data.email)}, ${ar(data.montant_ar)}`,
      });
    }
    await prevenir(admin, norm(data.email), ekena
      ? `✅ Ekena : ${ar(data.net_ar)} tafiditra ho vola tena izy ao amin'ny portefeuille-nao, azo alaina amin'ny Mobile Money.`
      : `↩️ Lavina ny fanovana ${ar(data.montant_ar)} : niverina ao amin'ny vola appli-nao.` + (note ? ` (${note})` : ""));
    return json({ conversion: data, enAttente: await conversionsEnAttente(admin) });
  }

  // ---- Acheter un entana du fil, l'argent tenu ----
  // Le prix vient de la base, jamais de la page : la page ne dit que QUOI
  // (le billet) et COMBIEN (la quantité). L'argent doit être de l'argent
  // vraiment payé — le même que celui qui se retire. Il quitte l'acheteur
  // tout de suite, mais n'arrive chez le vendeur que quand l'acheteur a reçu
  // l'entana (« achat_voaray ») ; rendu sinon (« achat_averina »).
  if (action === "achat") {
    const newsId = Number(body.newsId);
    const isa = Math.floor(Number(body.isa ?? 1));
    if (!Number.isFinite(newsId) || newsId <= 0) return json({ error: "entana tsy fantatra" }, 400);
    if (!(isa >= 1 && isa <= 99)) return json({ error: "isa tsy mety (1 hatramin'ny 99)" }, 400);

    const { data: billet, error: errBillet } = await admin.from("client_news")
      .select("id,type,price,message,author_email,client_name,deleted_at").eq("id", newsId).maybeSingle();
    if (errBillet) return json({ error: errBillet.message }, 500);
    if (!billet || billet.deleted_at) return json({ error: "Tsy hita intsony io entana io." }, 404);
    if (billet.type !== "entana") return json({ error: "Tsy entana amidy io publication io." }, 400);
    const prix = Math.floor(Number(String(billet.price ?? "").replace(/[^\d.]/g, "")) || 0);
    if (!(prix > 0)) return json({ error: "Tsy misy vidiny io entana io : resaho mivantana ny mpivarotra." }, 400);

    // Le vendeur : l'auteur du billet ; les billets de la maison, sans
    // adresse, sont au propriétaire.
    const vendeur = norm(billet.author_email) || ownerEmail;
    if (!vendeur) return json({ error: "Tsy fantatra ny mpivarotra." }, 400);
    if (vendeur === email) return json({ error: "Tsy afaka mividy ny entanao ianao." }, 400);

    const montant = prix * isa;
    const balance = await balanceFor(admin, email);
    const reel = await retirableFor(admin, email, balance);
    if (montant > reel) {
      return json({
        error: `Tsy ampy ny vola ao amin'ny portefeuille : ${reel.toLocaleString("fr-FR")} Ar ` +
          `(vola tena naloa), ilaina ${montant.toLocaleString("fr-FR")} Ar. ` +
          `Ampidiro vola amin'ny Papi na Mobile Money aloha.`,
        disponibleAr: reel, manque: montant - reel,
      }, 400);
    }

    const titre = String(billet.message ?? "").split("\n")[0].trim().slice(0, 80) || "Entana";
    const { data, error } = await admin.from("wallet_achats").insert({
      buyer_email: email, buyer_name: String(body.name ?? "").trim().slice(0, 80) || null,
      seller_email: vendeur, seller_name: String(billet.client_name ?? "").trim().slice(0, 80) || null,
      news_id: newsId, titre, isa, prix_ar: prix, amount_ar: montant, status: "tazonina",
    }).select("id,titre,isa,prix_ar,amount_ar,status,created_at").single();
    if (error) return json({ error: error.message }, 500);

    // Le vendeur et son équipe (le livreur) : l'argent est là, on peut livrer.
    const acheteur = String(body.name ?? "").trim() || email;
    await prevenir(admin, vendeur,
      `💸 Voaloa ${ar(montant)} ho an'ny « ${titre} » × ${isa} (${acheteur}). ` +
      `Voatazona ny vola mandra-pahazon'ny mpividy ny entana : alefaso ny entana.`);

    return json({ achat: data, balanceAr: balance - montant });
  }

  // ---- L'acheteur a reçu l'entana : l'argent passe au vendeur ----
  if (action === "achat_voaray") {
    const id = String(body.id ?? "").trim();
    if (!id) return json({ error: "fividianana tsy fantatra" }, 400);
    // Seul l'acheteur le dit, et une seule fois : le filtre sur
    // « tazonina » rend un second clic sans effet.
    const { data, error } = await admin.from("wallet_achats")
      .update({ status: "voaray", settled_at: new Date().toISOString() })
      .eq("id", id).eq("buyer_email", email).eq("status", "tazonina")
      .select("id,status,amount_ar,titre,isa,seller_email,buyer_name").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Efa voavaha na tsy anao io fividianana io." }, 409);
    // La commission d'affiliation se prend sur la vente : le vendeur la paie.
    const vendeur = norm(data.seller_email);
    const prise = await verserCommission(admin, email, Number(data.amount_ar) || 0, "achat:" + data.id,
      "« " + (data.titre ?? "Entana") + " »", vendeur);
    if (prise > 0) {
      await admin.from("wallet_achats").update({ commission_ar: prise }).eq("id", data.id);
    }
    // Le vendeur et son équipe : l'argent est parti chez eux.
    await prevenir(admin, vendeur,
      `💸 Lasa ny vola : ${ar(data.amount_ar)} ho an'ny « ${data.titre ?? "Entana"} » × ${data.isa ?? 1}. ` +
      `Voarain'ny mpividy (${data.buyer_name || email}) ny entana, tafiditra ao amin'ny portefeuille ny vola` +
      (prise > 0 ? ` (${ar(Number(data.amount_ar) - prise)}, nesorina ${ar(prise)} commission affiliation).` : "."));
    return json({ achat: data });
  }

  // ---- Rendre l'argent à l'acheteur ----
  // Le vendeur (il ne peut pas livrer) ou le propriétaire (litige). Jamais
  // l'acheteur seul : il pourrait reprendre son argent après avoir reçu.
  if (action === "achat_averina") {
    const id = String(body.id ?? "").trim();
    if (!id) return json({ error: "fividianana tsy fantatra" }, 400);
    const { data: ligne } = await admin.from("wallet_achats")
      .select("id,seller_email,status").eq("id", id).maybeSingle();
    if (!ligne) return json({ error: "Tsy hita io fividianana io." }, 404);
    if (norm(ligne.seller_email) !== email && !isOwner) {
      return json({ error: "Ny mpivarotra na ny tompon'ny Ny asako ihany no afaka mamerina ny vola." }, 403);
    }
    const note = String(body.note ?? "").trim().slice(0, 300);
    const { data, error } = await admin.from("wallet_achats")
      .update({ status: "naverina", note: note || (isOwner ? "Naverin'ny tompony" : "Naverin'ny mpivarotra"),
        settled_at: new Date().toISOString() })
      .eq("id", id).eq("status", "tazonina")
      .select("id,status,amount_ar,titre,isa,buyer_email,seller_email").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Efa voavaha io fividianana io." }, 409);
    // L'acheteur récupère son argent ; le vendeur (et son livreur) sait
    // qu'il n'y a plus rien à livrer.
    await prevenir(admin, norm(data.buyer_email),
      `💸 Naverina taminao ny ${ar(data.amount_ar)} ho an'ny « ${data.titre ?? "Entana"} » × ${data.isa ?? 1}.`);
    await prevenir(admin, norm(data.seller_email),
      `💸 Naverina tamin'ny mpividy ny ${ar(data.amount_ar)} ho an'ny « ${data.titre ?? "Entana"} » : aza alefa ny entana.`);
    return json({ achat: data });
  }

  // ---- Acheter à l'intérieur de l'application ----
  // Rien ne part au dehors : la somme quitte le solde et le droit est acquis
  // sur-le-champ. La demande est enregistrée comme déjà réglée, pour que le
  // solde en tienne compte et que l'achat laisse une trace.
  if (action === "spend") {
    const itemId = String(body.item ?? "");
    const item = SITE_ITEMS[itemId];
    if (!item) return json({ error: "article inconnu" }, 400);
    // Payé une fois, acquis pour toujours : pas de second paiement.
    if (itemId === "parrainage") {
      const { data: deja } = await admin.from("wallet_payouts").select("id")
        .eq("email", email).eq("kind", "insite").eq("status", "sent")
        .eq("destination", item.label).limit(1);
      if ((deja ?? []).length) return json({ error: "Efa voaloa ny Parrainage." }, 409);
    }

    const balance = await balanceFor(admin, email);
    // Seulement l'argent vraiment payé par Papi.
    const papi = await argentPapiFor(admin, email, balance);
    if (item.priceAr > papi) {
      return json({
        error: `Vola avy amin'ny Papi : ${papi.toLocaleString("fr-FR")} Ar, ilaina ` +
          `${item.priceAr.toLocaleString("fr-FR")} Ar. Vola tena izy ihany no andoavana ny abonnement : ` +
          `mandoava amin'ny Papi.`,
        papiAr: papi, manque: item.priceAr - papi,
      }, 400);
    }

    const { data, error } = await admin.from("wallet_payouts").insert({
      email: email, name: String(body.name ?? "").trim(),
      amount_ar: item.priceAr, method: "papi", kind: "insite",
      destination: item.label, currency: "MGA", amount_out: item.priceAr, rate: 1,
      status: "sent", settled_at: new Date().toISOString(),
    }).select("id").single();

    if (error) return json({ error: error.message }, 500);
    // Pas de commission ici : c'est l'appli qui encaisse, l'admin la paierait.
    return json({
      bought: itemId, label: item.label, priceAr: item.priceAr, days: item.days ?? 0,
      grant: item.grant ?? null,
      balanceAr: balance - item.priceAr, papiAr: papi - item.priceAr, receipt: data.id,
    });
  }

  // ---- Conversion, pour afficher le solde dans une autre devise ----
  if (action === "rate") {
    const currency = String(body.currency ?? "").toUpperCase();
    const rate = await rateFromAr(currency);
    return json({ currency, rate });
  }

  // ---- Choisir son ID KEY, la changer, ou revenir à l'automatique ----
  // Vide : la clef choisie s'efface et une clef automatique neuve la
  // remplace. Sinon : 4 à 20 lettres ou chiffres (tirets permis), libre chez
  // personne d'autre — comparée sans tirets, comme à la recherche.
  if (action === "cle-modifier") {
    const saisie = String(body.cle ?? "").trim().toUpperCase().replace(/\s+/g, "-");
    if (!saisie) {
      const { error: e } = await admin.from("wallet_cles").delete().eq("email", email);
      if (e) return json({ error: e.message }, 500);
      const cle = await cleFor(admin, email);
      return json({ idKey: cle, idKeyAuto: true });
    }
    if (!/^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$/.test(saisie) || normCle(saisie).length < 4) {
      return json({ error: "ID KEY : litera sy isa 4 ka hatramin'ny 20 (azo asiana « - »)." }, 400);
    }
    if (estCleAuto(saisie)) {
      return json({ error: "Ny endrika « NA-XXXX-XXXX » dia natokana ho an'ny ID KEY automatique." }, 400);
    }
    const { data: lignes, error: e1 } = await admin.from("wallet_cles").select("email,cle");
    if (e1) return json({ error: e1.message }, 500);
    const pris = ((lignes ?? []) as Array<{ email: string; cle: string }>)
      .some((l) => l.email !== email && memeCle(l.cle, saisie));
    if (pris) return json({ error: "Efa misy olona hafa mampiasa io ID KEY io." }, 409);
    const { error: e2 } = await admin.from("wallet_cles")
      .upsert({ email, cle: saisie }, { onConflict: "email" });
    if (e2) return json({ error: e2.message }, 500);
    return json({ idKey: saisie, idKeyAuto: false });
  }

  // ---- Voir à qui appartient une ID KEY, avant d'envoyer ----
  // On ne rend que le prénom affiché du compte (s'il en a un) : de quoi
  // vérifier qu'on ne s'est pas trompé de clef, sans livrer l'email.
  if (action === "cle") {
    const cle = normCle(body.cle);
    if (cle.length < 4) return json({ error: "ID KEY diso." }, 400);
    const { data: lignes } = await admin.from("wallet_cles").select("email,cle");
    const trouve = ((lignes ?? []) as Array<{ email: string; cle: string }>).find((l) => memeCle(l.cle, cle));
    if (!trouve) return json({ error: "Tsy misy wallet manana io ID KEY io." }, 404);
    if (trouve.email === email) return json({ error: "Anao io ID KEY io." }, 400);
    const { data: nom } = await admin.from("wallet_payouts").select("name")
      .eq("email", trouve.email).neq("name", "").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return json({ cle: trouve.cle, nom: nom?.name ?? null });
  }

  // ---- Transférer de la vola tena izy vers un autre portefeuille ----
  // Par son ID KEY. L'expéditeur paie la somme + les frais (TRANSFER_FEE_PCT),
  // pris sur sa seule vola tena izy ; le destinataire reçoit la somme entière,
  // le propriétaire les frais.
  if (action === "transfert") {
    const cle = normCle(body.cle);
    const amount = Math.floor(Number(body.amountAr ?? 0));
    const note = String(body.note ?? "").trim().slice(0, 300);
    if (cle.length < 4) return json({ error: "ID KEY diso." }, 400);
    if (!(amount > 0)) return json({ error: "Ampidiro ny vola halefa." }, 400);

    const { data: lignes, error: errCles } = await admin.from("wallet_cles").select("email,cle");
    if (errCles) return json({ error: "Mbola tsy vonona ny famindrana (supabase-portefeuille-famindrana.sql)." }, 500);
    const dest = ((lignes ?? []) as Array<{ email: string; cle: string }>).find((l) => memeCle(l.cle, cle));
    if (!dest) return json({ error: "Tsy misy wallet manana io ID KEY io." }, 404);
    if (dest.email === email) return json({ error: "Tsy azo alefa any aminao ihany." }, 400);

    const frais = fraisTransfert(amount);
    const balance = await balanceFor(admin, email);
    const { papi } = await partsSolde(admin, email, balance);
    if (amount + frais > papi) {
      return json({
        error: `Vola tena izy : ${ar(papi)}. Ilaina : ${ar(amount + frais)} ` +
          `(${ar(amount)} + frais ${ar(frais)}, ${TRANSFER_FEE_PCT} %). ` +
          "Ny vola tena izy ihany no afindra.",
      }, 400);
    }

    const { data, error } = await admin.from("wallet_transferts").insert({
      from_email: email, to_email: dest.email, amount_ar: amount, fee_ar: frais, note: note || null,
    }).select("id,amount_ar,fee_ar,created_at").single();
    if (error) return json({ error: error.message }, 500);

    const maCle = await cleFor(admin, email);
    await prevenir(admin, dest.email,
      `💸 Nahazo ${ar(amount)} avy amin'ny ${maCle ?? "wallet iray"}` + (note ? ` : ${note}` : "") + ".");
    return json({ transfert: data, cle: dest.cle, balanceAr: balance - amount - frais });
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

    // Un achat à l'étranger : le lien de l'entana, l'adresse où le livrer,
    // et la vola tena izy pour le payer — rien d'autre. Pas de frais : le
    // propriétaire paie la boutique, il n'envoie pas d'argent.
    const acheterAilleurs = async () => {
      if (!/^https?:\/\//i.test(link)) {
        return json({ error: "Apetaho ny rohin'ilay entana (https://…)." }, 400);
      }
      // Le prix s'écrit dans la devise de la boutique (les mêmes que « Voir
      // dans une autre devise ») ; c'est ICI qu'il devient de l'ariary, au
      // taux du jour — la page ne dit jamais combien d'ariary cela fait.
      let amount = Math.floor(Number(body.amountAr ?? 0));
      let prixDevise = amount;
      let taux = 1;
      if (currency !== "MGA") {
        prixDevise = Number(Number(body.prixDevise ?? 0).toFixed(2));
        if (!(prixDevise > 0)) return json({ error: "Ampidiro ny vidiny." }, 400);
        taux = await rateFromAr(currency);
        if (!(taux > 0)) {
          return json({ error: `Tsy hita ny taux ${currency} androany. Andramo indray, na soraty amin'ny ariary.` }, 400);
        }
        amount = Math.ceil(prixDevise / taux);
      }
      if (!(amount > 0)) return json({ error: "montant invalide" }, 400);
      const balance = await balanceFor(admin, email);
      const { papi } = await partsSolde(admin, email, balance);
      if (amount > papi) {
        return json({
          error: `Vola tena izy : ${ar(papi)}. Ilaina : ${ar(amount)}. ` +
            "Ny vola tena izy ihany no andoavana ny entana any ivelany. " +
            "Ampidiro vola amin'ny Mobile Money aloha.",
        }, 400);
      }
      const { data, error } = await admin.from("wallet_payouts").insert({
        email: email, name: name, amount_ar: amount, method: method, kind: kind,
        destination: destination, link: link, instructions: instructions || null,
        currency: currency, amount_out: prixDevise, rate: taux, status: "pending", fee_ar: 0,
      }).select("id,amount_ar,fee_ar,currency,amount_out").single();
      if (error) return json({ error: error.message }, 500);
      return json({ payout: data, balanceAr: balance - amount, etat: "pending", message: "", auto: null });
    };

    if (!METHODS.has(method)) return json({ error: "moyen de retrait inconnu" }, 400);
    if (!destination) return json({ error: "indiquez où envoyer l'argent" }, 400);
    // Wise, Payoneer et Skrill ne tiennent pas de compte en ariary :
    // une somme annoncée en MGA n'y arriverait jamais telle quelle.
    if (METHODES_EN_DEVISE.has(method) && (currency === "MGA" || !currency)) {
      return json({ error: "Ce portefeuille ne reçoit pas d'ariary : choisissez EUR, USD…" }, 400);
    }
    if (METHODES_EN_DEVISE.has(method) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
      return json({ error: "Indiquez l'email du compte " + method + "." }, 400);
    }
    if (method === "mobile" && currency !== "MGA") {
      return json({ error: "Le Mobile Money reçoit en ariary (MGA)." }, 400);
    }
    if (method === "usdt") {
      if (currency !== "USDT") return json({ error: "Ny retrait USDT dia amin'ny USDT." }, 400);
      // « TRC20 · Txxxx » : le réseau, puis l'adresse.
      const [reseau, adresse] = destination.split("·").map((x) => x.trim());
      const motif = ADIRESY_USDT[String(reseau ?? "").toUpperCase()];
      if (!motif || !motif.test(String(adresse ?? ""))) {
        return json({ error: "Diso ny adiresy USDT : TRC20 (manomboka amin'ny T) na BEP20 (manomboka amin'ny 0x)." }, 400);
      }
    }
    if (kind === "purchase") return await acheterAilleurs();
    if (!(amount > 0)) return json({ error: "montant invalide" }, 400);
    if (amount < MIN_PAYOUT_AR) {
      return json({ error: `Le retrait minimum est de ${MIN_PAYOUT_AR.toLocaleString("fr-FR")} Ar.` }, 400);
    }

    const balance = await balanceFor(admin, email);
    const frais = fraisRetrait(amount);
    // Ce qui sort doit être du vrai argent : pas les
    // sommes inscrites par l'application (voir retirableFor).
    const retirable = await retirableFor(admin, email, balance);
    if (amount + frais > retirable) {
      return json({
        error: `Vola azo alaina : ${retirable.toLocaleString("fr-FR")} Ar (ny vola tena naloa — ` +
          `ny vola nampidirin'ny appli ho azy dia ampiasaina ato anatiny ihany). Il faut ` +
          `${(amount + frais).toLocaleString("fr-FR")} Ar (${amount.toLocaleString("fr-FR")} Ar + ` +
          `${frais.toLocaleString("fr-FR")} Ar de frais, ${PAYOUT_FEE_PCT} %).`,
      }, 400);
    }

    const rate = await rateFromAr(currency);
    const amountOut = rate > 0 ? Number((amount * rate).toFixed(2)) : null;

    const { data, error } = await admin.from("wallet_payouts").insert({
      email: email, name: name, amount_ar: amount, method: method, kind: kind,
      destination: destination, link: link || null, instructions: instructions || null,
      currency: currency, amount_out: amountOut, rate: rate || null,
      status: "pending", fee_ar: frais,
    }).select("id,amount_ar,fee_ar,currency,amount_out").single();

    if (error) return json({ error: error.message }, 500);

    // Aucun canal ne part tout seul : la demande attend le propriétaire.
    // Le solde est déjà amputé : un retrait en attente compte comme parti,
    // sinon la même somme pourrait être demandée deux fois. Un refus, lui,
    // la rend — « balanceFor » ne compte que 'pending' et 'sent'.
    return json({
      payout: data,
      balanceAr: balance - amount - frais,
      etat: "pending",
      message: "",
      auto: null,
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
    if (!id) return json({ error: "la page n'a pas dit quelle demande annuler" }, 400);

    // L'erreur de la requête ne se jette pas : une colonne absente, une base
    // injoignable, et la ligne serait « introuvable » alors qu'elle existe.
    // Trois causes, trois mots — sans quoi on cherche la mauvaise.
    const { data: ligne, error: erreurLecture } = await admin.from("wallet_payouts")
      .select("id,email,status,auto_provider,auto_attempts,amount_ar")
      .eq("id", id).maybeSingle();

    if (erreurLecture) {
      return json({
        error: "La demande n'a pas pu être lue : " + erreurLecture.message +
          " — si une colonne manque, c'est que « supabase-retrait-automatique.sql » n'a pas été passé.",
      }, 500);
    }
    if (!ligne) return json({ error: "demande introuvable (" + id + ")" }, 404);

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

  // ---- Rattacher le compte au lien par lequel il est venu ----
  // La page garde le code du lien (« ?aff= ») et l'envoie après la connexion.
  // Le compte doit être neuf, ne pas être celui qui partage, et n'être
  // rattaché à personne encore : le premier lien l'emporte, pour toujours.
  if (action === "affilier") {
    const code = String(body.code ?? "").trim().slice(0, 40);
    if (!normCle(code)) return json({ error: "code vide" }, 400);
    const { data: deja, error: errDeja } = await admin.from("affiliations")
      .select("parrain_email").eq("filleul_email", email).maybeSingle();
    if (errDeja) return json({ error: "affiliation indisponible" }, 503);
    if (deja) return json({ affilie: false, raison: "deja" });

    const cree = Date.parse(String(caller?.user?.created_at ?? ""));
    if (!Number.isFinite(cree) || Date.now() - cree > AFF_JOURS_MAX * 86400000) {
      return json({ affilie: false, raison: "ancien" });
    }

    // L'ID KEY du lien : exacte d'abord, puis sans tirets ni « NA ».
    const { data: exacte } = await admin.from("wallet_cles")
      .select("email").eq("cle", code.toUpperCase()).maybeSingle();
    let parrain = norm(exacte?.email);
    if (!parrain) {
      const { data: toutes } = await admin.from("wallet_cles").select("email,cle");
      const trouve = ((toutes ?? []) as Array<{ email: string; cle: string }>).find((c) => memeCle(c.cle, code));
      parrain = norm(trouve?.email);
    }
    if (!parrain) return json({ affilie: false, raison: "inconnu" });
    if (parrain === email) return json({ affilie: false, raison: "soi" });

    const { error } = await admin.from("affiliations").insert({ filleul_email: email, parrain_email: parrain, code });
    if (error) return json({ affilie: false, raison: "deja" });

    if (AFF_INSCRIPTION_AR > 0) {
      const { error: e } = await admin.from("wallet_deposits").insert({
        email: parrain, amount_ar: AFF_INSCRIPTION_AR, provider: "affiliation_inscription",
        provider_ref: email, status: "confirme", confirmed_at: new Date().toISOString(),
        note: "Nisoratra tamin'ny rohinao : " + masquer(email),
      });
      if (!e) {
        await prevenir(admin, parrain,
          `🤝 ${masquer(email)} nisoratra tamin'ny rohinao : +${ar(AFF_INSCRIPTION_AR)}.`);
      }
    }
    return json({ affilie: true });
  }

  // ---- La machine envoie l'USDT elle-même ----
  // La ligne est d'abord verrouillée (auto_provider posé tant qu'elle est
  // 'pending' et vierge) : deux clics, deux onglets, un seul envoi.
  if (action === "envoyer_usdt") {
    if (!isOwner) return json({ error: "réservé au propriétaire" }, 403);
    const id = String(body.id ?? "");
    const { data: ligne } = await admin.from("wallet_payouts")
      .select("id,method,currency,amount_out,destination,status,auto_provider,auto_attempts")
      .eq("id", id).maybeSingle();
    if (!ligne || ligne.status !== "pending") return json({ error: "demande déjà traitée" }, 409);
    if (ligne.method !== "usdt" || ligne.currency !== "USDT") return json({ error: "tsy retrait USDT ity" }, 400);
    if (ligne.auto_provider || Number(ligne.auto_attempts ?? 0) > 0) {
      return json({ error: "Efa nisy fandefasana natao : jereo aloha ao amin'ny explorer (" + String(ligne.auto_provider) + ")." }, 409);
    }
    const [reseauBrut, adresse] = String(ligne.destination ?? "").split("·").map((x) => x.trim());
    const reseau = String(reseauBrut ?? "").toUpperCase();
    const montant = Number(ligne.amount_out ?? 0);
    if (!ADIRESY_USDT[reseau] || !ADIRESY_USDT[reseau].test(adresse ?? "")) return json({ error: "adiresy diso" }, 400);
    if (!(montant > 0)) return json({ error: "vola tsy fantatra" }, 400);
    if (montant > USDT_AUTO_MAX) return json({ error: `Mihoatra ny ${USDT_AUTO_MAX} USDT : alefaso an-tanana.` }, 400);
    if (!clefUsdt(reseau)) return json({ error: `Tsy misy wallet ${reseau} voaomana : alefaso an-tanana.` }, 400);

    const fournisseur = reseau === "TRC20" ? "tron" : "bsc";
    const { data: verrou } = await admin.from("wallet_payouts")
      .update({ auto_provider: fournisseur, auto_attempts: 1 })
      .eq("id", id).eq("status", "pending").is("auto_provider", null)
      .select("id").maybeSingle();
    if (!verrou) return json({ error: "efa misy fandefasana an-dalana" }, 409);

    const res = await envoyerUsdt(reseau, adresse, montant);
    if (res.ok) {
      await admin.from("wallet_payouts").update({
        status: "sent", auto_ref: res.txid, auto_raw: { txid: res.txid, reseau, montant },
        note: "txid " + res.txid, settled_at: new Date().toISOString(),
      }).eq("id", id);
      return json({ envoye: true, txid: res.txid, reseau });
    }
    if (!res.diffuse) {
      // Rien n'est parti : la ligne redevient libre, on pourra réessayer.
      await admin.from("wallet_payouts")
        .update({ auto_provider: null, auto_attempts: 0, auto_raw: { erreur: res.erreur } }).eq("id", id);
      return json({ error: "Tsy lasa ny vola : " + res.erreur }, 502);
    }
    // Peut-être parti : la ligne reste verrouillée jusqu'à vérification.
    await admin.from("wallet_payouts").update({ auto_raw: { erreur: res.erreur, douteux: true } }).eq("id", id);
    return json({ error: "Tsy fantatra raha lasa : jereo ao amin'ny explorer alohan'ny hanaovana zavatra hafa. " + res.erreur }, 502);
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
