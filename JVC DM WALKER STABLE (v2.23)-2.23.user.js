// ==UserScript==
// @name         JVC DM WALKER STABLE (v2.23)
// @namespace    https://tampermonkey.net/
// @version      2.23
// @description  Last page via max-number → true random user → 96h cooldown → MP all_dest. Compose-first, compact EN UI, forum scope (18-25 & Finance, 85/15), cooldown-left logs, human-like scroll/hover. Forum lists forced to page 1. URLs in message are pasted (not typed). UI mounting robust & private storage.
// @match        https://www.jeuxvideo.com/forums/*
// @match        https://www.jeuxvideo.com/messages-prives/nouveau.php*
// @match        https://www.jeuxvideo.com/messages-prives/message.php*
// @match        https://www.jeuxvideo.com/login*
// @run-at       document-idle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.addValueChangeListener
// @grant        GM.listValues
// @grant        GM.deleteValue
// ==/UserScript==
(async function () {
  'use strict';

const DEBUG = false;

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
    const sanitized=args.map(sanitizeForLog);
    logBuffer[logIdx++ % 200] = sanitized.join(' ');
    if(!logEl) logEl=q('#jvc-dmwalker-log');
    if(logEl){
    const idx=logIdx%200;
    const ordered=logBuffer.slice(idx).concat(logBuffer.slice(0,idx));
    logEl.textContent=ordered.filter(Boolean).join('\n');
    logEl.scrollTop=logEl.scrollHeight;
    }
    if(DEBUG) console.log(...sanitized);
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
    if(force || confCache===null){ confCache = await get(STORE_CONF,{}); }
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
let sessionCache = {active:false,startTs:0,stopTs:0,mpCount:0,mpNextDelay:Math.floor(rnd(2,5)),dmSent:0,pendingDm:false};
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

  const DEFAULTS = { me:'', cooldownH:96, activeHours:[8,23], accounts:[], accountIdx:0 };
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

  observeAndHandleDMErrors();

  function hasCloudflareCaptcha(){
    return q('#cf-challenge, .cf-turnstile, iframe[title*="Cloudflare" i]');
  }

  async function autoLogin(){
    if(loginAttempted) return;
    loginAttempted=true;
    const blocked = await get(STORE_LOGIN_BLOCKED,false);
    if(blocked){
      console.warn('autoLogin: blocked after repeated failures');
      return;
    }
    const blockUntil = await get(STORE_LOGIN_REFUSED,0);
    const remaining = blockUntil - NOW();
    if(remaining>0){
      console.warn('autoLogin: login recently refused');
      clearTimeout(loginReloadTimeout);
      loginReloadTimeout=setTimeout(()=>location.reload(),remaining);
      return;
    }
    if(loginReloadTimeout){ clearTimeout(loginReloadTimeout); loginReloadTimeout=null; }
    if(hasCloudflareCaptcha()){
      const retries = await get(STORE_CF_RETRIES,0);
      if(retries>=3){
        console.warn('autoLogin: Cloudflare challenge limit reached');
        return;
      }
      await set(STORE_CF_RETRIES,retries+1);
      await dwell();
      clearTimeout(loginReloadTimeout);
      loginReloadTimeout=setTimeout(()=>location.reload(),0);
      return;
    }
    await set(STORE_CF_RETRIES,0);
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
        console.warn('autoLogin: credential fill mismatch; forcing values');
        setValue(pseudoEl, account.user);
        setValue(passEl, account.pass);
      }
    const form = pseudoEl.closest('form') || passEl.closest('form');
    if(!form){
      console.warn('autoLogin: form not found');
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
        console.warn('autoLogin: no submission mechanism found');
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
            console.warn('autoLogin: Cloudflare challenge blocked');
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
            console.warn('autoLogin: login refused, blocking auto retries');
            return;
          }
          const delay=rnd(10*60*1000,11*60*1000);
          await set(STORE_LOGIN_REFUSED,NOW()+delay);
          clearTimeout(loginReloadTimeout);
          loginReloadTimeout=setTimeout(()=>location.reload(),delay);
          console.warn('autoLogin: login refused, delaying retry');
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
          console.warn('autoLogin: login refused, blocking auto retries');
          return;
        }
        const delay=rnd(10*60*1000,11*60*1000);
        await set(STORE_LOGIN_REFUSED,NOW()+delay);
        clearTimeout(loginReloadTimeout);
        loginReloadTimeout=setTimeout(()=>location.reload(),delay);
        console.warn('autoLogin: login refused, delaying retry');
        return;
      }
      if(/login/i.test(location.pathname) && !errEl){
        const attempts=(await get(STORE_LOGIN_ATTEMPTS,0))+1;
        await set(STORE_LOGIN_ATTEMPTS,attempts);
        const delay=attempts===1 ? rnd(10*60*1000,11*60*1000) : rnd(5*60*1000,6*60*1000);
        await set(STORE_LOGIN_REFUSED,NOW()+delay);
        clearTimeout(loginReloadTimeout);
        loginReloadTimeout=setTimeout(()=>location.reload(),delay);
        console.warn('autoLogin: login page unchanged, delaying retries');
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
  const hasCF = ()=> !!(q('iframe[src*="challenges.cloudflare.com"]') || q('input[name="cf-turnstile-response"]'));
  const cfToken = ()=> (q('input[name="cf-turnstile-response"]')?.value||'').trim();
  function getErrorText(){
    const nodes = qa('.alert--error, .alert.alert-danger, .msg-error, .alert-warning, .alert.alert-warning, .txt-msg-error, .flash-error');
    let text=''; for (const n of nodes) text += ' ' + (n.textContent||'');
    return text.toLowerCase();
  }
  function isAliasBanned(){ return /alias\s+est\s+banni/i.test(getErrorText()); }
  function isBannedError(){ return /banni|banned|utilisateur\s+.*banni|vous ne pouvez pas envoyer/i.test(getErrorText()); }
  function hasVisibleError(){ return !!q('.alert--error, .alert.alert-danger, .msg-error, .alert-warning, .alert.alert-warning'); }

  async function handleCompose(cfg){
    await sleep(150+Math.random()*250);

    let pseudo =
      q('#destinataires .form-control-tag .label')?.childNodes?.[0]?.nodeValue?.trim() ||
      (qa('#destinataires input[name^="participants["]').map(i=>i.value)[0]??'') || '';

    if(bannedRecipients.has(pseudo)){
      log('Recipient banned – back to topic list.');
      return { ok:false, pseudo, reason:'banned' };
    }

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
    if (isAliasBanned()) {
      log('Recipient banned – back to topic list.');
      bannedRecipients.add(pseudo);
      return { ok:false, pseudo, reason:'banned' };
    }
    if (isBannedError()){
      log('Recipient banned → back to list.');
      return { ok:false, pseudo, reason:'banned' };
    }
    // Retry if the CF token is missing or a visible error is detected.
    if ((hasCF() && !cfToken()) || hasVisibleError()) {
      await sleep(7000+Math.floor(Math.random()*6000));
      q('.btn.btn-poster-msg.js-post-message, button[type="submit"]')?.click();
      await sleep(1200);
      if (isAliasBanned()) {
        bannedRecipients.add(pseudo);
        return { ok:false, pseudo, reason:'banned' };
      }
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
    await set(STORE_SESSION, sessionCache);
    startTimerUpdater();
  }
  async function sessionStop(){
    await sessionGet(); sessionCache.active=false; sessionCache.stopTs=NOW(); await set(STORE_SESSION,sessionCache);
    clearInterval(timerHandle); timerHandle=null;
    await updateSessionUI().catch(log);
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
      const startEl = q('#jvc-dmwalker-active-start');
      if(startEl) startEl.value = c.activeHours[0];
      const endEl = q('#jvc-dmwalker-active-end');
      if(endEl) endEl.value = c.activeHours[1];
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
      setTimeout(()=>{ tickSoon(ms).catch(log); }, delay);
      return;
    }
    setTimeout(() => { tick().catch(log); }, ms);
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
      if(res.reason === 'banned'){
        const back = normalizeListToPageOne(await get(STORE_LAST_LIST,'') || pickListWeighted());
        await dwell(200,500);
        location.href = back;
        tickSoon(300);
        return;
      }
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
    hoursLabel.textContent='Active hours';
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

    const log=document.createElement('div');
    log.id='jvc-dmwalker-log';
    Object.assign(log.style,{
      marginTop:'2px',color:'#9ecbff',lineHeight:'1.4',height:'5.6em',
      overflow:'auto',whiteSpace:'pre-wrap',background:'#0b0d12',
      border:'1px solid #222',borderRadius:'8px',padding:'6px'
    });
    logEl=log;

    box.append(header,actions,hoursWrap,accountWrap,accountMgr,chronoWrap,log);

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
