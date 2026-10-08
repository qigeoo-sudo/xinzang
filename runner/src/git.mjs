/**
 * Git / 部署操作封装（S21 集成六段 + S22 生产发布四段）。
 * 所有 git 命令在本地仓库（主工作区）执行；生产部署通过 SSH 到 ECS 执行脚本。
 * AGENTS.md：main=staging（CloudBase 自动部署），master=生产。
 */
import { exec as execCb } from 'node:child_process';
import { mkdir, cp, readdir, stat, access, copyFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execCb);
const DEFAULT_REPO = 'C:\\Users\\bingw\\Documents\\trae_projects\\squeezer';
const PROD_ECS_HOST = process.env.PROD_ECS_HOST || '14.103.104.122';
const PROD_ECS_USER = process.env.PROD_ECS_USER || 'root';
const PROD_DEPLOY_DIR = process.env.PROD_DEPLOY_DIR || '/opt/xinzang-release';

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
    throw new Error(`回归测试失败（${failed}/${results.length}）：${results.filter((r) => !r.passed).map((r) => r.name).join('、')}`);
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
  // SSH 到 ECS：在 release 目录 git pull + 执行部署脚本
  const remoteCmd = `cd ${deployDir} && git fetch origin && git checkout master && git pull origin master && bash deploy.sh`;
  try {
    const { stdout, stderr } = await exec(`ssh ${user}@${host} "${remoteCmd}"`, { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 });
    return { deployOk: true, scriptLog: (stdout + stderr).slice(-2000) };
  } catch (err) {
    throw new Error(`生产部署失败：${String(err.stdout || err.stderr || err.message).slice(0, 2000)}`);
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
