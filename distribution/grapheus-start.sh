#!/bin/sh
# OpenEMR + Grapheus: start OpenEMR exactly as the official image does, and in
# the background install/enable Grapheus as soon as OpenEMR's database is set up.
(
  i=0
  while [ $i -lt 180 ]; do
    if grep -q '^\$config = 1' /var/www/localhost/htdocs/openemr/sites/default/sqlconf.php 2>/dev/null; then
      if php /var/www/localhost/htdocs/openemr/interface/modules/custom_modules/oe-module-grapheus/install/autoinstall.php default; then
        exit 0
      fi
    fi
    i=$((i + 1))
    sleep 10
  done
  echo "Grapheus: OpenEMR was not ready within 30 minutes; enable Grapheus in Modules > Manage Modules."
) &
exec ./openemr.sh
