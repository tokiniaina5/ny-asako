-- ============================================================
-- Faire passer le ménage des vidéos tout seul, chaque nuit
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- À passer APRÈS avoir déployé la fonction "menage-video" et posé son
-- secret. Se relance sans risque.
--
-- Le fil ne montre que les sept derniers jours. Une vidéo plus vieille
-- n'est affichée nulle part : elle occupe de la place et ne sert plus à
-- personne. La fonction "menage-video" les efface ; il reste à la faire
-- passer régulièrement.
--
-- AVANT DE COLLER, remplacez VOTRE_SECRET_ICI par le secret que vous avez
-- posé dans MENAGE_SECRET. Il vit ensuite dans la définition de la tâche,
-- lisible par qui a accès à cette base — c'est-à-dire vous.
--
-- Si "create extension" est refusé, activez pg_cron et pg_net depuis
-- Database > Extensions, puis relancez ce script sans les deux premières
-- lignes.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Une tâche du même nom ne se crée pas deux fois : on retire l'ancienne
-- avant de poser la nouvelle, pour que ce script se relance sans empiler.
do $$
begin
  perform cron.unschedule('menage-video-quotidien');
exception when others then
  null;  -- elle n'existait pas : il n'y a rien à retirer.
end $$;

-- Chaque nuit à 3 h (heure UTC). Rien ne presse : une vidéo de huit jours
-- qui reste une nuit de plus ne gêne personne, et une tâche de nuit ne
-- croise pas les gens qui publient.
select cron.schedule(
  'menage-video-quotidien',
  '0 3 * * *',
  $ordre$
  select net.http_post(
    url := 'https://ezpsapvthujkhttbfhlr.supabase.co/functions/v1/menage-video',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-secret-menage', 'VOTRE_SECRET_ICI'
    ),
    body := '{}'::jsonb
  );
  $ordre$
);

-- ---------- Vérification ----------
-- Doit renvoyer une ligne : la tâche, active, et son horaire.
select jobname, schedule, active
from cron.job
where jobname = 'menage-video-quotidien';

-- Ce qu'elle a donné, une fois qu'elle sera passée (vide au début) :
-- select * from cron.job_run_details
-- where jobname = 'menage-video-quotidien'
-- order by start_time desc limit 10;

-- Pour l'arrêter un jour :
-- select cron.unschedule('menage-video-quotidien');
