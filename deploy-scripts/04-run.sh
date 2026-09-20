#!/bin/bash
set -e

echo "===== 旧容器启动参数（参考） ====="
docker inspect xinzang --format 'RestartPolicy={{.HostConfig.RestartPolicy.Name}} Binds={{range .HostConfig.Binds}}{{.}} {{end}} Ports={{range $k,$v := .HostConfig.PortBindings}}{{$k}}->{{range $v}}{{.HostPort}} {{end}}{{end}}'
docker inspect xinzang --format 'EnvFileFrom={{range .Config.Env}}{{println .}}{{end}}' | grep -E "^(NODE_ENV|DATABASE_URL|AUTH_URL|NEXT_PUBLIC)" || true

echo "===== Mock 支付开关（只读检查） ====="
# 部署脚本不再强制改写 mock 开关。
# 上线真实微信/支付宝支付后，必须在 /opt/xinzang/.env 中关闭：
#   MOCK_PAYMENT_ENABLED=false（ALLOW_MOCK_IN_PRODUCTION 可留可删）
grep -E "^(MOCK_PAYMENT_ENABLED|ALLOW_MOCK_IN_PRODUCTION)" /opt/xinzang/.env || echo "(未设置 → mock 支付禁用)"

echo "===== 用新镜像替换容器 ====="
docker rm xinzang
docker run -d --name xinzang --restart unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  -p 3000:3000 \
  -v /opt/xinzang-data:/app/data \
  --env-file /opt/xinzang/.env \
  xinzang-new

sleep 4
docker ps --filter name=xinzang
echo "RUN_OK"
