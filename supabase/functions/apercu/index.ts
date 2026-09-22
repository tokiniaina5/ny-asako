// L'aperçu d'un lien partagé : l'image, le titre, le nom du site.
//
// Un billet qui ne porte qu'une adresse ne dit rien de ce qu'il y a au bout.
// « https://www.alibaba.com/ » — et puis ? Personne ne touche une adresse
// nue ; on touche une image.
//
// Le navigateur ne peut pas aller voir de lui-même : une page d'un autre
// domaine ne se lit pas depuis le nôtre, le navigateur l'interdit (CORS).
// C'est donc le serveur qui va la chercher, et n'en rapporte que quatre
// lignes — celles que la page publie ELLE-MÊME pour être partagée, les
// balises « og: » que lisent WhatsApp et Facebook.
//
// Ce qui n'est pas ici, et ne peut pas y être : la liste des marchandises
// d'une boutique. Les grands sites ne la publient pas de cette façon, la
// construisent dans le navigateur de leur visiteur, et refusent qui n'est pas
// une personne. On rapporte ce que le site donne à qui partage son lien : une
// image, un titre, une phrase. C'est ce que montrent WhatsApp et Facebook, et
// c'est déjà tout autre chose qu'une adresse nue.
//
// Déploiement : voir LISEZ-MOI-SUPABASE.txt, section « Aperçu des liens ».

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

// Une page se laisse lire par un navigateur, et se referme devant un script
// qui s'annonce comme tel. On se présente donc comme un navigateur — c'est ce
// que fait tout ce qui affiche un aperçu de lien.
const AGENT = "Mozilla/5.0 (compatible; NyAsako/1.0; +https://ny-asako.netlify.app)";
// De quoi contenir l'en-tête d'une page. Au-delà, les balises « og: » sont
// passées depuis longtemps, et l'on ne va pas télécharger un site entier.
const MAX_OCTETS = 512 * 1024;
const DELAI_MS = 8000;

// Ce qui n'est pas sur l'internet public n'a rien à faire au bout d'un lien
// partagé : une adresse locale ferait visiter au serveur son propre réseau.
function adressePublique(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return false;
  if (h === "0.0.0.0" || h === "[::1]" || h === "::1") return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^169\.254\./.test(h)) return false;
  return true;
}

function decode(v: string): string {
  return v
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

// Les balises se présentent dans les deux sens — « property » avant
// « content » ou l'inverse — et avec les guillemets qu'elles veulent.
function meta(html: string, noms: string[]): string {
  for (const nom of noms) {
    const n = nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const motifs = [
      new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${n}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${n}["']`, "i"),
    ];
    for (const m of motifs) {
      const trouve = html.match(m);
      if (trouve && trouve[1] && decode(trouve[1])) return decode(trouve[1]);
    }
  }
  return "";
}

function titreDeLaPage(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1].replace(/<[^>]*>/g, "")) : "";
}

// Une image annoncée « /img/x.jpg » ne s'affiche nulle part ailleurs que chez
// elle : on la ramène à son adresse entière.
function adresseEntiere(valeur: string, base: URL): string {
  if (!valeur) return "";
  try { return new URL(valeur, base).href; } catch { return ""; }
}

async function lireLeDebut(res: Response): Promise<string> {
  const lecteur = res.body?.getReader();
  if (!lecteur) return await res.text();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_OCTETS) {
    const { done, value } = await lecteur.read();
    if (done) break;
    if (value) { morceaux.push(value); total += value.length; }
  }
  try { await lecteur.cancel(); } catch { /* déjà close */ }
  const tout = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) { tout.set(m.subarray(0, Math.min(m.length, total - i)), i); i += m.length; }
  return new TextDecoder("utf-8", { fatal: false }).decode(tout);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let brut = "";
  try {
    const body = await req.json();
    brut = String(body.url ?? "").trim().slice(0, 2048);
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }
  if (!brut) return json({ error: "adresse manquante" }, 400);

  let cible: URL;
  try { cible = new URL(/^https?:\/\//i.test(brut) ? brut : "https://" + brut); }
  catch { return json({ error: "adresse illisible" }, 400); }
  if (!adressePublique(cible)) return json({ error: "adresse non publique" }, 400);

  const minuteur = AbortSignal.timeout ? AbortSignal.timeout(DELAI_MS) : undefined;
  let html = "";
  let finale = cible;
  try {
    const res = await fetch(cible.href, {
      headers: {
        "User-Agent": AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr,mg,en;q=0.8",
      },
      redirect: "follow",
      signal: minuteur,
    });
    // Le site a répondu autre chose qu'une page : on rend ce qu'on sait déjà
    // de l'adresse plutôt que rien.
    try { finale = new URL(res.url || cible.href); } catch { finale = cible; }
    const type = res.headers.get("content-type") || "";
    if (res.ok && /html/i.test(type)) html = await lireLeDebut(res);
  } catch {
    html = "";
  }

  const titre = meta(html, ["og:title", "twitter:title"]) || titreDeLaPage(html);
  const description = meta(html, ["og:description", "twitter:description", "description"]);
  const image = adresseEntiere(
    meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]),
    finale,
  );
  const site = meta(html, ["og:site_name"]) || finale.hostname.replace(/^www\./, "");

  return json({
    url: finale.href,
    site,
    titre: titre.slice(0, 200),
    description: description.slice(0, 300),
    image,
    // Rien n'a été trouvé : la page s'est refusée, ou ne publie pas d'aperçu.
    // Le client le saura et s'en tiendra au nom du site.
    vide: !titre && !image,
  });
});
