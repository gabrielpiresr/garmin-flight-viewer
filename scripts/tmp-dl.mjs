import { Client, Functions, Query } from "node-appwrite";
import fs from "node:fs";
const env = {};
for (const line of fs.readFileSync(".env.local","utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const base = env.VITE_APPWRITE_ENDPOINT, proj = env.VITE_APPWRITE_PROJECT_ID, key = env.APPWRITE_API_KEY;
const client = new Client().setEndpoint(base).setProject(proj).setKey(key);
const fns = new Functions(client);
const f = await fns.get({ functionId: "admin-users" });
console.log("f.deploymentId:", f.deploymentId, "| f.latestDeploymentId:", f.latestDeploymentId, "| f.deployment:", f.deployment);
// newest deployments
const deps = await fns.listDeployments({ functionId: "admin-users", queries: [Query.orderDesc("$createdAt"), Query.limit(6)] });
for (const d of deps.deployments) {
  console.log(JSON.stringify({ id:d.$id, status:d.status, created:d.$createdAt, size:d.sourceSize, buildSize:d.buildSize }));
}
const activeId = f.deploymentId || f.latestDeploymentId || deps.deployments.find(d=>d.status==="ready")?.$id;
console.log("chosen active:", activeId);
// download via REST
const url = `${base}/functions/admin-users/deployments/${activeId}/download?type=source`;
const resp = await fetch(url, { headers: { "X-Appwrite-Project": proj, "X-Appwrite-Key": key } });
console.log("download status:", resp.status, resp.headers.get("content-type"));
if (resp.ok) {
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync("scripts/_prod_admin_users_source.tar.gz", buf);
  console.log("saved bytes:", buf.length);
}
