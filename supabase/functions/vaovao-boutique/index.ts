// Les quatre publications du jour, tirées des boutiques d'achats internationaux.
//
// Le fil vivait de ce que les gens y écrivaient : les jours où personne
// n'écrivait, il ne disait rien, et l'on n'y revenait plus. La maison y prend
// donc la parole quatre fois par jour, et parle de ce dont elle a à parler —
// les boutiques par lesquelles on achète à l'étranger depuis ici.
//
// Un billet, c'est un nom de boutique, la phrase que cette boutique publie
// elle-même pour être partagée, et son adresse. Le fil en tire ensuite la
// carte aux images, comme pour n'importe quel lien (fonction « apercu »).
//
// CE QUE CE N'EST PAS : un catalogue. Aucun de ces sites ne publie sa liste de
// marchandises à qui n'est pas une personne. On rapporte ce que le site donne
// à qui partage son lien, et rien de plus — voir « apercu ».
//
// LA LISTE DES BOUTIQUES EST LA MÊME QUE CELLE DE LA PAGE
// (DEFAULT_MARKETPLACES, dans gestion-stockage-js/parametres.js). Une boutique
// ajoutée d'un côté et pas de l'autre paraîtrait dans la fenêtre « Boutiques »
// sans jamais venir dans le fil, ou l'inverse.
//
// Déploiement : c'est une machine qui l'appelle, jamais une personne
// connectée. Donc
//   supabase functions deploy vaovao-boutique --no-verify-jwt
// et c'est le secret partagé qui tient la porte.
//
// Secrets attendus :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (déjà posés)
//   VAOVAO_SECRET        le mot de passe de la porte
//
// « essai: true » dans le corps : elle dit quel billet elle écrirait, sans
// rien écrire. À essayer avant de la laisser courir toute seule.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-secret-vaovao",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Comparaison à durée constante : comparer deux secrets avec === laisse fuir,
// par le temps de réponse, le nombre de caractères devinés juste.
function memeSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Le nom sous lequel la maison signe. IL DOIT DIRE LA MÊME CHOSE que
// MARQUE_NOM dans parametres.js : c'est à ce nom-là que la page reconnaît un
// billet de la maison et lui pose le logo du site. S'ils divergent, ces
// billets repartent avec des initiales.
const MARQUE_NOM = "Ny asako";
// L'étiquette du billet, à la place de « Autre » : on doit voir d'un coup
// d'œil ce qui vient de la maison et ce qui vient de quelqu'un.
const RESEAU = "Boutique";

