// ==UserScript==
// @name         JVC DM WALKER STABLE (v2.23)
// @namespace    https://tampermonkey.net/
// @version      2.23
// @description  Last page via max-number → true random user → 96h cooldown → MP all_dest. Compose-first, compact EN UI, forum scope (18-25 & Finance, 85/15), cooldown-left logs, human-like scroll/hover. Forum lists forced to page 1. URLs in message are pasted (not typed). UI mounting robust & private storage.
// @match        https://www.jeuxvideo.com/forums/*
// @match        https://www.jeuxvideo.com/messages-prives/nouveau.php*
// @match        https://www.jeuxvideo.com/messages-prives/message.php*
// @match        https://www.jeuxvideo.com/login*
// @match        https://www.jeuxvideo.com/
// @run-at       document-idle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.addValueChangeListener
// @grant        GM.listValues
// @grant        GM.deleteValue
// ==/UserScript==
(async function () {
  'use strict';

const DEBUG = true;

  function sanitizeForLog(input) {
    if (typeof input === 'string') {
      return input.replace(/(token|password|pass|auth)=([^&\s]+)/gi, '$1=***');
    }
    if (input && typeof input === 'object') {
      try {
        return JSON.parse(JSON.stringify(input, (k, v) => /token|password|pass|auth/i.test(k) ? '***' : v));
      } catch (e) {
        return '[object]';
      }
    }
    return input;
  }

  /* ====== persistent private storage ====== */
  const STORE_TTL = 96*3600*1000;
  const TS_SUFFIX = '__ts';
  const get = async (k, d) => {
    try { return await GM.getValue(k, d); }
    catch (err) { log('GM.getValue:', err); return d; }
  };
  const set = async (k, v) => {
    try {
      await GM.setValue(k, v);
      if (v === null || v === undefined) {
        await GM.deleteValue(k + TS_SUFFIX);
      } else {
        await GM.setValue(k + TS_SUFFIX, Date.now());
      }
    }
    catch (err) { log('GM.setValue:', err); }
  };
  async function purgeStore(){
    try {
      const keys = await GM.listValues();
      const now = Date.now();
      for(const k of keys){
        if(k.endsWith(TS_SUFFIX)) continue;
        const ts = await GM.getValue(k + TS_SUFFIX, 0);
        if(ts && now - ts > STORE_TTL){
          await GM.deleteValue(k);
          await GM.deleteValue(k + TS_SUFFIX);
        }
      }
    } catch(err) {
      console.error('GM.listValues:', err);
    }
  }
  await purgeStore();

  /* ---------- utils ---------- */
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const human=()=>sleep(Math.round(rnd(49,105)));
  const dwell=(a=350,b=950)=>sleep(Math.round(rnd(a,b)));

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
    const clamp=y=>{
    const maxY=document.documentElement.scrollHeight-window.innerHeight;
    return Math.min(Math.max(0,y),maxY);
  };

  async function readingScroll(){
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    let cancel = false;
    const cancelFn = () => { cancel = true; };
    const events = ['wheel','mousedown','keydown','touchstart'];
    events.forEach(e => window.addEventListener(e, cancelFn, {once:true}));
    const start = Date.now();
    const MAX_TIME = 60000;
    let iter = 0;
    try{
      while(!cancel && window.scrollY < maxY && (Date.now() - start) < MAX_TIME && iter < 60){
        await smoothScrollTo(Math.min(window.scrollY + rnd(80,160), maxY));
        await dwell(400,900);
        iter++;
      }
    } finally {
      events.forEach(e => window.removeEventListener(e, cancelFn));
    }
  }
  async function smoothScrollTo(targetY){
    const maxY=document.documentElement.scrollHeight-window.innerHeight;
    targetY=Math.min(Math.max(0,targetY),maxY);
    let distance=targetY-window.scrollY;
    let steps=0;
    while(Math.abs(distance)>1 && steps++<1000){
      const step=Math.max(1,Math.min(Math.abs(distance),rnd(40,80)));
      window.scrollBy(0,step*Math.sign(distance));
      await sleep(Math.round(rnd(30,60)));
      distance=targetY-window.scrollY;
    }
    window.scrollTo(0,targetY);

  }
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const NOW=()=>Date.now(), HRS=h=>h*3600e3;
  const ORIG=typeof location !== 'undefined' ? location.origin : '';

let chronoEl=null, statusEl=null, logEl=null, dmCountEl=null;

  const logBuffer=[]; let logIdx=0; const log=(...args)=>{
    if (!DEBUG) return;
    const sanitized=args.map(sanitizeForLog);
    logBuffer[logIdx++ % 200] = sanitized.join(' ');
    if(!logEl) logEl=q('#jvc-dmwalker-log');
    if(logEl){
    const idx=logIdx%200;
    const ordered=logBuffer.slice(idx).concat(logBuffer.slice(0,idx));
    logEl.textContent=ordered.filter(Boolean).join('\n');
    logEl.scrollTop=logEl.scrollHeight;
    }
    console.log(...sanitized);
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

    const reinit = async () => {
      const on = await GM.getValue(STORE_ON, false);
      if (on) {
        log('[DM_WALKER] pageshow/popstate → reinit');
        try { await ensureUI(); }
        catch (e) { log('[DM Walker] UI error', e); }
        tickSoon(400);
      }
    };
    window.addEventListener('pageshow', () => { reinit().catch(log); });
    window.addEventListener('popstate', () => { reinit().catch(log); });
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
      await smoothScrollTo(clamp(targetY));
      await sleep(200+Math.random()*300);
      if(Math.random()<0.3){
        const dir = targetY > window.scrollY ? 1 : -1;
        const overshoot = rnd(30,120);
        const overY = clamp(targetY + dir*overshoot);
        await smoothScrollTo(overY);
        await sleep(120+Math.random()*180);
        await smoothScrollTo(clamp(targetY));
        await sleep(120+Math.random()*180);
      }
      const wheelCount = Math.floor(rnd(1,4));
      for(let i=0;i<wheelCount;i++){
        const delta = (Math.random()<0.5?-1:1)*rnd(20,80);
        el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:delta}));
        await sleep(60+Math.random()*120);
      }
      await smoothScrollTo(clamp(targetY));
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
    }catch(e){ log('[humanHover]', e); }
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
  const STORE_CONF='jvc_postwalker_conf';
  let confCache = null;
  async function loadConf(force=false){
    if(force || confCache===null){
      confCache = await get(STORE_CONF,{});
      if(!('activeSlots' in confCache) && Array.isArray(confCache.activeHours)){
        const [h1,h2] = confCache.activeHours;
        confCache.activeSlots = normalizeSlots([{start:h1*60,end:h2*60}]);
        await set(STORE_CONF, confCache);
      }
    }
    return confCache;
  }
  async function saveConf(conf){
    await set(STORE_CONF,conf);
    confCache = conf;
  }
    async function ensureDefaults(){
    const cfg = await loadConf();
    let changed = false;
    if(!Array.isArray(cfg.accounts)){
      cfg.accounts = [];
      changed = true;
    }
    if(!cfg.accounts.length){
      if(cfg.accountIdx !== 0){ cfg.accountIdx = 0; changed = true; }
    } else if(cfg.accountIdx >= cfg.accounts.length){
      cfg.accountIdx = 0;
      changed = true;
    }
    if(changed) await saveConf(cfg);
  }
  const STORE_SENT='jvc_mpwalker_sent';
  const STORE_ON='jvc_mpwalker_on';
  const STORE_LAST_LIST='jvc_mpwalker_last_list';
  const STORE_NAV_GUARD='jvc_mpwalker_nav_guard';
  const STORE_SESSION='jvc_postwalker_session';
  const STORE_PENDING_LOGIN='jvc_postwalker_pending_login';
  const STORE_LOGIN_REFUSED='jvc_postwalker_login_refused';
  const STORE_LOGIN_ATTEMPTS='jvc_postwalker_login_attempts';
  const STORE_LOGIN_BLOCKED='jvc_postwalker_login_blocked';
  const STORE_CF_RETRIES='jvc_postwalker_cf_retries';
  const STORE_TARGET_FORUM='jvc_mpwalker_target_forum';

  let loginReloadTimeout=null;
  let loginAttempted=false;

  let onCache = false;
