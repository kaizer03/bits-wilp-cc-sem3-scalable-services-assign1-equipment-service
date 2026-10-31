import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { database, serve, request } from './helpers.js';
let pool, server, item;
before(async()=>{pool=await database();server=await serve(createApp({pool,bookingUrl:'http://127.0.0.1:1'}));});
after(async()=>{await server?.close();await pool?.end();});
test('catalogue persists a newly registered asset',async()=>{
  const body={assetTag:`TEST-${Date.now()}`,name:'Portable screen',category:'Presentation',location:'Seminar room'};
  const created=await request(server.url,'/api/equipment','POST',body);assert.equal(created.status,201);item=created.body;
  const found=await request(server.url,`/api/equipment/${item.id}`);assert.equal(found.body.name,body.name);assert.equal(found.body.assetTag,body.assetTag);
});
test('asset tags are unique',async()=>{
  const result=await request(server.url,'/api/equipment','POST',{...item,assetTag:item.assetTag});assert.equal(result.status,409);
});
test('invalid fields and identifiers return client errors',async()=>{
  for(const input of [{name:'x'},null,[]]) assert.equal((await request(server.url,'/api/equipment','POST',input)).status,400);
  assert.equal((await request(server.url,'/api/equipment/not-an-id')).status,400);
});
test('maintenance changes persist and invalid status is rejected',async()=>{
  assert.equal((await request(server.url,`/api/equipment/${item.id}`,'PATCH',{status:'maintenance'})).body.status,'maintenance');
  assert.equal((await request(server.url,`/api/equipment/${item.id}`)).body.status,'maintenance');
  assert.equal((await request(server.url,`/api/equipment/${item.id}`,'PATCH',{status:'unknown'})).status,400);
});
test('catalogue and readiness still work when booking service is down',async()=>{
  assert.equal((await request(server.url,'/api/bookings')).status,503);
  assert.equal((await request(server.url,'/api/equipment')).status,200);
  assert.equal((await request(server.url,'/health/ready')).status,200);
});
