import fs from "node:fs";
import * as sdk from "node-appwrite";
const env={};
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue; const i=t.indexOf('='); env[t.slice(0,i)]=t.slice(i+1); }
const fn = new sdk.Functions(new sdk.Client().setEndpoint(env.VITE_APPWRITE_ENDPOINT).setProject(env.VITE_APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY));
const ex = await fn.createExecution({ functionId: env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || 'admin-users', body: JSON.stringify({action:'getDetail', userId:'saga_alias_115'}), async:false });
console.log('status', ex.status, 'code', ex.responseStatusCode, 'len', (ex.responseBody||'').length);
const parsed = ex.responseBody ? JSON.parse(ex.responseBody) : {};
const user = parsed.user;
console.log(JSON.stringify({
  hasUser: !!user,
  executedCount: user?.executed?.count,
  plannedCount: user?.planned?.count,
  executedIds: (user?.executedFlights||[]).map((f)=>f.id),
}, null, 2));