let sessionCache = {active:false,startTs:0,stopTs:0,mpCount:0,mpNextDelay:Math.floor(rnd(2,5)),dmSent:0,pendingDm:false,pendingCaptcha:false};
let sessionCacheLoaded = false;
  if(typeof GM !== 'undefined' && GM.addValueChangeListener){
    GM.addValueChangeListener(STORE_CONF, async () => {
      try { await loadConf(true); }
      catch (e) { log('loadConf failed', e); }
    });
    GM.addValueChangeListener(STORE_ON, (_, __, v)=>{ onCache = v; updateSessionUI().catch(log); });
    GM.addValueChangeListener(STORE_SESSION, (_, __, v)=>{ sessionCache = v; sessionCacheLoaded = true; updateSessionUI().catch(log); });
    await loadConf(true);
  }
  onCache = await get(STORE_ON,false);
  await ensureDefaults();

  const pendingLogin = await get(STORE_PENDING_LOGIN,false);
  if(pendingLogin){
    await set(STORE_PENDING_LOGIN,false);
    location.href='https://www.jeuxvideo.com/login';
    return;
  }

  const DEFAULTS = { me:'', cooldownH:96, activeHours:[8,23], activeSlots:[], accounts:[], accountIdx:0 };
  if(location.pathname.startsWith('/login') && !(await get(STORE_LOGIN_BLOCKED,false))) await autoLogin();
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
    'superpanda',
    'pseudo supprim[ée]',
  ]);

  // Farm accounts (hard blacklist)
  const FARM_ACCOUNTS = [
    'traknet',
    'patochelapoche',
    'aureliechiasse',
    'luciechiasse',
    'lauriechiasse',
    'adelechiasse',
    'karinechiasse',
    'clarachiasse',
    'ginettechiasse',
    'emmachiasse',
    'rosechiasse',
    'alicechiasse',
    'annachiasse',
    'juliachiasse',
    'agathechiasse',
    'jeannechiasse',
    'oliviachiasse',
    'lenachiasse',
    'chloechiasse',
    'leoniechiasse',
    'zoechiasse',
    'leachiasse',
    'lolachiasse',
    'margotchiasse',
  ];
  FARM_ACCOUNTS.forEach(u => HARD_BL.add(u));

  const TITLE_BL = [/(?:mod[ée]ration|moderation)/i, /(?:r[èe]gles|rules)/i];

  const DM_LIMIT_ERRORS = [
    "Vous avez atteint votre limite de création de discussions MP pour la journée. En savoir plus sur les niveaux utilisateurs.",
    "You have reached your limit of creating DM conversations for the day. Learn more about user levels."
  ];
    function shouldSwitchAccountForDM(errorText){
    const text=(errorText||'').replace(/\s+/g,' ').trim().toLowerCase();
    return DM_LIMIT_ERRORS.some(msg=>text.includes(msg.toLowerCase()));
  }

  function observeAndHandleDMErrors(){
    let debounce=null;
    let switching=false;
    const selector = [
      '.alert--error',
      '.alert.alert-danger',
      '.msg-error',
      '.alert-warning',
      '.alert.alert-warning',
      '.alert.alert-warning p.mb-0',
      '.txt-msg-error',
      '.flash-error'
    ].join(', ');
    const check=()=>{
      const els=qa(selector);
      for(const el of els){
        const txt=el.innerText||el.textContent||'';
        if(shouldSwitchAccountForDM(txt)){
          if(!debounce){
            debounce=setTimeout(()=>{
              debounce=null;
              if(!switching){
                switching=true;
                switchToNextAccount('DM_LIMIT_REACHED')
                  .catch(log)
                  .finally(()=>{switching=false;});
              }
            },200);
          }
          break;
        }
      }
    };
    const mo=new MutationObserver(check);
    check(); // handle message already present at load
    mo.observe(document.body,{childList:true,subtree:true});
    return mo;
  }

  let dmErrorObserver = observeAndHandleDMErrors();
  window.addEventListener('beforeunload', () => {
    dmErrorObserver?.disconnect();
    dmErrorObserver = null;
  });

  const CF_INLINE_ROOT_SELECTORS = [
    '.cb-c',
    '.cb-container',
    '.cb-lb'
  ];
  const CF_ROOT_SELECTORS = [
    '#cf-challenge',
    '.cf-challenge',
    '.cf-turnstile',
    '.cf-challenge-wrapper',
    ...CF_INLINE_ROOT_SELECTORS
  ];
  const CF_IFRAME_SELECTORS = [
    'iframe[src*="challenges.cloudflare.com"]',
    'iframe[title*="Cloudflare" i]'
  ];
  const MIN_CF_INTERACTIVE_SIZE = 4;
  const isElementInteractable = (el, minSize = MIN_CF_INTERACTIVE_SIZE) => {
    if(!el || typeof el.getBoundingClientRect !== 'function') return false;
    const rect = el.getBoundingClientRect();
    if(!rect || rect.width <= minSize || rect.height <= minSize) return false;
    if(typeof window !== 'undefined' && window.getComputedStyle){
      const style = window.getComputedStyle(el);
      if(style && (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) === 0)){
        return false;
      }
    }
    return true;
  };

  let turnstilePromptOverlay=null;
  let turnstilePromptTitleEl=null;
  let turnstilePromptMessageEl=null;
  let turnstilePromptStatusEl=null;

  function ensureTurnstilePrompt(){
    if(turnstilePromptOverlay) return turnstilePromptOverlay;
    const overlay=document.createElement('div');
    overlay.id='jvc-dmwalker-turnstile-prompt';
    Object.assign(overlay.style,{
      position:'fixed',
      top:'16px',
      left:'50%',
      transform:'translateX(-50%)',
      background:'rgba(15,17,21,0.92)',
      color:'#fff',
      padding:'12px 16px',
      borderRadius:'10px',
      boxShadow:'0 12px 32px rgba(0,0,0,0.45)',
      font:'13px/1.5 system-ui,Segoe UI,Roboto,Arial',
      zIndex:2147483646,
      maxWidth:'min(420px, calc(100% - 32px))',
      textAlign:'center',
      pointerEvents:'none',
      display:'none'
    });
    const title=document.createElement('div');
    Object.assign(title.style,{fontWeight:'700',fontSize:'13px'});
    title.textContent='Cloudflare verification required';
    const message=document.createElement('div');
    Object.assign(message.style,{marginTop:'6px'});
    message.textContent='Cloudflare challenge detected — please click the Turnstile checkbox manually.';
    const status=document.createElement('div');
    Object.assign(status.style,{marginTop:'6px',fontSize:'12px',opacity:'0.85',display:'none'});
    overlay.append(title,message,status);
    (document.body||document.documentElement).appendChild(overlay);
    turnstilePromptOverlay=overlay;
    turnstilePromptTitleEl=title;
    turnstilePromptMessageEl=message;
    turnstilePromptStatusEl=status;
    return overlay;
  }

  function updateTurnstilePromptStatus(status){
    if(!turnstilePromptOverlay || !turnstilePromptStatusEl) return;
    if(status){
      turnstilePromptStatusEl.textContent=status;
      turnstilePromptStatusEl.style.display='block';
    }else{
      turnstilePromptStatusEl.textContent='';
      turnstilePromptStatusEl.style.display='none';
    }
  }

  function showTurnstilePrompt(message='Cloudflare challenge detected — please click the Turnstile checkbox manually.', status){
    const overlay=ensureTurnstilePrompt();
    if(turnstilePromptTitleEl){
      turnstilePromptTitleEl.textContent='Cloudflare verification required';
    }
    if(turnstilePromptMessageEl){
      turnstilePromptMessageEl.textContent=message || '';
    }
    updateTurnstilePromptStatus(status);
    overlay.style.display='block';
  }

  function hideTurnstilePrompt(){
    if(turnstilePromptOverlay){
      turnstilePromptOverlay.style.display='none';
    }
  }

  function createFocusController(el){
    if(!el || typeof el.focus!=='function'){
      return { ensure:()=>{}, cleanup:()=>{} };
    }
    const hadTabIndex=typeof el.hasAttribute==='function' ? el.hasAttribute('tabindex') : true;
    if(!hadTabIndex){
      try{ el.setAttribute('tabindex','-1'); }
      catch(err){ log('[createFocusController] setAttribute failed', err); }
    }
    const ensure=()=>{
      try{
        const doc=el.getRootNode?.()||el.ownerDocument||document;
        if(doc?.activeElement === el) return;
        try{ el.focus({preventScroll:true}); }
        catch(err){
          try{ el.focus(); }
          catch(err2){ log('[createFocusController] focus failed', err2); }
        }
      }catch(err){ log('[createFocusController] ensure failed', err); }
    };
    const cleanup=()=>{
      if(!hadTabIndex){
        try{ el.removeAttribute('tabindex'); }
        catch(err){ log('[createFocusController] cleanup failed', err); }
      }
    };
    return { ensure, cleanup };
  }

  function findCloudflareChallengeRoot(){
    const seen=new Set();
    const candidates=[];
    const addCandidate=(el)=>{
      if(el && !seen.has(el)){
        seen.add(el);
        candidates.push(el);
      }
    };
    const collectSelectors=(selectors)=>{
      for(const sel of selectors){
        const matches=qa(sel);
        for(const match of matches){ addCandidate(match); }
      }
    };
    collectSelectors(CF_ROOT_SELECTORS);
    collectSelectors(CF_IFRAME_SELECTORS);

    const hidden=q('input[name="cf-turnstile-response"]');
    if(hidden && !hidden.value){
      const doc=hidden.getRootNode?.()||hidden.ownerDocument||document;
      const inlineSelectorList=CF_INLINE_ROOT_SELECTORS.join(', ');
      const cfWrapperSelector='#cf-challenge, .cf-turnstile, .cf-challenge, .cf-challenge-wrapper';
      const cfWrapper=hidden.closest?.(cfWrapperSelector);
      if(cfWrapper) addCandidate(cfWrapper);
      const inlineContainers=new Set();
      for(const sel of CF_INLINE_ROOT_SELECTORS){
        const inline=hidden.closest?.(sel);
        if(inline) inlineContainers.add(inline);
      }
      if(doc && typeof doc.querySelectorAll==='function'){
        for(const match of qa(inlineSelectorList,doc)){
          if(match?.querySelector?.('input[type="checkbox"]')){
            inlineContainers.add(match);
          }
        }
      }
      for(const inline of inlineContainers){
        if(!inline) continue;
        addCandidate(inline);
        const inlineWrapper=inline.closest?.(cfWrapperSelector);
        if(inlineWrapper) addCandidate(inlineWrapper);
      }
      addCandidate(hidden);
    }

    const visibleCandidate=candidates.find(isElementInteractable);
    if(visibleCandidate) return visibleCandidate;

    if(candidates.length){
      log('[findCloudflareChallengeRoot] Only hidden Cloudflare frames detected', {count:candidates.length});
    }

    return candidates[0] || null;
  }

  function getCloudflareInteractiveElement(root){
    if(!root) return null;
    if(root.matches?.('input[type="checkbox"]') && isElementInteractable(root)){
      return root;
    }
    const isResponseInput=root.matches?.('input[name="cf-turnstile-response"]');
    const doc=root.getRootNode?.()||root.ownerDocument||document;
    let searchScope=root;
    if(isResponseInput){
      const inlineScopeSelectors=['label.cb-lb','.cb-lb','.cb-container','.cb-c'];
      for(const sel of CF_INLINE_ROOT_SELECTORS){
        if(!inlineScopeSelectors.includes(sel)) inlineScopeSelectors.push(sel);
      }
      for(const sel of inlineScopeSelectors){
        const inlineCandidate=root.closest?.(sel)||doc?.querySelector?.(sel);
        if(inlineCandidate){
          searchScope=inlineCandidate;
          break;
        }
      }
      if(searchScope===root){
        const docScope=(doc && doc.querySelectorAll)?doc:document;
        searchScope=docScope||root;
      }
    }
    const iframeCandidates=[];
    const iframeSeen=new Set();
    const pushIframe=(el)=>{
      if(el && !iframeSeen.has(el)){
        iframeSeen.add(el);
        iframeCandidates.push(el);
      }
    };
    if(root.matches?.('iframe')) pushIframe(root);
    const iframeScope=isResponseInput?searchScope:root;
    if(!root.matches?.('iframe') && iframeScope && typeof iframeScope.querySelectorAll==='function'){
        for(const sel of CF_IFRAME_SELECTORS){
        const matches=qa(sel,iframeScope);
        for(const match of matches){ pushIframe(match); }
      }
    }
    const visibleIframe=iframeCandidates.find(isElementInteractable);
    if(visibleIframe) return visibleIframe;
    if(iframeCandidates.length){
      log('[getCloudflareInteractiveElement] Only hidden iframe candidates detected', {count:iframeCandidates.length});
    }
    let checkbox=null;
    if(searchScope?.querySelector){
      checkbox=q('input[type="checkbox"]',searchScope)||q('label input[type="checkbox"]',searchScope);
    }
      if(checkbox){
      if(checkbox.id){
        const escapeCss=(value)=>{
          try{
            if(typeof CSS!=='undefined' && typeof CSS.escape==='function'){
              return CSS.escape(value);
            }
          }catch(e){ log('[getCloudflareInteractiveElement] CSS.escape failed', e); }
          return value.replace(/["\\]/g,'\\$&');
        };
        try{
          const scope=checkbox.getRootNode?.()||checkbox.ownerDocument||doc||document;
          const labelFor=scope?.querySelector?.(`label[for="${escapeCss(checkbox.id)}"]`);
          if(labelFor && isElementInteractable(labelFor)) return labelFor;
        }catch(err){ log('[getCloudflareInteractiveElement] label[for] lookup failed', err); }
      }
      const inlineLabel=checkbox.closest('label.cb-lb, .cb-lb');
      if(inlineLabel && isElementInteractable(inlineLabel)) return inlineLabel;
      const label=checkbox.closest('label');
      if(label && isElementInteractable(label)) return label;
      if(isElementInteractable(checkbox)) return checkbox;
    }
    if(searchScope && typeof searchScope.querySelectorAll==='function'){
      const clickable=qa('button, [role="button"], label',searchScope).find(isElementInteractable);
      if(clickable) return clickable;
    }
    if(searchScope!==root && isElementInteractable(root)) return root;
    return isElementInteractable(root)?root:null;
  }
  async function solveCloudflareCaptcha({ validate } = {}){
    const hasValidator=typeof validate==='function';
    const isValidated=async()=>{
      if(!hasValidator) return false;
      try{ return !!(await validate()); }
      catch(err){ log('[solveCloudflareCaptcha] validate failed', err); return false; }
    };
    const getTurnstileInputs=()=>qa('input[name="cf-turnstile-response"]');
    const readTurnstileToken=()=>{
      for(const input of getTurnstileInputs()){
        const value=(input.value||'').trim();
        if(value) return value;
      }
      return '';
    };
    const hasToken=async()=>{
      if(readTurnstileToken()) return true;
      return await isValidated();
    };

      const patchKeyboardEventProps=(event,value)=>{
      if(!event || typeof value!=='number') return;
      try{
        if(event.keyCode!==value){
          Object.defineProperty(event,'keyCode',{value,configurable:true});
        }
      }catch(err){
        try{ event.keyCode=value; }catch(err2){}
      }
      try{
        if(event.which!==value){
          Object.defineProperty(event,'which',{value,configurable:true});
        }
      }catch(err){
        try{ event.which=value; }catch(err2){}
      }
    };

    const dispatchEventSafely=(el,type,Ctor,init,patchKeyCode)=>{
      if(!el || typeof Ctor!=='function') return false;
      let event;
      try{
        event=new Ctor(type,init);
      }catch(err){
        log(`[solveCloudflareCaptcha] ${type} constructor failed`, err);
        return false;
      }
      if(patchKeyCode && init && typeof init.keyCode==='number'){
        patchKeyboardEventProps(event, init.keyCode);
      }
      try{
        el.dispatchEvent(event);
        return true;
      }catch(err){
        log(`[solveCloudflareCaptcha] ${type} dispatch failed`, err);
        return false;
      }
    };

    const getEventCoordinates=(el)=>{
      if(!el || typeof el.getBoundingClientRect!=='function'){
        return {clientX:0,clientY:0};
      }
      try{
        const rect=el.getBoundingClientRect();
        if(!rect) return {clientX:0,clientY:0};
        const clientX=rect.left+(rect.width||0)/2;
        const clientY=rect.top+(rect.height||0)/2;
        return {clientX,clientY};
      }catch(err){
        log('[solveCloudflareCaptcha] getBoundingClientRect failed', err);
        return {clientX:0,clientY:0};
      }
    };

    const triggerPointerAndMouseEvents=(el)=>{
      if(!el) return false;
      const doc=el.ownerDocument||document;
      const view=doc?.defaultView||window;
      const coords=getEventCoordinates(el);
      const pointerBase={
        bubbles:true,
        cancelable:true,
        button:0,
        buttons:1,
        clientX:coords.clientX,
        clientY:coords.clientY,
        pointerId:1,
        pointerType:'mouse',
        isPrimary:true,
        view
      };
      const mouseBase={
        bubbles:true,
        cancelable:true,
        button:0,
        buttons:1,
        clientX:coords.clientX,
        clientY:coords.clientY,
        view
      };
      let dispatched=false;
      if(dispatchEventSafely(el,'pointerdown',view?.PointerEvent,{...pointerBase})){
        dispatched=true;
      }
      if(dispatchEventSafely(el,'mousedown',view?.MouseEvent,{...mouseBase})){
        dispatched=true;
      }
      if(dispatchEventSafely(el,'pointerup',view?.PointerEvent,{...pointerBase,buttons:0})){
        dispatched=true;
      }
      if(dispatchEventSafely(el,'mouseup',view?.MouseEvent,{...mouseBase,buttons:0})){
        dispatched=true;
      }
      if(dispatchEventSafely(el,'click',view?.MouseEvent,{...mouseBase,buttons:0})){
        dispatched=true;
      }
      return dispatched;
    };

    const getAssociatedControl=(el)=>{
      if(!el) return null;
      if(typeof el.matches==='function' && el.matches('input[type="checkbox"], input[type="radio"]')){
        return el;
      }
      const control=el.control;
      if(control) return control;
      const doc=el.ownerDocument||document;
      if(typeof el.getAttribute==='function'){
        const forId=el.getAttribute('for')||el.htmlFor;
        if(forId && doc?.getElementById){
          const forEl=doc.getElementById(forId);
          if(forEl) return forEl;
        }
      }
      if(typeof el.querySelector==='function'){
        const input=el.querySelector('input[type="checkbox"], input[type="radio"]');
        if(input) return input;
      }
      return null;
    };

    const triggerSpaceKey=(el)=>{
      if(!el) return false;
      const doc=el.ownerDocument||document;
      const view=doc?.defaultView||window;
      const keyboardCtor=view?.KeyboardEvent;
      const keyInit={key:' ',code:'Space',keyCode:32,which:32,bubbles:true,cancelable:true};
      let used=false;
      if(dispatchEventSafely(el,'keydown',keyboardCtor,keyInit,true)){
        used=true;
      }
      if(dispatchEventSafely(el,'keypress',keyboardCtor,keyInit,true)){
        used=true;
      }
      if(dispatchEventSafely(el,'keyup',keyboardCtor,{...keyInit},true)){
        used=true;
      }
      return used;
    };

    const automateClick=(el)=>{
      if(!el) return false;
      if(typeof el.isConnected==='boolean' && !el.isConnected) return false;
      try{
        const doc=el.ownerDocument||document;
        const activeEl=doc?.activeElement && doc.activeElement!==doc.body ? doc.activeElement : null;
        const pointerResult=triggerPointerAndMouseEvents(el);
        const keyboardTarget=activeEl || getAssociatedControl(el) || el;
        const keyboardResult=triggerSpaceKey(keyboardTarget);
        return pointerResult || keyboardResult;
      }catch(err){
        log('[solveCloudflareCaptcha] automateClick failed', err);
        return false;
      }
    };

    let manualPromptShown=false;
    const ensureManualPrompt=(status)=>{
      if(!manualPromptShown){
        showTurnstilePrompt('Cloudflare challenge detected — please click the Turnstile checkbox manually.', status);
        manualPromptShown=true;
      }else{
        updateTurnstilePromptStatus(status);
      }
    };

    if(await hasToken()) return true;

    let root=findCloudflareChallengeRoot();
    if(!root){
      return getTurnstileInputs().length===0;
    }

    const attempts=3;
    let solved=false;
    let automatedAttempted=false;
      try{
      for(let attempt=0; attempt<attempts && !solved; attempt++){
        const statusText=`Waiting for Turnstile token (${attempt+1}/${attempts})…`;
        updateTurnstilePromptStatus(statusText);
        root=findCloudflareChallengeRoot();
        if(!root){
          await sleep(400+Math.random()*200);
          solved=await hasToken();
          continue;
        }
        let target=getCloudflareInteractiveElement(root);
        const scrollTarget=target||root;
        try{ scrollTarget?.scrollIntoView?.({block:'center',behavior:'smooth'}); }
        catch(e){ log('[solveCloudflareCaptcha] scrollIntoView failed', e); }

        let focusCandidate=scrollTarget;
        let focusCtrl=createFocusController(focusCandidate);
        focusCtrl.ensure();
        let lastInteracted=null;

        const interactIfNeeded=(candidate)=>{
          if(!candidate) return false;
          if(typeof candidate.isConnected==='boolean' && !candidate.isConnected) return false;
          if(lastInteracted===candidate) return false;
          automatedAttempted=true;
          focusCtrl.ensure();
          const interacted=automateClick(candidate);
          if(interacted){
            lastInteracted=candidate;
          }
          return interacted;
        };

        interactIfNeeded(target||focusCandidate);

        const attemptDeadline=NOW()+20000+attempt*5000;
        try{
          while(NOW()<attemptDeadline){
            await sleep(400+Math.random()*200);
            solved=await hasToken();
            if(solved) break;
            const nextRoot=findCloudflareChallengeRoot();
            if(!nextRoot){
              solved=await hasToken();
              if(solved) break;
              continue;
            }
            root=nextRoot;
            target=getCloudflareInteractiveElement(root);
            const nextCandidate=target||root;
            const disconnected=focusCandidate && typeof focusCandidate.isConnected==='boolean' && !focusCandidate.isConnected;
            if(nextCandidate!==focusCandidate || disconnected){
              focusCtrl.cleanup();
              focusCandidate=nextCandidate;
              focusCtrl=createFocusController(focusCandidate);
            }
            focusCtrl.ensure();
            interactIfNeeded(target||focusCandidate);
          }
        } finally {
          focusCtrl.cleanup();
        }
      }

      if(!solved){
        solved=await hasToken();
      }
      if(!solved){
        const fallbackStatus=automatedAttempted
          ? `Automatic click attempts failed after ${attempts} tries — waiting for manual verification.`
          : 'Waiting for Turnstile token — manual verification may be required.';
        ensureManualPrompt(fallbackStatus);
      }
      if(solved){
        updateTurnstilePromptStatus('Turnstile token detected.');
      }
      return solved;
    } finally {
      hideTurnstilePrompt();
    }
  }

  function hasCloudflareCaptcha(){
    return findCloudflareChallengeRoot();
  }

  async function autoLogin(){
    if(loginAttempted) return;
    loginAttempted=true;
    const blocked = await get(STORE_LOGIN_BLOCKED,false);
    if(blocked){
      if (DEBUG) console.warn('autoLogin: blocked after repeated failures');
      return;
    }
    const blockUntil = await get(STORE_LOGIN_REFUSED,0);
    const remaining = blockUntil - NOW();
    if(remaining>0){
      if (DEBUG) console.warn('autoLogin: login recently refused');
      clearTimeout(loginReloadTimeout);
      loginReloadTimeout=setTimeout(()=>location.reload(),remaining);
      return;
    }
    if(loginReloadTimeout){ clearTimeout(loginReloadTimeout); loginReloadTimeout=null; }
    let cfRoot = hasCloudflareCaptcha();
    let cfRetries = await get(STORE_CF_RETRIES,0);
    if(cfRoot && cfRetries>=3){
      console.warn('autoLogin: Cloudflare challenge limit reached');
      return;
    }
    if(cfRoot){
      const solved = await solveCloudflareCaptcha();
      if(!solved){
        cfRetries += 1;
        await set(STORE_CF_RETRIES,cfRetries);
        if(cfRetries>=3){
          console.warn('autoLogin: Cloudflare challenge limit reached');
          return;
        }
        await dwell();
        clearTimeout(loginReloadTimeout);
        loginReloadTimeout=setTimeout(()=>location.reload(),0);
        return;
      }
      cfRoot = hasCloudflareCaptcha();
    }
    if(!cfRoot){
      await set(STORE_CF_RETRIES,0);
    }
    const cfg = Object.assign({}, DEFAULTS, await loadConf());
    const account = cfg.accounts?.[cfg.accountIdx];
    if(!account) return;
    const pseudoEl = q('input[name="login_pseudo"]');
    const passEl = q('input[name="login_password"]');
    if(!pseudoEl || !passEl) return;
    if(pseudoEl.value !== account.user || passEl.value !== account.pass){
      setValue(pseudoEl, '');
      setValue(passEl, '');
      await dwell(2000, 3000);
      await typeHuman(pseudoEl, account.user);
      await typeHuman(passEl, account.pass);
    }
      if(pseudoEl.value !== account.user || passEl.value !== account.pass){
        if (DEBUG) console.warn('autoLogin: credential fill mismatch; forcing values');
        setValue(pseudoEl, account.user);
        setValue(passEl, account.pass);
      }
    const form = pseudoEl.closest('form') || passEl.closest('form');
    if(!form){
      if (DEBUG) console.warn('autoLogin: form not found');
      return;
    }
    await dwell();
    const btn = form.querySelector('button[type="submit"], input[type="submit"]');
    try{
      await humanHover(btn || form);
      if(btn){
        btn.click();
      }else if(form.requestSubmit){
        form.requestSubmit();
      }else{
        if (DEBUG) console.warn('autoLogin: no submission mechanism found');
      }
      const deadline = NOW() + 15000;
      let sandboxCount = 0;
      let sandboxSeen = 0;
      while(NOW() < deadline && /login/i.test(location.pathname)){
        await sleep(250);
        const cf=q('#cf-challenge, .cf-turnstile');
        const currentSandbox=qa('iframe[sandbox]').length;
        if(!cf && currentSandbox > sandboxCount){
          sandboxCount = currentSandbox;
          sandboxSeen++;
          if(sandboxSeen >= 3){
            clearTimeout(loginReloadTimeout);
            loginReloadTimeout=null;
            alert('autoLogin: Cloudflare challenge impossible, intervention requise');
            if (DEBUG) console.warn('autoLogin: Cloudflare challenge limit reached');
            return;
          }
        }
        if(cf){
          const retries = await get(STORE_CF_RETRIES,0);
          if(retries>=3){
            console.warn('autoLogin: Cloudflare challenge limit reached');
          }else{
            await set(STORE_CF_RETRIES,retries+1);
            await dwell();
            clearTimeout(loginReloadTimeout);
            loginReloadTimeout=setTimeout(()=>location.reload(),0);
          }
          return;
        }
        const errEl=q('.alert--error, .alert.alert-danger, .msg-error, .alert-warning');
        if(errEl && /(?:Votre tentative de connexion a été refusée|Your login attempt was refused)/i.test(errEl.textContent)){
          const attempts=(await get(STORE_LOGIN_ATTEMPTS,0))+1;
          await set(STORE_LOGIN_ATTEMPTS,attempts);
          if(attempts>=2){
            await set(STORE_LOGIN_BLOCKED,true);
            await set(STORE_LOGIN_REFUSED,0);
            clearTimeout(loginReloadTimeout);
            if (DEBUG) console.warn('autoLogin: login refused, blocking auto retries');
            return;
          }
          const delay=rnd(10*60*1000,11*60*1000);
          await set(STORE_LOGIN_REFUSED,NOW()+delay);
          clearTimeout(loginReloadTimeout);
          loginReloadTimeout=setTimeout(()=>location.reload(),delay);
          if (DEBUG) console.warn('autoLogin: login refused, delaying retry');
          return;
        }
      }
      const errEl=q('.alert--error, .alert.alert-danger, .msg-error, .alert-warning');
      if(errEl && /(?:Votre tentative de connexion a été refusée|Your login attempt was refused)/i.test(errEl.textContent)){
        const attempts=(await get(STORE_LOGIN_ATTEMPTS,0))+1;
        await set(STORE_LOGIN_ATTEMPTS,attempts);
        if(attempts>=2){
          await set(STORE_LOGIN_BLOCKED,true);
          await set(STORE_LOGIN_REFUSED,0);
          clearTimeout(loginReloadTimeout);
          if (DEBUG) console.warn('autoLogin: login refused, blocking auto retries');
          return;
        }
        const delay=rnd(10*60*1000,11*60*1000);
        await set(STORE_LOGIN_REFUSED,NOW()+delay);
        clearTimeout(loginReloadTimeout);
        loginReloadTimeout=setTimeout(()=>location.reload(),delay);
        if (DEBUG) console.warn('autoLogin: login refused, delaying retry');
        return;
      }
      if(/login/i.test(location.pathname) && !errEl){
        const attempts=(await get(STORE_LOGIN_ATTEMPTS,0))+1;
        await set(STORE_LOGIN_ATTEMPTS,attempts);
        const delay=attempts===1 ? rnd(10*60*1000,11*60*1000) : rnd(5*60*1000,6*60*1000);
        await set(STORE_LOGIN_REFUSED,NOW()+delay);
        clearTimeout(loginReloadTimeout);
        loginReloadTimeout=setTimeout(()=>location.reload(),delay);
        if (DEBUG) console.warn('autoLogin: login page unchanged, delaying retries');
        return;
      }
      await set(STORE_LOGIN_ATTEMPTS,0);
      await set(STORE_LOGIN_BLOCKED,false);
      await set(STORE_LOGIN_REFUSED,0);
      loginAttempted=false;
    }
    catch(err){
      log('autoLogin: submission failed', err);
    }
  }

  if(typeof window !== 'undefined') window.autoLogin = autoLogin;

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
  log(`Username not found${hasSession ? ' — session detected' : ' — no session detected'}.`);
  return '';
  }
  /* ---------- message templates ---------- */
  const TITLE_TEMPLATES = [
    "Besoin d'aide URGENT","HELP : besoin d'aide","Full RSA besoin d'aide",
    "Aidez moi svp","Besoin d’aide FULL RSA","RSA je meurs","Survivre au RSA", "GRATTONS"
  ];
  const TEXT_TEMPLATES = [`MODE SURVIE https://image.noelshack.com/fichiers/2016/36/1473263957-risitas33.png
tqt c'est vraiment connu demande à chatgpt https://image.noelshack.com/fichiers/2016/48/1480465536-1475531584-risitascomplot.png
J’ai trouvé un "glitch" 100% LEGAL pour GRATTER de l’argent sur tous les sites https://image.noelshack.com/fichiers/2016/38/1474723937-tv9.png

+1000€ économisés depuis que je l'utilise :d) https://www.noelshack.com/2025-34-5-1755868565-82fef769add4fa83b41483178426ef5c.png

IGRAAAAAAAAAAL https://image.noelshack.com/fichiers/2021/43/4/1635454847-elton-john-tison-golem.png

Quand tu commandes :d) IGRAAL te redirige vers la boutique (amazon, aliexpress, uber eats, sfr, etc)

Le site file une com à IGRAAL pour t’avoir amené comme client :d) IGRAAL te reverse une partie https://image.noelshack.com/minis/2016/52/1483054124-risitas.png

3€ à GRATTER lors de l'inscription :d) https://fr.igraal.com/parrainage?parrain=AG_5ddf42495f191

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
    catch(e){ log('[getInfoFromHref]', e); return {forumId:null, topicId:null, page:NaN}; }
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
    }catch(e){ log('[normalizeListToPageOne]', e); return pickListWeighted(); }
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
        catch(e){ log('[findMaxPageLinkForCurrentTopic] URL parse', e); }
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
      if(bannedRecipients.has(p)){ log(`skip banned ${p}`); continue; }
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
  const bannedRecipients = new Set();
  const hasCF = ()=> hasCloudflareCaptcha();
  const cfToken = ()=> (q('input[name="cf-turnstile-response"]')?.value||'').trim();
  function getErrorText(){
    const nodes = qa('.alert--error, .alert.alert-danger, .msg-error, .alert-warning, .alert.alert-warning, .txt-msg-error, .flash-error');
    let text=''; for (const n of nodes) text += ' ' + (n.textContent||'');
    return text.toLowerCase();
  }
  function isAliasBanned(){ return /alias\s+est\s+banni/i.test(getErrorText()); }
  function isBannedError(){ return /banni|banned|utilisateur\s+.*banni|vous ne pouvez pas envoyer/i.test(getErrorText()); }
  function hasVisibleError(){ return !!q('.alert--error, .alert.alert-danger, .msg-error, .alert-warning, .alert.alert-warning'); }

  const SEND_SELECTOR = '.btn.btn-poster-msg.js-post-message, button[type="submit"]';
  function currentComposePseudo(){
    return q('#destinataires .form-control-tag .label')?.childNodes?.[0]?.nodeValue?.trim() ||
      (qa('#destinataires input[name^="participants["]').map(i=>i.value)[0]??'') || '';
  }
  function evaluateBanned(pseudo){
    if (isAliasBanned()) {
      log('Recipient banned – back to topic list.');
      if(pseudo) bannedRecipients.add(pseudo);
      return { ok:false, pseudo, reason:'banned' };
    }
    if (isBannedError()){
      log('Recipient banned → back to list.');
      return { ok:false, pseudo, reason:'banned' };
    }
    return null;
  }
  async function submitComposeAttempt(pseudo){
    const btn = q(SEND_SELECTOR);
    if(btn) btn.click();
    else log('Send button not found on compose page.');
    await sleep(1200);
    const bannedResult = evaluateBanned(pseudo);
    if(bannedResult) return { banned: bannedResult };
    return {
      banned: null,
      challenge: hasCF(),
      token: cfToken(),
      hasError: hasVisibleError()
    };
  }
  let captchaBannerEl = null;
  function ensureCaptchaBanner(){
    if(captchaBannerEl && captchaBannerEl.isConnected) return captchaBannerEl;
    const banner=document.createElement('div');
    banner.id='jvc-dmwalker-captcha-banner';
    Object.assign(banner.style,{
      position:'fixed',top:'16px',left:'50%',transform:'translateX(-50%)',
      background:'rgba(12,14,19,0.95)',color:'#f8f8f8',padding:'10px 16px',
      borderRadius:'8px',border:'1px solid #2a6ef5',boxShadow:'0 8px 20px rgba(0,0,0,.45)',
      font:'13px/1.4 system-ui,Segoe UI,Roboto,Arial',display:'none',
      zIndex:2147483647,alignItems:'center',gap:'10px',pointerEvents:'none'
    });
    const icon=document.createElement('span');
    icon.textContent='⚠️';
    icon.style.fontSize='18px';
    const textWrap=document.createElement('div');
    Object.assign(textWrap.style,{display:'flex',flexDirection:'column',gap:'2px'});
    const title=document.createElement('strong');
    title.textContent='Captcha required';
    title.style.fontSize='13px';
    const detail=document.createElement('span');
    detail.textContent='Please solve the captcha to resume automatic sending.';
    detail.style.fontSize='12px';
    detail.style.color='#d6dcff';
    textWrap.append(title,detail);
    banner.append(icon,textWrap);
    (document.body||document.documentElement).appendChild(banner);
    captchaBannerEl=banner;
    return banner;
  }
  function showCaptchaBanner(){
    const banner=ensureCaptchaBanner();
    if(banner) banner.style.display='flex';
  }
  function hideCaptchaBanner(){
    if(captchaBannerEl) captchaBannerEl.style.display='none';
  }
  async function setPendingCaptcha(flag){
    await sessionGet();
    if(sessionCache.pendingCaptcha === flag) return;
    sessionCache.pendingCaptcha = flag;
    await set(STORE_SESSION, sessionCache);
    await updateSessionUI();
  }
  async function waitForCaptchaToken(){
    let loops=0;
    while(true){
      if(!isCompose()) return null;
      if(isAliasBanned() || isBannedError()) return null;
      const token=cfToken();
      if(token) return token;
      if(++loops % 20 === 0){
        log('Waiting for cf-turnstile-response token…');
      }
      await sleep(hasCF()?700:400);
    }
  }
  async function waitForCaptchaAndSubmit(pseudo){
    pseudo = pseudo || currentComposePseudo();
    while(true){
      const bannedBefore = evaluateBanned(pseudo);
      if(bannedBefore){
        await setPendingCaptcha(false);
        hideCaptchaBanner();
        return bannedBefore;
      }
      await setPendingCaptcha(true);
      showCaptchaBanner();
      const token = await waitForCaptchaToken();
      hideCaptchaBanner();
      if(!token){
        await setPendingCaptcha(false);
        return { ok:false, pseudo, reason:'captcha-aborted' };
      }
      await setPendingCaptcha(false);
      await dwell(250,600);
      const attempt = await submitComposeAttempt(pseudo);
      if(attempt.banned){
        await setPendingCaptcha(false);
        hideCaptchaBanner();
        return attempt.banned;
      }
      if(attempt.challenge && !attempt.token){
        log('Captcha still pending after submission; waiting again.');
        await setPendingCaptcha(true);
        continue;
      }
      if(attempt.hasError){
        await setPendingCaptcha(false);
        hideCaptchaBanner();
        return { ok:false, pseudo, reason:'unknown' };
      }
      hideCaptchaBanner();
      return { ok:true, pseudo };
    }
  }

  async function handleCompose(cfg){
    await sleep(150+Math.random()*250);

    const pseudo = currentComposePseudo();

    if(bannedRecipients.has(pseudo)){
      log('Recipient banned – back to topic list.');
      return { ok:false, pseudo, reason:'banned' };
    }

    const generated = buildPersonalizedMessage(pseudo);
    if(!generated){
      log('Empty message generated → skipping send.');
      await setPendingCaptcha(false);
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
    let status = await submitComposeAttempt(pseudo);
    if(status.banned) return status.banned;

    let challenge = status.challenge;
    let token = status.token;
    let hasError = status.hasError;

    if(challenge && !token){
      const solved = await solveCloudflareCaptcha({ validate: cfToken });
      if(solved){
        await dwell(400,900);
        status = await submitComposeAttempt(pseudo);
        if(status.banned) return status.banned;
        challenge = status.challenge;
        token = status.token;
        hasError = status.hasError;
      }else{
        challenge = hasCF();
        token = cfToken();
        hasError = hasVisibleError();
      }
    }

    if((challenge && !token) || hasError){
      await sleep(7000+Math.floor(Math.random()*6000));
      status = await submitComposeAttempt(pseudo);
      if(status.banned) return status.banned;
      challenge = status.challenge;
      token = status.token;
      hasError = status.hasError;
    }

    if(challenge && !token){
      log('Captcha unresolved after automated attempts — skipping target.');
      await setPendingCaptcha(false);
      return { ok:false, pseudo, reason:'captcha-missing-token' };
    }

    await setPendingCaptcha(false);

    const ok = !hasError;
    return { ok, pseudo, reason: ok?'':'unknown' };
  }

  async function handleSendSuccess(){
    await sessionGet();
    sessionCache.mpCount = (sessionCache.mpCount||0) + 1;
    sessionCache.dmSent = (sessionCache.dmSent||0) + 1;
    sessionCache.pendingDm = true;
    sessionCache.pendingCaptcha = false;
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
  }

  /* ---------- session (timer only) ---------- */
  async function sessionGet(){
    if(!sessionCacheLoaded){ sessionCache = await get(STORE_SESSION,sessionCache); sessionCacheLoaded = true; }
    if(typeof sessionCache.pendingCaptcha !== 'boolean') sessionCache.pendingCaptcha = false;
    return sessionCache;
  }
  async function sessionStart(){
    await sessionGet();
        if(!myPseudo()){
      log('Username not found — session not started.');
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
    if(typeof sessionCache.pendingCaptcha !== 'boolean') sessionCache.pendingCaptcha = false;
    await set(STORE_SESSION, sessionCache);
    startTimerUpdater();
  }
  async function sessionStop(){
    await sessionGet(); sessionCache.active=false; sessionCache.stopTs=NOW(); sessionCache.pendingCaptcha=false; await set(STORE_SESSION,sessionCache);
    clearInterval(timerHandle); timerHandle=null;
    await updateSessionUI().catch(log);
    hideCaptchaBanner();
  }

  async function switchToNextAccount(reason){
    await ensureDefaults();
    const cfg = Object.assign({}, DEFAULTS, await loadConf());
    if(!Array.isArray(cfg.accounts) || cfg.accounts.length===0){
      log('[switchToNextAccount] no accounts configured');
      log('No accounts configured — nothing to switch.');
      return;
    }
    const avatar = q('.headerAccount__link');
    if(!avatar) return;
    await humanHover(avatar);
    avatar.click();
    await dwell(400,800);
    const logoutLink = q('.headerAccount__dropdownContainerBottom .headerAccount__button:last-child');
    if(!logoutLink){
      log('[switchToNextAccount] logout link not found');
      log('Logout link not found — aborting rotation.');
      return;
    }
    const current = (cfg.accountIdx || 0) % cfg.accounts.length;
    const next = (current + 1) % cfg.accounts.length;
    log(`[DM_WALKER] ${reason} → switching account from #${current} to #${next}`);
    const currAcc = cfg.accounts[current];
    if(currAcc?.user){
      await set(`jvc_postwalker_cd_${currAcc.user}`, NOW());
    }
    cfg.accountIdx = next;
    await saveConf(cfg);
    try { await sessionGet(); }
    catch (e) { log('sessionGet failed', e); }
    sessionCache.mpCount = 0;
    sessionCache.mpNextDelay = Math.floor(rnd(2,5));
    sessionCache.dmSent = 0;
    sessionCache.pendingDm = false;
    sessionCache.pendingCaptcha = false;
    sessionCache.cooldownUntil = 0;
    await set(STORE_SESSION, sessionCache);
    await updateSessionUI().catch(log);
    await set(STORE_PENDING_LOGIN,true);
    await humanHover(logoutLink);
    await dwell();
    logoutLink.click();
    await new Promise(res=>{
      const check=()=>{ if(/\/login/i.test(location.pathname)) res(); else setTimeout(check,200); };
      check();
    });
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
      const slots = (c.activeSlots && c.activeSlots.length)
        ? c.activeSlots
        : normalizeSlots([{start:c.activeHours[0]*60,end:c.activeHours[1]*60}]);
      const badge = q('#jvc-dmwalker-badge');
      if(badge){
        if(onCache){
          if(isNowInSlots(slots)){
            badge.textContent = 'Active';
          }else{
            const ms = msUntilNextBoundary(slots);
            const next = new Date(Date.now()+ms);
            badge.textContent = `Snoozed ${pad2(next.getHours())}:${pad2(next.getMinutes())}`;
          }
        }else{
          badge.textContent = 'MW';
        }
      }
      const accSel = q('#jvc-dmwalker-account-select');
      if(accSel) accSel.value = String(c.accountIdx||0);
    } finally {
      updating = false;
    }
  }
  let timerHandle=null;
  let updating=false;
  let ticking = false;
  function startTimerUpdater(){ if(timerHandle) clearInterval(timerHandle); timerHandle=setInterval(()=>{updateSessionUI().catch(log);},1000); updateSessionUI().catch(log); }

  function pad2(n){ return String(n).padStart(2,'0'); }
  function hmToMin(hm){
    if(typeof hm === 'number') return hm;
    const [h,m] = String(hm).split(':').map(Number);
    return h*60 + (m||0);
  }
  function minToHM(min){
    const h = Math.floor(min/60)%24;
    const m = min%60;
    return `${pad2(h)}:${pad2(m)}`;
  }
  function normalizeSlots(slots){
    if(!Array.isArray(slots)) return [];
    const tmp=[];
    for(const s of slots){
      let start,end;
      if(Array.isArray(s)){ [start,end]=s; }
      else if(s && typeof s==='object'){ start=s.start; end=s.end; }
      if(start===undefined || end===undefined) continue;
      start=hmToMin(start); end=hmToMin(end);
      if(isNaN(start)||isNaN(end)) continue;
      start=(start%1440+1440)%1440; end=(end%1440+1440)%1440;
      if(end<=start){
        tmp.push({start,end:1440});
        tmp.push({start:0,end});
      }else tmp.push({start,end});
    }
    tmp.sort((a,b)=>a.start-b.start);
    const out=[];
    for(const s of tmp){
      if(!out.length) out.push({...s});
      else{
        const last=out[out.length-1];
        if(s.start<=last.end) last.end=Math.max(last.end,s.end);
        else out.push({...s});
      }
    }
    return out;
  }
  function isNowInSlots(slots){
    const norm=normalizeSlots(slots);
    const now=new Date();
    const m=now.getHours()*60+now.getMinutes();
    return norm.some(s=>m>=s.start && m<s.end);
  }
  function msUntilNextBoundary(slots){
    const norm=normalizeSlots(slots);
    if(!norm.length) return 0;
    const now=new Date();
    const m=now.getHours()*60+now.getMinutes();
    let best=1440;
    for(const s of norm){
      if(m < s.start) best=Math.min(best, s.start - m);
      else if(m>=s.start && m<s.end) best=Math.min(best, s.end - m);
      else best=Math.min(best, s.start + 1440 - m);
    }
    return best*60*1000;
  }

  /* ---------- scheduler ---------- */
  async function tickSoon(ms=300){
    const cfg = Object.assign({}, DEFAULTS, await loadConf());
    let slots = cfg.activeSlots && cfg.activeSlots.length ? cfg.activeSlots : normalizeSlots([{start:cfg.activeHours[0]*60,end:cfg.activeHours[1]*60}]);
    if(!slots.length){ setTimeout(()=>{ tick().catch(log); }, ms); return; }
    if(!isNowInSlots(slots)){
      await sessionStop();
      const delay = msUntilNextBoundary(slots);
      setTimeout(()=>{ tickSoon(ms).catch(log); }, delay);
      return;
    }
    await sessionStart();
    setTimeout(()=>{ tick().catch(log); }, ms);
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
      await sessionGet();
      hideCaptchaBanner();
      let composeResult=null;
      if(sessionCache.pendingCaptcha){
        const pendingToken = cfToken();
        const hasPendingChallenge = hasCF();
        if(!hasPendingChallenge && !pendingToken){
          log('Pending captcha flag without Turnstile challenge/token → clearing.');
          await setPendingCaptcha(false);
          composeResult = { ok:false, pseudo: currentComposePseudo(), reason:'captcha-missing-token' };
        }else{
          log('Compose pending captcha → waiting for manual resolution.');
          composeResult = await waitForCaptchaAndSubmit(currentComposePseudo());
        }
      }else{
        log('Compose detected → sending…');
        const res=await handleCompose(cfg);
        if(res.reason === 'banned'){
          const back = normalizeListToPageOne(await get(STORE_LAST_LIST,'') || pickListWeighted());
          await dwell(200,500);
          hideCaptchaBanner();
          location.href = back;
          tickSoon(300);
          return;
        }
        if(res.reason === 'captcha'){
          log('Captcha challenge detected — awaiting manual completion.');
          composeResult = await waitForCaptchaAndSubmit(res.pseudo);
        }else{
          composeResult = res;
        }
      }

      if(composeResult && composeResult.reason === 'banned'){
        hideCaptchaBanner();
        const back = normalizeListToPageOne(await get(STORE_LAST_LIST,'') || pickListWeighted());
        await dwell(200,500);
        location.href = back;
        tickSoon(300);
        return;
      }

      if(composeResult && composeResult.ok){
        log('MP sent.');
        await handleSendSuccess();
      }else{
        await setPendingCaptcha(false);
        const reasonTxt = (composeResult && composeResult.reason) ? ` (${composeResult.reason})` : '';
        log(`Send failed / skipped${reasonTxt}.`);
      }

              hideCaptchaBanner();
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
      await readingScroll();
      const pseudo=await pickRandomEligiblePseudo(cfg, 6000);
      if(!pseudo){
        log('No eligible user (cooldown/blacklist). Back to list.');
        let back = await get(STORE_LAST_LIST, '') || pickListWeighted();
        back = normalizeListToPageOne(back);
        await dwell(200,600);
        location.href = back;
        tickSoon(300);
        return;
      }

      log(`Chosen random target → ${pseudo}`);
      await dwell(400,1200);
      try{
        const msg=q('.bloc-message-forum');
        if(msg) await humanHover(msg);
        else window.scrollBy({top:rnd(-120,120),behavior:'smooth'});
      }catch(e){ log('[nav mimic]', e); }
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
      try{ abs=new URL(href,ORIG).href; info=getInfoFromHref(abs); }catch(e){ log('[collectTopicLinks] URL parse', e); continue; }
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
    const tryUI=async()=>{
      try{
        await ensureUI();
      }catch(e){
        log('[DM Walker] UI error', e);
        if(!uiRemountTimeout){
          uiRemountTimeout=setTimeout(async ()=>{
            uiRemountTimeout=null;
            await tryUI();
          },2000);
        }
      }
    };
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
      log('Username not found — start canceled.');
      return;
    }
    const startEl=q('#jvc-dmwalker-active-start');
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

    // --- Slots UI (24h pickers, no "Active slots" label) ---

    const slotsWrap = document.createElement('div');
    Object.assign(slotsWrap.style, { display: 'flex', flexDirection: 'column', gap: '4px', margin: '6px 0' });

    // NO LABEL: keep "Active slots" removed on purpose

    const slotsList = document.createElement('div');
    slotsList.id = 'jvc-dmwalker-slots-list';
    Object.assign(slotsList.style, { display: 'flex', flexDirection: 'column', gap: '4px' });

    // Build a 24h time picker (HH:MM) with two <select>, no locale issues
    function createTimePicker(initialHM) {
      const wrap = document.createElement('div');
      Object.assign(wrap.style, { display: 'inline-flex', gap: '4px', alignItems: 'center' });

      const selH = document.createElement('select');
      const selM = document.createElement('select');
      Object.assign(selH.style, { flex: '1', background: '#0b0d12', color: '#eee', border: '1px solid #222', borderRadius: '4px' });
      Object.assign(selM.style, { flex: '1', background: '#0b0d12', color: '#eee', border: '1px solid #222', borderRadius: '4px' });

      for (let h = 0; h < 24; h++) {
        const o = document.createElement('option');
        o.value = pad2(h); o.textContent = pad2(h);
        selH.appendChild(o);
      }
      for (let m = 0; m < 60; m++) {
        const o = document.createElement('option');
        o.value = pad2(m); o.textContent = pad2(m);
        selM.appendChild(o);
      }

      let mins = hmToMin(initialHM || '01:00'); // uses existing hmToMin from the script
      if (Number.isNaN(mins)) mins = hmToMin('01:00');
      selH.value = pad2(Math.floor(mins / 60));
      selM.value = pad2(mins % 60);

      wrap.append(selH, document.createTextNode(':'), selM);

      return {
        el: wrap,
        get() { return `${selH.value}:${selM.value}`; },
        set(v) {
          const t = hmToMin(v);
          if (!Number.isNaN(t)) {
            selH.value = pad2(Math.floor(t / 60));
            selM.value = pad2(t % 60);
          }
        }
      };
    }

    function addSlotRow(start = '08:00', end = '23:00') {
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px' });

      const startPicker = createTimePicker(start);
      const endPicker = createTimePicker(end);

      const del = document.createElement('button');
      del.textContent = 'Del';
      Object.assign(del.style, { background: '#8a2020', border: '0', color: '#fff', padding: '1px 4px', borderRadius: '4px', cursor: 'pointer' });
      del.addEventListener('click', () => row.remove());

      // expose a getter for Save
      row._get = () => ({ start: startPicker.get(), end: endPicker.get() });

      row.append(startPicker.el, document.createTextNode('—'), endPicker.el, del);
      slotsList.appendChild(row);
    }

    function renderSlots() {
      slotsList.innerHTML = '';
      const base = (conf.activeSlots && conf.activeSlots.length)
        ? conf.activeSlots
        : normalizeSlots([{ start: conf.activeHours[0] * 60, end: conf.activeHours[1] * 60 }]);
      if (base.length) {
        base.forEach(sl => addSlotRow(minToHM(sl.start), minToHM(sl.end)));
      } else {
        addSlotRow();
      }
    }

    renderSlots();

    const addSlotBtn = document.createElement('button');
    addSlotBtn.textContent = 'Add';
    Object.assign(addSlotBtn.style, { background: '#2a6ef5', border: '0', color: '#fff', padding: '2px 6px', borderRadius: '6px', cursor: 'pointer' });
    addSlotBtn.addEventListener('click', () => addSlotRow());

    const saveSlotBtn = document.createElement('button');
    saveSlotBtn.textContent = 'Save';
    Object.assign(saveSlotBtn.style, { background: '#2a6ef5', border: '0', color: '#fff', padding: '2px 6px', borderRadius: '6px', cursor: 'pointer' });
    saveSlotBtn.addEventListener('click', async () => {
      const rows = qa('#jvc-dmwalker-slots-list > div');
      const raw = rows.map(r => r._get ? r._get() : { start: '08:00', end: '23:00' });
      const norm = normalizeSlots(raw);
      conf.activeSlots = norm;
      if (norm.length) {
        conf.activeHours = [ Math.floor(norm[0].start / 60), Math.floor(norm[0].end / 60) ];
      }
      await saveConf(conf);
      renderSlots();
      await updateSessionUI();
    });

    const resetSlotBtn = document.createElement('button');
    resetSlotBtn.textContent = 'Reset';
    Object.assign(resetSlotBtn.style, { background: '#333', border: '1px solid #555', color: '#bbb', padding: '2px 6px', borderRadius: '6px', cursor: 'pointer' });
    resetSlotBtn.addEventListener('click', () => renderSlots());

    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, { display: 'flex', gap: '4px' });
    btnRow.append(addSlotBtn, saveSlotBtn, resetSlotBtn);

    // Append the rebuilt 24h-only UI (still no "Active slots" label)
    slotsWrap.append(slotsList, btnRow);

    const accountWrap=document.createElement('div');
    Object.assign(accountWrap.style,{display:'flex',alignItems:'center',gap:'4px',margin:'6px 0'});
    const accountLabel=document.createElement('span');
    accountLabel.textContent='Account';
    const accountSelect=document.createElement('select');
    accountSelect.id='jvc-dmwalker-account-select';
    Object.assign(accountSelect.style,{flex:'1',background:'#0b0d12',color:'#eee',border:'1px solid #222',borderRadius:'4px'});
    (conf.accounts||[]).forEach((acc,i)=>{
      const opt=document.createElement('option');
      opt.value=String(i);
      opt.textContent=acc.user;
      accountSelect.appendChild(opt);
    });
    accountSelect.value=String(conf.accountIdx||0);
    accountSelect.addEventListener('change', async ()=>{
      const idx=parseInt(accountSelect.value,10)||0;
      conf.accountIdx = idx;
      const c=Object.assign({}, DEFAULTS, await loadConf());
      c.accountIdx=idx;
      await saveConf(c);
      await updateSessionUI();
    });
    const addAccBtn=document.createElement('button');
    addAccBtn.textContent='Add account';
    addAccBtn.title='Add or edit accounts';
    Object.assign(addAccBtn.style,{background:'#2a6ef5',border:'0',color:'#fff',padding:'2px 6px',borderRadius:'6px',cursor:'pointer'});
    accountWrap.append(accountLabel,accountSelect,addAccBtn);

    const accountMgr=document.createElement('div');
    Object.assign(accountMgr.style,{display:'none',flexDirection:'column',gap:'4px',margin:'4px 0',padding:'4px',background:'#0b0d12',border:'1px solid #222',borderRadius:'8px'});
    const accList=document.createElement('div');
    Object.assign(accList.style,{display:'flex',flexDirection:'column',gap:'2px',maxHeight:'70px',overflowY:'auto'});
    const form=document.createElement('div');
    Object.assign(form.style,{display:'flex',gap:'4px'});
    const userInput=document.createElement('input');
    userInput.placeholder='username';
    Object.assign(userInput.style,{flex:'1',background:'#0b0d12',color:'#eee',border:'1px solid #222',borderRadius:'4px'});
    const passInput=document.createElement('input');
    passInput.type='password';
    passInput.placeholder='password';
    Object.assign(passInput.style,{flex:'1',background:'#0b0d12',color:'#eee',border:'1px solid #222',borderRadius:'4px'});
    const saveAccBtn=document.createElement('button');
    saveAccBtn.textContent='Save';
    saveAccBtn.title='Click Save or press Enter to confirm';
    Object.assign(saveAccBtn.style,{background:'#2a6ef5',border:'0',color:'#fff',padding:'2px 6px',borderRadius:'6px',cursor:'pointer'});
    const handleEnterToSave = e => { if(e.key==='Enter'){ e.preventDefault(); saveAccBtn.click(); } };
    userInput.addEventListener('keydown', handleEnterToSave);
    passInput.addEventListener('keydown', handleEnterToSave);
    form.append(userInput,passInput,saveAccBtn);
    accountMgr.append(accList,form);
    let editIdx=-1;
    function refreshAccountSelect(){
      accountSelect.innerHTML='';
      (conf.accounts||[]).forEach((acc,i)=>{
        const opt=document.createElement('option');
        opt.value=String(i);
        opt.textContent=acc.user;
        accountSelect.appendChild(opt);
      });
      if(conf.accountIdx>=conf.accounts.length) conf.accountIdx=0;
      accountSelect.value=String(conf.accountIdx||0);
    }
    function populateAccList(){
      accList.innerHTML='';
      (conf.accounts||[]).forEach((acc,i)=>{
        const row=document.createElement('div');
        Object.assign(row.style,{display:'flex',alignItems:'center',gap:'4px'});
        const name=document.createElement('span');
        name.textContent=acc.user;
        Object.assign(name.style,{flex:'1'});
        const editBtn=document.createElement('button');
        editBtn.textContent='Edit';
        Object.assign(editBtn.style,{background:'#555',border:'0',color:'#fff',padding:'1px 4px',borderRadius:'4px',cursor:'pointer'});
        editBtn.addEventListener('click',()=>{ userInput.value=acc.user; passInput.value=acc.pass||''; editIdx=i; });
        const delBtn=document.createElement('button');
        delBtn.textContent='Del';
        Object.assign(delBtn.style,{background:'#8a2020',border:'0',color:'#fff',padding:'1px 4px',borderRadius:'4px',cursor:'pointer'});
        delBtn.addEventListener('click',async ()=>{
          conf.accounts.splice(i,1);
          if(conf.accountIdx>=conf.accounts.length) conf.accountIdx=0;
          await saveConf(conf);
          refreshAccountSelect();
          populateAccList();
          await updateSessionUI();
        });
        row.append(name,editBtn,delBtn);
        accList.appendChild(row);
      });
    }
    addAccBtn.addEventListener('click',()=>{
      accountMgr.style.display=accountMgr.style.display==='none'?'flex':'none';
      if(accountMgr.style.display!=='none'){ populateAccList(); log('Enter username and password then Save. Click Edit to modify or Del to remove.'); }
    });
    saveAccBtn.addEventListener('click',async ()=>{
      const u=userInput.value.trim(), p=passInput.value;
      if(!u){ log('User required.'); return; }
      if(conf.accounts.some(a=>a.user===u && editIdx===-1)){
        log('Account already exists.');
        const existingIdx = conf.accounts.findIndex(a=>a.user===u);
        if(existingIdx!==-1){
          const row = accList.children[existingIdx];
          if(row){ row.style.outline='1px solid #2a6ef5'; row.scrollIntoView({block:'center'}); setTimeout(()=>row.style.outline='',1000); }
          userInput.value = conf.accounts[existingIdx].user;
          passInput.value = conf.accounts[existingIdx].pass || '';
          editIdx = existingIdx;
        }
        return;
      }
      if(editIdx>=0) conf.accounts[editIdx]=p?{user:u,pass:p}:{user:u};
      else conf.accounts.push(p?{user:u,pass:p}:{user:u});
      editIdx=-1;
      userInput.value=''; passInput.value='';
      await saveConf(conf);
      refreshAccountSelect();
      populateAccList();
      await updateSessionUI();
      log('Account saved');
    });

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

      box.append(header,actions,slotsWrap,accountWrap,accountMgr,chronoWrap);
      if(DEBUG){
      const log=document.createElement('div');
        log.id='jvc-dmwalker-log';
        Object.assign(log.style,{
          marginTop:'2px',color:'#9ecbff',lineHeight:'1.4',height:'5.6em',
          overflow:'auto',whiteSpace:'pre-wrap',background:'#0b0d12',
          border:'1px solid #222',borderRadius:'8px',padding:'6px'
        });
        logEl=log;
        box.append(log);
      }

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
            catch(e){ log('UI remount failed',e); }
          },50);
        }
      }
    });
    uiMutationObserver.observe(parent,{childList:true,subtree:false});
  }
})();
