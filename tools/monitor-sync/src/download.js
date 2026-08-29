export async function downloadMonitorJs(version) {
  const url = `https://raw.githubusercontent.com/louislam/uptime-kuma/refs/tags/${version}/server/model/monitor.js`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`monitor-sync: failed to download monitor.js for ${version}: HTTP ${res.status} (${url})`);
  }
  return res.text();
}
