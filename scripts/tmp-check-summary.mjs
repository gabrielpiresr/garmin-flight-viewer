import fs from "node:fs";
import * as sdk from "node-appwrite";
const env={};for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue; const i=t.indexOf('='); env[t.slice(0,i)] = t.slice(i+1);}
const fn = new sdk.Functions(new sdk.Client().setEndpoint(env.VITE_APPWRITE_ENDPOINT).setProject(env.VITE_APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY));
const payload = { action:'listSummaries', role:'admin', limit:50, offset:0, q:'SPYROS' };
const ex = await fn.createExecution({ functionId: env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || 'admin-users', body: JSON.stringify(payload), async:false});
console.log('status', ex.status, 'code', ex.responseStatusCode, 'len', (ex.responseBody||'').length);
if (ex.responseBody){
  const parsed = JSON.parse(ex.responseBody);
  const first=(parsed.summaries||[])[0];
  console.log(JSON.stringify({
    summaryCount: parsed.summaries?.length,
    first: first ? {
      userId:first.userId,
      fullName:first.fullName,
      executedCount:first.executed?.count,
      plannedCount:first.planned?.count,
      recentExecutedFlights:(first.recentExecutedFlights||[]).map(f=>({id:f.id,date:f.flightDate,status:f.flightStatus,source:f.sourceFilename})),
    } : null,
  }, null, 2));
}
