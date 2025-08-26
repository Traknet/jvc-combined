// ==UserScript==
// @name         JVC DM WALKER STABLE (v2.23)
// @namespace    https://tampermonkey.net/
// @version      2.23
// @description  Last page via max-number → true random user → 96h cooldown → MP all_dest. Compose-first, compact EN UI, forum scope (18-25 & Finance, 85/15), cooldown-left logs, human-like scroll/hover. Forum lists forced to page 1. URLs in message are pasted (not typed). UI mounting robust & private storage.
// @match        *://*.jeuxvideo.com/*
// @run-at       document-end
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.addValueChangeListener
// ==/UserScript==
(async function () {
  'use strict';

  /* ====== stockage persistant et privé ====== */
  const get = async (k, d) => {
    try { return await GM.getValue(k, d); }
    catch (err) { console.error('GM.getValue:', err); return d; }
  };
  const set = async (k, v) => {
    try { await GM.setValue(k, v); }
    catch (err) { console.error('GM.setValue:', err); }
  };

  /* ---------- utils ---------- */
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const human=()=>sleep(Math.round(rnd(49,105)));
  const dwell=(a=350,b=950)=>sleep(Math.round(rnd(a,b)));
    async function randomScrollWait(min,max){
    if (min >= max) [min, max] = [max, min];
    min = Math.max(min, 0);
    const end = NOW() + Math.round(rnd(min,max));
    while(NOW() < end){
      if(Math.random()<0.3){
        try{ window.scrollBy({top:rnd(-120,120),behavior:'smooth'}); }
        catch(e){ console.error('[randomScrollWait]', e); }
      }
      await dwell(400,1200);
    }
  }
  async function randomScrollWait(min,max){
  if (min >= max) [min, max] = [max, min];
    min = Math.max(min, 0);
    const end = NOW() + Math.round(rnd(min,max));
    while(NOW() < end){
      if(Math.random()<0.3){
        try{ window.scrollBy({top:rnd(-120,120),behavior:'smooth'}); }
        catch(e){ console.error('[randomScrollWait]', e); }
      }
      await dwell(400,1200);
    }
  }
 /**
  * Attend une durée aléatoire entre `min` et `max` en simulant des scrolls.
  * Si `min >= max`, les valeurs sont permutées pour garantir un intervalle valide.
  * Le paramètre `min` est borné à `0` pour éviter les valeurs négatives.
  */
 async function randomScrollWait(min,max){
    if (min >= max) [min, max] = [max, min];
    min = Math.max(min, 0);
    const end = NOW() + Math.round(rnd(min,max));
    while(NOW() < end){
      if(Math.random()<0.3){
        try{ window.scrollBy({top:rnd(-120,120),behavior:'smooth'}); }
        catch(e){ console.error('[randomScrollWait]', e); }
      }
      await dwell(400,1200);
    }
  }
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const NOW=()=>Date.now(), HRS=h=>h*3600e3;
  const ORIG=typeof location !== 'undefined' ? location.origin : '';

let chronoEl=null, statusEl=null, logEl=null, dmCountEl=null;

  const logBuffer=[]; let logIdx=0; const log=(s)=>{
    logBuffer[logIdx++ % 200] = s;
    if(!logEl) logEl=q('#jvc-dmwalker-log');
    if(logEl){
    const idx=logIdx%200;
    const ordered=logBuffer.slice(idx).concat(logBuffer.slice(0,idx));
    logEl.textContent=ordered.filter(Boolean).join('\n');
    logEl.scrollTop=logEl.scrollHeight;
    }
  };

  // keep track of the UI MutationObserver so it can be cleaned up
  let uiMutationObserver = null;
  let uiRemountTimeout = null;
  if (typeof window !== 'undefined') {
    window.toggleKeyHandler = window.toggleKeyHandler || null;
      function cleanupUI(){
        if(uiMutationObserver){
          uiMutationObserver.disconnect();
          uiMutationObserver = null;
        }
        if(window.toggleKeyHandler){
          const toggleKeyHandler = window.toggleKeyHandler;
          document.removeEventListener('keydown', toggleKeyHandler);
          window.toggleKeyHandler = null;
        }
        if (uiRemountTimeout) {
          clearTimeout(uiRemountTimeout);
          uiRemountTimeout = null;
        }
        if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
        q('#jvc-dmwalker')?.remove();
        q('#jvc-dmwalker-badge')?.remove();
        chronoEl=null;
        statusEl=null;
        logEl=null;
        dmCountEl=null;

    }
    window.addEventListener('unload', cleanupUI);
  }

  function setVal(el,v){
    if(!el) return;
    const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
    d?.set ? d.set.call(el,v) : (el.value=v);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  async function typeHuman(el, txt){
    if(!el) return;
    el.scrollIntoView?.({block:'center'});
    el.focus?.();
    for(const ch of txt){
            if(Math.random() < 0.05){
        const prevErr=(el.value??el.textContent??'');
        const wrongCh=String.fromCharCode(97+Math.floor(Math.random()*26));
        if(el.isContentEditable){ el.textContent = prevErr + wrongCh; }
        else setVal(el, prevErr + wrongCh);
        el.dispatchEvent(new KeyboardEvent('keydown',{key:wrongCh,bubbles:true}));
        el.dispatchEvent(new KeyboardEvent('keypress',{key:wrongCh,bubbles:true}));
        el.dispatchEvent(new KeyboardEvent('keyup',{key:wrongCh,bubbles:true}));
        await human();
        const corrected=(el.value??el.textContent??'').slice(0,-1);
        if(el.isContentEditable){ el.textContent = corrected; }
        else setVal(el, corrected);
        el.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true}));
        el.dispatchEvent(new KeyboardEvent('keyup',{key:'Backspace',bubbles:true}));
        await human();
      }
      const prev=(el.value??el.textContent??'');
      if(el.isContentEditable){ el.textContent = prev + ch; }
      else setVal(el, prev + ch);
      el.dispatchEvent(new KeyboardEvent('keydown',{key:ch,bubbles:true}));
      el.dispatchEvent(new KeyboardEvent('keypress',{key:ch,bubbles:true}));
      el.dispatchEvent(new KeyboardEvent('keyup',{key:ch,bubbles:true}));
      await human();
      if(Math.random()<0.03){
        try{ window.scrollBy({top:rnd(-60,60),behavior:'smooth'}); }
        catch(e){ console.error('[typeHuman scroll]', e); }
        await human();
      }
    }
    await human();
  }

  // “Paste URLs, type everything else” for message field
  const URL_RX_GLOBAL = /(https?:\/\/\S+)/gi;
  const URL_RX_STRICT = /^https?:\/\/\S+$/i;
  function getValue(el){ return el?.isContentEditable ? (el.textContent||'') : (el.value||''); }
  function setValue(el,v){ if(el.isContentEditable){ el.textContent=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); } else setVal(el,v); }
  async function appendQuick(el, s){ const prev=getValue(el); setValue(el, prev + s); await sleep(20); }
  async function typeMixed(el, text){
    if(!el) return;
    URL_RX_GLOBAL.lastIndex = 0;
    const parts = text.split(URL_RX_GLOBAL);
    for(const part of parts){
      if(!part) continue;
      if (URL_RX_STRICT.test(part)){
        await appendQuick(el, part);
      } else {
        await typeHuman(el, part);
      }
    }
  }

  /* ---------- human-like pre-click ---------- */
  async function humanHover(el){
    if(!el) return;
    try{
      let rect=el.getBoundingClientRect?.();
      if(!rect) return;
      const targetY = window.scrollY + rect.top - window.innerHeight/2 + rnd(-80,80);
      const behavior = Math.random()<0.5 ? 'smooth' : 'instant';
      try{ window.scrollTo({top: Math.max(0,targetY), behavior}); }
      catch(e){ console.error('[humanHover] initial scrollTo', e); window.scrollTo(0, Math.max(0,targetY)); }
      await sleep(200+Math.random()*300);
      if(Math.random()<0.3){
        const dir = targetY > window.scrollY ? 1 : -1;
        const overshoot = rnd(30,120);
        const overY = Math.max(0, targetY + dir*overshoot);
        try{ window.scrollTo({top:overY, behavior}); }
        catch(e){ console.error('[humanHover] overshoot scrollTo', e); window.scrollTo(0,overY); }
        await sleep(120+Math.random()*180);
        try{ window.scrollTo({top: Math.max(0,targetY), behavior}); }
        catch(e){ console.error('[humanHover] return scrollTo', e); window.scrollTo(0, Math.max(0,targetY)); }
        await sleep(120+Math.random()*180);
      }
      const wheelCount = Math.floor(rnd(1,4));
      for(let i=0;i<wheelCount;i++){
        const delta = (Math.random()<0.5?-1:1)*rnd(20,80);
        el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:delta}));
        await sleep(60+Math.random()*120);
      }
      try{ window.scrollTo({top: Math.max(0,targetY), behavior}); }
      catch(e){ console.error('[humanHover] final scrollTo', e); window.scrollTo(0, Math.max(0,targetY)); }
      await sleep(120+Math.random()*180);
      rect=el.getBoundingClientRect?.();
      if(!rect) return;
      const cx = rect.left + rect.width/2;
      const cy = rect.top + rect.height/2;
      for(let i=0;i<2+Math.floor(Math.random()*3);i++){
        el.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:cx+rnd(-15,15),clientY:cy+rnd(-8,8)}));
        await sleep(40+Math.random()*90);
      }
      el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:cx,clientY:cy}));
    }catch(e){ console.error('[humanHover]', e); }
    await dwell(120,260);
  }

  /* ---------- detectors ---------- */
  const isCompose  = ()=> /\/messages-prives\/nouveau\.php/i.test(location.pathname+location.search);
  const isMpThread = ()=> /\/messages-prives\/message\.php/i.test(location.pathname);
  function isTopicPage(){
    if(!/\/forums\//i.test(location.pathname)) return false;
    if(qa('.bloc-message-forum').length>0) return true;
    return !!q('#forum-main-col .conteneur-message .bloc-header');
  }
  function isForumList(){
    if(!/\/forums\//i.test(location.pathname)) return false;
    if(isTopicPage()) return false;
    return true;
  }

  /* ---------- state ---------- */
  const STORE_CONF='jvc_mpwalker_conf';
  let confCache = null;
  async function loadConf(force=false){
    if(force || confCache===null){ confCache = await get(STORE_CONF,{}); }
    return confCache;
  }
  async function saveConf(conf){
    await set(STORE_CONF,conf);
    confCache = conf;
  }
  const STORE_SENT='jvc_mpwalker_sent';
  const STORE_ON='jvc_mpwalker_on';
  const STORE_LAST_LIST='jvc_mpwalker_last_list';
  const STORE_NAV_GUARD='jvc_mpwalker_nav_guard';
  const STORE_SESSION='jvc_mpwalker_session';
  const STORE_TARGET_FORUM='jvc_mpwalker_target_forum';

  let onCache = false;
let sessionCache = {active:false,startTs:0,stopTs:0,mpCount:0,mpNextDelay:Math.floor(rnd(2,5)),dmSent:0,pendingDm:false};
let sessionCacheLoaded = false;
  if(typeof GM !== 'undefined' && GM.addValueChangeListener){
    GM.addValueChangeListener(STORE_CONF, async () => {
      try { await loadConf(true); }
      catch (e) { console.error('loadConf failed', e); }
    });
    GM.addValueChangeListener(STORE_ON, (_, __, v)=>{ onCache = v; updateSessionUI().catch(console.error); });
    GM.addValueChangeListener(STORE_SESSION, (_, __, v)=>{ sessionCache = v; sessionCacheLoaded = true; updateSessionUI().catch(console.error); });
    await loadConf(true);
  }
  onCache = await get(STORE_ON,false);

  const DEFAULTS = { me:'', cooldownH:96, activeHours:[8,23] };
  // Source: hard blacklist provided by the DM Walker community
  // Last updated: 2025-08-22
  const HARD_BL = new Set([
    '-cloud-',
    '[[xou]]',
    '[flolem]',
    '[france77]',
    '[hush]2',
    '[sadik]',
    '[sf]',
    'a-la-peche',
    'adgjl',
    'adiom',
    'aisatsana[102]',
    'alighieri_dante',
    'allicroco',
    'alvin_stick',
    'angry_skinny',
    'antistar',
    'asap_sven',
    'blaze',
    'bonbonnedegaz',
    'cartographe',
    'celuiquiestfor',
    'chiasse-supreme',
    'chimene_azalee',
    'chrysolithe',
    'claudou28',
    'clem-du-30',
    'corochi',
    'cthulhus',
    'cyberhakim',
    'dakota-47',
    'dantedmc1',
    'darcaus',
    'daveuss',
    'dieu_me_garde',
    'diz25',
    'dnob700',
    'dr_goomba',
    'drdee',
    'duke3d',
    'dunkan',
    'eiki16',
    'elabosak',
    'elsa',
    'endorph[-ine]',
    'enis-karra',
    'evilash08',
    'fatalkill',
    'faunolefaune',
    'foun59',
    'foundernoob',
    'gabiven',
    'gamos',
    'georodin',
    'gnap_gnap',
    'godrik',
    'google_bot',
    'grayhena',
    'gsr-x-perez',
    'guido_',
    'gus',
    'hernandieu',
    'hildegarn',
    'hisokaa',
    'hoshikaze',
    'hypobowling',
    'ipaname',
    'jigako',
    'jipoupierre',
    'jiti-way',
    'jomak',
    'jordan_peterson',
    'josc59',
    'kaaido',
    'kai-kod',
    'kamisamabob',
    'kimbo',
    'kingofaesthetic',
    'kisuke4',
    'kogba',
    'krayzel',
    'ktmzaer',
    'kyo_soma',
    'l_g',
    'lan78',
    'lapintade',
    'lasnlleretour',
    'latios[jv]',
    'lauchhammer',
    'leirok',
    'lgv',
    'linkpa',
    'lion-heart38',
    'ludens',
    'mac-artist',
    'mandoulis',
    'mangas-act',
    'mano',
    'mario86',
    'matt44200',
    'mazda',
    'mehdiguadi',
    'mistho',
    'monsieurdebat',
    'mrfantastic',
    'mugowar',
    'myssmelmel',
    'n-kingen',
    'nalix',
    'nargulu',
    'naughtygod',
    'neofungamer',
    'nombre',
    'odellbeckham',
    'oo-fox-oo',
    'papipigeon',
    'patou260567',
    'paulop',
    'penta_pingouin',
    'pilou_cs',
    'pommephone',
    'protestant',
    'psnoffline',
    'puissancier',
    'rams',
    'raziel_2007',
    'remysangfamy',
    'resolution',
    'retr0pl4yer',
    'rewi98',
    'rika',
    'ruquierchasseur',
    's4viem',
    'saiyar',
    'sangowski',
    'senkai',
    'shinruto93',
    'shiptari',
    'smlennox',
    'smoking_lady',
    'stinger[jv]',
    'talib',
    'tardyl1973',
    'teetest',
    'thanhatos',
    'therealmarco',
    'thymotep',
    'tommy_killer',
    'tomy-fett',
    'tonycannes',
    'truepatriot',
    'uossitreza',
    'vortex646',
    'vykt0r41',
    'wolkade2',
    'xofeye78',
    'y3ti',
    'yamachan',
    'yoda_software',
    'zavvi',
    'zelprod',
    'Superpanda',
  ]);

  const TITLE_BL = [/mod[ée]ration/i, /r[èe]gles/i];

  /* ---------- forums + weighted choice ---------- */
  const FORUMS = {
    '51':      { name:'18-25',               list:'https://www.jeuxvideo.com/forums/0-51-0-1-0-1-0-blabla-18-25-ans.htm' },
    '36':      { name:'Guerre des consoles', list:'https://www.jeuxvideo.com/forums/0-36-0-1-0-1-0-guerre-des-consoles.htm' },
    '20':      { name:'Football',            list:'https://www.jeuxvideo.com/forums/0-20-0-1-0-1-0-football.htm' },
    '3011927': { name:'Finance',             list:'https://www.jeuxvideo.com/forums/0-3011927-0-1-0-1-0-finance.htm' }
  };
  const ALLOWED_FORUMS = new Set(Object.keys(FORUMS));
  const FORUM_WEIGHTS = [
    { fid:'51', weight:0.80 },
    { fid:'36', weight:0.10 },
    { fid:'20', weight:0.05 },
    { fid:'3011927', weight:0.05 }
  ];
  function pickForumIdWeighted(){
    const r = Math.random();
    let cum = 0;
    for(const {fid, weight} of FORUM_WEIGHTS){
      cum += weight;
      if(r < cum) return fid;
    }
    return FORUM_WEIGHTS[0].fid;
  }
  function pickListWeighted(){ const fid=pickForumIdWeighted(); return FORUMS[fid].list; }

  async function setTargetForum(fid){ await set(STORE_TARGET_FORUM, {fid, ts:NOW()}); }
  async function getTargetForum(){ const o=await get(STORE_TARGET_FORUM,null); if(!o) return null; if(NOW()-o.ts>10*60*1000){ await set(STORE_TARGET_FORUM,null); return null; } return o.fid||null; }
  async function clearTargetForum(){ await set(STORE_TARGET_FORUM,null); }

/* ---------- sent memory ---------- */
  const hashPseudo = async (pseudo) => {
    const data = new TextEncoder().encode(pseudo.toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };
  const sentMap = async (cooldownH) => {
    const m = await get(STORE_SENT, {});
    const now = NOW();
    const clean = {};
    let changed = false;
    for (const [key, t] of Object.entries(m)) {
      const h = key.length === 64 ? key : await hashPseudo(key);
      if (now - t < HRS(cooldownH)) {
        clean[h] = t;
      } else {
        changed = true;
      }
     if (h !== key) changed = true;

    }
    if (changed || Object.keys(clean).length !== Object.keys(m).length) {
      await set(STORE_SENT, clean);
    }
    return clean;
  };

  function myPseudo(){
  const selectors=[
    '.headerAccount__pseudo',
    '.account__pseudo',
    'a.headerAccount__user'
  ];
  for(const sel of selectors){
    const t=q(sel)?.textContent?.trim();
    if(t) return t;
  }
  const hasSession = document.cookie.includes('md_sid=');
  log(`Pseudo introuvable${hasSession ? ' — session détectée' : ' — aucune session détectée'}.`);
  return '';
  }
  /* ---------- message templates ---------- */
  const TITLE_TEMPLATES = [
    "Besoin d'aide URGENT","HELP : besoin d'aide","Full RSA besoin d'aide",
    "Aidez moi svp","Besoin d’aide FULL RSA","RSA je meurs","Survivre au RSA"
  ];
  const TEXT_TEMPLATES = [`MODE SURVIE https://image.noelshack.com/fichiers/2016/36/1473263957-risitas33.png
tqt c'est vraiment connu demande à chatgpt https://image.noelshack.com/fichiers/2016/48/1480465536-1475531584-risitascomplot.png
J’ai trouvé un "glitch" 100% LEGAL pour GRATTER de l’argent sur tous les sites https://image.noelshack.com/fichiers/2016/38/1474723937-tv9.png

+1000€ économisés depuis que je l'utilise :d) https://www.noelshack.com/2025-34-5-1755868565-82fef769add4fa83b41483178426ef5c.png

IGRAAAAAAAAAAL https://image.noelshack.com/fichiers/2021/43/4/1635454847-elton-john-tison-golem.png
Quand tu commandes :d)  IGRAAL te redirige vers la boutique (amazon, aliexpress, uber eats, sfr, etc) https://image.noelshack.com/fichiers/2016/36/1473263957-risitas33.png
Le site file une com à IGRAAL pour t’avoir amené comme client :d)  IGRAAL te reverse une partie https://image.noelshack.com/minis/2016/52/1483054124-risitas.png
3€ à GRATTER lors de l'inscription :d)  https://fr.igraal.com/parrainage?parrain=AG_5ddf42495f191 https://image.noelshack.com/minis/2017/39/3/1506463228-risibg.png

oui je GRATTE aussi 3 balles https://image.noelshack.com/minis/2021/51/4/1640278497-2.png
C’est gratos et t’encaisses par virement ou paypal https://image.noelshack.com/minis/2019/11/6/1552755294-macronpetitpied2.png`];

    const rand32 = () => {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const u32 = new Uint32Array(1);
      window.crypto.getRandomValues(u32);
      return u32[0];
    }
    return Math.floor(Math.random() * 0x100000000);
  };

  const randInt = max => {
    if (max <= 0) return 0;
    const limit = Math.floor(0x100000000 / max) * max;
    let u;
    do { u = rand32(); } while (u >= limit);
    return u % max;
  };

  const randomPick = arr => (Array.isArray(arr) && arr.length>0) ? arr[randInt(arr.length)] : undefined;
  function sanitizeURLs(text){
    return text
      .replace(/[\u00A0\u202F\u2009\u200A]+(?=https?:\/\/)/g, '')
      .replace(/[\u200B-\u200D\uFEFF]+(?=https?:\/\/)/g, '');
  }
  function addTrailingSpaces(text){
    return text.split('\n').map(line=>{
      if(!line.trim()) return line;
      return line + (Math.random()<0.5 ? ' ' : '  ');
    }).join('\n');
  }
  function generateMessage(){
    const subject = randomPick(TITLE_TEMPLATES) || '';
    const raw = sanitizeURLs(randomPick(TEXT_TEMPLATES) || '');
    const message = addTrailingSpaces(raw);
    if(!message.trim()){
    }
    return { subject, message };
  }
  function buildPersonalizedMessage(pseudo){
    const generated = generateMessage();
    if(!generated){ return null; }
    const { subject, message } = generated;
    const safePseudo = pseudo || "";
    return { subject, message: message.split("{pseudo}").join(safePseudo) };
  }

  /* ---------- URL helpers + forum-list page parsing ---------- */
  function getTopicInfoFromPath(pathname){
    const m = pathname.match(/\/forums\/\d+-(\d+)-(\d+)-(\d+)-\d+-\d+-.*\.htm/i);
    if(!m) return {forumId:null, topicId:null, page:NaN};
    return {forumId:m[1], topicId:m[2], page:+m[3]};
  }
  function getInfoFromHref(href){
    try{ const u=new URL(href, ORIG); return getTopicInfoFromPath(u.pathname); }
    catch(e){ console.error('[getInfoFromHref]', e); return {forumId:null, topicId:null, page:NaN}; }
  }
  function currentTopicInfo(){ return getTopicInfoFromPath(location.pathname); }

  function getListInfoFromPath(pathname, search){
    const m = pathname.match(/\/forums\/0-(\d+)-0-(\d+)-\d+-\d+-\d+-/i);
    const fid = m ? m[1] : null;
    let page = m ? parseInt(m[2],10) : NaN;
    const mQ = (search||'').match(/[?&]page=(\d+)/i);
    if(mQ){ const qp = parseInt(mQ[1],10); if(!isNaN(qp)) page = qp; }
    return {fid, page};
  }
  function listForumIdFromPath(pathname){ return getListInfoFromPath(pathname, location.search).fid; }
  function pageIsAllowed(){
    if(isTopicPage()){
      const {forumId}=currentTopicInfo();
      return forumId && ALLOWED_FORUMS.has(forumId);
    }
    if(isForumList()){
      const {fid}=getListInfoFromPath(location.pathname, location.search);
      return fid && ALLOWED_FORUMS.has(fid);
    }
    return false;
  }
  function forumListPageOneURL(fid){
    return FORUMS[fid]?.list || pickListWeighted();
  }
  function normalizeListToPageOne(href){
    try{
      const u=new URL(href, ORIG);
      const {fid} = getListInfoFromPath(u.pathname, u.search);
      return fid && ALLOWED_FORUMS.has(fid) ? forumListPageOneURL(fid) : pickListWeighted();
    }catch(e){ console.error('[normalizeListToPageOne]', e); return pickListWeighted(); }
  }

  /* ---------- pagination : max-number (same topicId) ---------- */
  function findMaxPageLinkForCurrentTopic(){
    const {topicId} = currentTopicInfo();
    if(!topicId) return {el:null, num:NaN, abs:null};
    let best={el:null,num:NaN,abs:null};
    const anchors=qa('a[href*="/forums/"]');
    for(const a of anchors){
      const href=a.getAttribute('href'); if(!href) continue;
      const info=getInfoFromHref(href);
      if(info.topicId!==topicId) continue;
      const txt=(a.textContent||'').trim();
      let n = /^\d+$/.test(txt) ? parseInt(txt,10) : info.page;
      if(!isNaN(n) && (isNaN(best.num) || n>best.num)){
        try{ best={el:a,num:n,abs:new URL(href,ORIG).href}; }
        catch(e){ console.error('[findMaxPageLinkForCurrentTopic] URL parse', e); }
      }
    }
    return best;
  }
  async function navGuardOk(targetHref){
    const g=await get(STORE_NAV_GUARD,null);
    const now=NOW();
    if(!g || g.href!==targetHref || (now-g.ts)>15000){
      await set(STORE_NAV_GUARD,{href:targetHref,tries:1,ts:now});
      return true;
    }
    if(g.tries>=3){ await set(STORE_NAV_GUARD,{href:targetHref,tries:g.tries,ts:now}); log(`[Last] Abort after ${g.tries} tries`); return false; }
    await set(STORE_NAV_GUARD,{href:targetHref,tries:g.tries+1,ts:now});
    return true;
  }
  async function ensureAtLastPage(){
    const best=findMaxPageLinkForCurrentTopic();
    if(!best.el || isNaN(best.num)){ log('No pagination → stay.'); return true; }
    const cur=currentTopicInfo().page;
    log(`Page=${cur} | Max=${best.num}`);
    if(!isNaN(cur) && cur>=best.num) return true;
    if(best.abs && await navGuardOk(best.abs)){
      await humanHover(best.el);
      best.el.setAttribute('target','_self');
      best.el.click();
      setTimeout(()=>{ if(location.href!==best.abs) location.href=best.abs; }, 600);
      return false;
    }
    return true;
  }

  /* ---------- random & cooldown ---------- */
  function shuffleSecure(a){
    for(let i=a.length-1;i>0;i--){
      const j=randInt(i+1);
      [a[i],a[j]]=[a[j],a[i]];
    }
  }
  function uniquePseudosOnPage(cfg){
    const me=(cfg.me||'').toLowerCase();
    const uniq=new Map();
    for(const post of qa('.bloc-message-forum')){
      let pseudo='';
      const dataPseudo = post.getAttribute('data-pseudo') || post.dataset?.pseudo;
      if(dataPseudo) pseudo = dataPseudo.trim();
      if(!pseudo){
        const link = post.querySelector('.bloc-pseudo-msg a[href*="/profil/"], a[href*="/profil/"]');
        pseudo = (link?.textContent||'').trim();
      }
      if(!pseudo){
        const node = post.querySelector('.bloc-pseudo-msg');
        pseudo = (node?.textContent||'').trim();
      }
      if(!pseudo) continue;
      const low=pseudo.toLowerCase();
      if(low===me || HARD_BL.has(low)) continue;
      if(!uniq.has(low)) uniq.set(low,pseudo);
    }
    return Array.from(uniq.values());
  }
  function formatLeft(ms){
    const left = Math.max(0, ms);
    const m = Math.floor(left/60000);
    const h = Math.floor(m/60), mm = m%60;
    return `${h}h ${String(mm).padStart(2,'0')}m`;
  }
  async function pickRandomEligiblePseudo(cfg, timeout=6000){
    const t0=performance.now();
    const sent = await sentMap(cfg.cooldownH);
    let pool=uniquePseudosOnPage(cfg);
    while(!pool.length && (performance.now()-t0)<timeout){
      await sleep(120);
      pool=uniquePseudosOnPage(cfg);
    }
    if(!pool.length) return null;
    shuffleSecure(pool);
    const offset = randInt(pool.length);
    for(let k=0;k<pool.length;k++){
      const p = pool[(k+offset)%pool.length];
      const key = await hashPseudo(p);
      const t = sent[key];
      if(t){
        const leftMs = HRS(cfg.cooldownH) - (NOW()-t);
        if(leftMs>0){ log(`skip ${p} — ${formatLeft(leftMs)} left`); continue; }
      }
      sent[key] = NOW();
      await set(STORE_SENT, sent);
      return p;
    }
    return null;
  }

  /* ---------- compose ---------- */
  const hasCF = ()=> !!(q('iframe[src*="challenges.cloudflare.com"]') || q('input[name="cf-turnstile-response"]'));
  const cfToken = ()=> (q('input[name="cf-turnstile-response"]')?.value||'').trim();
  function getErrorText(){
    const nodes = qa('.alert--error, .alert.alert-danger, .msg-error, .alert-warning, .txt-msg-error, .flash-error');
    let text=''; for (const n of nodes) text += ' ' + (n.textContent||'');
    return text.toLowerCase();
  }
  function isBannedError(){ return /banni|banned|utilisateur\s+.*banni|vous ne pouvez pas envoyer/i.test(getErrorText()); }
  function hasVisibleError(){ return !!q('.alert--error, .alert.alert-danger, .msg-error, .alert-warning'); }

  async function handleCompose(cfg){
    await sleep(150+Math.random()*250);

    let pseudo =
      q('#destinataires .form-control-tag .label')?.childNodes?.[0]?.nodeValue?.trim() ||
      (qa('#destinataires input[name^="participants["]').map(i=>i.value)[0]??'') || '';

    const generated = buildPersonalizedMessage(pseudo);
    if(!generated){
      log('Empty message generated → skipping send.');
      return { ok:false, reason:'empty message' };
    }
    const { subject, message } = generated;

    const titre = q('#conv_titre, input[name="conv_titre"], input[placeholder*="sujet" i]');
    if(titre){ await human(); setVal(titre,''); await typeHuman(titre, subject||''); }

    let zone = q('textarea[name="message"]') || q('.jv-editor [contenteditable="true"]');
    if(!zone){
      const form=q('form.js-form-post-mp')||q('form');
      if(form && !q('textarea[name="message"]',form)){ const ta=document.createElement('textarea'); ta.name='message'; ta.style.display='none'; form.appendChild(ta); zone=ta; }
    }
    if(zone){ await human(); setValue(zone,''); await typeMixed(zone, message||''); }

    await dwell(800,1400);
    q('.btn.btn-poster-msg.js-post-message, button[type="submit"]')?.click();
    await sleep(1200);

    if (isBannedError()){
      log('Recipient banned → back to list.');
      return { ok:false, pseudo, reason:'banned' };
    }
    // Retry if the CF token is missing or a visible error is detected.
    if ((hasCF() && !cfToken()) || hasVisibleError()) {
      await sleep(7000+Math.floor(Math.random()*6000));
      q('.btn.btn-poster-msg.js-post-message, button[type="submit"]')?.click();
      await sleep(1200);
      if (isBannedError()){
        return { ok:false, pseudo, reason:'banned' };
      }
    }
    const ok = !hasVisibleError();
    return { ok, pseudo, reason: ok?'':'unknown' };
  }

  /* ---------- session (timer only) ---------- */
  async function sessionGet(){
    if(!sessionCacheLoaded){ sessionCache = await get(STORE_SESSION,sessionCache); sessionCacheLoaded = true; }
    return sessionCache;
  }
  async function sessionStart(){
    await sessionGet();
        if(!myPseudo()){
      log('Pseudo introuvable — session non démarrée.');
      onCache=false;
      await set(STORE_ON,false);
      await updateSessionUI();
      return;
    }
    const wasActive = sessionCache.active;
    if(!sessionCache.active || !sessionCache.startTs) sessionCache.startTs = NOW();
    sessionCache.active = true;
    sessionCache.stopTs = 0;
    if(!wasActive) sessionCache.dmSent = 0;
    if(typeof sessionCache.pendingDm !== 'boolean') sessionCache.pendingDm = false;
    await set(STORE_SESSION, sessionCache);
    startTimerUpdater();
  }
  async function sessionStop(){
    await sessionGet(); sessionCache.active=false; sessionCache.stopTs=NOW(); await set(STORE_SESSION,sessionCache);
    clearInterval(timerHandle); timerHandle=null;
    await updateSessionUI().catch(console.error);
  }
  function formatHMS(ms){
    const sec=Math.floor(ms/1000);
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    const pad=n=>String(n).padStart(2,'0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  async function updateSessionUI(){
    if (updating) return;
    updating = true;
    try {
      const s=await sessionGet();
      let ms=0;
      if(s.startTs){
        if(s.active) ms = NOW()-s.startTs;
        else if(s.stopTs) ms = Math.max(0,s.stopTs - s.startTs);
        else ms = NOW()-s.startTs;
      }
      if(!chronoEl) chronoEl = q('#jvc-dmwalker-chrono');
      if(chronoEl) chronoEl.textContent = formatHMS(ms);
      if(!statusEl) statusEl = q('#jvc-dmwalker-status');
      if(statusEl){
        const on=onCache;
        statusEl.textContent = on?'ON':'OFF';
        statusEl.style.color = on?'#32d296':'#bbb';
      }
      if(!dmCountEl) dmCountEl = q('#jvc-dmwalker-dmcount');
      if(dmCountEl) dmCountEl.textContent = String(s.dmSent||0);

      const c = Object.assign({}, DEFAULTS, await loadConf());
      const startEl = q('#jvc-dmwalker-active-start');
      if(startEl) startEl.value = c.activeHours[0];
      const endEl = q('#jvc-dmwalker-active-end');
      if(endEl) endEl.value = c.activeHours[1];
    } finally {
      updating = false;
    }
  }
  let timerHandle=null;
  let updating=false;
  let ticking = false;
  function startTimerUpdater(){ if(timerHandle) clearInterval(timerHandle); timerHandle=setInterval(()=>{updateSessionUI().catch(console.error);},1000); updateSessionUI().catch(console.error); }

  /* ---------- scheduler ---------- */
  async function tickSoon(ms=300){
    const cfg = Object.assign({}, DEFAULTS, await loadConf());
    const [startHour,endHour]=cfg.activeHours;
    const now=new Date();
    const h=now.getHours();
    if(h<startHour||h>=endHour){
      await sessionStop();
      const next=new Date(now);
      if(h>=endHour) next.setDate(next.getDate()+1);
      next.setHours(startHour,0,0,0);
      const delay=next.getTime()-now.getTime();
      setTimeout(()=>{ tickSoon(ms).catch(console.error); }, delay);
      return;
    }
    setTimeout(() => { tick().catch(console.error); }, ms);
  }
  async function tick(){
    if (ticking) return;
    ticking = true;
    try {
    if(!onCache) return;
    const cfg = Object.assign({}, DEFAULTS, await loadConf());

    // 1) handle MP first (compose/thread)
    if(isMpThread()){
      await sessionGet();
      sessionCache.pendingDm = true;
      await set(STORE_SESSION, sessionCache);
      let back = await get(STORE_LAST_LIST,'') || pickListWeighted();
      back = normalizeListToPageOne(back);
      log('MP thread detected → back to list.');
      await dwell(200,600); location.href=back; tickSoon(300); return;
    }

    if(isCompose()){
      log('Compose detected → sending…');
      const res=await handleCompose(cfg);
      if(res.ok){
        log('MP sent.');
        await sessionGet();
        sessionCache.mpCount = (sessionCache.mpCount||0) + 1;
        sessionCache.dmSent = (sessionCache.dmSent||0) + 1;
        sessionCache.pendingDm = true;
        await updateSessionUI();
        if(!sessionCache.mpNextDelay) sessionCache.mpNextDelay = Math.floor(rnd(2,5));
        if(sessionCache.mpCount >= sessionCache.mpNextDelay){
          const ms = Math.round(rnd(30000,120000));
          log(`MP limit reached (${sessionCache.mpCount}) → sleeping ${Math.round(ms/1000)}s.`);
          await sleep(ms);
          sessionCache.mpCount = 0;
          sessionCache.mpNextDelay = Math.floor(rnd(2,5));
        }
        await set(STORE_SESSION, sessionCache);
        await updateSessionUI();
      }else{
        log(`Send failed / skipped${res.reason?` (${res.reason})`:''}.`);
      }

      let back = await get(STORE_LAST_LIST,'') || pickListWeighted();
      back = normalizeListToPageOne(back);
      await dwell(200,500); location.href=back; tickSoon(300); return;
    }

    // 2) enforce forum scope with weighted target
    if(!pageIsAllowed()){
      const fid = pickForumIdWeighted(); await setTargetForum(fid);
      const target = FORUMS[fid].list;
      log(`Outside allowed forums → redirecting to ${FORUMS[fid].name} (page 1).`);
      location.href=target; return;
    }

    // 3) standard flow
    if(isTopicPage()){
      const {forumId}=currentTopicInfo();
      if(!ALLOWED_FORUMS.has(forumId)){ const fid = pickForumIdWeighted(); await setTargetForum(fid); location.href=FORUMS[fid].list; return; }
      const title=(q('#bloc-title-forum')?.textContent||'').trim();
      if(title && TITLE_BL.some(r=>r.test(title))){ log(`Blacklisted topic (“${title}”) → back.`); history.back(); return; }

      const atLast = await ensureAtLastPage();
      await dwell(800,2000);
      await randomScrollWait(3000,7000);
      await randomScrollWait(2000,6000);
      await randomScrollWait(2000,4000);
      const pseudo=await pickRandomEligiblePseudo(cfg, 6000);
      if(!pseudo){ log('No eligible user (cooldown/blacklist). Back to list.'); history.back(); return; }

      log(`Chosen random target → ${pseudo}`);
      await dwell(400,1200);
      try{
        const msg=q('.bloc-message-forum');
        if(msg) await humanHover(msg);
        else window.scrollBy({top:rnd(-120,120),behavior:'smooth'});
      }catch(e){ console.error('[nav mimic]', e); }
      const url=`${ORIG}/messages-prives/nouveau.php?all_dest=${encodeURIComponent(pseudo)}`;
      location.href=url;
      return;
    }

    if(isForumList()){
      const info = getListInfoFromPath(location.pathname, location.search);
      if(info.fid && info.page && info.page !== 1){
        const url = forumListPageOneURL(info.fid);
        log(`List on page ${info.page} → forcing page 1.`);
        location.href = url; return;
      }

      let targetF = await getTargetForum();
      const currentF = info.fid;
      if(!targetF){
        targetF = pickForumIdWeighted();
        await setTargetForum(targetF);
        log(`Forum target: ${FORUMS[targetF].name} (weighted)`);
      }
      if(currentF !== targetF){
        log(`Switching to ${FORUMS[targetF].name} (weighted target, page 1).`);
        location.href = FORUMS[targetF].list; return;
      }

      await set(STORE_LAST_LIST, location.href);
      await sessionGet();
      if(sessionCache.pendingDm){
        sessionCache.dmSent = (sessionCache.dmSent||0) + 1;
        sessionCache.pendingDm = false;
        await set(STORE_SESSION, sessionCache);
        await updateSessionUI();
      }
      const links=collectTopicLinks();
      if(!links.length){ log('Forum list detected but no usable links.'); tickSoon(800); return; }
      const pick=randomPick(links);
      log(`Open topic → ${(pick.textContent||'').trim().slice(0,80)}`);
      await humanHover(pick);
      await clearTargetForum();
      pick.setAttribute('target','_self'); pick.click();
      return;
    }

    // fallback: jump to weighted list (page 1)
    const fid = pickForumIdWeighted(); await setTargetForum(fid);
    location.href=FORUMS[fid].list;
    } finally { ticking = false; }

  }

  function collectTopicLinks(){
    const nodes=qa('#forum-main-col a[href*="/forums/"][href$=".htm"], .liste-sujets a[href*="/forums/"][href$=".htm"]');
    const out=[], seen=new Set();
    for(const a of nodes){
      const href=a.getAttribute('href')||'';
      if(/\/messages-prives\//i.test(href)) continue;
      let abs, info;
      try{ abs=new URL(href,ORIG).href; info=getInfoFromHref(abs); }catch(e){ console.error('[collectTopicLinks] URL parse', e); continue; }
      if(!info || !ALLOWED_FORUMS.has(info.forumId||'')) continue;
      if(seen.has(abs)) continue;
      seen.add(abs); out.push(a);
    }
    return out;
  }

  if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') {
    module.exports = { sanitizeURLs, addTrailingSpaces };
  }

  /* ---------- robust compact English UI ---------- */
  (async function buildAndAutoStart(){
    const tryUI=async()=>{ try{ await ensureUI(); }catch(e){ console.error('[DM Walker] UI error', e); } };
    if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', tryUI, {once:true}); }
    else { await tryUI(); }
    let retries=0;
    let mounting = false;
    const iv=setInterval(async ()=>{
      if(mounting) return;
      mounting = true;
      try {
        if(q('#jvc-dmwalker')){
          clearInterval(iv);
        } else {
          await tryUI();
          if(++retries>10) clearInterval(iv);
        }
      } finally {
        mounting = false;
      }
    }, 700);    if(onCache) tickSoon(400);
  })();

  async function startHandler(){
    const c=Object.assign({}, DEFAULTS, await loadConf());
    const pseudo = myPseudo();
    if(!pseudo){
      log('Pseudo introuvable — démarrage annulé.');
      return;
    }
    const startEl=q('#jvc-dmwalker-active-start');
    const endEl=q('#jvc-dmwalker-active-end');
    const start=parseInt(startEl?startEl.value:c.activeHours[0],10);
    const end=parseInt(endEl?endEl.value:c.activeHours[1],10);
    await saveConf({ ...c, me:pseudo, activeHours:[start,end] });
    await set(STORE_ON,true);
    onCache = true;
    await sessionStart();
    log('Session started.');
    tickSoon(250);
  }

  async function stopHandler(){
    await set(STORE_ON,false);
    onCache = false;
    await sessionStop();
    log('Session stopped.');
  }

  async function purgeHandler(){
    await set(STORE_SENT,{});
    log('96h memory cleared.');
  }

  async function ensureUI(){
    if(q('#jvc-dmwalker')) return;

    const conf = Object.assign({}, DEFAULTS, await loadConf());
    if(!conf.me){ conf.me = myPseudo(); await saveConf(conf); }
        if(!conf.me){
      const pseudo = myPseudo();
      if(pseudo){
        conf.me = pseudo;
        await saveConf(conf);
      }
    }

    const box=document.createElement('div');
    box.id='jvc-dmwalker';
    Object.assign(box.style,{
      position:'fixed', right:'12px', bottom:'12px', width:'260px',
      background:'#0f1115', color:'#eee', border:'1px solid #333',
      borderRadius:'10px', padding:'8px', zIndex:2147483647,
      boxShadow:'0 8px 24px rgba(0,0,0,.5)',
      font:'12px/1.4 system-ui,Segoe UI,Roboto,Arial'
    });
    const header=document.createElement('div');
    Object.assign(header.style,{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'});
    const title=document.createElement('strong');
    title.textContent='JVC DM WALKER';
    Object.assign(title.style,{fontSize:'12px',flex:'1'});
    const status=document.createElement('span');
    status.id='jvc-dmwalker-status';
    status.textContent='OFF';
    Object.assign(status.style,{fontWeight:'700',color:'#bbb'});
    statusEl=status;
    header.append(title,status);

    const actions=document.createElement('div');
    Object.assign(actions.style,{display:'flex',alignItems:'center',gap:'8px',margin:'6px 0'});
    const startBtn=document.createElement('button');
    startBtn.id='jvc-dmwalker-start';
    startBtn.textContent='Start';
    Object.assign(startBtn.style,{background:'#2a6ef5',border:'0',color:'#fff',padding:'5px 9px',borderRadius:'8px',cursor:'pointer'});
    const stopBtn=document.createElement('button');
    stopBtn.id='jvc-dmwalker-stop';
    stopBtn.textContent='Stop';
    Object.assign(stopBtn.style,{background:'#8a2020',border:'0',color:'#fff',padding:'5px 9px',borderRadius:'8px',cursor:'pointer'});
    const purgeBtn=document.createElement('button');
    purgeBtn.id='jvc-dmwalker-purge';
    purgeBtn.textContent='Clear 96h';
    Object.assign(purgeBtn.style,{background:'#333',border:'1px solid #555',color:'#bbb',padding:'5px 9px',borderRadius:'8px',cursor:'pointer'});
    actions.append(startBtn,stopBtn,purgeBtn);
    startBtn.addEventListener('click', startHandler);
    stopBtn.addEventListener('click', stopHandler);
    purgeBtn.addEventListener('click', purgeHandler);

    const hoursWrap=document.createElement('div');
    Object.assign(hoursWrap.style,{display:'flex',alignItems:'center',gap:'4px',margin:'6px 0'});
    const hoursLabel=document.createElement('span');
    hoursLabel.textContent='Heures actives';
    const startInput=document.createElement('input');
    startInput.type='number';
    startInput.id='jvc-dmwalker-active-start';
    startInput.value=conf.activeHours[0];
    startInput.min='0'; startInput.max='24';
    Object.assign(startInput.style,{width:'40px',background:'#0b0d12',color:'#eee',border:'1px solid #222',borderRadius:'4px'});
    const endInput=document.createElement('input');
    endInput.type='number';
    endInput.id='jvc-dmwalker-active-end';
    endInput.value=conf.activeHours[1];
    endInput.min='0'; endInput.max='24';
    Object.assign(endInput.style,{width:'40px',background:'#0b0d12',color:'#eee',border:'1px solid #222',borderRadius:'4px'});
    hoursWrap.append(hoursLabel,startInput,endInput);

    const chronoWrap=document.createElement('div');
    Object.assign(chronoWrap.style,{display:'flex',alignItems:'center',gap:'4px',marginBottom:'4px',fontVariantNumeric:'tabular-nums'});
    const chronoLabel=document.createElement('span');
    chronoLabel.textContent='⏱';
    const chrono=document.createElement('span');
    chrono.id='jvc-dmwalker-chrono';
    chrono.textContent='00:00:00';
    chronoEl=chrono;
    const dmCount=document.createElement('span');
    dmCount.id='jvc-dmwalker-dmcount';
    dmCount.textContent='0';
    dmCountEl=dmCount;
    chronoWrap.append(chronoLabel, chrono, document.createTextNode(' | DMs: '), dmCount);

    const log=document.createElement('div');
    log.id='jvc-dmwalker-log';
    Object.assign(log.style,{
      marginTop:'2px',color:'#9ecbff',lineHeight:'1.4',height:'5.6em',
      overflow:'auto',whiteSpace:'pre-wrap',background:'#0b0d12',
      border:'1px solid #222',borderRadius:'8px',padding:'6px'
    });
    logEl=log;

    box.append(header,actions,hoursWrap,chronoWrap,log);

    const parent=document.body||document.documentElement;
    parent.appendChild(box);

    let b=q('#jvc-dmwalker-badge');
    if(!b){
      b=document.createElement('div');
      b.id='jvc-dmwalker-badge';
      Object.assign(b.style,{position:'fixed',top:'10px',right:'10px',background:'#2a6ef5',color:'#fff',padding:'5px 7px',borderRadius:'8px',font:'12px system-ui',zIndex:2147483647,cursor:'pointer',boxShadow:'0 6px 18px rgba(0,0,0,.35)'});
      b.textContent='MW';
      b.title='Toggle panel (Alt+J)';
      (document.body||document.documentElement).appendChild(b);
    }
    b.onclick = ()=>{ const box=q('#jvc-dmwalker'); if(box) box.style.display = (box.style.display==='none'?'block':'none'); };

    if(!window.toggleKeyHandler){
      const toggleKeyHandler = (e)=>{
        if(e.altKey && /j/i.test(e.key)){
          const box=q('#jvc-dmwalker');
          if(box) box.style.display=box.style.display==='none'?'block':'none';
        }
      };
      window.toggleKeyHandler = toggleKeyHandler;
      document.addEventListener('keydown', toggleKeyHandler);
    }

    if((await sessionGet()).active) {
      startTimerUpdater();
      tickSoon();
    } else await updateSessionUI();

    uiMutationObserver = new MutationObserver(()=>{
      if(!parent.contains(box)){
        uiMutationObserver.disconnect();
        uiMutationObserver = null;
        if(!uiRemountTimeout){
          uiRemountTimeout=setTimeout(async ()=>{
            uiRemountTimeout=null;
            try{ await ensureUI(); }
            catch(e){ console.error('UI remount failed',e); }
          },50);
        }
      }
    });
    uiMutationObserver.observe(parent,{childList:true,subtree:false});
  }
})();