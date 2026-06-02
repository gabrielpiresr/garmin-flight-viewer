import fs from "node:fs";
import * as sdk from "node-appwrite";
const env={};for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue; const i=t.indexOf('='); env[t.slice(0,i)] = t.slice(i+1);}
const fn = new sdk.Functions(new sdk.Client().setEndpoint(env.VITE_APPWRITE_ENDPOINT).setProject(env.VITE_APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY));
const payload = { action:'listSummaries', role:'admin', limit:200, offset:0 };
const ex = await fn.createExecution({ functionId: env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || 'admin-users', body: JSON.stringify(payload), async:false});
const parsed = ex.responseBody ? JSON.parse(ex.responseBody) : {};
const row = (parsed.summaries||[]).find(s=>s.userId==='saga_alias_115');
console.log(JSON.stringify({found:!!row, executed:row?.executed?.count, planned:row?.planned?.count, recent:(row?.recentExecutedFlights||[]).map(f=>f.id)},null,2));
