import assert from 'node:assert/strict';
import test from 'node:test';
import {executeExpertTurn,planExpertTurn} from '../../packages/evolution-expert/dist/index.js';
for(const [intent,texts,payload,tool,expected] of [
 ['project-discover',['discover project','发现项目'],{projectFacts:{repository:'synthetic/project'}},'discover',{payload:{repository:'synthetic/project'}}],
 ['project-list',['list project definitions','项目列表'],{},'list',{}],
 ['project-inspect',['inspect project definition','查看项目'],{projectDefinitionId:'synthetic',version:'1.0.0'},'inspect',{projectDefinitionId:'synthetic',version:'1.0.0'}],
 ['project-diff',['compare project versions','比较项目版本'],{projectDefinitionId:'synthetic',fromVersion:'1.0.0',toVersion:'1.1.0'},'diff',{projectDefinitionId:'synthetic',fromVersion:'1.0.0',toVersion:'1.1.0'}],
 ['project-onboard',['register project','注册项目'],{projectDiscovery:{},projectDefinition:{schema:'synthetic'}},'register',{payload:{schema:'synthetic'}}],
 ['project-adjust',['adjust project','修改项目'],{projectImpact:{},projectDefinition:{schema:'synthetic'}},'register',{payload:{schema:'synthetic'}}]
])test(`${intent} bilingual routing and exact MCP envelope`,async()=>{
 for(const text of texts){const plan=planExpertTurn(text,payload),calls=[];assert.equal(plan.intent,intent);await executeExpertTurn(plan,{invoke:async(name,args)=>calls.push({name,args})});assert.deepEqual(calls,[{name:`evopilot_project_definition_${tool}`,args:expected}]);}
});
for(const key of ['serverUrl','actor','payload','authorizationDigest','unknown'])test(`project projection refuses undeclared ${key}`,async()=>{
 let calls=0;await assert.rejects(executeExpertTurn(planExpertTurn('discover project',{projectFacts:{},[key]:'synthetic'}),{invoke:async()=>calls++}),/PROJECT_INPUT_INVALID/);assert.equal(calls,0);
});
for(const projectFacts of [null,[],42,'text'])test(`project facts require an object ${JSON.stringify(projectFacts)}`,async()=>{
 let calls=0;await assert.rejects(executeExpertTurn(planExpertTurn('discover project',{projectFacts}),{invoke:async()=>calls++}),/PROJECT_INPUT_INVALID/);assert.equal(calls,0);
});

for(const [verb,text] of [['activate','激活项目定义'],['rollback','回滚项目']])test(`project ${verb} requires matching destination digest and evidence`,async()=>{
 const hash='sha256:'+'a'.repeat(64),calls=[],payload={projectDefinitionId:'synthetic',version:'1.0.0',definitionDigest:hash,expectedActiveDigest:hash,authorizationDigest:hash,evidenceRef:'decision://synthetic'};
 const plan=planExpertTurn(text,payload);assert.equal(plan.intent,'project-'+verb);
 await assert.rejects(executeExpertTurn(plan,{invoke:async()=>calls.push(1)}),/EXACT_DECISION_REQUIRED/);
 await assert.rejects(executeExpertTurn(plan,{invoke:async()=>calls.push(1)},{authorizationDigest:hash,evidenceRef:'decision://different'}),/PROJECT_DECISION_MISMATCH/);
 assert.equal(calls.length,0);
 await executeExpertTurn(plan,{invoke:async(name,args)=>calls.push({name,args})},{authorizationDigest:hash,evidenceRef:'decision://synthetic'});
 assert.deepEqual(calls,[{name:'evopilot_project_definition_'+verb,args:{projectDefinitionId:'synthetic',payload:{version:'1.0.0',definitionDigest:hash,expectedActiveDigest:hash,evidenceRef:'decision://synthetic'}}}]);
});

for(const [name,projectFacts]of Object.entries({password:{source:{credentials:{password:'synthetic'}}},apiKey:{nested:{apiKey:'synthetic'}},url:{repository:'https://synthetic:synthetic@example.test/repo'}}))test('nested project secret is refused before MCP: '+name,async()=>{
 let calls=0;await assert.rejects(executeExpertTurn(planExpertTurn('discover project',{projectFacts}),{invoke:async()=>calls++}),/PROJECT_RAW_SECRET_REFUSED/);assert.equal(calls,0);
});
test('project discovery forwards explicit credential references without resolving them',async()=>{
 const calls=[];await executeExpertTurn(planExpertTurn('discover project',{projectFacts:{secretRefs:['secret://synthetic/reference']}}),{invoke:async(name,args)=>calls.push(args)});
 assert.deepEqual(calls,[{payload:{secretRefs:['secret://synthetic/reference']}}]);
});

for(const [text,intent,tool,payload,expected]of [
 ['项目接入预检','project-connect-plan','onboarding_plan',{projectRegistration:{repository:{provider:'local-git',root:'/synthetic'}}},{payload:{repository:{provider:'local-git',root:'/synthetic'}}}],
 ['连接项目','project-connect','register',{projectRegistration:{id:'p',repository:{provider:'local-git',root:'/synthetic'}}},{payload:{id:'p',repository:{provider:'local-git',root:'/synthetic'}}}],
 ['项目就绪','project-readiness','readiness',{projectId:'p'},{projectId:'p'}],
 ['已连接项目列表','project-connected-list','list',{},{}],
 ['查看已连接项目','project-connected-inspect','inspect',{projectId:'p'},{projectId:'p'}]
])test('connected project guidance: '+intent,async()=>{
 const calls=[],p=planExpertTurn(text,payload);assert.equal(p.intent,intent);await executeExpertTurn(p,{invoke:async(name,args)=>calls.push({name,args})});assert.deepEqual(calls,[{name:'evopilot_project_'+tool,args:expected}]);
});
for(const [name,change]of Object.entries({scope:r=>r.tenantId='foreign',command:r=>r.repository.command='synthetic',credentials:r=>r.repository.credentials={token:'synthetic'},raw:r=>r.repository.token='synthetic'}))test('project connection refuses '+name+' before transport',async()=>{
 const projectRegistration={id:'p',repository:{provider:'local-git',root:'/synthetic'}};change(projectRegistration);let calls=0;await assert.rejects(executeExpertTurn(planExpertTurn('connect project',{projectRegistration}),{invoke:async()=>calls++}));assert.equal(calls,0);
});
