-- mentorId 连名带姓迁移（一次性，配合 commit 7949b25）
-- 部署时在 npx tsx prisma/seed-knowledge-cards.ts 之后执行：
--   docker exec <mysql容器> mysql -u<user> -p<pwd> <db> < deploy-scripts/migrate-mentor-ids.sql
--   或在服务器直接：mysql -h<RDS内网> -u<user> -p<pwd> <db> < deploy-scripts/migrate-mentor-ids.sql
--
-- MentorKnowledgeCard 表由 seed-knowledge-cards.ts 幂等迁移（按 cardId upsert，data 带 mentorId），无需手动 UPDATE。
-- ChatSession 表存了导师 ID，必须手动迁移。

UPDATE ChatSession SET mentorId='freyagao'   WHERE mentorId='freya';
UPDATE ChatSession SET mentorId='lydiachen'  WHERE mentorId='lydia';
UPDATE ChatSession SET mentorId='winnieni'   WHERE mentorId='winnie';
UPDATE ChatSession SET mentorId='tinazhang'  WHERE mentorId='tina';
UPDATE ChatSession SET mentorId='phyllischi' WHERE mentorId='phyllis';
UPDATE ChatSession SET mentorId='yingwang'  WHERE mentorId='ying';
UPDATE ChatSession SET mentorId='kevinyuan' WHERE mentorId='kevin';

-- freyaren 保持不变（已符合连名带姓格式，不在映射表内）
