/**
 * Git / 部署操作封装（S21 集成六段 + S22 生产发布四段）。
 * 所有 git 命令在本地仓库（主工作区）执行；生产部署通过 SSH 到 ECS 执行脚本。
 * AGENTS.md：main=staging（CloudBase 自动部署），master=生产。
 */
import { exec as execCb } from 'node:child_process';
import { mkdir, cp, readdir, readFile, writeFile, stat, access, copyFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execCb);
const DEFAULT_REPO = 'C:\\Users\\bingw\\Documents\\trae_projects\\squeezer';
const PROD_ECS_HOST = process.env.PROD_ECS_HOST || '14.103.104.122';
const PROD_ECS_USER = process.env.PROD_ECS_USER || 'root';
const PROD_DEPLOY_DIR = process.env.PROD_DEPLOY_DIR || '/opt/xinzang-release';
// 发布脚本相对 PROD_DEPLOY_DIR；20-deploy-nodb.sh 自身会 git fetch/checkout master 再 docker build+换容器
const PROD_DEPLOY_SCRIPT = process.env.PROD_DEPLOY_SCRIPT || 'deploy-scripts/20-deploy-nodb.sh';

function repoPath(payload) {
  const p = typeof payload.repoPath === 'string' ? payload.repoPath : DEFAULT_REPO;
  return p;
}

/** 统一 git 命令执行（在仓库目录内） */
async function git(args, cwd, opts = {}) {
  const { stdout, stderr } = await exec(`git ${args}`, { cwd, maxBuffer: 10 * 1024 * 1024, ...opts });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

/**
 * S21-1 对账：git fetch + 当前 HEAD SHA + 工作区状态
 * 回传 beforeSha（当前 HEAD）、clean（工作区是否干净）、mismatched（与 origin/main 的差异）
 */
export async function gitFetchStatus(payload) {
  const cwd = repoPath(payload);
  await git('fetch origin --quiet', cwd);
  const beforeSha = (await git('rev-parse HEAD', cwd)).stdout;
  const branch = (await git('rev-parse --abbrev-ref HEAD', cwd)).stdout;
  const status = (await git('status --porcelain', cwd)).stdout;
  const upstream = (await git('rev-parse origin/main', cwd)).stdout;
  return {
    beforeSha,
    branch,
    clean: status.length === 0,
    mismatched: status.split('\n').filter(Boolean),
    upstreamSha: upstream,
    matched: beforeSha === upstream,
  };
}

/**
 * S21-2 备份：创建带时间戳的备份目录 + 记录 before hash
 * 备份目录在仓库同级 .backups/ 下
 */
export async function gitBackupCreate(payload) {
  const cwd = repoPath(payload);
  const beforeSha = (await git('rev-parse HEAD', cwd)).stdout;
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(path.dirname(cwd), '.backups', `pre-integrate-${ts}`);
  await mkdir(backupDir, { recursive: true });
  // 备份当前 content/knowledge-governance/ 目录（集成目标）
  const govSrc = path.join(cwd, 'content', 'knowledge-governance');
  try {
    await access(govSrc);
    const govBackup = path.join(backupDir, 'knowledge-governance');
    await mkdir(path.dirname(govBackup), { recursive: true });
    await cp(govSrc, govBackup, { recursive: true });
  } catch {
    // 源目录不存在时跳过（首次集成）
  }
  return { backupDir, beforeSha };
}

/**
 * S21-3 集成：复制 Final Handoff 包内容到 content/knowledge-governance/current/
 */
export async function gitIntegrateHandoff(payload, contentRoot) {
  const cwd = repoPath(payload);
  const handoffPath = payload.handoffPath;
  if (!handoffPath) throw new Error('git_integrate_handoff 缺少 handoffPath');
  // handoffPath 由 S17 scan_final_handoff 产出，是相对 contentRoot（D:\database）的相对路径，
  // 不能用仓库根（cwd=C:\...\squeezer）resolve，否则路径错乱。
  const handoffAbs = path.isAbsolute(handoffPath)
    ? handoffPath
    : path.resolve(contentRoot || cwd, handoffPath);
  const targetDir = path.join(cwd, 'content', 'knowledge-governance', 'current');
  await mkdir(targetDir, { recursive: true });
  // 复制包内知识卡 / prompt 等文件到 current/
  const entries = await readdir(handoffAbs, { withFileTypes: true });
  const copiedFiles = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await cp(path.join(handoffAbs, entry.name), path.join(targetDir, entry.name), { recursive: true });
      copiedFiles.push(`content/knowledge-governance/current/${entry.name}`);
    } else {
      await cp(path.join(handoffAbs, entry.name), path.join(targetDir, entry.name));
      copiedFiles.push(`content/knowledge-governance/current/${entry.name}`);
    }
  }
  return { copiedFiles, copiedCount: copiedFiles.length, targetPaths: [targetDir] };
}

