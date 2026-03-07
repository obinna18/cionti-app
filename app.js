/* ═══════════════════════════════════════════════════════════
   CIONTI — FULL APPLICATION
   Community Of Talent In One Network
   Stack: Firebase (Auth/Firestore/Storage) + Leaflet + Paystack
═══════════════════════════════════════════════════════════ */

'use strict';

// ── Firebase services ──────────────────────────────────────
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

// ── Constants ─────────────────────────────────────────────
const CATEGORIES = [
  'All','Tech','Design','Trades','Education','Business',
  'Health','Creative','Legal','Finance','Transport','Other'
];
const CAT_EMOJI = {
  Tech:'💻',Design:'🎨',Trades:'🔧',Education:'📚',Business:'💼',
  Health:'🏥',Creative:'🎭',Legal:'⚖️',Finance:'💰',Transport:'🚗',Other:'📦'
};
const AVATAR_COLORS = ['#1F3EC7','#4F6FE8','#0EA5E9','#22C55E','#F59E0B','#8B5CF6','#EC4899'];
const WARRI = { lat: 5.5167, lng: 5.7500 }; // Default center: Warri/Effurun

// ── App State ──────────────────────────────────────────────
const S = {
  user: null, profile: null,
  skills: [], filteredSkills: [],
  selectedCat: 'All',
  viewMode: 'map',           // 'map' | 'list'
  radiusKm: 10,
  userLat: null, userLng: null,
  filters: { stype:'all', price:'all', avail:'all', maxPrice:null, cat:'' },
  vpUid: null, vpProfile: null, vpSkills: [],
  vpSelSkillId: null,
  editSkillId: null, editSkillStype: 'both', editSkillPtype: 'negotiable',
  chatId: null, chatOtherUid: null, chatOtherProfile: null,
  msgUnsub: null, chatsUnsub: null, notifsUnsub: null,
  reqTab: 'recv',
  selectedRating: 0,
  otpGenerated: '',
  resendTimer: null,
  pendingVerifyDest: '',
  phoneConfirmResult: null,
  paystackKey: 'pk_test_REPLACE_WITH_YOUR_KEY', // replace with live key
  pendingPayment: null,
  userType: 'both',
  portfolioFile: null,
};

// ── Utilities ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const initials = n => (n||'').split(' ').filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join('')||'?';
const avColor  = n => AVATAR_COLORS[((n||'').charCodeAt(0)||0) % AVATAR_COLORS.length];
const fmtPrice = (type, price) => type==='free'?'Free':type==='fixed'?`₦${Number(price||0).toLocaleString()}`:'Negotiable';
const fmtTime  = ts => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts), diff = Date.now()-d;
  if (diff<60000) return 'just now';
  if (diff<3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff<86400000) return `${Math.floor(diff/3600000)}h ago`;
  return d.toLocaleDateString('en-NG',{day:'numeric',month:'short'});
};
const haversine = (la1,ln1,la2,ln2) => {
  const R=6371,dl=((la2-la1)*Math.PI/180),dn=((ln2-ln1)*Math.PI/180);
  const a=Math.sin(dl/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dn/2)**2;
  return R*2*Math.asin(Math.sqrt(a));
};
const fmtDist = km => km<1?`${Math.round(km*1000)}m`:km<10?`${km.toFixed(1)}km`:`${Math.round(km)}km`;
const trustScore = u => {
  if (!u) return 0;
  return Math.round(
    Math.min((u.averageRating||0)*30,30)+
    Math.min((u.completedJobs||0)*2,30)+
    Math.min((u.referralCount||0)*5,20)+
    (['profileImageUrl','bio','city'].filter(f=>u[f]).length/3)*20
  );
};
const starsHtml = r => '★'.repeat(Math.round(r||0))+'☆'.repeat(5-Math.round(r||0));
const escHtml = t => (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
const avatarEl = (u, cls='av-sm') => {
  if (!u) return `<div class="avatar ${cls}" style="background:#eee">?</div>`;
  if (u.profileImageUrl) return `<img src="${u.profileImageUrl}" class="avatar ${cls}" style="object-fit:cover" loading="lazy">`;
  const col = avColor(u.fullName);
  return `<div class="avatar ${cls}" style="background:${col}22;color:${col}">${initials(u.fullName)}</div>`;
};

function toast(msg, type='') {
  const t = $('toast');
  t.textContent = msg; t.className = `show ${type}`;
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('show'),3200);
}

