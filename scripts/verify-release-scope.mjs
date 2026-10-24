import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function checkReleaseScope(){
  const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
  const policy=read('governance/release-scope.json');
  assert.equal(policy.phase,'PRE_V1_0_RELEASE');
  assert.deepEqual(policy.excludedCapabilities,['dashboard','graphical-frontend','browser-acceptance']);
  assert.equal(policy.postReleaseRequiresNewAcceptedPlan,true);
  assert.equal(policy.historicalProposalsHaveExecutionAuthority,false);
  assert.equal(policy.withdrawnIsPassed,false);
  const plan=read('governance/asset-usability-v08.json');
  assert.equal(plan.preV1ReleaseScope.graphicalFrontend,'EXCLUDED');
  for(const item of [...plan.requirements,...plan.acceptance])assert(!/dashboard|browser journeys/i.test(item.requirement),'Graphical frontend obligation was reintroduced');
  const v07=read('governance/readability-v07.json');
  assert(!/dashboard/i.test(v07.objective));
  assert(v07.targets.every(t=>!/dashboard/i.test(t.name)));
  for(const p of ['docs/roadmap.md','docs/asset-usability-v08.md',...['runtime','harness','ontology'].map(owner=>'projects/evopilot-'+owner+'/docs/roadmap.md')]){
    const file=resolve(root,p);if(existsSync(file))assert(!/(?:and|the|read-only)\s+Dashboard|Expert\/Dashboard/i.test(readFileSync(file,'utf8')),'Active UI scope in '+p);
  }
  for(const p of ['integration/consumption/dashboard.ts','integration/consumption/client.ts'])assert(!existsSync(resolve(root,p)),'Excluded frontend source: '+p);
  const http=resolve(root,'integration/consumption/http.ts');
  if(existsSync(http))assert(!/dashboardHTML|staticModules|text\/html/.test(readFileSync(http,'utf8')),'Asset API must not serve frontend pages');
  const delivery=resolve(root,'governance/asset-usability-v08-delivery.json');
  if(existsSync(delivery)){
    const target=read('governance/asset-usability-v08-delivery.json');
    assert(!target.variants.some(v=>v.id==='V08-E15.D03'||/dashboard|browser/i.test(v.name)));
    assert.deepEqual(target.scopeAmendment.withdrawnVariants.map(v=>[v.id,v.status,v.countsAsPassed]),[['V08-E15.D03','OUT_OF_SCOPE',false]]);
  }
  return {status:'ALIGNED',phase:policy.phase,graphicalFrontend:'EXCLUDED',withdrawnIsPassed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(checkReleaseScope()));
