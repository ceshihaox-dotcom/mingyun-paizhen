// 命运牌阵落地包 · 本地无缓存预览服务(治 file:// 死缓存)
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=__dirname;
const PORT=8788;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/') p='/index.html';
  const f=path.join(ROOT, p);
  if(!f.startsWith(ROOT)){ res.writeHead(403); res.end('no'); return; }
  fs.readFile(f,(e,data)=>{
    if(e){ res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}); res.end('404 ' + p); return; }
    res.writeHead(200,{
      'Content-Type': MIME[path.extname(f).toLowerCase()]||'application/octet-stream',
      'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma':'no-cache','Expires':'0'
    });
    res.end(data);
  });
}).listen(PORT,()=>console.log('命运牌阵 预览(无缓存): http://localhost:'+PORT+'/'));
