#!/usr/bin/env bash
# Removes AirTime. Pass --purge to delete schedules and settings as well.
set -Eeuo pipefail

state_dir="/var/lib/airtime"
purge=false
[[ "${1:-}" == "--purge" ]] && purge=true

[[ "${EUID}" -eq 0 ]] || { echo "run this with sudo" >&2; exit 1; }

systemctl disable --now airtime.service airtime-update.path 2>/dev/null || true
rm -f /etc/systemd/system/airtime.service \
      /etc/systemd/system/airtime-update.service \
      /etc/systemd/system/airtime-update.path \
      /usr/local/libexec/airtime-update \
      /usr/local/bin/airtime
systemctl daemon-reload

# Hand time sync back to chrony's own servers.
rm -f /etc/chrony/conf.d/airtime.conf
if [[ -f /etc/chrony/chrony.conf ]]; then
  sed -i -e '/^# AirTime: time servers chosen in the dashboard$/d' \
         -e "\|^sourcedir ${state_dir}/chrony$|d" /etc/chrony/chrony.conf
fi
systemctl restart chrony 2>/dev/null || systemctl restart chronyd 2>/dev/null || true

if [[ "${purge}" == true ]]; then
  rm -rf -- "${state_dir}"
  echo "AirTime removed, including schedules and settings."
else
  echo "AirTime removed. Schedules and settings are kept in ${state_dir}."
fi
