import {createServer} from '../../packages/server/dist/index.js';
const scope={tenantId:'lifecycle-test',workspaceId:'lifecycle-test'};
const server=createServer({dataRoot:process.argv[2],runtimeMode:'debug',tokens:[
  {name:'admin',token:'synthetic-admin',role:'admin',...scope},
  {name:'viewer',token:'synthetic-viewer',role:'viewer',...scope},
  {name:'foreign',token:'synthetic-foreign',role:'admin',tenantId:'foreign',workspaceId:'foreign'}
]});
server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
process.on('message',message=>{if(message==='stop')server.close(()=>process.exit(0));});