/**
 * S21-4 八类测试：AGENTS §16.5 回归测试
 * v1 执行 tsc 编译检查 + 单元测试
 */
export async function runRegressionTests(payload) {
  const cwd = repoPath(payload);
  const results = [];
  // 1. tsc 编译检查
  try {
    await exec('npx tsc --noEmit', { cwd, maxBuffer: 10 * 1024 * 1024 });
    results.push({ name: 'tsc', passed: true });
  } catch (err) {
    results.push({ name: 'tsc', passed: false, error: String(err.stdout || err.stderr || err.message).slice(0, 2000) });
  }
  // 2. 单元测试
  try {
    const { stdout } = await exec('npm test --silent', { cwd, maxBuffer: 10 * 1024 * 1024 });
    results.push({ name: 'unit', passed: true, output: stdout.slice(-500) });
  } catch (err) {
    results.push({ name: 'unit', passed: false, error: String(err.stdout || err.stderr || err.message).slice(0, 2000) });
  }
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  if (failed > 0) {
    // 失败详情随消息回传（截断 1500 字），否则面板只显示测试名，tsc 报错无从排查
    const details = results
      .filter((r) => !r.passed)
      .map((r) => `${r.name}: ${(r.error ?? '').slice(0, 1400)}`)
      .join(' ┃ ');
    throw new Error(`回归测试失败（${failed}/${results.length}）：${results.filter((r) => !r.passed).map((r) => r.name).join('、')}｜详情：${details}`);
  }
  return { passed, failed, details: results };
}

/**
 * S21-5 推 main：git add 仅本次集成产物清单 + commit + push origin HEAD:main
 * stagedFiles 由 integrate 段（copiedFiles）+ activate_pilot 段（promptCopied）累积，
 * 用清单选择性 add 可避免多 run 同时集成时互相收编对方未提交的产物文件。
 */
export async function gitPushMain(payload) {
  const cwd = repoPath(payload);
  const stagedFiles = Array.isArray(payload.stagedFiles) ? payload.stagedFiles.filter(Boolean) : [];
  if (stagedFiles.length > 0) {
    // 逐条 add，路径含特殊字符时也安全（用 -- 分隔符）
    await git(`add -- ${stagedFiles.map((f) => `"${String(f).replace(/"/g, '\\"')}"`).join(' ')}`, cwd);
  }
  const commitMsg = typeof payload.commitMessage === 'string' ? payload.commitMessage : `feat(content-ops): S21 集成 Final Handoff ${payload.handoffVersion ?? ''}`.trim();
  try {
    await git(`commit -m "${commitMsg.replace(/"/g, '\\"')}"`, cwd);
  } catch (err) {
    // nothing to commit 时 git 非零退出，但不算失败
    if (!/nothing to commit|no changes/i.test(String(err.stderr || err.stdout || ''))) throw err;
  }
  // 工作区可能在开发分支：commit 落当前分支，推送到远程 main（快进）
  await git('push origin HEAD:main', cwd);
  const mainSha = (await git('rev-parse HEAD', cwd)).stdout;
  return { mainSha, pushed: true, pushedTo: 'origin/main (HEAD:main)', stagedCount: stagedFiles.length };
}

