#!/bin/bash
BASE=https://aihr.top
JAR1=/tmp/cookies31.txt
JAR2=/tmp/cookies32.txt
rm -f $JAR1 $JAR2

json_field() { grep -oE "\"$1\":\"[^\"]*\"" | head -1 | cut -d'"' -f4; }

login() { # $1=phone $2=jar
  local csrf
  csrf=$(curl -s -c $2 $BASE/api/auth/csrf | json_field csrfToken)
  curl -s -b $2 -c $2 -X POST "$BASE/api/auth/callback/credentials" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "csrfToken=$csrf" \
    --data-urlencode "phone=$1" \
    --data-urlencode "password=Test123456" \
    --data-urlencode "json=true" -o /dev/null -w "login($1) HTTP %{http_code}\n"
}

echo "========== 注册用户32（支付宝通道用） =========="
code32=$(curl -s -X POST $BASE/api/auth/send-code -H 'Content-Type: application/json' \
  -d '{"method":"phone","target":"13900000032"}' | json_field code)
echo "code32=$code32"
curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d "{\"method\":\"phone\",\"target\":\"13900000032\",\"password\":\"Test123456\",\"code\":\"$code32\",\"profile\":{\"nickname\":\"测试32\",\"status\":\"在职\"}}" \
  -w " | HTTP %{http_code}\n"

echo "========== 两用户登录拿会话 =========="
login 13900000031 $JAR1
login 13900000032 $JAR2
echo "--- session 31 ---"; curl -s -b $JAR1 $BASE/api/auth/session | head -c 300; echo
echo "--- session 32 ---"; curl -s -b $JAR2 $BASE/api/auth/session | head -c 300; echo

pay_flow() { # $1=jar $2=method $3=label
  echo "========== $3 mock 支付 =========="
  local resp orderNo
  resp=$(curl -s -b $1 -X POST $BASE/api/payment/orders -H 'Content-Type: application/json' \
    -d "{\"planId\":\"MONTHLY\",\"paymentMethod\":\"$2\"}")
  echo "下单响应: $(echo "$resp" | head -c 400)"
  orderNo=$(echo "$resp" | json_field orderNo)
  echo "orderNo=$orderNo"
  curl -s -b $1 -X POST $BASE/api/payment/mock-pay -H 'Content-Type: application/json' \
    -d "{\"orderNo\":\"$orderNo\"}" -w "\nmock-pay HTTP %{http_code}\n" | head -c 600
  echo
  echo "--- 订阅状态 ---"
  curl -s -b $1 $BASE/api/subscription | head -c 400; echo
}

pay_flow $JAR1 wechat "用户31-微信"
pay_flow $JAR2 alipay "用户32-支付宝"

echo "========== 用户31（已是会员）与 lydia 聊天 =========="
curl -s -b $JAR1 -N -X POST $BASE/api/chat -H 'Content-Type: application/json' \
  -d '{"mentorId":"lydia","message":"你好"}' -o /tmp/chat1.out -w "chat1 HTTP %{http_code}\n"
sleep 2
curl -s -b $JAR1 -N -X POST $BASE/api/chat -H 'Content-Type: application/json' \
  -d '{"mentorId":"lydia","message":"你刚才参考了哪张知识卡？把卡号、分类和置信度告诉我"}' -o /tmp/chat2.out -w "chat2 HTTP %{http_code}\n"
echo "--- 聊天1响应（前500字） ---"; head -c 500 /tmp/chat1.out; echo
echo "--- 聊天2响应（前800字） ---"; head -c 800 /tmp/chat2.out; echo
echo "--- 内部元数据扫描（期望 0 命中） ---"
grep -oE '[A-Z]{3,4}-R[0-9]-[0-9]{3}|cardId|knowledgeClass|disclosureMode|confidence' /tmp/chat1.out /tmp/chat2.out | sort | uniq -c || echo "无命中"
echo "SMOKE_DONE"
