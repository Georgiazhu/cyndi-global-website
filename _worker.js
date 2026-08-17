const encoder = new TextEncoder();

const trackingPage = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Logistics Tracking | Cyndi Global Limited</title>
<style>
:root{--navy:#0f1f3a;--blue:#1e5a8a;--sky:#eef6fb;--orange:#e07a3a;--text:#1a2a3a;--muted:#71849a;--line:#dce8f0}*{box-sizing:border-box}body{margin:0;background:var(--sky);color:var(--text);font-family:Arial,sans-serif}.top{padding:16px 5%;background:var(--navy);color:#fff;display:flex;justify-content:space-between;align-items:center}.brand{color:#fff;text-decoration:none;font-weight:700;letter-spacing:1.5px}.brand small{display:block;color:#8cc5e0;font-size:10px;margin-top:3px}.actions{display:flex;gap:12px}.actions a,.lang{color:#eef6fb;text-decoration:none;border:1px solid #6b91ad;border-radius:8px;padding:8px 11px;background:transparent;cursor:pointer}.hero{padding:70px 20px 105px;text-align:center;color:#fff;background:linear-gradient(135deg,#0f1f3a,#1e5a8a)}h1{font-size:clamp(38px,7vw,74px);margin:14px 0}.hero p{max-width:700px;margin:auto;color:#dce8f0;font-size:17px;line-height:1.8}.search{max-width:900px;margin:-45px auto 0;padding:24px;background:#fff;border-radius:16px;box-shadow:0 20px 55px #0f1f3a29;position:relative}.form{display:flex;gap:12px}.form input{flex:1;min-width:0;padding:16px;border:1px solid var(--line);border-radius:10px;font-size:16px}.form button{border:0;border-radius:10px;padding:0 24px;background:var(--orange);color:#fff;font-weight:700;cursor:pointer}.hint{margin:12px 2px 0;color:var(--muted);font-size:12px}.msg{max-width:900px;margin:24px auto 0;padding:14px;text-align:center;border-radius:10px;background:#e0f0f8;color:#176080}.err{background:#fff1eb;color:#9a3d22}.hidden{display:none!important}main{max-width:1180px;margin:auto;padding:64px 20px}.heading{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:24px}.heading h2{margin:0;color:var(--navy);font-size:clamp(26px,4vw,36px)}.updated{color:var(--muted);font-size:12px;text-align:right}.grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.85fr);gap:22px}.panel{background:#fff;border-radius:16px;padding:25px;box-shadow:0 12px 30px #0f1f3a0f}.panel h3{margin:0;color:var(--navy)}.pill{display:inline-flex;margin-left:10px;padding:7px 11px;border-radius:20px;background:#e8f8ef;color:#217753;font-size:11px;font-weight:700}.route{display:grid;grid-template-columns:1fr 40px 1fr;align-items:center;margin:23px 0;padding:16px;border:1px solid var(--line);border-radius:12px;background:#f9fcfe}.route span,.meta span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase}.arrow{color:#4a9fd4;font-size:22px;text-align:center}.timeline{border-left:1px solid var(--line);margin-left:10px;padding-left:20px}.event{position:relative;padding-bottom:25px}.event:before{content:"";position:absolute;left:-26px;top:3px;width:9px;height:9px;border-radius:50%;background:#b5c5d1;border:3px solid white}.event.current:before{background:var(--orange)}.event time{color:var(--muted);font-size:11px}.event h4{margin:5px 0;color:var(--navy);font-size:15px}.event p{margin:0;color:var(--muted);font-size:13px;line-height:1.6}.meta{display:grid;grid-template-columns:1fr 1fr}.meta div{padding:14px 0;border-top:1px solid var(--line)}.meta strong{font-size:14px}.warehouse,.notes{margin-top:22px}.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.gallery figure{margin:0;background:var(--navy);border-radius:10px;overflow:hidden}.gallery img{display:block;width:100%;aspect-ratio:1.25;object-fit:cover}.gallery figcaption{padding:9px;color:#fff;font-size:11px}.raw{white-space:pre-wrap;word-break:break-word;color:var(--muted);font:13px/1.7 Consolas,monospace}.foot{padding:30px 20px;background:var(--navy);color:#fff;text-align:center;font-size:12px}.foot a{color:#8cc5e0}@media(max-width:760px){.actions a{display:none}.hero{padding:58px 18px 92px}.search{margin:-40px 18px 0;padding:17px}.form{display:block}.form button{width:100%;height:49px;margin-top:10px}.grid{grid-template-columns:1fr}.heading{display:block}.updated{text-align:left;margin-top:10px}.route{grid-template-columns:1fr}.arrow{transform:rotate(90deg);padding:8px}.gallery{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<header class="top"><a class="brand" href="../index.html">CYNDI GLOBAL<small>LIMITED</small></a><div class="actions"><a href="../index.html">Back to website</a><button class="lang" id="lang">CN</button></div></header>
<section class="hero"><div>CATALOG - LOGISTICS</div><h1 id="title">Shipment Tracking</h1><p id="intro">Enter a product number to view its latest logistics status, movement history and warehouse storage photos.</p></section>
<section class="search"><form class="form" id="form"><input id="input" placeholder="Enter product number" autocomplete="off"><button id="search">Track shipment</button></form><div class="hint">Enter the product number maintained by Cyndi Global.</div></section>
<div id="message" class="msg hidden"></div>
<main id="main" class="hidden"><div class="heading"><h2 id="name"></h2><div class="updated" id="updated"></div></div><div class="grid"><article class="panel"><h3 id="movement">Movement history <span class="pill" id="status"></span></h3><div class="route"><div><span>Origin</span><strong id="origin"></strong></div><div class="arrow">-&gt;</div><div><span>Destination</span><strong id="destination"></strong></div></div><div class="timeline" id="events"></div></article><aside class="panel"><h3 id="details">Shipment details</h3><div class="meta" style="grid-template-columns:1fr"><div><span>Packing quantity</span><strong id="packages"></strong></div></div></aside></div><article class="panel warehouse"><h3 id="warehouseTitle">Warehouse storage photos</h3><p id="warehouseUpdated" class="updated"></p><div id="gallery" class="gallery"></div></article></main>
<footer class="foot">(c) 2026 <a href="../index.html">Cyndi Global Limited</a> - Hong Kong</footer>
<script>
var cn=false;var labels={en:{title:'Shipment Tracking',intro:'Enter a product number to view its latest logistics status, movement history and warehouse storage photos.',placeholder:'Enter product number',search:'Track shipment',notFound:'No logistics record found for this product number.',required:'Please enter a product number.',movement:'Movement history',details:'Shipment details',warehouse:'Warehouse storage photos'},cn:{title:'\u7269\u6d41\u67e5\u8be2',intro:'\u8f93\u5165\u4ea7\u54c1\u7f16\u53f7\uff0c\u67e5\u8be2\u6700\u65b0\u7269\u6d41\u72b6\u6001\u3001\u8fd0\u8f93\u8f68\u8ff9\u53ca\u4ed3\u5e93\u7167\u7247\u3002',placeholder:'\u4ea7\u54c1\u7f16\u53f7',search:'\u67e5\u8be2',notFound:'\u6ca1\u6709\u627e\u5230\u8be5\u4ea7\u54c1\u7f16\u53f7\u5bf9\u5e94\u7684\u7269\u6d41\u8bb0\u5f55\u3002',required:'\u8bf7\u8f93\u5165\u4ea7\u54c1\u7f16\u53f7\u3002',movement:'\u8fd0\u8f93\u8f68\u8ff9',details:'\u8d27\u8fd0\u8be6\u60c5',warehouse:'\u4ed3\u5e93\u5b58\u50a8\u56fe\u7247'}};
function $(id){return document.getElementById(id)}function escapeHtml(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}function date(value){return value?new Date(value).toLocaleString(cn?'zh-CN':'en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'-'}function message(value,error){$('message').textContent=value;$('message').className='msg'+(error?' err':'')}function language(){var t=cn?labels.cn:labels.en;document.documentElement.lang=cn?'zh-CN':'en';$('title').textContent=t.title;$('intro').textContent=t.intro;$('input').placeholder=t.placeholder;$('search').textContent=t.search;$('movement').childNodes[0].textContent=t.movement+' ';$('details').textContent=t.details;$('warehouseTitle').textContent=t.warehouse}
function render(record){$('main').classList.remove('hidden');$('name').textContent=cn&&record.productNameZh?record.productNameZh:(record.productName||record.productNo);$('origin').textContent=cn&&record.originZh?record.originZh:(record.origin||'-');$('destination').textContent=cn&&record.destinationZh?record.destinationZh:(record.destination||'-');$('packages').textContent=record.packages==null?'-':record.packages;$('status').textContent=record.statusLabel||record.status||'-';$('updated').textContent=(cn?'\u6700\u540e\u66f4\u65b0':'Last updated')+': '+date(record.lastUpdated);$('warehouseUpdated').textContent=(cn?'\u4ed3\u5e93\u66f4\u65b0':'Warehouse update')+': '+date(record.warehouseUpdated);$('events').innerHTML=(record.events||[]).map(function(item,index){return '<div class="event '+(index===record.events.length-1?'current':'')+'"><time>'+escapeHtml(date(item.time))+'</time><h4>'+escapeHtml(cn&&item.titleZh?item.titleZh:item.title)+'</h4><p>'+escapeHtml(cn&&item.descriptionZh?item.descriptionZh:item.description)+'</p></div>'}).join('')||'<p>-</p>';$('gallery').innerHTML=(record.warehouseImages||[]).map(function(photo){return '<figure><img src="'+escapeHtml(photo.url)+'" alt="Warehouse photo"><figcaption>'+escapeHtml(cn&&photo.captionZh?photo.captionZh:(photo.caption||''))+'</figcaption></figure>'}).join('')||'<p>-</p>'}
async function lookup(){var number=$('input').value.trim().toUpperCase();if(!number){$('main').classList.add('hidden');message(cn?labels.cn.required:labels.en.required,true);return}message('Loading...');try{var response=await fetch('/api/logistics?productNo='+encodeURIComponent(number));if(!response.ok)throw new Error('not found');render(await response.json());$('message').classList.add('hidden')}catch(error){$('main').classList.add('hidden');message(cn?labels.cn.notFound:labels.en.notFound,true)}}$('form').addEventListener('submit',function(event){event.preventDefault();lookup()});$('lang').addEventListener('click',function(){cn=!cn;language();if(!$('main').classList.contains('hidden'))lookup()});language();
</script>
</body>
</html>`;

const adminPage = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logistics Admin | Cyndi Global Limited</title>
<style>
body{margin:0;background:#eef6fb;color:#1a2a3a;font-family:Arial,sans-serif}header{padding:20px 5%;background:#0f1f3a;color:#fff;display:flex;justify-content:space-between;align-items:center}header a{color:#8cc5e0}main{max-width:1080px;margin:auto;padding:35px 20px}.card{background:#fff;padding:24px;margin:18px 0;border-radius:14px;box-shadow:0 10px 28px #0f1f3a0f}.login{max-width:440px;margin:45px auto}label{display:block;margin:0 0 8px;color:#71849a;font-size:12px;font-weight:700}input,textarea{width:100%;padding:13px;border:1px solid #dce8f0;border-radius:8px;font:inherit;box-sizing:border-box}textarea{min-height:620px;font:12px Consolas,monospace}.field{margin-bottom:16px}.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}button{border:0;border-radius:8px;padding:13px 18px;background:#e07a3a;color:#fff;font-weight:700;cursor:pointer}button.secondary{background:#e5f2f9;color:#1e5a8a}button.small{padding:8px 11px;font-size:12px}.help{color:#71849a;font-size:12px;line-height:1.6}.msg{margin-top:15px;padding:12px 14px;border-radius:8px;background:#e9f8ef;color:#216749}.err{background:#fff0e9;color:#9a3d22}.hidden{display:none!important}.history{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.history button{background:#eef6fb;color:#1e5a8a;border:1px solid #c8dce9}.history button.active{background:#1e5a8a;color:#fff}.version{font-size:12px;color:#71849a}@media(max-width:650px){.row{grid-template-columns:1fr}}
</style>
</head>
<body>
<header><strong>CYNDI GLOBAL - LOGISTICS ADMIN</strong><a href="../catalog/logistics.html">Open tracking page</a></header>
<main>
<section id="login" class="card login"><h1>Admin login</h1><p>Manage product logistics records, photos and saved versions.</p><form id="loginForm"><div class="field"><label for="password">Admin password</label><input id="password" type="password" required></div><button>Sign in</button></form><div id="loginMsg" class="msg hidden"></div></section>
<section id="editor" class="hidden"><h1>Logistics data management</h1>
<div class="card"><div class="row"><div class="field"><label for="productNo">Product number</label><input id="productNo" placeholder="HRT-01" autocomplete="off"><p class="help">Enter HRT-01 or HRT-02 to load its current saved record automatically.</p></div><div class="field"><label for="imageFile">Warehouse images (multiple)</label><input id="imageFile" type="file" accept="image/*" multiple><p class="help">Select multiple images, upload them, then save the record.</p></div></div><div class="actions"><button id="load" class="secondary">Load product record</button><button id="upload" class="secondary">Upload images</button><span id="uploadMsg"></span></div><div id="historyBox" class="hidden"><div class="version" id="versionText"></div><div class="history" id="history"></div></div></div>
<div class="card"><div class="field"><label for="record">Record JSON or logistics text</label><textarea id="record" spellcheck="false" placeholder="Enter logistics information or load an existing record to edit"></textarea><p class="help">JSON and plain text are supported. Every save creates a new historical version.</p></div><div class="actions"><button id="save">Save record</button><button id="logout" class="secondary">Log out</button></div><div id="editorMsg" class="msg hidden"></div></div>
<div class="card"><h2>Change login password</h2><p class="help">Set your own admin password. Use 8 to 128 characters.</p><form id="passwordForm"><div class="row"><div class="field"><label for="currentPassword">Current password</label><input id="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="newPassword">New password</label><input id="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div></div><div class="field"><label for="confirmPassword">Confirm new password</label><input id="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div><button type="submit">Change password</button></form><div id="passwordMsg" class="msg hidden"></div></div>
</section>
</main>
<script>
function $(id){return document.getElementById(id)}function show(id,value,error){$(id).textContent=value;$(id).className='msg'+(error?' err':'')}function demo(){return {productNo:'',productName:'',status:'in_transit',lastUpdated:new Date().toISOString(),origin:'',destination:'',carrier:'',trackingNo:'',eta:'',packages:null,quantity:null,warehouseLocation:'',warehouseUpdated:new Date().toISOString(),events:[],warehouseImages:[],documents:[],notes:'',customFields:{}}}function setRecord(record){$('productNo').value=String(record.productNo||'').toUpperCase();$('record').value=JSON.stringify(record,null,2)}function setHistory(body){var history=body.history||[];$('historyBox').classList.remove('hidden');$('versionText').textContent='Current version: '+(body.currentVersion||0)+' | Saved versions: '+history.length;$('history').innerHTML=history.length?history.map(function(item){return '<button class="small '+(item.versionNo===body.currentVersion?'active':'')+'" data-version="'+item.versionNo+'">Version '+item.versionNo+' - '+new Date(item.createdAt).toLocaleString()+'</button>'}).join(''):'<span class="version">No previous versions yet.</span>';Array.from($('history').querySelectorAll('button')).forEach(function(button){button.addEventListener('click',function(){loadRecord(Number(button.dataset.version))})})}async function api(url,options){var response=await fetch(url,options);var body=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(body.error||body.detail||'Request failed');return body}function parseRecord(value){var text=value.trim();if(!text)throw new Error('Please enter logistics text.');try{var record=JSON.parse(text);record.productNo=String(record.productNo||$('productNo').value||'').trim().toUpperCase();record.productName=String(record.productName||record.productNameZh||record.productNo||'').trim();if(!record.productNo||!record.productName)throw new Error('Enter a product number and product name.');return record}catch(error){if(error.message.indexOf('Enter a product number')===0)throw error}var lines=text.split(/\r?\n/).map(function(line){return line.trim()}).filter(Boolean),first=lines[0]||'',header=first.match(/^([A-Za-z0-9_-]+)\s*(?:[\u3010\[]\s*([^\u3011\]]+)\s*[\u3011\]])?/),productNo=String($('productNo').value||(header&&header[1])||'').trim().toUpperCase();if(!productNo)throw new Error('Enter the product number above or on the first line.');var productName=header&&header[2]?header[2].trim():(first.replace(productNo,'').trim()||productNo),events=[];lines.slice(1).forEach(function(line){var match=line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(.+)$/);if(match)events.push({time:match[1]+'T'+match[2],title:match[3].trim(),description:'',status:'current'})});var last=events[events.length-1],boxes=text.match(/\*\s*(\d+)\s*\u7bb1/);return Object.assign({},demo(),{productNo:productNo,productName:productName,status:'in_transit',lastUpdated:last?last.time:new Date().toISOString(),packages:boxes?Number(boxes[1]):null,events:events,notes:text,rawText:text,customFields:{inputFormat:'plain_text'}})}async function loadRecord(version){var number=$('productNo').value.trim().toUpperCase();if(!number){show('editorMsg','\u8bf7\u8f93\u5165\u4ea7\u54c1\u7f16\u53f7\uff0c\u4f8b\u5982 HRT-01\u3002',true);return}try{var url='../api/admin/record?productNo='+encodeURIComponent(number)+(version?'&version='+version:'');var body=await api(url);setRecord(body.record);setHistory(body);show('editorMsg',version?'\u5df2\u52a0\u8f7d\u5386\u53f2\u7248\u672c '+version+'\u3002':'\u5df2\u52a0\u8f7d '+number+' \u7684\u5f53\u524d\u8bb0\u5f55\uff0c\u53ef\u4ee5\u4fee\u6539\u540e\u4fdd\u5b58\u3002',false)}catch(error){if(!version){$('record').value='';$('historyBox').classList.add('hidden')}show('editorMsg',error.message,true)}}var loadTimer;$('productNo').addEventListener('input',function(){clearTimeout(loadTimer);var number=$('productNo').value.trim();if(number.length>=2)loadTimer=setTimeout(function(){loadRecord()},500)});$('productNo').addEventListener('keydown',function(event){if(event.key==='Enter'){event.preventDefault();loadRecord()}});$('load').addEventListener('click',function(){loadRecord()});$('loginForm').addEventListener('submit',async function(event){event.preventDefault();try{await api('../api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});$('login').classList.add('hidden');$('editor').classList.remove('hidden');$('productNo').focus()}catch(error){show('loginMsg',error.message,true)}});$('upload').addEventListener('click',async function(){var files=Array.from($('imageFile').files),number=$('productNo').value.trim().toUpperCase();if(!files.length||!number){$('uploadMsg').textContent='Select a product number and at least one image.';return}if(files.length>20){$('uploadMsg').textContent='Upload at most 20 images per batch.';return}var form=new FormData();form.append('productNo',number);files.forEach(function(file){form.append('file',file)});try{var body=await api('../api/admin/upload',{method:'POST',body:form});$('uploadMsg').textContent='Uploaded and saved '+(body.urls||[]).length+' images.';await loadRecord();show('editorMsg','\u56fe\u7247\u5df2\u4e0a\u4f20\u5e76\u81ea\u52a8\u4fdd\u5b58\u5230 '+number+'\u3002',false)}catch(error){$('uploadMsg').textContent=error.message}});$('save').addEventListener('click',async function(){try{var record=parseRecord($('record').value),body=await api('../api/admin/record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});setRecord(record);await loadRecord();show('editorMsg','\u5df2\u4fdd\u5b58 '+body.productNo+'\uff0c\u65b0\u7248\u672c\u53f7\uff1a'+body.versionNo,false)}catch(error){show('editorMsg',error.message||'Could not save record',true)}});$('logout').addEventListener('click',async function(){await fetch('../api/admin/logout',{method:'POST'});location.reload()});
</script>
<script>
$('passwordForm').addEventListener('submit',async function(event){event.preventDefault();var currentPassword=$('currentPassword').value,newPassword=$('newPassword').value,confirmPassword=$('confirmPassword').value;if(newPassword!==confirmPassword){show('passwordMsg','The two new passwords do not match.',true);return}try{await api('../api/admin/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:currentPassword,newPassword:newPassword})});$('currentPassword').value='';$('newPassword').value='';$('confirmPassword').value='';show('passwordMsg','Password changed. Please sign in again with your new password.',false);setTimeout(function(){location.reload()},1200)}catch(error){show('passwordMsg',error.message||'Could not change password',true)}});
</script>
</body>
</html>`;

function base64Url(bytes) { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function decodeBase64Url(value) { const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4); const binary = atob(padded); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
async function sign(value, secret) { const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))); }
async function hashText(value) { const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
function timingSafeTextEqual(left, right) { const leftBytes = encoder.encode(String(left)); const rightBytes = encoder.encode(String(right)); return leftBytes.byteLength === rightBytes.byteLength && crypto.subtle.timingSafeEqual(leftBytes, rightBytes); }
async function getAdminSecret(env) { if (env.DB) { try { const row = await env.DB.prepare('SELECT password_hash FROM logistics_admin_settings WHERE id = 1').first(); if (row?.password_hash) return row.password_hash; } catch {} } return env.LOGISTICS_ADMIN_PASSWORD || ''; }
async function checkAdminPassword(env, password) { if (!password) return false; if (env.DB) { try { const row = await env.DB.prepare('SELECT password_hash FROM logistics_admin_settings WHERE id = 1').first(); if (row?.password_hash) return timingSafeTextEqual(await hashText(password), row.password_hash); } catch {} } return Boolean(env.LOGISTICS_ADMIN_PASSWORD && timingSafeTextEqual(password, env.LOGISTICS_ADMIN_PASSWORD)); }
async function authenticated(request, secret) { if (!secret) return false; const cookie = request.headers.get('Cookie') || ''; const match = cookie.match(/(?:^|;\s*)logistics_admin=([^;]+)/); if (!match) return false; const parts = match[1].split('.'); if (!parts[0] || !parts[1]) return false; try { const payload = new TextDecoder().decode(decodeBase64Url(parts[0])); return Number(payload) >= Date.now() && await sign(payload, secret) === parts[1]; } catch { return false; } }
function json(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } }); }
function bytesToBase64(bytes) { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }
function deriveShipmentFields(record) {
  const eventText = Array.isArray(record.events) ? record.events.map((event) => [event.title, event.description].filter(Boolean).join(' ')).join('\n') : '';
  const text = [record.rawText, record.notes, eventText].filter(Boolean).join('\n');
  const originMatch = text.match(/(?:Origin|\u8d77\u8fd0\u5730|\u59cb\u53d1\u5730|\u53d1\u8d27\u5730)\s*[:\uff1a]?\s*([^\r\n]*?)(?=\s*(?:Destination|\u76ee\u7684\u5730|\u5230\u8fbe\u5730|\u6536\u8d27\u5730|Packages?|Packing quantity|\u88c5\u7bb1\u6570\u91cf|\u7bb1\u6570|\u7a7a\u8fd0|\u6d77\u8fd0|\u5c3a\u5bf8|\u8ba1\u8d39\u91cd\u91cf|\d{4}-\d{2}-\d{2})|$)/i);
  const destinationMatch = text.match(/(?:Destination|\u76ee\u7684\u5730|\u5230\u8fbe\u5730|\u6536\u8d27\u5730)\s*[:\uff1a]?\s*([^\r\n]*?)(?=\s*(?:Origin|\u8d77\u8fd0\u5730|\u59cb\u53d1\u5730|\u53d1\u8d27\u5730|Packages?|Packing quantity|\u88c5\u7bb1\u6570\u91cf|\u7bb1\u6570|\u7a7a\u8fd0|\u6d77\u8fd0|\u5c3a\u5bf8|\u8ba1\u8d39\u91cd\u91cf|\d{4}-\d{2}-\d{2})|$)/i);
  const warehouseMatches = [];
  const warehousePattern = /(?:\u5230\u8fbe|\u62b5\u8fbe|\u9884\u8ba1\u5230|\u53d1\u5f80|\u8fd0\u5f80)\s*([A-Za-z\u4e00-\u9fff]+?\u4ed3\u5e93)/g;
  let warehouseMatch;
  while ((warehouseMatch = warehousePattern.exec(text))) if (!warehouseMatches.includes(warehouseMatch[1])) warehouseMatches.push(warehouseMatch[1]);
  const packageMatch = text.match(/(?:Packages?|Packing quantity|\u88c5\u7bb1\u6570\u91cf|\u7bb1\u6570)\s*[:\uff1a]?\s*(\d+)/i) || text.match(/\*\s*(\d+)\s*\u7bb1/) || text.match(/(?:^|\s)(\d+)\s*\u7bb1(?:\s|$)/m);
  return {
    ...record,
    origin: String(record.origin || '').trim() || String(originMatch?.[1] || warehouseMatches[0] || '').trim(),
    destination: String(record.destination || '').trim() || String(destinationMatch?.[1] || (warehouseMatches.length > 1 ? warehouseMatches[warehouseMatches.length - 1] : '')).trim(),
    packages: record.packages !== null && record.packages !== undefined && record.packages !== '' ? record.packages : (packageMatch ? Number(packageMatch[1]) : null),
  };
}
async function includeStoredMedia(env, productNo, record) {
  if (!env.DB) return record;
  if (Array.isArray(record.warehouseImages) && record.warehouseImages.length) return record;
  const media = await env.DB.prepare('SELECT id, created_at FROM logistics_media WHERE product_no = ?1 ORDER BY created_at').bind(productNo).all();
  let results = media.results || [];
  const suffix = productNo.match(/-(\d+)$/)?.[1];
  if (suffix) {
    const named = await env.DB.prepare('SELECT id, file_name, created_at FROM logistics_media WHERE product_no = ?1 ORDER BY created_at DESC').bind(productNo).all();
    const prefix = suffix.padStart(2, '0');
    const unique = new Map();
    for (const item of named.results || []) if (String(item.file_name || '').startsWith(prefix) && !unique.has(item.file_name)) unique.set(item.file_name, item);
    if (unique.size) results = Array.from(unique.values()).sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  }
  record.warehouseImages = [];
  for (const item of results) {
    const mediaUrl = '/api/media?id=' + encodeURIComponent(item.id);
    record.warehouseImages.push({ url: mediaUrl, caption: '', captionZh: '', date: item.created_at });
  }
  const latest = results.at(-1);
  if (latest?.created_at && !record.warehouseUpdated) record.warehouseUpdated = latest.created_at;
  return record;
}
async function getStoredRecord(env, productNo) { const row = await env.DB.prepare('SELECT data_json FROM logistics_records WHERE product_no = ?1').bind(productNo).first(); if (!row) return null; try { return deriveShipmentFields(await includeStoredMedia(env, productNo, JSON.parse(row.data_json))); } catch { throw new Error('Stored logistics data is invalid'); } }
async function api(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/logistics' && request.method === 'GET') {
    const productNo = url.searchParams.get('productNo')?.trim().toUpperCase();
    if (!productNo) return json({ error: 'productNo is required' }, 400);
    if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
    const record = await getStoredRecord(env, productNo);
    return record ? json(record) : json({ error: 'Logistics record not found' }, 404);
  }
  if (url.pathname === '/api/admin/login' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const secret = await getAdminSecret(env);
    if (!secret) return json({ error: 'Admin password has not been configured' }, 503);
    if (!await checkAdminPassword(env, body.password)) return json({ error: 'Invalid password' }, 401);
    const payload = String(Date.now() + 1000 * 60 * 60 * 8);
    const session = base64Url(encoder.encode(payload)) + '.' + await sign(payload, secret);
    return json({ ok: true }, 200, { 'Set-Cookie': 'logistics_admin=' + session + '; Path=/; Max-Age=28800; Secure; HttpOnly; SameSite=Strict' });
  }
  if (url.pathname === '/api/admin/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': 'logistics_admin=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict' });
  if (url.pathname === '/api/admin/password' && request.method === 'POST') {
    if (!await authenticated(request, await getAdminSecret(env))) return json({ error: 'Unauthorized' }, 401);
    if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!await checkAdminPassword(env, currentPassword)) return json({ error: 'Current password is incorrect' }, 401);
    if (newPassword.length < 8 || newPassword.length > 128 || newPassword.trim().length < 8) return json({ error: 'New password must contain 8 to 128 characters' }, 400);
    if (timingSafeTextEqual(currentPassword, newPassword)) return json({ error: 'New password must be different from the current password' }, 400);
    const passwordHash = await hashText(newPassword);
    await env.DB.prepare('INSERT INTO logistics_admin_settings (id, password_hash, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at').bind(passwordHash, new Date().toISOString()).run();
    return json({ ok: true }, 200, { 'Set-Cookie': 'logistics_admin=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict' });
  }
  if (url.pathname === '/api/admin/record' && request.method === 'GET') {
    if (!await authenticated(request, await getAdminSecret(env))) return json({ error: 'Unauthorized' }, 401);
    if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
    const productNo = url.searchParams.get('productNo')?.trim().toUpperCase();
    const version = Number(url.searchParams.get('version') || 0);
    if (!productNo) return json({ error: 'productNo is required' }, 400);
    let row;
    if (version > 0) row = await env.DB.prepare('SELECT data_json, version_no, created_at FROM logistics_record_versions WHERE product_no = ?1 AND version_no = ?2').bind(productNo, version).first();
    else row = await env.DB.prepare('SELECT data_json FROM logistics_records WHERE product_no = ?1').bind(productNo).first();
    if (!row) return json({ error: 'Logistics record not found' }, 404);
    const history = await env.DB.prepare('SELECT version_no, created_at FROM logistics_record_versions WHERE product_no = ?1 ORDER BY version_no DESC LIMIT 100').bind(productNo).all();
    const current = await env.DB.prepare('SELECT MAX(version_no) AS version_no FROM logistics_record_versions WHERE product_no = ?1').bind(productNo).first();
    try { const record = deriveShipmentFields(version > 0 ? JSON.parse(row.data_json) : await includeStoredMedia(env, productNo, JSON.parse(row.data_json))); return json({ record, currentVersion: Number(current?.version_no || 0), history: (history.results || []).map((item) => ({ versionNo: Number(item.version_no), createdAt: item.created_at })) }); } catch { return json({ error: 'Stored logistics data is invalid' }, 500); }
  }
  if (url.pathname === '/api/admin/record' && request.method === 'POST') {
    if (!await authenticated(request, await getAdminSecret(env))) return json({ error: 'Unauthorized' }, 401);
    if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
    let record = await request.json().catch(() => null);
    if (!record || !record.productNo || !record.productName) return json({ error: 'productNo and productName are required' }, 400);
    record.productNo = String(record.productNo).trim().toUpperCase();
    record.lastUpdated = record.lastUpdated || new Date().toISOString();
    record = deriveShipmentFields(record);
    const createdAt = new Date().toISOString();
    const existing = await env.DB.prepare('SELECT data_json, updated_at FROM logistics_records WHERE product_no = ?1').bind(record.productNo).first();
    if (existing && record.customFields?.inputFormat === 'plain_text' && (!Array.isArray(record.warehouseImages) || !record.warehouseImages.length)) {
      try { record.warehouseImages = JSON.parse(existing.data_json).warehouseImages || []; } catch { record.warehouseImages = []; }
    }
    const recordJson = JSON.stringify(record);
    if (encoder.encode(recordJson).byteLength > 1900000) return json({ error: 'This logistics record is too large; keep it below 1.9MB' }, 413);
    const current = await env.DB.prepare('SELECT MAX(version_no) AS version_no FROM logistics_record_versions WHERE product_no = ?1').bind(record.productNo).first();
    let versionNo = Number(current?.version_no || 0) + 1;
    const statements = [];
    if (existing && !Number(current?.version_no || 0)) {
      statements.push(env.DB.prepare('INSERT INTO logistics_record_versions (id, product_no, version_no, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(crypto.randomUUID(), record.productNo, 1, existing.data_json, existing.updated_at || createdAt));
      versionNo = 2;
    }
    statements.push(env.DB.prepare('INSERT INTO logistics_record_versions (id, product_no, version_no, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(crypto.randomUUID(), record.productNo, versionNo, recordJson, createdAt));
    statements.push(env.DB.prepare('INSERT INTO logistics_records (product_no, data_json, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(product_no) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at').bind(record.productNo, recordJson, record.lastUpdated));
    await env.DB.batch(statements);
    return json({ ok: true, productNo: record.productNo, versionNo, lastUpdated: record.lastUpdated });
  }
  if (url.pathname === '/api/admin/upload' && request.method === 'POST') {
    if (!await authenticated(request, await getAdminSecret(env))) return json({ error: 'Unauthorized' }, 401);
    try {
      const form = await request.formData();
      const productNo = String(form.get('productNo') || '').trim().toUpperCase();
      const values = typeof form.getAll === 'function' ? form.getAll('file') : [form.get('file')];
      const files = values.filter((file) => file && typeof file.arrayBuffer === 'function' && typeof file.type === 'string');
      if (!productNo || !files.length) return json({ error: 'productNo and at least one file are required' }, 400);
      if (files.length > 20) return json({ error: 'Upload at most 20 images per batch' }, 400);
      if (files.some((file) => !file.type.startsWith('image/'))) return json({ error: 'Only image files are allowed' }, 400);
      if (files.some((file) => file.size > 10 * 1024 * 1024)) return json({ error: 'Each image must be smaller than 10MB' }, 400);
      const urls = [];
      const attachUrls = async () => {
        const row = await env.DB.prepare('SELECT data_json FROM logistics_records WHERE product_no = ?1').bind(productNo).first();
        if (!row) return { attached: false };
        const record = JSON.parse(row.data_json);
        if (!Array.isArray(record.warehouseImages)) record.warehouseImages = [];
        const createdAt = new Date().toISOString();
        for (const mediaUrl of urls) if (!record.warehouseImages.some((image) => image?.url === mediaUrl)) record.warehouseImages.push({ url: mediaUrl, caption: '', captionZh: '', date: createdAt });
        record.warehouseUpdated = createdAt;
        const recordJson = JSON.stringify(record);
        const current = await env.DB.prepare('SELECT MAX(version_no) AS version_no FROM logistics_record_versions WHERE product_no = ?1').bind(productNo).first();
        const versionNo = Number(current?.version_no || 0) + 1;
        await env.DB.batch([
          env.DB.prepare('INSERT INTO logistics_record_versions (id, product_no, version_no, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(crypto.randomUUID(), productNo, versionNo, recordJson, createdAt),
          env.DB.prepare('UPDATE logistics_records SET data_json = ?1, updated_at = ?2 WHERE product_no = ?3').bind(recordJson, record.lastUpdated || createdAt, productNo),
        ]);
        return { attached: true, versionNo };
      };
      if (!env.MEDIA) {
        if (!env.DB) return json({ error: 'Database binding is not configured' }, 503);
        if (files.some((file) => file.size > 1.5 * 1024 * 1024)) return json({ error: 'Each image must be smaller than 1.5MB when R2 is not enabled' }, 400);
        for (const file of files) { const id = crypto.randomUUID(); const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer())); await env.DB.prepare('INSERT INTO logistics_media (id, product_no, file_name, content_type, image_data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(id, productNo, file.name || 'warehouse-image', file.type, base64, new Date().toISOString()).run(); urls.push('/api/media?id=' + encodeURIComponent(id)); }
        return json({ ok: true, storage: 'database', urls, url: urls[0], ...await attachUrls() });
      }
      for (const file of files) { const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'; const key = 'warehouse/' + productNo + '/' + crypto.randomUUID() + '.' + ext; await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } }); urls.push('/api/media?key=' + encodeURIComponent(key)); }
      return json({ ok: true, storage: 'r2', urls, url: urls[0], ...await attachUrls() });
    } catch (error) { return json({ error: 'Image upload failed', detail: String(error?.message || error) }, 500); }
  }
  if (url.pathname === '/api/media' && request.method === 'GET') {
    const id = url.searchParams.get('id');
    if (id && env.DB && /^[a-f0-9-]{36}$/i.test(id)) { const row = await env.DB.prepare('SELECT content_type, image_data FROM logistics_media WHERE id = ?1').bind(id).first(); if (!row) return new Response('Not found', { status: 404 }); const binary = atob(row.image_data); const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0)); return new Response(bytes, { headers: { 'Content-Type': row.content_type, 'Cache-Control': 'public, max-age=31536000, immutable' } }); }
    if (!env.MEDIA) return new Response('Media binding is not configured', { status: 503 });
    const key = url.searchParams.get('key'); if (!key || !/^warehouse\/[A-Z0-9_-]+\/[a-z0-9-]+\.[a-z0-9]+$/i.test(key)) return new Response('Not found', { status: 404 }); const object = await env.MEDIA.get(key); if (!object) return new Response('Not found', { status: 404 }); const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('Cache-Control', 'public, max-age=31536000, immutable'); return new Response(object.body, { headers });
  }
  return null;
}

export default { async fetch(request, env) { const path = new URL(request.url).pathname; if (request.method === 'GET' && path === '/catalog/logistics.html') return new Response(trackingPage, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); if (request.method === 'GET' && path === '/admin/logistics.html') return new Response(adminPage, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); const result = await api(request, env); if (result) return result; if ((path === '/' || path === '/index.html') && request.method === 'GET') { const asset = await env.ASSETS.fetch(request); if (asset.ok) { const html = await asset.text(); const updated = html.includes('catalog/logistics.html') ? html : html.replace('<li><a href="#contact"', '<li><a href="catalog/logistics.html">Logistics</a></li><li><a href="#contact"'); return new Response(updated, { status: asset.status, headers: asset.headers }); } } return env.ASSETS.fetch(request); } };