// ── Main C object (exposed globally) ──────────────────────
const C = {

  // ── ROUTING ─────────────────────────────────────────────
  goTo(name) {
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const el = $('s-'+name);
    if (el) el.classList.add('active');
    const MAIN = ['discover','requests','messages','profile'];
    const nav  = $('bottom-nav');
    if (MAIN.includes(name)) {
      nav.classList.add('visible');
      document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
      const ni = $('nav-'+name);
      if (ni) ni.classList.add('active');
    } else {
      nav.classList.remove('visible');
    }
  },

  navTo(name) {
    C.goTo(name);
    if (name==='discover')  C.initDiscover();
    if (name==='requests')  C.loadRequests();
    if (name==='messages')  C.loadChats();
    if (name==='profile')   C.renderMyProfile();
  },

  // ── AUTH ─────────────────────────────────────────────────
  async login() {
    const email=$('l-email').value.trim(), pw=$('l-pw').value;
    const err=$('l-err'), btn=$('btn-login');
    if (!email||!pw){C.showErr('l-err','Please fill in all fields.');return;}
    btn.disabled=true; btn.textContent='Signing in...'; err.style.display='none';
    try {
      const c = await auth.signInWithEmailAndPassword(email, pw);
      await C.postLogin(c.user);
    } catch(e) {
      btn.disabled=false; btn.textContent='Login';
      C.showErr('l-err', C.authErr(e.code));
    }
  },

  async register() {
    const name=$('r-name').value.trim(), email=$('r-email').value.trim(),
          phone=$('r-phone').value.trim(), pw=$('r-pw').value;
    if (!name||!email||!pw){C.showErr('r-err','Fill in all required fields.');return;}
    if (pw.length<6){C.showErr('r-err','Password must be at least 6 characters.');return;}
    if (!$('r-terms').checked){C.showErr('r-err','Please accept the Terms & Conditions.');return;}
    const btn=document.querySelector('#s-register .btn-white');
    btn.disabled=true; btn.textContent='Creating account...'; C.hideErr('r-err');
    try {
      const c = await auth.createUserWithEmailAndPassword(email, pw);
      await c.user.updateProfile({ displayName: name });
      await db.collection('users').doc(c.user.uid).set({
        uid:c.user.uid, fullName:name, email, phone:phone||'',
        userType:S.userType, profileImageUrl:'', bio:'', city:'', state:'',
        lat:null, lng:null, isAvailable:true, trustScore:0,
        totalRatings:0, averageRating:0, completedJobs:0,
        referralCount:0, setupComplete:false, walletBalance:0,
        escrowBalance:0, createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      S.user = c.user;
      S.pendingVerifyDest = email;
      $('v-dest').textContent = email;
      C.generateOtp();
      C.clearOtp();
      C.goTo('verify');
    } catch(e) {
      btn.disabled=false; btn.textContent='Create account';
      C.showErr('r-err', C.authErr(e.code));
    }
  },

  async loginGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const c = await auth.signInWithPopup(provider);
      // Create user doc if first time
      const snap = await db.collection('users').doc(c.user.uid).get();
      if (!snap.exists) {
        await db.collection('users').doc(c.user.uid).set({
          uid:c.user.uid, fullName:c.user.displayName||'', email:c.user.email||'',
          phone:'', userType:'both', profileImageUrl:c.user.photoURL||'',
          bio:'', city:'', state:'', lat:null, lng:null,
          isAvailable:true, trustScore:0, totalRatings:0, averageRating:0,
          completedJobs:0, referralCount:0, setupComplete:false,
          walletBalance:0, escrowBalance:0,
          createdAt:firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      await C.postLogin(c.user);
    } catch(e) { toast('Google sign-in failed. Try another method.','err'); }
  },

  async sendPhoneCode() {
    const phone = $('ph-num').value.trim();
    if (!phone){C.showErr('ph-err','Enter your phone number.');return;}
    try {
      // Init reCAPTCHA for phone login
      if (!window.phoneRecaptcha) {
        window.phoneRecaptcha = new firebase.auth.RecaptchaVerifier('recaptcha-phone', {size:'invisible'});
      }
      const confirm = await auth.signInWithPhoneNumber(phone, window.phoneRecaptcha);
      S.phoneConfirmResult = confirm;
      S.pendingVerifyDest = phone;
      $('v-dest').textContent = phone;
      C.clearOtp();
      toast('Code sent!','ok');
      C.goTo('verify');
    } catch(e) {
      C.showErr('ph-err','Could not send code. Check number and try again.');
      window.phoneRecaptcha = null; // reset
    }
  },

  async verifyOtp() {
    const entered = [0,1,2,3].map(i=>$(`otp-${i}`)?.value||'').join('');
    const errEl=$('otp-err'), okEl=$('otp-ok'), btn=document.querySelector('#s-verify .btn.btn-p');
    if (entered.length<4){toast('Enter all 4 digits','err');return;}

    // Phone auth flow
    if (S.phoneConfirmResult) {
      try {
        btn.disabled=true; btn.textContent='Verifying...';
        const c = await S.phoneConfirmResult.confirm(entered);
        okEl.style.display='block'; errEl.style.display='none';
        [0,1,2,3].forEach(i=>{ const el=$(`otp-${i}`); if(el)el.classList.add('ok'); });
        S.user = c.user;
        setTimeout(async()=>{
          const snap = await db.collection('users').doc(c.user.uid).get();
          S.profile = {uid:c.user.uid,...snap.data()};
          if (snap.exists && snap.data().setupComplete) C.bootApp();
          else C.goTo('setup');
        },1000);
      } catch(e) {
        btn.disabled=false; btn.textContent='Verify & Continue';
        errEl.style.display='block'; okEl.style.display='none';
        [0,1,2,3].forEach(i=>{ const el=$(`otp-${i}`); if(el)el.classList.add('err'); });
      }
      return;
    }

    // Email OTP flow (generated locally)
    if (entered===S.otpGenerated) {
      [0,1,2,3].forEach(i=>{ const el=$(`otp-${i}`); if(el){el.classList.remove('err');el.classList.add('ok');} });
      errEl.style.display='none'; okEl.style.display='block';
      btn.disabled=true;
      clearInterval(S.resendTimer);
      setTimeout(()=>C.goTo('setup'),1100);
    } else {
      [0,1,2,3].forEach(i=>{ const el=$(`otp-${i}`); if(el){el.classList.remove('ok');el.classList.add('err');} });
      errEl.style.display='block'; okEl.style.display='none';
    }
  },

  generateOtp() {
    S.otpGenerated = String(Math.floor(1000+Math.random()*9000));
    console.log(`%c[Cionti Dev] OTP for ${S.pendingVerifyDest}: ${S.otpGenerated}`, 'color:#1F3EC7;font-weight:bold;font-size:14px');
    toast(`Code sent to ${S.pendingVerifyDest}`, 'ok');
    C.startResendTimer();
  },

  resendOtp() {
    if (S.phoneConfirmResult) { C.sendPhoneCode(); return; }
    C.generateOtp(); C.clearOtp();
    $('otp-err').style.display='none';
  },

  startResendTimer() {
    clearInterval(S.resendTimer);
    const lnk=$('resend-lnk'), tmr=$('resend-tmr');
    if (!lnk||!tmr) return;
    lnk.style.pointerEvents='none'; lnk.style.opacity='.4';
    tmr.style.display='block';
    let s=60;
    S.resendTimer = setInterval(()=>{
      s--;
      if (tmr) tmr.textContent=`Resend in ${s}s`;
      if (s<=0) {
        clearInterval(S.resendTimer);
        lnk.style.pointerEvents='auto'; lnk.style.opacity='1';
        tmr.style.display='none';
      }
    },1000);
  },

  clearOtp() {
    [0,1,2,3].forEach(i=>{
      const el=$(`otp-${i}`);
      if(el){el.value='';el.classList.remove('ok','err');}
    });
    $('otp-0')?.focus();
    $('otp-err').style.display='none';
    $('otp-ok').style.display='none';
  },

  otpIn(idx) {
    const el=$(`otp-${idx}`);
    if (el.value.length>1) el.value=el.value.slice(-1);
    el.classList.remove('err','ok');
    if (el.value && idx<3) $(`otp-${idx+1}`)?.focus();
    const all=[0,1,2,3].map(i=>$(`otp-${i}`)?.value||'');
    if (all.every(v=>v)) C.verifyOtp();
  },

  otpKey(e, idx) {
    if (e.key==='Backspace') {
      const el=$(`otp-${idx}`);
      el.value=''; el.classList.remove('err','ok');
      if (idx>0) $(`otp-${idx-1}`)?.focus();
    }
  },

  async forgotPw() {
    const email=$('l-email').value.trim();
    if (!email){toast('Enter your email first','err');return;}
    try { await auth.sendPasswordResetEmail(email); toast(`Reset link sent to ${email}`,'ok'); }
    catch(e){ toast('Failed to send reset email','err'); }
  },

  togglePw(id, el) {
    const inp=$(id);
    if (!inp) return;
    if (inp.type==='password'){ inp.type='text'; el.textContent='🙈'; }
    else { inp.type='password'; el.textContent='👁'; }
  },

  selType(val) {
    S.userType = val;
    ['both','provider','seeker'].forEach(t=>{
      $('to-'+t)?.classList.toggle('on',t===val);
    });
  },

  authErr(code) {
    const m={
      'auth/user-not-found':'No account with that email.',
      'auth/wrong-password':'Incorrect password.',
      'auth/invalid-email':'Invalid email address.',
      'auth/email-already-in-use':'Email already registered — try signing in.',
      'auth/weak-password':'Password too weak (min 6 chars).',
      'auth/too-many-requests':'Too many attempts. Try again later.',
      'auth/network-request-failed':'Network error. Check your connection.',
    };
    return m[code]||'Something went wrong. Please try again.';
  },

  showErr(id, msg) { const el=$(id); if(!el)return; el.textContent=msg; el.style.display='block'; },
  hideErr(id)      { const el=$(id); if(!el)return; el.style.display='none'; },

  async postLogin(user) {
    S.user = user;
    const snap = await db.collection('users').doc(user.uid).get();
    S.profile = { uid:user.uid, ...snap.data() };
    if (snap.exists && snap.data().setupComplete) C.bootApp();
    else C.goTo('setup');
  },

  // ── SETUP ─────────────────────────────────────────────────
  previewSetupAv(input) {
    const f=input.files[0]; if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      const av=$('setup-av');
      av.innerHTML=`<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    };
    r.readAsDataURL(f);
  },

  detectLoc() {
    if (!navigator.geolocation){toast('Geolocation not supported','err');return;}
    toast('Detecting location...');
    navigator.geolocation.getCurrentPosition(pos=>{
      S.userLat=pos.coords.latitude; S.userLng=pos.coords.longitude;
      $('loc-ok').style.display='block';
      toast('Location detected!','ok');
      // Reverse geocode with Nominatim (free)
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${S.userLat}&lon=${S.userLng}&format=json`)
        .then(r=>r.json()).then(d=>{
          const city = d.address?.city||d.address?.town||d.address?.village||d.address?.suburb||'';
          const state = d.address?.state||'';
          if (city && !$('setup-city').value) $('setup-city').value=city;
          if (state && !$('setup-state').value) $('setup-state').value=state;
        }).catch(()=>{});
    },()=>toast('Could not detect location. Enter city manually.','err'));
  },

  async saveSetup() {
    const bio=$('setup-bio').value.trim(), city=$('setup-city').value.trim(), state=$('setup-state').value.trim();
    if (!city){toast('Please enter your city','err');return;}
    const btn=document.querySelector('#s-setup .btn.btn-p');
    btn.disabled=true; btn.textContent='Saving...';
    try {
      const uid=S.user.uid;
      const upd={bio,city,state,setupComplete:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
      if (S.userLat){upd.lat=S.userLat;upd.lng=S.userLng;}
      const ph=document.querySelector('#setup-ph')?.files[0];
      if (ph){
        const ref=storage.ref(`avatars/${uid}`);
        await ref.put(ph);
        upd.profileImageUrl=await ref.getDownloadURL();
      }
      await db.collection('users').doc(uid).update(upd);
      const snap=await db.collection('users').doc(uid).get();
      S.profile={uid,...snap.data()};
      C.bootApp();
    } catch(e){
      btn.disabled=false; btn.textContent='Save & Continue';
      toast('Save failed. Try again.','err');
    }
  },

  skipSetup() {
    db.collection('users').doc(S.user.uid).update({setupComplete:true}).then(()=>{});
    C.bootApp();
  },

  // ── BOOT ──────────────────────────────────────────────────
  bootApp() {
    C.goTo('discover');
    $('bottom-nav').classList.add('visible');
    C.initDiscover();
    C.loadNotifs();
    C.initFCM();
    C.populateCategorySelects();
  },

  populateCategorySelects() {
    const cats = CATEGORIES.filter(c=>c!=='All');
    ['ps-cat','f-cat'].forEach(id=>{
      const el=$(id); if(!el)return;
      cats.forEach(c=>{
        if ([...el.options].some(o=>o.value===c)) return;
        const o=document.createElement('option');
        o.value=o.textContent=c; el.appendChild(o);
      });
    });
  },

  // ── DISCOVER ──────────────────────────────────────────────
  async initDiscover() {
    if (!S.user||!S.profile) return;
    // Header name
    const first=(S.profile.fullName||'').split(' ')[0]||'there';
    $('disc-name').textContent = `Hi, ${first} 👋`;
    if (S.profile.city) $('disc-loc').textContent = `📍 ${S.profile.city}${S.profile.state?', '+S.profile.state:''}`;
    // Avatar
    const av = $('disc-av');
    if (S.profile.profileImageUrl) {
      av.innerHTML=`<img src="${S.profile.profileImageUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      av.textContent=initials(S.profile.fullName);
    }
    if (S.profile.lat){S.userLat=S.profile.lat;S.userLng=S.profile.lng;}
    // Build chips
    const chipsEl=$('cat-chips');
    chipsEl.innerHTML=CATEGORIES.map(c=>
      `<div class="chip ${c==='All'?'on':''}" data-cat="${c}" onclick="C.selCat(this,'${c}')">${c==='All'?'All':(CAT_EMOJI[c]||'')+'&nbsp;'+c}</div>`
    ).join('');
    // Init map
    C.initMap();
    // Get location then load
    if (navigator.geolocation && !S.userLat) {
      navigator.geolocation.getCurrentPosition(pos=>{
        S.userLat=pos.coords.latitude; S.userLng=pos.coords.longitude;
        C.mapSetView(S.userLat, S.userLng);
        C.loadSkills();
      },()=>C.loadSkills());
    } else {
      C.loadSkills();
    }
  },

  selCat(el, cat) {
    document.querySelectorAll('#cat-chips .chip').forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
    S.selectedCat=cat;
    C.renderSkills();
  },

  filterSkills() { C.renderSkills(); },

  switchView(mode) {
    S.viewMode=mode;
    $('vt-map').classList.toggle('on',mode==='map');
    $('vt-list').classList.toggle('on',mode==='list');
    $('map-view').style.display=mode==='map'?'block':'none';
    $('list-view').style.display=mode==='list'?'flex':'none';
    if (mode==='map') { setTimeout(()=>{ if(CiontiMap.map)CiontiMap.map.invalidateSize();},100); }
    C.renderSkills();
  },

  updateRadius(v) {
    S.radiusKm=Number(v);
    $('rad-label').textContent=`${v}km`;
    C.renderSkills();
  },

  async loadSkills() {
    try {
      const snap = await db.collection('skills')
        .where('isActive','==',true)
        .orderBy('createdAt','desc').limit(200).get();
      const skills=snap.docs.map(d=>({id:d.id,...d.data()}));
      const uids=[...new Set(skills.map(s=>s.userId))];
      const users={};
      await Promise.all(uids.map(async uid=>{
        try{ const u=await db.collection('users').doc(uid).get(); if(u.exists)users[uid]=u.data(); }catch(e){}
      }));
      S.skills=skills.map(s=>({...s,user:users[s.userId]||{}}));
      C.renderSkills();
    } catch(e){ console.error(e); }
  },

  renderSkills() {
    const q=($('disc-search')?.value||'').toLowerCase().trim();
    let list=[...S.skills];
    // Category
    if (S.selectedCat!=='All') list=list.filter(s=>s.category===S.selectedCat);
    // Search
    if (q) list=list.filter(s=>
      (s.title||'').toLowerCase().includes(q)||
      (s.description||'').toLowerCase().includes(q)||
      (s.user?.fullName||'').toLowerCase().includes(q)||
      (s.tags||[]).some(t=>t.toLowerCase().includes(q))
    );
    // Filters
    const f=S.filters;
    if (f.stype!=='all') list=list.filter(s=>s.serviceType===f.stype||s.serviceType==='both');
    if (f.price!=='all') list=list.filter(s=>s.priceType===f.price);
    if (f.avail==='true') list=list.filter(s=>s.user?.isAvailable);
    if (f.maxPrice) list=list.filter(s=>!s.price||s.price<=f.maxPrice);
    if (f.cat) list=list.filter(s=>s.category===f.cat);
    // Attach distance + sort
    list=list.map(s=>{
      const dist=(S.userLat&&s.lat)?haversine(S.userLat,S.userLng,s.lat,s.lng):null;
      return {...s,distKm:dist};
    });
    // Radius filter on map view
    if (S.viewMode==='map' && S.userLat) {
      list=list.filter(s=>s.distKm===null||s.distKm<=S.radiusKm);
    }
    list.sort((a,b)=>(a.distKm??999)-(b.distKm??999));
    S.filteredSkills=list;
    if (S.viewMode==='map') C.updateMap(list);
    else C.renderList(list);
  },

  renderList(list) {
    const el=$('skill-list'); if(!el)return;
    if (!list.length) {
      el.innerHTML=`<div class="empty-c"><div class="ei">🔍</div><h3>No skills found</h3><p>Try a different search or filter, or <span class="link-p" onclick="C.openPostSkill()">post your own skill</span></p></div>`;
      return;
    }
    el.innerHTML=list.map((s,i)=>{
      const u=s.user||{};
      const dist=s.distKm!==null?fmtDist(s.distKm):(s.city||'');
      const ts=trustScore(u);
      return `<div class="skill-card" onclick="C.openProfile('${s.userId}','${s.id}')" style="animation:fadeUp .25s ${i*.03}s both">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          ${avatarEl(u,'av-sm')}
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.fullName||'Unknown'}</div>
            <div style="font-size:.7rem;color:var(--textl)">📍 ${dist}</div>
          </div>
          <span style="font-size:.68rem;color:var(--textl);background:var(--bg);padding:2px 8px;border-radius:10px;white-space:nowrap">${{remote:'🌐 Remote',physical:'📍 In-Person',both:'🔄 Both'}[s.serviceType]||'🔄 Both'}</span>
        </div>
        <div style="font-family:'Syne',sans-serif;font-size:.95rem;font-weight:700;margin-bottom:4px">${s.title||''}</div>
        <div style="font-size:.78rem;color:var(--textl);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${s.description||''}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">
          <span style="font-weight:700;font-size:.88rem;color:var(--p)">${fmtPrice(s.priceType,s.price)}</span>
          <span style="font-size:.75rem;color:var(--textl)">★ ${u.averageRating?u.averageRating.toFixed(1):'New'}${u.completedJobs?` · ${u.completedJobs} jobs`:''}</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <span class="badge badge-p">${s.category||''}</span>
          ${ts>0?`<span class="trust-badge">🔥 ${ts}</span>`:''}
          ${u.isAvailable?'<span class="badge badge-ok">● Available</span>':''}
        </div>
      </div>`;
    }).join('');
  },

  // ── MAP ────────────────────────────────────────────────────
  initMap() {
    if (CiontiMap.map) {
      CiontiMap.map.invalidateSize();
      return;
    }
    CiontiMap.init(S.userLat||WARRI.lat, S.userLng||WARRI.lng);
  },

  mapSetView(lat, lng) {
    if (CiontiMap.map) CiontiMap.map.setView([lat,lng],14);
  },

  updateMap(skills) {
    if (!CiontiMap.map) { C.initMap(); return; }
    CiontiMap.update(skills, S.userLat, S.userLng, S.radiusKm);
  },

  // ── FILTERS ────────────────────────────────────────────────
  openFilters()   { $('s-filters').style.display='flex'; },
  closeFilters(e) { if(e.target===$('s-filters'))$('s-filters').style.display='none'; },

  selTgl(groupId, el) {
    const group=$(groupId);
    group.querySelectorAll('.tgl').forEach(t=>t.classList.remove('on'));
    el.classList.add('on');
  },

  applyFilters() {
    S.filters={
      stype:$('f-stype')?.querySelector('.tgl.on')?.dataset.v||'all',
      price:$('f-price')?.querySelector('.tgl.on')?.dataset.v||'all',
      avail:$('f-avail')?.querySelector('.tgl.on')?.dataset.v||'all',
      maxPrice:parseFloat($('f-max')?.value)||null,
      cat:$('f-cat')?.value||''
    };
    $('s-filters').style.display='none';
    C.renderSkills();
    toast('Filters applied','ok');
  },

  resetFilters() {
    S.filters={stype:'all',price:'all',avail:'all',maxPrice:null,cat:''};
    document.querySelectorAll('#f-stype .tgl,#f-price .tgl,#f-avail .tgl').forEach((el,i)=>el.classList.toggle('on',i%3===0||i%4===0||i%2===0));
    // Just set all first ones on
    ['f-stype','f-price','f-avail'].forEach(id=>{
      const g=$(id); if(!g)return;
      g.querySelectorAll('.tgl').forEach((t,i)=>t.classList.toggle('on',i===0));
    });
    if ($('f-max')) $('f-max').value='';
    if ($('f-cat')) $('f-cat').value='';
    $('s-filters').style.display='none';
    C.renderSkills();
  },

  // ── VIEW PROFILE ───────────────────────────────────────────
  async openProfile(uid, skillId='') {
    S.vpUid=uid; S.vpSelSkillId=skillId||null;
    $('vp-content').innerHTML='<div class="loading-c"><div class="spinner"></div></div>';
    $('vp-back').onclick=()=>{ S.viewMode==='map'?C.navTo('discover'):history.back(); };
    C.goTo('view-profile');
    try {
      const [uSnap,skSnap,revSnap]=await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('skills').where('userId','==',uid).where('isActive','==',true).get(),
        db.collection('reviews').where('revieweeId','==',uid).orderBy('createdAt','desc').limit(10).get()
      ]);
      S.vpProfile={uid,...uSnap.data()};
      S.vpSkills=skSnap.docs.map(d=>({id:d.id,...d.data()}));
      const reviews=revSnap.docs.map(d=>({id:d.id,...d.data()}));
      C.renderViewProfile(S.vpProfile,S.vpSkills,reviews);
    } catch(e){ $('vp-content').innerHTML='<div class="empty-c"><div class="ei">⚠️</div><h3>Failed to load</h3></div>'; }
  },

  renderViewProfile(u,skills,reviews) {
    const ts=trustScore(u);
    $('vp-req-btn').style.display=skills.length&&u.uid!==S.user?.uid?'flex':'none';
    $('vp-content').innerHTML=`
      <div class="profile-hero">
        <div style="display:flex;gap:16px;align-items:center">
          ${avatarEl(u,'av-lg')}
          <div style="flex:1">
            <h2 style="font-size:1.2rem;font-weight:800;color:#fff">${u.fullName||'Unknown'}</h2>
            <div style="font-size:.78rem;color:rgba(255,255,255,.8);margin:4px 0">📍 ${u.city||''}${u.state?', '+u.state:''}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              ${ts>0?`<span class="trust-badge">🔥 Trust ${ts}</span>`:''}
              <span class="badge ${u.isAvailable?'badge-ok':'badge-n'}">${u.isAvailable?'● Available':'○ Busy'}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:24px;margin-top:16px">
          <div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:#fff">${u.completedJobs||0}</div><div style="font-size:.65rem;color:rgba(255,255,255,.65)">Jobs</div></div>
          <div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:#fff">${u.averageRating?u.averageRating.toFixed(1):'—'}</div><div style="font-size:.65rem;color:rgba(255,255,255,.65)">Rating</div></div>
          <div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:#fff">${u.referralCount||0}</div><div style="font-size:.65rem;color:rgba(255,255,255,.65)">Referrals</div></div>
        </div>
      </div>
      <div style="padding:16px 20px">
        ${u.bio?`<p style="font-size:.85rem;color:var(--textl);line-height:1.7;margin-bottom:20px">${u.bio}</p>`:''}
        <div class="sec-title">Skills (${skills.length})</div>
        ${skills.length?skills.map(s=>`
          <div class="profile-skill ${s.id===S.vpSelSkillId?'sel':''}" id="ps-${s.id}" onclick="C.selVpSkill('${s.id}')">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="flex:1"><div style="font-family:'Syne',sans-serif;font-size:.95rem;font-weight:700">${s.title}</div>
              <div style="font-size:.78rem;color:var(--textl);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${s.description||''}</div></div>
              <div style="text-align:right;flex-shrink:0"><div style="font-weight:700;font-size:.85rem;color:var(--p)">${fmtPrice(s.priceType,s.price)}</div><span class="badge badge-p mt-8" style="margin-top:6px">${s.category}</span></div>
            </div>
            ${s.portfolioImageUrl?`<img src="${s.portfolioImageUrl}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-top:10px" loading="lazy">`:''}
          </div>`).join(''):'<p class="text-muted text-sm">No skills listed yet.</p>'}
        <div class="sec-title">Reviews (${reviews.length})</div>
        ${reviews.length?reviews.map(r=>`
          <div class="review-item">
            <div class="stars-html">${starsHtml(r.rating)}</div>
            <p style="font-size:.82rem;color:var(--textl);margin-top:5px;line-height:1.5">${r.comment||''}</p>
            <p style="font-size:.7rem;color:var(--muted);margin-top:4px">${fmtTime(r.createdAt)}</p>
          </div>`).join(''):'<p class="text-muted text-sm">No reviews yet.</p>'}
      </div>`;
  },

  selVpSkill(id) {
    document.querySelectorAll('.profile-skill').forEach(el=>el.classList.remove('sel'));
    $(`ps-${id}`)?.classList.add('sel');
    S.vpSelSkillId=id;
  },

  openChatWith() { if(S.vpProfile)C.openChat(S.vpUid,S.vpProfile.fullName||''); },

  openReqModal() {
    if (!S.vpSkills.length){toast('No skills to request','err');return;}
    $('req-skill-sel').innerHTML=S.vpSkills.map(s=>`
      <div class="profile-skill ${s.id===S.vpSelSkillId?'sel':''}" id="rps-${s.id}" onclick="C.selReqSkill('${s.id}')">
        <div style="font-family:'Syne',sans-serif;font-size:.88rem;font-weight:700">${s.title}</div>
        <div style="font-size:.76rem;color:var(--textl);margin-top:2px">${s.description?.slice(0,80)||''}</div>
        <div style="font-weight:700;font-size:.82rem;color:var(--p);margin-top:6px">${fmtPrice(s.priceType,s.price)}</div>
      </div>`).join('');
    $('req-msg').value='';
    $('modal-request').classList.add('open');
  },

  selReqSkill(id) {
    document.querySelectorAll('#req-skill-sel .profile-skill').forEach(el=>el.classList.remove('sel'));
    $(`rps-${id}`)?.classList.add('sel');
    S.vpSelSkillId=id;
  },

  async submitRequest() {
    const msg=$('req-msg').value.trim();
    if (!S.vpSelSkillId){toast('Select a skill first','err');return;}
    if (!msg){toast('Add a message','err');return;}
    const skill=S.vpSkills.find(s=>s.id===S.vpSelSkillId);
    try {
      await db.collection('requests').add({
        seekerId:S.user.uid, seekerName:S.profile?.fullName||'',
        providerId:S.vpUid, providerName:S.vpProfile?.fullName||'',
        skillId:S.vpSelSkillId, skillTitle:skill?.title||'',
        message:msg, status:'pending', reviewed:false,
        payment:{status:'none',amount:0,paystackRef:''},
        createdAt:firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      // Notification
      await C.createNotif(S.vpUid,'request',`${S.profile?.fullName} sent you a request for "${skill?.title}"`,S.user.uid);
      C.closeModalById('modal-request');
      toast('Request sent! 🚀','ok');
    } catch(e){ toast('Failed to send request','err'); }
  },

  openReferModal() { $('refer-ctx').value=''; $('modal-refer').classList.add('open'); },

  async submitReferral() {
    const ctx=$('refer-ctx').value.trim();
    try {
      await db.collection('referrals').add({
        referrerId:S.user.uid, referredId:S.vpUid, context:ctx,
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      await db.collection('users').doc(S.vpUid).update({referralCount:firebase.firestore.FieldValue.increment(1)});
      C.closeModalById('modal-refer');
      toast('Referral submitted! 🤝','ok');
    } catch(e){ toast('Failed to submit referral','err'); }
  },

  // ── POST SKILL ─────────────────────────────────────────────
  openPostSkill(skill=null) {
    S.editSkillId=skill?.id||null;
    S.editSkillStype=skill?.serviceType||'both';
    S.editSkillPtype=skill?.priceType||'negotiable';
    S.portfolioFile=null;
    $('ps-title').textContent=skill?'Edit Skill':'Post a Skill';
    $('btn-post-skill').textContent=skill?'Save Changes':'Post Skill';
    $('ps-skill-title').value=skill?.title||'';
    $('ps-cat').value=skill?.category||'';
    $('ps-desc').value=skill?.description||'';
    $('ps-tags').value=(skill?.tags||[]).join(', ');
    $('ps-price').value=skill?.price||'';
    $('btn-del-skill').style.display=skill?'flex':'none';
    $('portfolio-prev').style.display='none';
    $('portfolio-prev').innerHTML='';
    // Stype
    $('ps-stype').querySelectorAll('.stype-card').forEach(el=>el.classList.toggle('on',el.dataset.v===S.editSkillStype));
    // Ptype
    $('ps-ptype').querySelectorAll('.stype-card').forEach(el=>el.classList.toggle('on',el.dataset.v===S.editSkillPtype));
    $('ps-price').style.display=S.editSkillPtype==='fixed'?'block':'none';
    $('ps-back').onclick=()=>C.navTo('profile');
    C.goTo('post-skill');
  },

  selStype(el) {
    S.editSkillStype=el.dataset.v;
    $('ps-stype').querySelectorAll('.stype-card').forEach(c=>c.classList.toggle('on',c===el));
  },

  selPtype(el) {
    S.editSkillPtype=el.dataset.v;
    $('ps-ptype').querySelectorAll('.stype-card').forEach(c=>c.classList.toggle('on',c===el));
    $('ps-price').style.display=el.dataset.v==='fixed'?'block':'none';
  },

  prevPortfolio(input) {
    const f=input.files[0]; if(!f)return;
    S.portfolioFile=f;
    const r=new FileReader();
    r.onload=ev=>{
      $('portfolio-prev').style.display='block';
      $('portfolio-prev').innerHTML=`<img src="${ev.target.result}" style="width:100%;height:140px;object-fit:cover;border-radius:10px">`;
    };
    r.readAsDataURL(f);
  },

  async postSkill() {
    const title=$('ps-skill-title').value.trim(), cat=$('ps-cat').value,
          desc=$('ps-desc').value.trim();
    const tagsRaw=$('ps-tags').value;
    const tags=tagsRaw.split(',').map(t=>t.trim()).filter(Boolean);
    const price=parseFloat($('ps-price').value)||0;
    const btn=$('btn-post-skill');
    if (!title||!cat||!desc){toast('Title, category and description required','err');return;}
    btn.disabled=true; btn.textContent='Saving...';
    try {
      const p=S.profile||{};
      let portfolioUrl=S.editSkillId?(await db.collection('skills').doc(S.editSkillId).get()).data()?.portfolioImageUrl||'':'';
      if (S.portfolioFile) {
        const ref=storage.ref(`portfolio/${S.user.uid}/${Date.now()}`);
        await ref.put(S.portfolioFile);
        portfolioUrl=await ref.getDownloadURL();
      }
      const data={
        userId:S.user.uid, userType:S.userType||p.userType||'both',
        title, category:cat, description:desc,
        priceType:S.editSkillPtype, price:S.editSkillPtype==='fixed'?price:0,
        serviceType:S.editSkillStype, tags,
        portfolioImageUrl:portfolioUrl,
        city:p.city||'', state:p.state||'',
        lat:p.lat||null, lng:p.lng||null,
        isActive:true, updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      };
      if (S.editSkillId) {
        await db.collection('skills').doc(S.editSkillId).update(data);
        toast('Skill updated! ✅','ok');
      } else {
        data.createdAt=firebase.firestore.FieldValue.serverTimestamp();
        data.viewCount=0;
        await db.collection('skills').add(data);
        toast('Skill posted! 🎉','ok');
      }
      C.loadSkills();
      C.navTo('profile');
    } catch(e){
      btn.disabled=false; btn.textContent=S.editSkillId?'Save Changes':'Post Skill';
      toast('Failed to save. Try again.','err');
    }
  },

  async deleteSkill() {
    if (!confirm('Delete this skill? This cannot be undone.'))return;
    await db.collection('skills').doc(S.editSkillId).update({isActive:false});
    toast('Skill deleted.');
    C.loadSkills();
    C.navTo('profile');
  },

  // ── REQUESTS ──────────────────────────────────────────────
  switchReqTab(tab) {
    S.reqTab=tab;
    $('tab-recv').classList.toggle('on',tab==='recv');
    $('tab-sent').classList.toggle('on',tab==='sent');
    C.loadRequests();
  },

  async loadRequests() {
    $('req-list').innerHTML='<div class="loading-c"><div class="spinner"></div></div>';
    try {
      const field=S.reqTab==='recv'?'providerId':'seekerId';
      const snap=await db.collection('requests')
        .where(field,'==',S.user.uid)
        .orderBy('createdAt','desc').limit(40).get();
      if (snap.empty){C.showEmptyReq();return;}
      const reqs=snap.docs.map(d=>({id:d.id,...d.data()}));
      const enriched=await Promise.all(reqs.map(async r=>{
        const otherId=S.reqTab==='recv'?r.seekerId:r.providerId;
        try {
          const u=await db.collection('users').doc(otherId).get();
          return {...r,other:u.data()||{}};
        } catch(e){ return {...r,other:{}}; }
      }));
      C.renderRequests(enriched);
    } catch(e){C.showEmptyReq();}
  },

  renderRequests(reqs) {
    $('req-list').innerHTML=reqs.map(r=>{
      const u=r.other||{};
      const statusMap={pending:{cls:'badge-warn',lbl:'Pending'},accepted:{cls:'badge-ok',lbl:'Accepted'},rejected:{cls:'badge-bad',lbl:'Declined'},completed:{cls:'badge-n',lbl:'Completed'}};
      const st=statusMap[r.status]||statusMap.pending;
      const otherId=S.reqTab==='recv'?r.seekerId:r.providerId;
      const isAccepted=r.status==='accepted';
      const isPaid=r.payment?.status==='paid';
      return `<div class="req-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
            ${avatarEl(u,'av-sm')}
            <div style="min-width:0"><div style="font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.fullName||'Unknown'}</div>
            <div style="font-size:.72rem;color:var(--textl)">${r.skillTitle||'Skill Request'}</div></div>
          </div>
          <span class="badge ${st.cls}">${st.lbl}</span>
        </div>
        <div style="font-size:.8rem;color:var(--textl);background:var(--bg);padding:10px 12px;border-radius:8px;line-height:1.5;font-style:italic">"${r.message||''}"</div>
        <div style="font-size:.7rem;color:var(--muted);margin-top:6px">${fmtTime(r.createdAt)}</div>
        <div class="req-actions">
          <button class="btn btn-g btn-sm" onclick="C.openChat('${otherId}','${escHtml(u.fullName||'')}')">💬 Chat</button>
          ${S.reqTab==='recv'&&r.status==='pending'?`
            <button class="btn btn-bad btn-sm" onclick="C.updateReqStatus('${r.id}','rejected')">Decline</button>
            <button class="btn btn-ok btn-sm" style="flex:1" onclick="C.updateReqStatus('${r.id}','accepted')">Accept ✓</button>`:''}
          ${isAccepted&&!isPaid&&S.reqTab==='sent'?`
            <button class="btn btn-p btn-sm" style="flex:1" onclick="C.openPayment('${r.id}','${r.providerId}','${r.skillTitle}',${r.payment?.amount||0})">Pay 💳</button>`:''}
          ${r.status==='accepted'?`
            <button class="btn btn-p btn-sm" style="flex:1" onclick="C.markComplete('${r.id}','${r.providerId}')">Mark Complete ✓</button>`:''}
          ${r.status==='completed'&&S.reqTab==='sent'&&!r.reviewed?`
            <button class="btn btn-o btn-sm" style="flex:1" onclick="C.openReviewModal('${r.id}','${r.providerId}')">Review ⭐</button>`:''}
        </div>
      </div>`;
    }).join('');
  },

  showEmptyReq() {
    $('req-list').innerHTML=`<div class="empty-c"><div class="ei">${S.reqTab==='recv'?'📩':'📤'}</div><h3>No ${S.reqTab==='recv'?'received':'sent'} requests</h3><p>${S.reqTab==='recv'?'When someone requests your skill it appears here.':'Requests you send appear here.'}</p></div>`;
  },

  async updateReqStatus(id,status) {
    await db.collection('requests').doc(id).update({status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    toast(status==='accepted'?'Request accepted! 🎉':'Request declined.',status==='accepted'?'ok':'');
    if (status==='accepted') {
      const req=(await db.collection('requests').doc(id).get()).data();
      await C.createNotif(req.seekerId,'request_update',`Your request for "${req.skillTitle}" was accepted!`,S.user.uid);
    }
    C.loadRequests();
  },

  async markComplete(reqId,provId) {
    const req=(await db.collection('requests').doc(reqId).get()).data();
    await Promise.all([
      db.collection('requests').doc(reqId).update({status:'completed',updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),
      db.collection('users').doc(provId).update({completedJobs:firebase.firestore.FieldValue.increment(1)})
    ]);
    // Release escrow if paid
    if (req?.payment?.status==='escrow') {
      const amt=req.payment.amount||0;
      await db.collection('users').doc(provId).update({walletBalance:firebase.firestore.FieldValue.increment(amt),escrowBalance:firebase.firestore.FieldValue.increment(-amt)});
      await db.collection('transactions').add({
        uid:provId,type:'escrow_release',amount:amt,
        requestId:reqId,status:'completed',
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    toast('Marked complete! 🏆','ok');
    C.loadRequests();
  },

  openReviewModal(reqId,provId) {
    $('rev-req-id').value=reqId; $('rev-prov-id').value=provId;
    S.selectedRating=0; C.buildStarPicker();
    $('rev-comment').value='';
    $('modal-review').classList.add('open');
  },

  buildStarPicker() {
    $('star-picker').innerHTML=[1,2,3,4,5].map(n=>
      `<span class="star-pick ${n<=S.selectedRating?'on':''}" onclick="C.setRating(${n})">${n<=S.selectedRating?'★':'☆'}</span>`
    ).join('');
  },

  setRating(n){ S.selectedRating=n; C.buildStarPicker(); },

  async submitReview() {
    if (!S.selectedRating){toast('Select a rating','err');return;}
    const comment=$('rev-comment').value.trim(), reqId=$('rev-req-id').value, provId=$('rev-prov-id').value;
    try {
      await db.collection('reviews').add({
        reviewerId:S.user.uid, reviewerName:S.profile?.fullName||'',
        revieweeId:provId, requestId:reqId,
        rating:S.selectedRating, comment,
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      const allRev=await db.collection('reviews').where('revieweeId','==',provId).get();
      const ratings=allRev.docs.map(d=>d.data().rating);
      const avg=ratings.reduce((a,b)=>a+b,0)/ratings.length;
      await db.collection('users').doc(provId).update({averageRating:avg,totalRatings:ratings.length});
      await db.collection('requests').doc(reqId).update({reviewed:true});
      C.closeModalById('modal-review');
      toast('Review submitted! ⭐','ok');
      C.loadRequests();
    } catch(e){toast('Failed to submit review','err');}
  },

  // ── PAYMENT (PAYSTACK ESCROW) ──────────────────────────────
  openPayment(reqId,provId,skillTitle,amount) {
    S.pendingPayment={reqId,provId,skillTitle,amount};
    $('pay-summary').innerHTML=`
      <div class="pay-row"><span>Service</span><span>${skillTitle}</span></div>
      <div class="pay-row"><span>Amount</span><span>₦${Number(amount).toLocaleString()}</span></div>
      <div class="pay-row"><span>Paystack fee (1.5%)</span><span>₦${Math.round(amount*0.015).toLocaleString()}</span></div>
      <div class="pay-row"><span>Total</span><span>₦${Math.round(amount*1.015).toLocaleString()}</span></div>`;
    $('modal-payment').classList.add('open');
  },

  initiatePayment() {
    if (!S.pendingPayment) return;
    const {reqId,provId,amount}=S.pendingPayment;
    const total=Math.round(amount*1.015*100); // kobo
    const ref=`CIONTI-${reqId}-${Date.now()}`;
    const handler=PaystackPop.setup({
      key: S.paystackKey,
      email: S.user.email||S.profile?.email||'',
      amount: total,
      currency: 'NGN',
      ref,
      metadata:{ custom_fields:[{display_name:'Cionti Request',variable_name:'request_id',value:reqId}]},
      callback: async(res)=>{
        // Hold in escrow
        await db.collection('requests').doc(reqId).update({
          'payment.status':'escrow','payment.amount':amount,
          'payment.paystackRef':res.reference,
          'payment.paidAt':firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('users').doc(provId).update({escrowBalance:firebase.firestore.FieldValue.increment(amount)});
        await db.collection('transactions').add({
          uid:S.user.uid, type:'payment', amount, requestId:reqId,
          paystackRef:res.reference, status:'escrow',
          createdAt:firebase.firestore.FieldValue.serverTimestamp()
        });
        await C.createNotif(provId,'payment',`Payment of ₦${amount.toLocaleString()} received for your service (held in escrow)`,S.user.uid);
        C.closeModalById('modal-payment');
        toast('Payment successful! Held in escrow 🔒','ok');
        C.loadRequests();
      },
      onClose:()=>{}
    });
    handler.openIframe();
  },

  // ── MESSAGES / CHAT ────────────────────────────────────────
  async loadChats() {
    $('chats-list').innerHTML='<div class="loading-c"><div class="spinner"></div></div>';
    if (S.chatsUnsub) S.chatsUnsub();
    S.chatsUnsub=db.collection('chats')
      .where('participants','array-contains',S.user.uid)
      .orderBy('lastMessageTime','desc')
      .onSnapshot(async snap=>{
        if (snap.empty){
          $('chats-list').innerHTML='<div class="empty-c"><div class="ei">💬</div><h3>No conversations yet</h3><p>Message someone from their profile to start a conversation.</p></div>';
          return;
        }
        const chats=snap.docs.map(d=>({id:d.id,...d.data()}));
        const uids=[...new Set(chats.map(c=>c.participants.find(p=>p!==S.user.uid)).filter(Boolean))];
        const users={};
        await Promise.all(uids.map(async uid=>{try{const u=await db.collection('users').doc(uid).get();if(u.exists)users[uid]=u.data();}catch(e){}}));
        $('chats-list').innerHTML=chats.map(c=>{
          const otherId=c.participants.find(p=>p!==S.user.uid);
          const u=users[otherId]||{};
          const unread=c.unreadCount?.[S.user.uid]>0;
          return `<div class="chat-item ${unread?'unread':''}" onclick="C.openChat('${otherId}','${escHtml(u.fullName||'')}')">
            ${avatarEl(u,'av-md')}
            <div style="flex:1;min-width:0">
              <div style="font-weight:${unread?'700':'600'};font-size:.9rem">${u.fullName||'Unknown'}</div>
              <div style="font-size:.78rem;color:var(--textl);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${c.lastMessage||'Start a conversation'}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
              <div style="font-size:.68rem;color:var(--muted)">${fmtTime(c.lastMessageTime)}</div>
              ${unread?`<div class="unread-dot"></div>`:''}
            </div>
          </div>`;
        }).join('');
      });
  },

  async openChat(uid,name='') {
    S.chatOtherUid=uid;
    if (S.msgUnsub){S.msgUnsub();S.msgUnsub=null;}
    // Header
    $('chat-name').textContent=name||'Loading...';
    $('chat-status').textContent='';
    const cavEl=$('chat-av');
    cavEl.className='avatar av-sm';
    cavEl.style.background=avColor(name)+'22';
    cavEl.style.color=avColor(name);
    cavEl.textContent=initials(name);
    $('chat-msgs').innerHTML='<div class="loading-c"><div class="spinner"></div></div>';
    C.goTo('chat');
    $('chat-back').onclick=()=>{if(S.msgUnsub){S.msgUnsub();S.msgUnsub=null;}C.navTo('messages');};

    // Load other user
    try {
      const uSnap=await db.collection('users').doc(uid).get();
      if (uSnap.exists) {
        S.chatOtherProfile=uSnap.data();
        const u=uSnap.data();
        $('chat-name').textContent=u.fullName||name;
        $('chat-status').textContent=u.isAvailable?'● Online':'';
        if (u.profileImageUrl) {
          cavEl.innerHTML=`<img src="${u.profileImageUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
          cavEl.style.background='';
        } else {
          cavEl.textContent=initials(u.fullName);
          cavEl.style.background=avColor(u.fullName)+'22';
          cavEl.style.color=avColor(u.fullName);
        }
      }
    } catch(e){}

    // Create/get chat
    const ids=[S.user.uid,uid].sort();
    S.chatId=ids.join('_');
    const chatRef=db.collection('chats').doc(S.chatId);
    const cSnap=await chatRef.get();
    if (!cSnap.exists) {
      await chatRef.set({participants:ids,lastMessage:'',lastMessageTime:firebase.firestore.FieldValue.serverTimestamp(),unreadCount:{},createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    }
    // Mark read
    await chatRef.update({[`unreadCount.${S.user.uid}`]:0});

    // Listen messages
    S.msgUnsub=db.collection('chats').doc(S.chatId).collection('messages')
      .orderBy('timestamp','asc')
      .onSnapshot(snap=>{
        C.renderMsgs(snap.docs.map(d=>({id:d.id,...d.data()})));
      });
  },

  renderMsgs(msgs) {
    const body=$('chat-msgs'); if(!body)return;
    if (!msgs.length){
      body.innerHTML=`<div style="text-align:center;padding:50px 20px"><div style="font-size:2.5rem;margin-bottom:10px">👋</div><p style="font-size:.82rem;color:var(--muted)">Say hello!</p></div>`;
      return;
    }
    let html='',lastDate='';
    msgs.forEach(m=>{
      const isSent=m.senderId===S.user.uid;
      if (m.timestamp) {
        const d=m.timestamp.toDate().toLocaleDateString('en-NG',{day:'numeric',month:'short'});
        if (d!==lastDate){html+=`<div class="date-sep">${d===new Date().toLocaleDateString('en-NG',{day:'numeric',month:'short'})?'Today':d}</div>`;lastDate=d;}
      }
      const t=m.timestamp?m.timestamp.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
      if (m.type==='image'&&m.imageUrl) {
        html+=`<div class="msg-wrap-${isSent?'sent':'recv'}">
          <img src="${m.imageUrl}" style="max-width:220px;border-radius:12px;cursor:pointer" onclick="window.open('${m.imageUrl}','_blank')" loading="lazy">
          <div class="msg-time">${t}${isSent?` <span class="msg-read">${m.read?'✓✓':'✓'}</span>`:''}</div>
        </div>`;
      } else {
        html+=`<div class="msg-wrap-${isSent?'sent':'recv'}">
          <div class="msg-bubble ${isSent?'msg-sent':'msg-recv'}">${escHtml(m.text)}</div>
          <div class="msg-time">${t}${isSent?` <span class="msg-read">${m.read?'✓✓':'✓'}</span>`:''}</div>
        </div>`;
      }
    });
    body.innerHTML=html;
    body.scrollTop=body.scrollHeight;
  },

  async sendMsg() {
    const inp=$('chat-inp'); if(!inp)return;
    const text=inp.value.trim();
    if (!text||!S.chatId)return;
    inp.value=''; inp.style.height='auto';
    try {
      await db.collection('chats').doc(S.chatId).collection('messages').add({
        senderId:S.user.uid, text, type:'text',
        timestamp:firebase.firestore.FieldValue.serverTimestamp(), read:false
      });
      const prev=text.length>60?text.slice(0,60)+'…':text;
      await db.collection('chats').doc(S.chatId).update({
        lastMessage:prev, lastMessageTime:firebase.firestore.FieldValue.serverTimestamp(),
        [`unreadCount.${S.chatOtherUid}`]:firebase.firestore.FieldValue.increment(1)
      });
    } catch(e){toast('Failed to send','err');}
  },

  async sendImg(input) {
    const f=input.files[0]; if(!f||!S.chatId)return;
    toast('Sending image...');
    try {
      const ref=storage.ref(`chat/${S.chatId}/${Date.now()}`);
      await ref.put(f);
      const url=await ref.getDownloadURL();
      await db.collection('chats').doc(S.chatId).collection('messages').add({
        senderId:S.user.uid, imageUrl:url, type:'image',
        timestamp:firebase.firestore.FieldValue.serverTimestamp(), read:false
      });
      await db.collection('chats').doc(S.chatId).update({
        lastMessage:'📷 Image', lastMessageTime:firebase.firestore.FieldValue.serverTimestamp(),
        [`unreadCount.${S.chatOtherUid}`]:firebase.firestore.FieldValue.increment(1)
      });
      input.value='';
    } catch(e){toast('Failed to send image','err');}
  },

  chatTyping() {
    const inp=$('chat-inp');
    if (inp){inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,120)+'px';}
    // Could add real-time typing indicator via Firestore here
  },

  chatKey(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();C.sendMsg();} },

  // ── MY PROFILE ─────────────────────────────────────────────
  async renderMyProfile() {
    $('my-profile').innerHTML='<div class="loading-c"><div class="spinner"></div></div>';
    try {
      const [uSnap,skSnap]=await Promise.all([
        db.collection('users').doc(S.user.uid).get(),
        db.collection('skills').where('userId','==',S.user.uid).where('isActive','==',true).orderBy('createdAt','desc').get()
      ]);
      S.profile={uid:S.user.uid,...uSnap.data()};
      const skills=skSnap.docs.map(d=>({id:d.id,...d.data()}));
      const ts=trustScore(S.profile);
      const u=S.profile;
      $('my-profile').innerHTML=`
        <div class="profile-hero">
          <div style="display:flex;gap:14px;align-items:center">
            ${avatarEl(u,'av-xl')}
            <div style="flex:1">
              <h2 style="font-size:1.15rem;font-weight:800;color:#fff">${u.fullName||'Your Name'}</h2>
              <div style="font-size:.75rem;color:rgba(255,255,255,.75);margin:3px 0">📍 ${u.city||'Set your location'}${u.state?', '+u.state:''}</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
                ${ts>0?`<span class="trust-badge">🔥 Trust ${ts}</span>`:''}
                <span class="badge ${u.isAvailable?'badge-ok':'badge-n'}">${u.isAvailable?'● Available':'○ Busy'}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:20px;margin-top:14px">
            <div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;color:#fff">${skills.length}</div><div style="font-size:.62rem;color:rgba(255,255,255,.6)">Skills</div></div>
            <div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;color:#fff">${u.completedJobs||0}</div><div style="font-size:.62rem;color:rgba(255,255,255,.6)">Jobs</div></div>
            <div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;color:#fff">${u.averageRating?u.averageRating.toFixed(1):'—'}</div><div style="font-size:.62rem;color:rgba(255,255,255,.6)">Rating</div></div>
            <div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;color:#fff">${u.referralCount||0}</div><div style="font-size:.62rem;color:rgba(255,255,255,.6)">Referrals</div></div>
          </div>
        </div>
        <div style="padding:16px 20px">
          ${u.bio?`<p style="font-size:.85rem;color:var(--textl);line-height:1.7;margin-bottom:16px">${u.bio}</p>`:''}
          <div class="sec-title" style="margin-top:0">My Skills (${skills.length})</div>
          ${skills.map(s=>`
            <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--border)">
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.title}</div>
                <div style="font-size:.72rem;color:var(--textl);margin-top:2px">${s.category} · ${fmtPrice(s.priceType,s.price)}</div>
              </div>
              <button class="btn btn-g btn-sm" onclick='C.editSkill(${JSON.stringify({id:s.id,title:s.title,category:s.category,description:s.description,serviceType:s.serviceType,priceType:s.priceType,price:s.price,tags:s.tags||[]})})'>Edit</button>
            </div>`).join('')}
          <button class="btn btn-o btn-full mt-16" onclick="C.openPostSkill()">+ Add New Skill</button>
          <div class="divider"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
            <button class="btn btn-g" style="font-size:.82rem" onclick="C.goTo('wallet')">💰 Wallet</button>
            <button class="btn btn-g" style="font-size:.82rem" onclick="C.goTo('settings')">⚙️ Settings</button>
          </div>
          <button class="btn btn-bad btn-full" style="opacity:.8" onclick="C.signOut()">Sign Out</button>
        </div>`;
      C.renderSettings();
      C.renderWallet();
    } catch(e){console.error(e);}
  },

  editSkill(skill) { C.openPostSkill(skill); },

  openEditProfile() {
    const u=S.profile||{};
    $('ep-name').value=u.fullName||'';
    $('ep-bio').value=u.bio||'';
    $('ep-city').value=u.city||'';
    $('ep-state').value=u.state||'';
    $('ep-avail').value=String(u.isAvailable!==false);
    $('modal-edit-profile').classList.add('open');
  },

  async saveEditProfile() {
    const name=$('ep-name').value.trim(), bio=$('ep-bio').value.trim(),
          city=$('ep-city').value.trim(), state=$('ep-state').value.trim(),
          avail=$('ep-avail').value==='true';
    const btn=$('btn-save-ep');
    btn.disabled=true; btn.textContent='Saving...';
    try {
      const upd={fullName:name,bio,city,state,isAvailable:avail,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
      const ph=$('ep-photo')?.files[0];
      if (ph){
        const ref=storage.ref(`avatars/${S.user.uid}`);
        await ref.put(ph);
        upd.profileImageUrl=await ref.getDownloadURL();
      }
      await db.collection('users').doc(S.user.uid).update(upd);
      C.closeModalById('modal-edit-profile');
      toast('Profile updated! ✅','ok');
      C.renderMyProfile();
    } catch(e){toast('Save failed','err');}
    finally{btn.disabled=false;btn.textContent='Save Changes';}
  },

  async signOut() {
    if (!confirm('Sign out of Cionti?'))return;
    if (S.chatsUnsub)S.chatsUnsub();
    if (S.msgUnsub)S.msgUnsub();
    if (S.notifsUnsub)S.notifsUnsub();
    await auth.signOut();
    S.user=null;S.profile=null;S.skills=[];
    $('bottom-nav').classList.remove('visible');
    C.goTo('splash');
  },

  // ── WALLET ─────────────────────────────────────────────────
  async renderWallet() {
    const el=$('wallet-content'); if(!el)return;
    const u=S.profile||{};
    const txSnap=await db.collection('transactions').where('uid','==',S.user?.uid).orderBy('createdAt','desc').limit(20).get().catch(()=>({docs:[]}));
    const txs=txSnap.docs.map(d=>({id:d.id,...d.data()}));
    el.innerHTML=`
      <div class="wallet-balance">
        <div class="wallet-bal-lbl">Available Balance</div>
        <div class="wallet-bal-amt">₦${Number(u.walletBalance||0).toLocaleString()}</div>
        ${u.escrowBalance?`<div style="font-size:.78rem;color:rgba(255,255,255,.65);margin-top:4px">🔒 ₦${Number(u.escrowBalance).toLocaleString()} in escrow</div>`:''}
        <div class="wallet-actions">
          <div class="wallet-action-btn" onclick="C.initiateWithdrawal()">💸 Withdraw</div>
          <div class="wallet-action-btn" onclick="toast('Share your profile link to earn referral rewards!')">🔗 Refer &amp; Earn</div>
        </div>
      </div>
      <div class="sec-title" style="margin-top:0">Transaction History</div>
      ${txs.length?txs.map(tx=>{
        const icons={payment:'💳',escrow_release:'🔓',withdrawal:'💸',refund:'↩️'};
        const isCredit=['escrow_release','refund'].includes(tx.type);
        return `<div class="tx-item">
          <div class="tx-icon" style="background:${isCredit?'#DCFCE7':'#FEE2E2'}">${icons[tx.type]||'💰'}</div>
          <div style="flex:1"><div style="font-weight:600;font-size:.85rem">${({payment:'Payment (Escrow)',escrow_release:'Job Payment Released',withdrawal:'Withdrawal',refund:'Refund'}[tx.type]||'Transaction')}</div>
          <div style="font-size:.72rem;color:var(--textl)">${fmtTime(tx.createdAt)}</div></div>
          <div style="font-weight:700;font-size:.9rem;color:${isCredit?'var(--ok)':'var(--bad)'}">
            ${isCredit?'+':'−'}₦${Number(tx.amount||0).toLocaleString()}
          </div>
        </div>`;
      }).join(''):'<div class="empty-c" style="padding:40px 0"><div class="ei">💰</div><p>No transactions yet</p></div>'}`;
  },

  initiateWithdrawal() { toast('Withdrawal feature coming soon. Contact support@cionti.app',''); },

  // ── SETTINGS ───────────────────────────────────────────────
  renderSettings() {
    const el=$('settings-content'); if(!el)return;
    el.innerHTML=`
      <div class="setting-section">Account</div>
      <div class="setting-row" onclick="C.openEditProfile()"><div class="setting-icon" style="background:#EEF2FF">👤</div><div><div class="setting-name">Edit Profile</div><div class="setting-desc">Update your name, bio, photo</div></div><span style="color:var(--muted)">›</span></div>
      <div class="setting-row" onclick="C.goTo('wallet')"><div class="setting-icon" style="background:#FEF3C7">💰</div><div><div class="setting-name">Wallet &amp; Earnings</div><div class="setting-desc">View balance and transactions</div></div><span style="color:var(--muted)">›</span></div>
      <div class="setting-row" onclick="toast('Verification coming soon')"><div class="setting-icon" style="background:#DCFCE7">✅</div><div><div class="setting-name">Get Verified</div><div class="setting-desc">Boost trust with a verified badge</div></div><span style="color:var(--muted)">›</span></div>
      <div class="setting-section">Notifications</div>
      <div class="setting-row"><div class="setting-icon" style="background:#EEF2FF">🔔</div><div style="flex:1"><div class="setting-name">Push Notifications</div><div class="setting-desc">Requests, messages, reviews</div></div><div class="toggle-switch on" id="ts-notifs" onclick="C.toggleSetting('ts-notifs')"><div class="toggle-thumb"></div></div></div>
      <div class="setting-row"><div class="setting-icon" style="background:#EEF2FF">📧</div><div style="flex:1"><div class="setting-name">Email Notifications</div><div class="setting-desc">Weekly digest and updates</div></div><div class="toggle-switch" id="ts-email" onclick="C.toggleSetting('ts-email')"><div class="toggle-thumb"></div></div></div>
      <div class="setting-section">Privacy &amp; Safety</div>
      <div class="setting-row"><div class="setting-icon" style="background:#FEE2E2">🔒</div><div style="flex:1"><div class="setting-name">Profile Visibility</div><div class="setting-desc">Show on map &amp; search</div></div><div class="toggle-switch on" id="ts-visible" onclick="C.toggleSetting('ts-visible')"><div class="toggle-thumb"></div></div></div>
      <div class="setting-row" onclick="toast('Location privacy — only your city/state is shown publicly')"><div class="setting-icon" style="background:#FEF3C7">📍</div><div><div class="setting-name">Location Privacy</div><div class="setting-desc">Only city-level shown publicly</div></div><span style="color:var(--ok)">Protected ›</span></div>
      <div class="setting-section">Support</div>
      <div class="setting-row" onclick="window.open('mailto:support@cionti.app','_blank')"><div class="setting-icon" style="background:#EEF2FF">💬</div><div><div class="setting-name">Contact Support</div><div class="setting-desc">support@cionti.app</div></div><span style="color:var(--muted)">›</span></div>
      <div class="setting-row" onclick="toast('Version 1.0.0 — Community Of Talent In One Network')"><div class="setting-icon" style="background:#EEF2FF">ℹ️</div><div><div class="setting-name">About Cionti</div><div class="setting-desc">Version 1.0.0</div></div><span style="color:var(--muted)">›</span></div>
      <div style="padding:20px"><button class="btn btn-bad btn-full" style="opacity:.8" onclick="C.signOut()">Sign Out</button></div>`;
  },

  toggleSetting(id) {
    const el=$(id); if(!el)return;
    el.classList.toggle('on');
  },

  // ── NOTIFICATIONS ──────────────────────────────────────────
  async loadNotifs() {
    if (!S.user) return;
    if (S.notifsUnsub) S.notifsUnsub();
    S.notifsUnsub=db.collection('notifications')
      .where('toUid','==',S.user.uid)
      .orderBy('createdAt','desc').limit(20)
      .onSnapshot(snap=>{
        const unread=snap.docs.filter(d=>!d.data().read).length;
        const dot=$('notif-dot');
        if (dot) dot.style.display=unread>0?'block':'none';
      });
  },

  async openNotifs() {
    $('modal-notifs').classList.add('open');
    const snap=await db.collection('notifications').where('toUid','==',S.user.uid).orderBy('createdAt','desc').limit(20).get().catch(()=>({docs:[]}));
    const notifs=snap.docs.map(d=>({id:d.id,...d.data()}));
    const typeEmoji={request:'📩',message:'💬',review:'⭐',payment:'💳',request_update:'✅',referral:'🤝'};
    $('notifs-list').innerHTML=notifs.length?notifs.map(n=>`
      <div class="notif-item ${n.read?'':'unread'}" onclick="C.handleNotifTap('${n.id}','${n.type}','${n.fromUid||''}')">
        <div class="notif-icon">${typeEmoji[n.type]||'🔔'}</div>
        <div style="flex:1"><div style="font-size:.85rem;font-weight:${n.read?'500':'700'};line-height:1.4">${n.message||''}</div>
        <div style="font-size:.7rem;color:var(--muted);margin-top:3px">${fmtTime(n.createdAt)}</div></div>
      </div>`).join('')
    :'<div class="empty-c" style="padding:40px 0"><div class="ei">🔔</div><p>No notifications yet</p></div>';
    // Mark all read
    snap.docs.filter(d=>!d.data().read).forEach(d=>d.ref.update({read:true}).catch(()=>{}));
    const dot=$('notif-dot');
    if (dot) dot.style.display='none';
  },

  async handleNotifTap(notifId,type,fromUid) {
    C.closeModalById('modal-notifs');
    if (type==='message'&&fromUid) C.openChat(fromUid,'');
    else if (type==='request') C.switchReqTab('recv');
    else if (fromUid) C.openProfile(fromUid,'');
  },

  async createNotif(toUid,type,message,fromUid='') {
    if (!toUid)return;
    await db.collection('notifications').add({
      toUid, type, message, fromUid, read:false,
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    }).catch(()=>{});
  },

  // ── FIREBASE CLOUD MESSAGING ───────────────────────────────
  async initFCM() {
    try {
      const messaging=firebase.messaging();
      const token=await messaging.getToken({vapidKey:'REPLACE_WITH_VAPID_KEY'});
      if (token && S.user) {
        await db.collection('users').doc(S.user.uid).update({fcmToken:token});
      }
      messaging.onMessage(payload=>{
        toast(payload.notification?.body||'New notification','ok');
      });
    } catch(e){/* FCM not supported or denied */}
  },

  // ── MODALS ─────────────────────────────────────────────────
  closeModal(e,id) { if(e.target===$( id))$( id).classList.remove('open'); },
  closeModalById(id) { $( id)?.classList.remove('open'); },
};