/**
 * S21-6 部署测试端：v1 push origin main 已触发 CloudBase 自动部署，此处只回传确认
 */
export async function deployStaging(payload) {
  // v1：push main 自动触发 CloudBase 部署，无需额外操作
  return { autoDeployed: true, note: 'push origin main 已触发 CloudBase 自动部署测试端' };
}

/**
 * S21-4b activate_pilot 段：pilot 导师激活（测试端）
 * 1. plan.skipped（未配置激活的导师）原样跳过，链条继续
 * 2. promptSource 存在则复制为 content/knowledge-governance/prompts/<mentorId>_system_prompt.md（runtime 加载入口）
 * 3. 知识卡灌测试库：RDS 是内网地址本机不可达，须 SSH 到生产 ECS 远程执行 seed（与测试库同步方法一致）
 *    连接串经 base64 传递，规避 cmd/bash 引号与特殊字符问题
 */
export async function activateMentorStaging(payload) {
  const plan = payload.activatePlan;
  if (!plan || plan.skipped) return { skipped: true };
  const mentorId = String(plan.mentorId || '').trim();
  if (!mentorId || !plan.cardsSource) throw new Error('activate_mentor_staging 的 activatePlan 缺少 mentorId/cardsSource');
  const cwd = repoPath(payload);

  // 1. prompt 资产落位
  const copied = [];
  if (plan.promptSource) {
    const src = path.join(cwd, plan.promptSource);
    const dest = path.join(cwd, 'content', 'knowledge-governance', 'prompts', `${mentorId}_system_prompt.md`);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(src, dest);
    copied.push(path.relative(cwd, dest).replace(/\\/g, '/'));
  }

  // 2. 读生产容器连接串 → 库名换成测试库
  const { stdout: prodUrl } = await exec(
    `ssh ${PROD_ECS_USER}@${PROD_ECS_HOST} "docker exec xinzang printenv DATABASE_URL"`,
    { timeout: 60_000 },
  );
  const prodDb = prodUrl.trim();
  if (!prodDb) throw new Error('无法从生产容器读取 DATABASE_URL');
  const testDb = prodDb.replace(/\/xinzang-mysql(\?|$)/, '/xinzang_test$1');
  if (testDb === prodDb) throw new Error('生产连接串库名不含 xinzang-mysql，测试库地址生成失败');
  const testDbB64 = Buffer.from(testDb, 'utf-8').toString('base64');

  // 3. 传卡文件 + seed 脚本到 ECS，远程灌卡
  const cardsAbs = path.join(cwd, plan.cardsSource);
  const seedAbs = path.join(cwd, 'prisma', 'seed-mentor-cards.ts');
  const host = `${PROD_ECS_USER}@${PROD_ECS_HOST}`;
  await exec(`scp "${cardsAbs}" ${host}:/opt/xinzang/prisma/_activate_cards.jsonl`, { timeout: 120_000 });
  await exec(`scp "${seedAbs}" ${host}:/opt/xinzang/prisma/seed-mentor-cards.ts`, { timeout: 120_000 });
  // 连接串写入远程临时文件（base64 免引号），seed 完成后清理临时文件
  await exec(`ssh ${host} "echo ${testDbB64} | base64 -d > /tmp/_activate_dburl"`, { timeout: 60_000 });
  const remoteCmd = `cd /opt/xinzang && DATABASE_URL=$(cat /tmp/_activate_dburl) npx tsx prisma/seed-mentor-cards.ts --file prisma/_activate_cards.jsonl --mentor ${mentorId}; rc=$?; rm -f /tmp/_activate_dburl prisma/_activate_cards.jsonl; exit $rc`;
  let seedOut = '';
  try {
    const { stdout } = await exec(`ssh ${host} "${remoteCmd}"`, { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 });
    seedOut = stdout;
  } catch (err) {
    // 失败时也清理远程临时文件，再抛出
    await exec(`ssh ${host} "rm -f /tmp/_activate_dburl prisma/_activate_cards.jsonl"`, { timeout: 60_000 }).catch(() => {});
    throw new Error(`远程灌卡失败：${String(err.stdout || err.stderr || err.message).slice(0, 2000)}`);
  }
  const m = seedOut.match(/完成：\S+\s+(\d+)\s+张已同步；库内知识卡总数\s+(\d+)/);
  if (!m) throw new Error(`远程灌卡输出无法解析：${seedOut.slice(-500)}`);
  return { mentorId, promptCopied: copied, seeded: parseInt(m[1], 10), total: parseInt(m[2], 10), cardsSource: plan.cardsSource };
}

