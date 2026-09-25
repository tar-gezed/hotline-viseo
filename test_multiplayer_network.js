'use strict';
const assert=require('node:assert/strict');
if(!globalThis.crypto)globalThis.crypto=require('node:crypto').webcrypto;
(async()=>{
  const {NetworkManager}=await import('./js/network/network_manager.js');
  const rooms=new Map(), managers=[];
  const flush=async()=>{for(let i=0;i<3;i++)await new Promise(r=>setTimeout(r,5));};
  function endpoint(){const queued=[],waiting=[];return {send:data=>{const r=waiting.shift();r?r({data}):queued.push(data);return Promise.resolve();},receive:()=>queued.length?Promise.resolve({data:queued.shift()}):new Promise(r=>waiting.push(r))};}
  function transport(id){return async()=>({selfId:id,joinRoom(config,code,callbacks){
    const actions=new Map(), peers=new Map(), room={id,code,callbacks,actions,peers,
      makeAction:name=>{
        const a={onMessage:null,send:async(data,{target})=>{
          for(const id of Array.isArray(target)?target:[target]) {
            const other=peers.get(id);
            queueMicrotask(()=>other?.actions.get(name)?.onMessage?.(structuredClone(data),{peerId:room.id}));
          }
        }};
        actions.set(name,a);return a;
      },
      getPeers:()=>Object.fromEntries([...peers.keys()].map(id=>[id,{createDataChannel(){throw Error('test fallback');}}])),
      leave:async()=>{rooms.get(code).delete(room);for(const p of peers.values()){p.peers.delete(id);p.onPeerLeave?.(id);}peers.clear();}
    };
    const group=rooms.get(code)||new Set();rooms.set(code,group);
    for(const other of group)queueMicrotask(async()=>{
      const a=endpoint(),b=endpoint();
      const verdicts=await Promise.allSettled([room.callbacks.onPeerHandshake(other.id,a.send,b.receive),other.callbacks.onPeerHandshake(id,b.send,a.receive)]);
      if(verdicts.every(v=>v.status==='fulfilled')){room.peers.set(other.id,other);other.peers.set(id,room);room.onPeerJoin?.(other.id);other.onPeerJoin?.(id);}
    });group.add(room);return room;
  }});}
  const make=(id,fp='a'.repeat(64))=>{const received=[],closed=[],n=new NetworkManager({fingerprint:fp,masks:['vincent','anne'],transport:transport(id),onEvent:(...e)=>received.push(e),onClose:m=>closed.push(m),onInput:(...e)=>received.push(['input',...e]),onSnapshot:s=>received.push(['snapshot',s])});n.received=received;n.closed=closed;managers.push(n);return n;};
  try{
    const host=make('host');await host.connect(true,null,{name:'Host',mask:'vincent'});
    const wrong=make('wrong','b'.repeat(64));await wrong.connect(false,host.code);await flush();assert(wrong.closed.some(s=>s.includes('Carte incompatible')));assert.equal(host.members.size,1);
    const clients=[];
    for(let i=1;i<5;i++){const n=make('client'+i);clients.push(n);await n.connect(false,host.code,{name:'P'+i,mask:'anne'});await flush();}
    assert.equal(host.members.size,5);assert.equal(Object.keys(host.room.getPeers()).length,4);
    assert(clients.every(n=>n.members.size===5&&Object.keys(n.room.getPeers()).length===1));
    const overflow=make('overflow');await overflow.connect(false,host.code);await flush();assert(overflow.closed.some(s=>s.includes('complet')));assert.equal(host.members.size,5);
    clients[0].profileUpdate({mask:'invalid',name:'<Bad>\nName'});await flush();assert.equal(host.members.get(1).mask,'anne');assert(!host.members.get(1).name.includes('<'));
    assert(!host.canStart());host.ready();for(const n of clients)n.ready();await flush();assert(host.canStart());host.start();await flush();assert(clients.every(n=>n.phase==='playing'&&n.run===1));
    const f={version:1,seq:1,x:1,y:0,angle:0,buttons:1,edges:[1,0,0]};clients[0].realtimeSend('input',f);await flush();assert(host.received.some(e=>e[0]==='input'&&e[1]===1));
    const before=host.received.length;
    host.receiveRealtime({session:host.session,run:0,type:'input',data:f},'client1');
    host.receiveRealtime({session:host.session,run:1,type:'input',data:f},'intruder');
    host.receiveRealtime({session:'bad',run:1,type:'input',data:f},'client1');
    host.receiveRealtime({session:host.session,run:1,type:'input',data:{...f,x:1000}},'client1');
    assert.equal(host.received.length,before);
    const original=host.members.get(1).mask;clients[0].profileUpdate({mask:'vincent'});await flush();assert.equal(host.members.get(1).mask,original,'no character changes during play');
    const late=make('late');await late.connect(false,host.code);await flush();assert(late.closed.some(s=>s.includes('commencé')));
    host.phase='results';host.send('results',[]);await flush();
    host.resultReady();for(const n of clients.slice(0,3))n.resultReady();await flush();assert.equal(host.phase,'results');
    await clients[3].leave();await flush();assert.equal(host.phase,'lobby','disconnection removes player from results quorum');
    const newcomer=make('newcomer');await newcomer.connect(false,host.code);await flush();
    assert.equal(newcomer.run,1,'joining between missions adopts the host run epoch');
    newcomer.profileUpdate({mask:'anne',name:'New colleague'});await flush();assert.equal(host.members.get(4).name,'New colleague');
    host.ready();for(const n of [...clients.slice(0,3),newcomer])n.ready();await flush();assert(host.canStart());host.start();await flush();assert.equal(host.run,2);
    await host.leave();await flush();assert(clients.slice(0,3).every(n=>n.closed.some(s=>s.includes('hôte'))));
    // Backpressure discards fast frames; reliable fallback has one in-flight frame.
    const queue=make('queue');queue.isHost=false;queue.hostId='h';queue.session='c'.repeat(32);queue.run=1;
    let sent=0;queue.fast.set('h',{readyState:'open',bufferedAmount:999999,send(){sent++;},close(){}});queue.realtimeSend('input',f);assert.equal(sent,0);
    queue.fast.clear();let release;queue.realtime={send(){sent++;return new Promise(r=>release=r);}};queue.realtimeSend('input',f);queue.realtimeSend('input',f);assert.equal(sent,1);release();await flush();queue.realtimeSend('input',f);assert.equal(sent,2);release();
    await flush();
    // An old reliable promise must not unlock the replacement session's frame.
    const releases=[];const fallback={send(){sent++;return new Promise(r=>releases.push(r));}};
    queue.realtime=fallback;queue.realtimeSend('input',f);await queue.leave();
    queue.realtime=fallback;queue.realtimeSend('input',f);const inFlight=sent;
    releases[0]();await flush();queue.realtimeSend('input',f);assert.equal(sent,inFlight,'old completion cannot remove new backpressure');
    releases[1]();await flush();queue.realtimeSend('input',f);assert.equal(sent,inFlight+1);releases[2]();await flush();
    // Delayed events from a replaced/closed SCTP stream are ignored, even if
    // the peer ID is reused. The replacement must keep its fast channel.
    const streams=[],stream=make('stream');stream.isHost=false;stream.hostId='h';
    stream.room={getPeers:()=>({h:{createDataChannel(){const c={close(){this.onclose?.();}};streams.push(c);return c;}}}),leave:async()=>{}};
    let received=0;stream.receiveRealtime=()=>received++;
    stream.joined('h');stream.joined('h');
    streams[0].onmessage({data:'{}'});streams[0].onerror();
    assert.equal(received,0);assert.equal(stream.fast.get('h'),streams[1]);
    streams[1].onmessage({data:'{}'});assert.equal(received,1);
    await stream.leave();streams[1].onmessage({data:'{}'});assert.equal(received,1,'closed session cannot receive late fast messages');
    console.log('PASS star admission, map mismatch, capacity, authority, epochs, readiness quorum, disconnect and congestion');
  }finally{for(const n of managers)await n.leave();}
})().catch(e=>{console.error(e);process.exit(1);});
