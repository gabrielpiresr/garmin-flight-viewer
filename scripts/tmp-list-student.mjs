import fs from "node:fs";
import * as sdk from "node-appwrite";
const env={};
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue; const i=t.indexOf('='); env[t.slice(0,i)]=t.slice(i+1); }
const db = new sdk.Databases(new sdk.Client().setEndpoint(env.VITE_APPWRITE_ENDPOINT).setProject(env.VITE_APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY));
const student='saga_alias_115';
let offset=0; const limit=100; const docs=[];
while(true){
  const page=await db.listDocuments({databaseId:env.VITE_APPWRITE_DATABASE_ID,collectionId:env.VITE_APPWRITE_COLLECTION_ID,queries:[sdk.Query.equal('student_user_id',[student]),sdk.Query.limit(limit),sdk.Query.offset(offset)]});
  docs.push(...page.documents);
  if (!page.documents || page.documents.length < limit) break;
  offset += limit;
}
const saga=docs.filter(d=>String(d.saga_flight_id||'').length||String(d.source_filename||'').includes('saga')).map(d=>({
  docId:d.$id,
  saga_flight_id:d.saga_flight_id,
  source_filename:d.source_filename,
  date:d.flight_date,
  name:d.name,
  status:d.flight_status,
  updatedAt:d.$updatedAt,
})).sort((a,b)=> String(a.date||'').localeCompare(String(b.date||'')) || String(a.saga_flight_id||'').localeCompare(String(b.saga_flight_id||'')));
console.log(JSON.stringify({totalDocs:docs.length,sagaDocs:saga.length,rows:saga},null,2));