// Les boutiques, avec le rayon sous lequel la page les range. Le rangement ne
// sert pas ici, mais garder la même forme qu'à la page rend la comparaison
// possible d'un coup d'œil le jour où l'une des deux listes bouge.
const BOUTIQUES: { groupe: string; nom: string; url: string }[] = [
  { groupe: "Ambongadiny sy Azia", nom: "Alibaba", url: "https://www.alibaba.com" },
  { groupe: "Ambongadiny sy Azia", nom: "AliExpress", url: "https://www.aliexpress.com" },
  { groupe: "Ambongadiny sy Azia", nom: "Taobao", url: "https://world.taobao.com" },
  { groupe: "Ambongadiny sy Azia", nom: "Lazada", url: "https://www.lazada.com" },
  { groupe: "Ny zavatra rehetra", nom: "Amazon", url: "https://www.amazon.fr" },
  { groupe: "Ny zavatra rehetra", nom: "eBay", url: "https://www.ebay.fr" },
  { groupe: "Ny zavatra rehetra", nom: "Cdiscount", url: "https://www.cdiscount.com" },
  { groupe: "Ny zavatra rehetra", nom: "Fnac", url: "https://www.fnac.com" },
  { groupe: "Ny zavatra rehetra", nom: "Rakuten", url: "https://fr.shopping.rakuten.com" },
  { groupe: "Ny zavatra rehetra", nom: "E.Leclerc", url: "https://www.e.leclerc" },
  { groupe: "Ny zavatra rehetra", nom: "Auchan", url: "https://www.auchan.fr" },
  { groupe: "Ny zavatra rehetra", nom: "Rue du Commerce", url: "https://www.rueducommerce.fr" },
  { groupe: "Ny zavatra rehetra", nom: "Pixmania", url: "https://www.pixmania.com" },
  { groupe: "Akanjo sy kiraro", nom: "SHEIN", url: "https://www.shein.com" },
  { groupe: "Akanjo sy kiraro", nom: "Zalando", url: "https://www.zalando.fr" },
  { groupe: "Akanjo sy kiraro", nom: "ASOS", url: "https://www.asos.com" },
  { groupe: "Akanjo sy kiraro", nom: "La Redoute", url: "https://www.laredoute.fr" },
  { groupe: "Akanjo sy kiraro", nom: "Spartoo", url: "https://www.spartoo.com" },
  { groupe: "Akanjo sy kiraro", nom: "Farfetch", url: "https://www.farfetch.com" },
  { groupe: "Elektronika sy mozika", nom: "Darty", url: "https://www.darty.com" },
  { groupe: "Elektronika sy mozika", nom: "Boulanger", url: "https://www.boulanger.com" },
  { groupe: "Elektronika sy mozika", nom: "Materiel.net", url: "https://www.materiel.net" },
  { groupe: "Elektronika sy mozika", nom: "Son-Vidéo", url: "https://www.son-video.com" },
  { groupe: "Elektronika sy mozika", nom: "JBL", url: "https://www.jbl.com" },
  { groupe: "Elektronika sy mozika", nom: "Thomann", url: "https://www.thomann.de" },
  { groupe: "Fanatanjahantena", nom: "Decathlon", url: "https://www.decathlon.fr" },
  { groupe: "Fanatanjahantena", nom: "Nike", url: "https://www.nike.com" },
  { groupe: "Fitaovana sy fiara", nom: "ManoMano", url: "https://www.manomano.fr" },
  { groupe: "Fitaovana sy fiara", nom: "Oscaro", url: "https://www.oscaro.com" },
  { groupe: "Fitaovana sy fiara", nom: "AUTODOC", url: "https://www.autodoc.fr" },
];

// Sept jours : c'est la fenêtre du fil lui-même. Une boutique déjà passée
// pendant ces jours-là y est encore affichée ; la remontrer ferait deux fois
// la même carte dans la même page. Trente boutiques et quatre billets par jour
// font un tour complet en sept jours et demi — la file se vide juste à temps.
const FENETRE_JOURS = 7;

// Une boutique qui se referme devant un robot ne donne ni phrase ni image :
// son billet n'aurait que son nom, et la carte du lien resterait vide sous
// lui. On en essaie donc une autre, jusqu'à quatre fois. Si toutes se
// taisent, on publie quand même la première — un billet nu vaut mieux qu'un
// jour de silence.
const ESSAIS_MUETS = 4;

type Apercu = { titre?: string; description?: string; site?: string; vide?: boolean };

// La boutique a-t-elle dit quelque chose d'elle-même ?
function aParle(a: Apercu): boolean {
  return !!((a.description || "").trim() || (a.titre || "").trim());
}

// Ce que la boutique publie d'elle-même pour être partagée. La fonction
// « apercu » fait déjà ce travail, et le fait bien : on ne le refait pas ici.
// Si elle ne répond pas — pas déployée, site muet — le billet paraît quand
// même, avec le seul nom de la boutique. Un billet nu vaut mieux qu'aucun.
async function lApercu(base: string, clef: string, url: string): Promise<Apercu> {
  try {
    const res = await fetch(base + "/functions/v1/apercu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": clef,
        "Authorization": "Bearer " + clef,
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
    });
    if (!res.ok) return {};
    return (await res.json()) as Apercu;
  } catch {
    return {};
  }
}

