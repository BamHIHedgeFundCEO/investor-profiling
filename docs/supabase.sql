-- 單表。跑在 Supabase 的 SQL Editor。
--
-- 設計取捨：
--   * 匿名。不收姓名、email、IP。主鍵是隨機 uuid，無法回推到人。
--   * 只開放 INSERT。anon key 會出現在前端（它本來就設計成公開），所以資料表必須
--     假設任何人都能拿到它：能寫、不能讀、不能改、不能刪。分析時用 service role
--     key 從後台讀，那把 key 絕不進前端。
--   * responses 逐題原始作答，但開放式文字在離開瀏覽器前已做 PII 剝離。
--   * social_layer 僅在 consent_matching = true 時帶有興趣資料；未同意時只留同意旗標。
--   * 整筆寫入需要 consent_research = true，否則前端根本不送。

create table if not exists profiles (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  schema_version     text,
  item_bank_version  text,
  responses          jsonb,
  scoring_layer      jsonb,
  presentation_layer jsonb,
  social_layer       jsonb,
  quality_flags      text[],
  analyzer_used      text
);

alter table profiles enable row level security;

-- 只給 insert。沒有 select / update / delete policy，等於全部拒絕。
drop policy if exists "anon can insert only" on profiles;
create policy "anon can insert only"
  on profiles for insert
  to anon
  with check (true);

-- 方便之後看樣本分佈（用 service role 或 SQL Editor 執行）。
-- select investor_type, count(*) from (
--   select scoring_layer->>'investor_type' as investor_type from profiles
-- ) t group by 1 order by 2 desc;
