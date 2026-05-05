#!/usr/bin/env bash
set +e
echo "===DNS do host==="
getent hosts srv1496079.hstgr.cloud || echo "FAIL host dns"

echo "===DNS dentro do container==="
docker exec gestaopro getent hosts srv1496079.hstgr.cloud 2>&1 || \
  docker exec gestaopro sh -c 'nslookup srv1496079.hstgr.cloud 2>&1 || cat /etc/resolv.conf'

echo "===HTTPS do host==="
curl -sS -o /dev/null -w "HTTP %{http_code} time=%{time_total}s\n" --max-time 10 https://srv1496079.hstgr.cloud/auth/v1/health

echo "===HTTPS de dentro do container==="
docker exec gestaopro sh -c 'wget -S -qO- --timeout=10 https://srv1496079.hstgr.cloud/auth/v1/health 2>&1 | head -20 || echo FAIL'

echo "===Logs ultimas 50==="
docker logs --tail 50 gestaopro 2>&1