// Le texte du billet : le nom de la boutique et son rayon, ce qu'elle dit
// d'elle-même, et l'invitation. La carte du lien porte les images ; le texte
// n'a pas à les décrire.
function leTexte(nom: string, groupe: string, a: Apercu): string {
  const lignes = ["🛍️ " + nom + " — " + groupe];
  const phrase = (a.description || a.titre || "").trim();
  if (phrase) lignes.push(phrase.slice(0, 220));
  lignes.push("Tsindrio ny rohy hijerena izay amidy any.");
  return lignes.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode refusée" }, 405);

  const secret = Deno.env.get("VAOVAO_SECRET") ?? "";
  // Pas de secret posé, pas de porte ouverte : un secret vide laisserait
  // n'importe qui écrire dans le fil de tout le monde.
  if (!secret) return json({ error: "secret absent : rien n'est publié" }, 503);
  if (!memeSecret(req.headers.get("x-secret-vaovao") ?? "", secret)) {
    return json({ error: "refusé" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "configuration incomplète" }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const essai = body.essai === true;
  // Un billet par appel : ce sont les quatre heures de la journée qui font les
  // quatre publications, et non une rafale d'un bloc qui remplirait le fil le
  // matin et le laisserait muet jusqu'au lendemain.
  const combien = Math.min(Math.max(Number(body.combien ?? 1) || 1, 1), 4);

  const admin = createClient(supabaseUrl, serviceKey);

  // Les boutiques déjà passées dans la fenêtre du fil.
  const depuis = new Date(Date.now() - FENETRE_JOURS * 24 * 60 * 60 * 1000).toISOString();
  const { data: deja, error: erreurLecture } = await admin
    .from("client_news")
    .select("link")
    .eq("client_name", MARQUE_NOM)
    .gte("created_at", depuis)
    .limit(200);
  if (erreurLecture) return json({ error: erreurLecture.message }, 500);

  const vues = new Set((deja ?? []).map((r: { link?: string }) => String(r.link ?? "")));
  let file = BOUTIQUES.filter((b) => !vues.has(b.url));
  // Toutes passées : le tour est fini, on le recommence. Sans cela la maison
  // se tairait le jour où la liste serait épuisée.
  if (!file.length) file = BOUTIQUES.slice();

  // Chaque billet tire une boutique au hasard dans ce qui reste, va voir ce
  // qu'elle dit, et passe à la suivante si elle ne dit rien. La boutique
  // essayée sort de la file dans les deux cas : une boutique muette à
  // l'instant le sera encore dans la minute, et l'on ne va pas y revenir deux
  // fois dans le même passage. Elle revient au passage d'après.
  const choisies: { groupe: string; nom: string; url: string }[] = [];
  const billets: Record<string, unknown>[] = [];
  const muettes: string[] = [];

  for (let i = 0; i < combien && file.length; i++) {
    let retenue: { groupe: string; nom: string; url: string } | null = null;
    let apercu: Apercu = {};
    let repli: { groupe: string; nom: string; url: string } | null = null;
    let apercuRepli: Apercu = {};

    for (let tentative = 0; tentative < ESSAIS_MUETS && file.length; tentative++) {
      const n = Math.floor(Math.random() * file.length);
      const b = file[n];
      file.splice(n, 1);
      const a = await lApercu(supabaseUrl, serviceKey, b.url);
      if (!repli) { repli = b; apercuRepli = a; }
      if (aParle(a)) { retenue = b; apercu = a; break; }
      muettes.push(b.nom);
    }
    // Toutes muettes : on publie la première essayée plutôt que rien.
    if (!retenue && repli) { retenue = repli; apercu = apercuRepli; }
    if (!retenue) break;

    const b = retenue;
    const a = apercu;
    choisies.push(b);
    billets.push({
      client_name: MARQUE_NOM,
      network: RESEAU,
      message: leTexte(b.nom, b.groupe, a),
      link: b.url,
      type: "vaovao",
      price: null,
      // Pas de photo d'auteur : la page reconnaît un billet de la maison à son
      // nom et lui pose le logo du site elle-même. Écrire la colonne ici ferait
      // échouer l'insertion entière tant que « supabase-sary-mpanoratra.sql »
      // n'est pas passé, pour un résultat identique à l'écran.
      image: null,
    });
  }

  // « muettes » n'est pas une erreur : c'est la liste de celles qui se sont
  // refusées à ce passage-là, et qui reviendront au suivant. La voir permet
  // de reconnaître une boutique qui ne parle jamais, et de la retirer des
  // deux listes si elle ne sert à rien.
  if (essai) return json({ essai: true, restantes: file.length, muettes, billets });
  if (!billets.length) return json({ publies: 0, muettes });

  const { error } = await admin.from("client_news").insert(billets);
  if (error) return json({ error: error.message }, 500);

  return json({
    publies: billets.length,
    boutiques: choisies.map((b) => b.nom),
    muettes,
    restantes: file.length,
  });
});