// ── LEAFLET MAP MODULE ─────────────────────────────────────
const CiontiMap = {
  map:null,
  markers:null,
  userMarker:null,
  radiusCircle:null,

  init(lat, lng) {
    const el=$('cionti-map'); if(!el)return;
    CiontiMap.map=L.map('cionti-map',{zoomControl:false,attributionControl:false}).setView([lat,lng],13);
    // OpenStreetMap tiles (free)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,attribution:'© OpenStreetMap'
    }).addTo(CiontiMap.map);
    // Attribution small
    L.control.attribution({prefix:'',position:'bottomleft'}).addTo(CiontiMap.map);
    // Zoom controls top-right
    L.control.zoom({position:'bottomright'}).addTo(CiontiMap.map);
    // Marker cluster group
    CiontiMap.markers=L.markerClusterGroup({
      iconCreateFunction(cluster){
        const cnt=cluster.getChildCount();
        return L.divIcon({
          html:`<div class="marker-cluster-custom">${cnt}</div>`,
          className:'',iconSize:L.point(42,42)
        });
      },
      spiderfyOnMaxZoom:true,
      showCoverageOnHover:false,
      maxClusterRadius:60,
    });
    CiontiMap.map.addLayer(CiontiMap.markers);
    // User location marker
    CiontiMap.addUserMarker(lat,lng);
  },

  addUserMarker(lat,lng) {
    if (!CiontiMap.map)return;
    const icon=L.divIcon({
      html:`<div style="width:20px;height:20px;border-radius:50%;background:var(--p);border:3px solid #fff;box-shadow:0 2px 8px rgba(31,62,199,.5)"></div>`,
      className:'',iconSize:[20,20],iconAnchor:[10,10]
    });
    if (CiontiMap.userMarker) CiontiMap.map.removeLayer(CiontiMap.userMarker);
    CiontiMap.userMarker=L.marker([lat,lng],{icon,zIndexOffset:1000})
      .addTo(CiontiMap.map).bindPopup('<strong>You are here</strong>');
  },

  update(skills,userLat,userLng,radiusKm) {
    if (!CiontiMap.map||!CiontiMap.markers)return;
    CiontiMap.markers.clearLayers();
    // Radius circle
    if (CiontiMap.radiusCircle) CiontiMap.map.removeLayer(CiontiMap.radiusCircle);
    if (userLat) {
      CiontiMap.addUserMarker(userLat,userLng);
      CiontiMap.radiusCircle=L.circle([userLat,userLng],{
        radius:radiusKm*1000,
        color:'var(--p)',fillColor:'var(--pl)',fillOpacity:.08,weight:1.5,dashArray:'5,6'
      }).addTo(CiontiMap.map);
    }
    const catColors={Tech:'#1F3EC7',Design:'#EC4899',Trades:'#F59E0B',Education:'#22C55E',Business:'#8B5CF6',Health:'#EF4444',Creative:'#F97316',Legal:'#6366F1',Finance:'#10B981',Transport:'#3B82F6',Other:'#6B7280'};
    skills.forEach(s=>{
      if (!s.lat||!s.lng)return;
      const u=s.user||{};
      const col=catColors[s.category]||'var(--p)';
      const icon=L.divIcon({
        html:`<div style="width:36px;height:36px;border-radius:50%;background:${col};border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#fff;font-size:.75rem;font-weight:800;font-family:Syne,sans-serif;cursor:pointer">${CAT_EMOJI[s.category]||initials(u.fullName)}</div>`,
        className:'',iconSize:[36,36],iconAnchor:[18,18]
      });
      const dist=userLat?haversine(userLat,userLng,s.lat,s.lng):null;
      const marker=L.marker([s.lat,s.lng],{icon})
        .on('click',()=>CiontiMap.showPeek(s,u,dist));
      CiontiMap.markers.addLayer(marker);
    });
    if (skills.filter(s=>s.lat).length===0&&userLat) {
      CiontiMap.map.setView([userLat,userLng],13);
    }
  },

  showPeek(s,u,dist) {
    const pk=$('map-peek'); if(!pk)return;
    const ts=trustScore(u);
    pk.style.display='block';
    pk.innerHTML=`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        ${avatarEl(u,'av-sm')}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.fullName||'Unknown'}</div>
          <div style="font-size:.7rem;color:var(--textl)">📍 ${dist?fmtDist(dist):(s.city||'')}</div>
        </div>
        <button onclick="$('map-peek').style.display='none'" style="background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer">×</button>
      </div>
      <div style="font-family:'Syne',sans-serif;font-size:.92rem;font-weight:700;margin-bottom:4px">${s.title}</div>
      <div style="font-size:.78rem;color:var(--textl);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:10px">${s.description||''}</div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:6px">
          <span class="badge badge-p">${s.category}</span>
          <span style="font-weight:700;font-size:.85rem;color:var(--p)">${fmtPrice(s.priceType,s.price)}</span>
          ${ts>0?`<span class="trust-badge">🔥 ${ts}</span>`:''}
        </div>
        <button class="btn btn-p btn-sm" onclick="C.openProfile('${s.userId}','${s.id}')">View →</button>
      </div>`;
  },
};

// ── APP INIT ───────────────────────────────────────────────
window.addEventListener('load',()=>{
  auth.onAuthStateChanged(async user=>{
    if (!user){return;} // Stay on splash
    S.user=user;
    try {
      const snap=await db.collection('users').doc(user.uid).get();
      S.profile={uid:user.uid,...snap.data()};
      if (snap.exists&&snap.data().setupComplete) C.bootApp();
      else C.goTo('setup');
    } catch(e){ /* stay on splash */ }
  });
});

// Enter key support
document.addEventListener('keydown',e=>{
  if (e.key==='Enter') {
    const active=document.querySelector('.screen.active');
    if (active?.id==='s-login') C.login();
  }
});

// Expose globally
window.C=C;
window.CiontiMap=CiontiMap;
window.$=$;
