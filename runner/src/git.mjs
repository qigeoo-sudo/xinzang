/**
 * Git / 部署操作封装（S21 集成六段 + S22 生产发布四段）。
 * 所有 git 命令在本地仓库（主工作区）执行；生产部署通过 SSH 到 ECS 执行脚本。
 * AGENTS.md：main=staging（CloudBase 自动部署），master=生产。
 */
import { exec as execCb } from 'node:child_process';
import { mkdir, cp, readdir, stat, access } from 'node:fs/promises';
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
  let copiedFiles = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await cp(path.join(handoffAbs, entry.name), path.join(targetDir, entry.name), { recursive: true });
      copiedFiles++;
    } else {
      await cp(path.join(handoffAbs, entry.name), path.join(targetDir, entry.name));
      copiedFiles++;
    }
  }
  return { copiedFiles, targetPaths: [targetDir] };
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
 * S21-5 推 main：git add + commit + push origin main
 */
export async function gitPushMain(payload) {
  const cwd = repoPath(payload);
  await git('add -A', cwd);
  const commitMsg = typeof payload.commitMessage === 'string' ? payload.commitMessage : `feat(content-ops): S21 集成 Final Handoff ${payload.handoffVersion ?? ''}`.trim();
  try {
    await git(`commit -m "${commitMsg.replace(/"/g, '\\"')}"`, cwd);
  } catch (err) {
    // nothing to commit 时 git 非零退出，但不算失败
    if (!/nothing to commit|no changes/i.test(String(err.stderr || err.stdout || ''))) throw err;
  }
  await git('push origin main', cwd);
  const mainSha = (await git('rev-parse HEAD', cwd)).stdout;
  return { mainSha, pushed: true };
}

/**
 * S21-6 部署测试端：v1 push origin main 已触发 CloudBase 自动部署，此处只回传确认
 */
export async function deployStaging(payload) {
  // v1：push main 自动触发 CloudBase 部署，无需额外操作
  return { autoDeployed: true, note: 'push origin main 已触发 CloudBase 自动部署测试端' };
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
