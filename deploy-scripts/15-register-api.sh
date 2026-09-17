#!/bin/bash
echo "===== 直接调注册 API（850022 仍有效） ====="
curl -s -X POST https://aihr.top/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"method":"phone","target":"13900000031","password":"Test123456","code":"850022","profile":{"nickname":"测试31","status":"在职"}}' \
  -w "\nHTTP %{http_code}\n"
