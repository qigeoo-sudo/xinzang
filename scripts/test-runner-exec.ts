import { exec } from 'node:child_process';

const cwd = process.cwd();
console.log('Running: npm test --silent');
console.log('cwd:', cwd);

exec('npm test --silent', { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
  if (err) {
    console.log('EXIT CODE:', err.code);
    console.log('STDOUT (last 500):', (stdout || '').slice(-500));
    console.log('STDERR (last 500):', (stderr || '').slice(-500));
  } else {
    console.log('SUCCESS');
    console.log('STDOUT (last 500):', (stdout || '').slice(-500));
  }
});
