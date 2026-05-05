#!/bin/bash
echo "=== compose project dir ==="
docker inspect supabase-auth-1 | grep -E 'working_dir|config_files' | head -5
echo ""
echo "=== compose env_file ==="
docker inspect supabase-auth-1 | grep -A2 -E 'EnvFile|HostConfig' | head -10
echo ""
echo "=== ls candidates ==="
ls -la /root/supabase 2>/dev/null && echo "found /root/supabase"
ls -la /home/*/supabase 2>/dev/null
find /opt /root /home -maxdepth 4 -name 'docker-compose.yml' 2>/dev/null | head -10
