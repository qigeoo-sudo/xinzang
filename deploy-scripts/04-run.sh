#!/bin/bash
set -e

echo "===== 旧容器启动参数（参考） ====="
docker inspect xinzang --format 'RestartPolicy={{.HostConfig.RestartPolicy.Name}} Binds={{range .HostConfig.Binds}}{{.}} {{end}} Ports={{range $k,$v := .HostConfig.PortBindings}}{{$k}}->{{range $v}}{{.HostPort}} {{end}}{{end}}'
docker inspect xinzang --format 'EnvFileFrom={{range .Config.Env}}{{println .}}{{end}}' | grep -E "^(NODE_ENV|DATABASE_URL|AUTH_URL|NEXT_PUBLIC)" || true

echo "===== 更新 /opt/xinzang/.env ====="
if grep -q "^ALLOW_MOCK_IN_PRODUCTION=" /opt/xinzang/.env; then
  sed -i 's/^ALLOW_MOCK_IN_PRODUCTION=.*/ALLOW_MOCK_IN_PRODUCTION=true/' /opt/xinzang/.env
else
  echo "ALLOW_MOCK_IN_PRODUCTION=true" >> /opt/xinzang/.env
fi
grep -E "^(MOCK_PAYMENT_ENABLED|ALLOW_MOCK_IN_PRODUCTION)" /opt/xinzang/.env

echo "===== 用新镜像替换容器 ====="
docker rm xinzang
docker run -d --name xinzang --restart unless-stopped \
  -p 3000:3000 \
  -v /opt/xinzang-data:/app/data \
  --env-file /opt/xinzang/.env \
  xinzang-new

sleep 4
docker ps --filter name=xinzang
echo "RUN_OK"