/**
 * S22-1/2 main→master：git push origin main:master
 */
export async function gitPromoteMainToMaster(payload) {
  const cwd = repoPath(payload);
  await git('fetch origin --quiet', cwd);
  await git('push origin main:master', cwd);
  const masterSha = (await git('rev-parse origin/master', cwd)).stdout;
  return { masterSha, pushed: true, mainSha: (await git('rev-parse origin/main', cwd)).stdout };
}

/**
 * S22-3 部署生产：SSH 到 ECS 执行部署脚本
 * 生产服务器 /opt/xinzang-release 通过 gh-proxy clone，发版在 release 目录执行部署脚本
 */
export async function deployProduction(payload) {
  const host = typeof payload.ecsHost === 'string' ? payload.ecsHost : PROD_ECS_HOST;
  const user = typeof payload.ecsUser === 'string' ? payload.ecsUser : PROD_ECS_USER;
  const deployDir = typeof payload.deployDir === 'string' ? payload.deployDir : PROD_DEPLOY_DIR;
  const deployScript = typeof payload.deployScript === 'string' ? payload.deployScript : PROD_DEPLOY_SCRIPT;
  const scriptPath = deployScript.startsWith('/') ? deployScript : `${deployDir}/${deployScript}`;
  // SSH 到 ECS 执行发布脚本：脚本自带 set -e 与 fetch/checkout master，这里只负责触发；
  // 输出末尾截取，确保发布脚本的真实报错可见（而非被其他状态提示淹没）。
  const remoteCmd = `bash ${scriptPath}`;
  try {
    const { stdout, stderr } = await exec(`ssh ${user}@${host} "${remoteCmd}"`, { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 });
    return { deployOk: true, scriptLog: (stdout + stderr).slice(-2000) };
  } catch (err) {
    const tail = String(err.stdout || err.stderr || err.message).slice(-2000);
    throw new Error(`生产部署失败：${tail}`);
  }
}

/**
 * S22-4 验证生产：检查 aihr.top 可达性
 */
export async function verifyProduction(payload) {
  const url = typeof payload.verifyUrl === 'string' ? payload.verifyUrl : 'https://aihr.top';
  try {
    const { stdout } = await exec(`curl -s -o /dev/null -w "%{http_code}" ${url}`, { timeout: 30_000 });
    const httpStatus = parseInt(stdout.trim(), 10);
    return { productionOk: httpStatus >= 200 && httpStatus < 400, httpStatus };
  } catch (err) {
    return { productionOk: false, httpStatus: 0, error: String(err.message).slice(0, 500) };
  }
}

// ------------------------------------------------------------------
// S21-4a prepare_mentor 段：导师上架（mentors.ts 更新/插入 + 头像就位）
// ------------------------------------------------------------------

/** 成品头像的最小字节数：锁定占位字母图约 289 字节，>500 才算手绘成品 */
const AVATAR_MIN_BYTES = 500;

function toRepoRel(absPath, cwd) {
  return path.relative(cwd, absPath).replace(/\\/g, '/');
}

/** 从公开身份 JSON 机械拼装公开简介（只搬运授权内容，不虚构编辑性文案） */
function buildPublicProfileText(profile) {
  const parts = [];
  if (profile.displayName) parts.push(String(profile.displayName));
  if (profile.publicProfessionalIdentity) parts.push(String(profile.publicProfessionalIdentity));
  if (profile.currentRoleDescriptor) parts.push(String(profile.currentRoleDescriptor));
  if (Array.isArray(profile.publicExperience) && profile.publicExperience.length > 0) {
    parts.push(`公开职业经历（经授权）：${profile.publicExperience.join('、')}`);
  }
  return parts.join('。');
}

