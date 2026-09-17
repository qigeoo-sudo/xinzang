#!/bin/bash
echo "===== 旧容器启动参数 ====="
docker inspect xinzang --format 'Restart={{.HostConfig.RestartPolicy.Name}}
Binds={{range .HostConfig.Binds}}[{{.}}] {{end}}
Ports={{range $k,$v := .HostConfig.PortBindings}}{{$k}}={{range $v}}{{.HostPort}} {{end}}{{end}}'
echo
echo "===== 旧容器实际生效的全部环境变量（只列非敏感键名） ====="
docker inspect xinzang --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -E 's/(KEY|SECRET|TOKEN|PASSWORD)=.*/\1=***隐藏***/'
echo
echo "===== /opt/xinzang/.env 键名 ====="
sed -E 's/=.*/=.../' /opt/xinzang/.env
