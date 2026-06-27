/* ck-custom.js — 用户自定义层(localStorage), 叠在默认数据 CK_DATA 之上
 * 设计: 自定义与默认彻底分离, 只记"差异"(屏蔽/编辑/新增), 用「词条名」当稳定锚。
 *   → 默认数据(data.js)更新时整份替换, 这一层纹丝不动, 加载时按名字自动合并。
 *   → 屏蔽/编辑因此在更新后自动对回去, 无需任何同步逻辑。
 * 操作: 屏蔽(可恢复) / 编辑(覆盖, 可恢复默认) / 添加。无硬删除。
 * 维度页 + 抽卡页(以及将来牌库)都用它拿"合并后的数据"。
 */
(function(){
  var KEY='ck_custom_v1';
  var TYPES=['motifs','identities','variables','coords'];
  function blank(){ return {blocked:{}, edits:{}, added:[]}; }

  function load(){
    var c=null;
    try{ c=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ c=null; }
    if(!c){
      c={};
      TYPES.forEach(function(t){ c[t]=blank(); });
      // 迁移旧的维度屏蔽键 ck_dim_blocked ({ "motifs::名":1 })
      try{
        var old=JSON.parse(localStorage.getItem('ck_dim_blocked')||'{}');
        for(var k in old){ var p=k.split('::'); if(c[p[0]]) c[p[0]].blocked[p.slice(1).join('::')]=1; }
      }catch(e){}
    }
    // 补全结构
    TYPES.forEach(function(t){
      if(!c[t]) c[t]=blank();
      if(!c[t].blocked) c[t].blocked={};
      if(!c[t].edits) c[t].edits={};
      if(!c[t].added) c[t].added=[];
    });
    return c;
  }

  var C=load();
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(C)); }catch(e){} }
  function base(type){ return (window.CK_DATA && window.CK_DATA[type]) || []; }

  // ---- 时空坐标(coords)专用: 牌库(全形 .name/.atmos[]/.tone=中文) 与 抽卡(紧凑 .n/.a/.t=daily) 形状不同 ----
  function tCompact(t){ return ({'日常':'daily','混合':'mixed','冲突':'conflict','NSFW':'mixed'})[t]||t; }
  function mapAtmos(a){ return Array.isArray(a)?a.join('、'):(a||''); }
  function slimCoord(e){ return {name:e.name,en:e.en||'',region:e.region,country:e.country||'',era:e.era,year:e.year,period:e.period||'',tone:e.tone,nsfw:!!e.nsfw,themes:(e.themes||[]).slice(),atmos:Array.isArray(e.atmos)?e.atmos.slice():(e.atmos||[]),sensory:e.sensory||'',note:e.note||''}; }
  var coordBaseline={};   // 牌库 hydrate 时记下的"纯净默认"(按 name), 供 diff 出编辑

  // 抽卡用: 默认 CK_DATA.coords + 坐标自定义(映射成紧凑形), 应用编辑/标屏蔽
  function coordsCompact(){
    var b=(window.CK_DATA&&window.CK_DATA.coords)||[];
    var cc=C.coords, bl=cc.blocked, ed=cc.edits;
    var merged=b.map(function(c){
      var e=ed[c.n], o=c;
      if(e){ o={n:c.n,r:c.r,p:(e.period!=null?e.period:c.p),t:(e.tone!=null?tCompact(e.tone):c.t),nsfw:(e.nsfw!=null?!!e.nsfw:c.nsfw),a:(e.atmos!=null?mapAtmos(e.atmos):c.a),s:(e.sensory!=null?e.sensory:c.s),b:(e.note!=null?e.note:c.b),en:(e.en!=null?e.en:c.en),country:c.country,era:c.era,themes:c.themes}; }
      return Object.assign({},o,{_base:true,_edited:!!e,_blocked:!!bl[c.n]});
    });
    var added=cc.added.map(function(x){
      return {n:x.name,r:x.region,p:x.period||'',t:tCompact(x.tone),nsfw:!!x.nsfw,a:mapAtmos(x.atmos),s:x.sensory||'',b:x.note||'',en:x.en||'',country:x.country||'',era:x.era||'',themes:x.themes||[],_custom:true,_blocked:!!bl[x.name]};
    });
    return merged.concat(added);
  }

  var API={
    raw:function(){ return C; },

    // 合并全集(默认套用编辑 + 自定义新增); 含被屏蔽项(各自带 _blocked 标记), 给维度/牌库列表用
    all:function(type){
      if(type==='coords') return coordsCompact();
      var ed=C[type].edits, bl=C[type].blocked;
      var merged=base(type).map(function(e){
        var o = ed[e.n] ? Object.assign({}, e, ed[e.n], {n:e.n}) : e;  // 名字是锚, 不被编辑覆盖
        return Object.assign({}, o, {_base:true, _edited:!!ed[e.n], _blocked:!!bl[e.n]});
      });
      var added=C[type].added.map(function(e){
        return Object.assign({}, e, {_custom:true, _blocked:!!bl[e.n]});
      });
      return merged.concat(added);
    },

    // 抽卡用: 合并全集去掉被屏蔽的
    pool:function(type){
      if(type==='coords') return coordsCompact().filter(function(e){ return !e._blocked; });
      var bl=C[type].blocked;
      return API.all(type).filter(function(e){ return !bl[e.n]; });
    },

    // ---- 牌库(CD app)用: 全形 ----
    // hydrate: 把坐标自定义套到牌库基础条目, 返回 {data(套编辑), added(带id), blocked(id数组)}
    // hydrate(牌库原生模型: data=基础不变, overrides{id:条目}=基础编辑, added=新增, blocked=id数组)
    coordsForCodex:function(baseEntries){
      var cc=C.coords;
      var added=cc.added.map(function(e){ var o=Object.assign({}, e); if(!o.id) o.id='user-'+Math.random().toString(36).slice(2,9); return o; });
      var n2i={}, byName={};
      baseEntries.forEach(function(e){ n2i[e.name]=e.id; byName[e.name]=e; });
      added.forEach(function(e){ n2i[e.name]=e.id; });
      var overrides={};
      Object.keys(cc.edits).forEach(function(name){ var b=byName[name]; if(b) overrides[b.id]=Object.assign({}, b, cc.edits[name], {id:b.id, name:name}); });
      var blocked=Object.keys(cc.blocked).map(function(n){ return n2i[n]; }).filter(Boolean);
      return {data:baseEntries, added:added, blocked:blocked, overrides:overrides};
    },
    // persist: 从牌库 state({data,added,blocked:id[],overrides:{id:条目}}) 反算成"按名字"存回
    persistCoordsFromState:function(s){
      var allNow=(s.data||[]).concat(s.added||[]);
      var id2name={}; allNow.forEach(function(e){ id2name[e.id]=e.name; });
      var blockedNames=(s.blocked||[]).map(function(id){ return id2name[id]; }).filter(Boolean);
      var edits={}, ov=s.overrides||{};
      Object.keys(ov).forEach(function(id){ var name=id2name[id]||ov[id].name; if(name) edits[name]=slimCoord(ov[id]); });
      C.coords.added=(s.added||[]).map(function(e){ var o=slimCoord(e); o.id=e.id; return o; });
      C.coords.blocked={}; blockedNames.forEach(function(n){ C.coords.blocked[n]=1; });
      C.coords.edits=edits;
      save();
    },

    isBlocked:function(type,n){ return !!C[type].blocked[n]; },
    toggleBlock:function(type,n){
      if(C[type].blocked[n]) delete C[type].blocked[n]; else C[type].blocked[n]=1;
      save();
    },

    isCustom:function(type,n){ return C[type].added.some(function(e){return e.n===n;}); },
    isEdited:function(type,n){ return !!C[type].edits[n]; },

    // 添加自定义词条(obj 含 n/d/.. + nsfw)
    addEntry:function(type,obj){
      if(!obj || !obj.n) return false;
      // 名字撞了默认或已有自定义 → 不重复添加(改用编辑)
      var exists = base(type).some(function(e){return e.n===obj.n;}) || API.isCustom(type,obj.n);
      if(exists) return false;
      C[type].added.push(obj); save(); return true;
    },

    // 编辑: 默认词条→存覆盖(edits); 自定义词条→就地改
    editEntry:function(type,name,fields){
      var cust=C[type].added.find(function(e){return e.n===name;});
      if(cust){ Object.assign(cust, fields); }
      else { C[type].edits[name]=Object.assign({}, C[type].edits[name], fields); }
      save();
    },

    // 恢复默认(撤销对某默认词条的编辑)
    resetEdit:function(type,name){ delete C[type].edits[name]; save(); }
  };

  window.CKCustom=API;

  // ---- 把某页(默认维度页)镶进当前界面的浮层(iframe), 不跳转/不新开标签 ----
  window.CKOpenDim=function(src){
    src=src||'维度.html';
    var o=document.getElementById('__ckdim');
    if(!o){
      o=document.createElement('div'); o.id='__ckdim';
      o.style.cssText='position:fixed;inset:0;background:rgba(52,46,62,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
      var box=document.createElement('div');
      box.style.cssText='position:relative;width:680px;max-width:100%;height:90vh;max-height:920px;border-radius:2px;overflow:hidden;box-shadow:0 30px 80px rgba(58,46,70,.5)';
      box.innerHTML='<div class="__x" style="position:absolute;right:12px;top:10px;z-index:3;width:28px;height:28px;line-height:26px;text-align:center;border-radius:50%;cursor:pointer;color:#5d5274;font:600 16px sans-serif;background:rgba(247,244,249,.88);box-shadow:0 1px 5px rgba(58,46,70,.25)">✕</div><iframe style="width:100%;height:100%;border:0;display:block" src="'+src+'"></iframe>';
      o.appendChild(box);
      o.addEventListener('click',function(e){ if(e.target===o) window.CKCloseDim(); });
      box.querySelector('.__x').addEventListener('click',window.CKCloseDim);
      document.body.appendChild(o);
    } else { o.querySelector('iframe').src=src; o.style.display='flex'; }
  };
  window.CKCloseDim=function(){ var o=document.getElementById('__ckdim'); if(o) o.style.display='none'; };
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&window.CKCloseDim) window.CKCloseDim(); });
  // 委托: 拦截任何指向"维度.html"的链接(牌库的「維度」), 改为弹层嵌入, 不跳转。
  // (CD app 会剥掉注入元素上的 onclick, 所以用 document 级委托·捕获阶段拦在导航之前)
  document.addEventListener('click', function(e){
    var t=e.target, a=t&&t.closest?t.closest('a'):null;
    if(a && /维度\.html/.test(a.getAttribute('href')||'') && window.top===window.self){
      e.preventDefault(); e.stopPropagation(); window.CKOpenDim('维度.html');
    }
  }, true);
})();