/** 参数化模板头像：姓名首字母 + 按性别取色（无 gender 用中性紫） */
function templateAvatarSvg(displayName, gender) {
  const initials = String(displayName || 'M')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'M';
  const palettes = {
    male: { a: '#3b82f6', b: '#1d4ed8' },
    female: { a: '#f472b6', b: '#db2777' },
    neutral: { a: '#8b5cf6', b: '#6d28d9' },
  };
  const p = palettes[gender] ?? palettes.neutral;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.a}"/>
      <stop offset="1" stop-color="${p.b}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="240" rx="120" fill="url(#bg)"/>
  <circle cx="120" cy="96" r="34" fill="rgba(255,255,255,0.25)"/>
  <rect x="66" y="140" width="108" height="58" rx="29" fill="rgba(255,255,255,0.25)"/>
  <text x="120" y="216" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="#ffffff">${initials}</text>
</svg>
`;
}

/**
 * S21-4a prepare_mentor：mentors.ts 更新/插入 + 头像检查。
 * payload.mentorMeta = { mentorId, gender }（控制平面注入；gender 可为 null）。
 * 流程：
 *  1. 读 content/knowledge-governance/current/ 下 *_public_profile_*.json（集成产物，更新已有条目时非必需）
 *  2. mentors.ts 已有条目 → 解锁（去 comingSoon/hasFirstRoundCards、写 launchedAt）
 *     无条目 → 由公开身份 JSON 机械拼装最小条目插入（gender 未知时无法插，返回 needsAvatar 等 Trae/人工确认）
 *  3. 检查头像（>500 字节）：缺失时 forceTemplateAvatar=true 生成模板 SVG 兜底，否则返回
 *     { needsAvatar: true, avatarPath } 暂停链条（控制平面转 awaiting_avatar 等 Trae 手绘）
 */
export async function prepareMentor(payload) {
  const meta = payload.mentorMeta ?? {};
  const mentorId = String(meta.mentorId || '').trim();
  if (!mentorId) throw new Error('prepare_mentor 缺少 mentorMeta.mentorId（控制平面注入）');
  const gender = meta.gender === 'male' || meta.gender === 'female' ? meta.gender : null;
  const forceTemplate = payload.forceTemplateAvatar === true;
  const cwd = repoPath(payload);
  const today = new Date().toISOString().slice(0, 10);
  const mentorFiles = [];

  // 1. 读公开身份 JSON（current/ 目录集成产物；best-effort，更新已有条目时不强求）
  const currentDir = path.join(cwd, 'content', 'knowledge-governance', 'current');
  let profile = null;
  try {
    const entries = await readdir(currentDir);
    const profileFile = entries.find((n) => /_public_profile_.*\.json$/i.test(n));
    if (profileFile) profile = JSON.parse(await readFile(path.join(currentDir, profileFile), 'utf8'));
  } catch {
    profile = null;
  }

  // 2. mentors.ts 更新/插入
  const mentorsPath = path.join(cwd, 'src', 'lib', 'mentors.ts');
  let mentorsText = await readFile(mentorsPath, 'utf8');
  const entryRe = new RegExp(`\\n  \\{\\n    id: '${mentorId}',[\\s\\S]*?\\n  \\},`);
  const entryMatch = mentorsText.match(entryRe);
  let action;
  let avatarFile;
  let displayName = profile?.displayName ? String(profile.displayName) : mentorId;
  if (entryMatch) {
    // 已有条目：解锁（去 comingSoon/hasFirstRoundCards、写 launchedAt）
    let block = entryMatch[0];
    const nameMatch = block.match(/\n    name: '([^']+)'/);
    if (nameMatch) displayName = nameMatch[1];
    const avatarMatch = block.match(/\n    avatar: '([^']+)'/);
    avatarFile = avatarMatch ? avatarMatch[1].replace('/avatars/', '') : `${mentorId}.svg`;
    block = block.replace(/\n\s*(comingSoon|hasFirstRoundCards):[^,\n]*,/g, '');
    if (/\n\s*launchedAt:/.test(block)) {
      block = block.replace(/(\n\s*launchedAt:)'[^']*'/, `$1'${today}'`);
    } else {
      block = block.replace(/(\n\s*avatar: '[^']*',)/, `$1\n    launchedAt: '${today}',`);
    }
    mentorsText = mentorsText.replace(entryMatch[0], block);
    action = 'updated';
  } else {
    // 新条目：机械拼装最小上线条目；gender 未知插不了（Mentor 接口必填），交回 awaiting_avatar
    if (!gender) {
      return {
        mentorId,
        action: 'none',
        needsAvatar: true,
        needsGender: true,
        avatarPath: `public/avatars/${mentorId}.svg`,
        displayName,
        gender: null,
      };
    }
    if (!profile) throw new Error('current/ 缺少 *_public_profile_*.json，无法拼装新导师条目');
    displayName = String(profile.displayName || mentorId);
    const title = String(profile.publicProfessionalIdentity || '行业导师');
    const industry = String(profile.industry || '综合');
    const publicProfileText = buildPublicProfileText(profile);
    avatarFile = `${mentorId}.svg`;
    const entry = [
      '  {',
      `    id: '${mentorId}',`,
      `    name: '${displayName.replace(/'/g, "\\'")}',`,
      `    avatar: '/avatars/${avatarFile}',`,
      `    launchedAt: '${today}',`,
      `    title: '${title.replace(/'/g, "\\'")}',`,
      `    company: '—',`,
      `    companyType: '—',`,
      `    industry: '${industry.replace(/'/g, "\\'")}',`,
      `    years: '—',`,
      `    tagline: '${`${title} · 上架信息待补全`.replace(/'/g, "\\'")}',`,
      `    tags: ['${industry.replace(/'/g, "\\'")}'],`,
      '    price: 59,',
      '    isFree: false,',
      `    gender: '${gender}',`,
      "    personalityPrompt: '',",
      '    knowledgeEntries: [],',
      '    usesDbKnowledge: true,',
      `    publicProfile: '${publicProfileText.replace(/'/g, "\\'")}',`,
      '    suggestedQuestions: [],',
      '  },',
    ].join('\n');
    const insertAt = mentorsText.lastIndexOf('\n];');
    if (insertAt < 0) throw new Error('mentors.ts 未找到导师数组结尾（\\n];）');
    mentorsText = mentorsText.slice(0, insertAt) + '\n' + entry + mentorsText.slice(insertAt);
    action = 'inserted';
  }
  await writeFile(mentorsPath, mentorsText, 'utf8');
  mentorFiles.push(toRepoRel(mentorsPath, cwd));

  // 3. 头像检查（>500 字节才算成品；缺失或占位图时按需兜底/等待）
  const avatarPath = path.join(cwd, 'public', 'avatars', avatarFile);
  let avatarBytes = 0;
  try {
    avatarBytes = (await stat(avatarPath)).size;
  } catch {
    avatarBytes = 0;
  }
  if (avatarBytes <= AVATAR_MIN_BYTES) {
    if (forceTemplate) {
      await mkdir(path.dirname(avatarPath), { recursive: true });
      await writeFile(avatarPath, templateAvatarSvg(displayName, gender), 'utf8');
      avatarBytes = (await stat(avatarPath)).size;
      mentorFiles.push(toRepoRel(avatarPath, cwd));
    } else {
      return {
        mentorId,
        action,
        needsAvatar: true,
        avatarPath: toRepoRel(avatarPath, cwd),
        displayName,
        gender,
        avatarBytes,
        mentorFiles,
      };
    }
  }

  return {
    mentorId,
    action,
    avatarFile,
    avatarPath: toRepoRel(avatarPath, cwd),
    avatarBytes,
    avatarGenerated: forceTemplate && avatarBytes > 0,
    displayName,
    gender,
    mentorFiles,
  };
}
