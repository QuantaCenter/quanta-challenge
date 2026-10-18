import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLoginContext, parseSessionResult, loginError, isQuantaLoginPath } from '../app/utils/quanta-login.ts';

const csrfToken='x'.repeat(43);
test('only OAuth flow pages suppress the legacy unauthorized redirect', () => {
   for(const path of ['/auth/quanta','/auth/quanta/','/auth/quanta?error=expired']) assert.equal(isQuantaLoginPath(path),true);
   for(const path of ['/app/dashboard','/auth/quanta-elsewhere','/auth/login']) assert.equal(isQuantaLoginPath(path),false);
});
test('only validated context responses can display identity confirmation', () => {
   assert.deepEqual(parseLoginContext({status:'ready'}),{status:'ready'});
   const context={status:'onboarding',name:'实名',linkName:null,csrfToken};
   assert.deepEqual(parseLoginContext(context),context);
   for(const value of [null,{}, {...context,status:'unknown'}, {...context,name:''}, {...context,csrfToken:'bad'}, {...context,linkName:123}]) assert.throws(()=>parseLoginContext(value));
});
test('session response cannot redirect anywhere except the fixed Challenge homepage', () => {
   assert.deepEqual(parseSessionResult({csrfToken,destination:'/app/dashboard'}),{csrfToken,destination:'/app/dashboard'});
   for(const destination of ['//evil.test','https://evil.test','/auth/login','/app/dashboard?return=evil']) assert.throws(()=>parseSessionResult({csrfToken,destination}));
   assert.throws(()=>parseSessionResult({csrfToken:'bad',destination:'/app/dashboard'}));
});
test('API errors are translated locally and never echo server or provider messages', () => {
   assert.equal(loginError({data:{data:{error:'credentials_invalid'}}}).restart,false);
   for(const code of ['expired','csrf_failed','binding_conflict','session_invalid','conflict','reauth_required']) assert.equal(loginError({data:{data:{error:code}}}).restart,true);
   assert.equal(loginError({data:{error:'expired'}}).restart,true);
   assert.equal(loginError({data:{data:{error:'unavailable'}}}).restart,false);
   assert.doesNotMatch(loginError(new Error('secret upstream details')).message,/secret/);
   assert.equal(typeof loginError({code:'constructor'}).message,'string');
   assert.equal(typeof loginError({code:'__proto__'}).message,'string');
});
