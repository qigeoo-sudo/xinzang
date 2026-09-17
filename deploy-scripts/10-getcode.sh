#!/bin/bash
# 在服务器上请求 mock 验证码（与浏览器出口 IP 不同也没关系，码按手机号存库）
curl -s -X POST https://aihr.top/api/auth/send-code \
  -H 'Content-Type: application/json' \
  -d '{"method":"phone","target":"13900000031"}'
echo
