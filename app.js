/* ═══════════════════════════════════════════════════
   CIONTI v2 — App Logic
   Community Of Talent In One Network
═══════════════════════════════════════════════════ */

const S = {
  currentScreen: 'onboard',
  currentNav: 'discover',
  user: null,
  userData: null,
  skills: [],
  filteredSkills: [],
  activeCategory: 'all',
  activeFilters: {},
  currentRadius: 10,
  userLat: 5.5167,
  userLng: 5.7500,
  selectedType: 'both',
  currentViewProfile: null,
  currentChat: null,
  chatUnsub: null,
  reqUnsub: null,
  notifsUnsub: null,
  isGuest: false,
  obSlide: 0,
  selectedSkillForReq: null,
  selectedReqRating: 0,
  currentSkillEdit: null,
  paystackKey: 'pk_test_REPLACE_WITH_YOUR_PAYSTACK_KEY',
  currentPayReq: null,
  aiHistory: [],
  feedLikes: {},
  theme: localStorage.getItem('cionti-theme') || 'dark',
};

const CATS = [
  {id:'tech',label:'💻 Tech',color:'#2952FF'},
  {id:'design',label:'🎨 Design',color:'#9B59B6'},
  {id:'fashion',label:'👗 Fashion',color:'#E91E63'},
  {id:'trades',label:'🔧 Trades',color:'#FF8C00'},
  {id:'beauty',label:'💅 Beauty',color:'#FF69B4'},
  {id:'health',label:'🏥 Health',color:'#00D97E'},
  {id:'education',label:'📚 Education',color:'#2196F3'},
  {id:'legal',label:'⚖️ Legal',color:'#795548'},
  {id:'finance',label:'💰 Finance',color:'#4CAF50'},
  {id:'transport',label:'🚗 Transport',color:'#FF5722'},
  {id:'food',label:'🍽️ Food',color:'#FF9800'},
  {id:'media',label:'📸 Media',color:'#00BCD4'},
  {id:'music',label:'🎵 Music',color:'#673AB7'},
  {id:'events',label:'🎉 Events',color:'#F44336'},
  {id:'other',label:'📦 Other',color:'#607D8B'},
];

const CAT_ICONS = {};
CATS.forEach(c => { CAT_ICONS[c.id] = c.label.split(' ')[0]; });

// ── DB / AUTH references ──
let db, auth, storage;
try {
  db = firebase.firestore();
  auth = firebase.auth();
  storage = firebase.storage();
} catch(e) { console.warn('Firebase not configured:', e.message); }

// ── INIT ──
window.addEventListener('load', () => {
  // Apply theme
  if (S.theme === 'light') document.documentElement.setAttribute('data-theme','light');
  document.getElementById('theme-toggle') && (document.getElementById('theme-toggle').textContent = S.theme === 'dark' ? '🌙' : '☀️');

  if (!auth) { C.goTo('onboard'); return; }

  auth.onAuthStateChanged(user => {
    if (user) {
      S.user = user;
      C.loadUserData(user.uid).then(() => {
        if (S.userData && S.userData.setupComplete) {
          C.enterApp();
        } else {
          C.goTo('setup');
        }
      });
    } else {
      C.goTo('onboard');
    }
  });
});

const C = {

  // ── NAVIGATION ──
  goTo(screen) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });
    const el = document.getElementById('s-' + screen);
    if (el) {
      el.style.display = 'flex';
      requestAnimationFrame(() => el.classList.add('active'));
    }
    S.currentScreen = screen;
    const showNav = ['discover','feed','ai','requests','messages','profile'].includes(screen);
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.classList.toggle('visible', showNav);
  },

  navTo(screen) {
    C.goTo(screen);
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const el = document.getElementById('nav-' + screen);
    if (el) el.classList.add('active');
    S.currentNav = screen;
    if (screen === 'discover' && !S.mapInited) C.initMap();
    if (screen === 'feed') C.loadFeed('community');
    if (screen === 'ai') C.initAI();
    if (screen === 'profile') C.renderMyProfile();
    if (screen === 'messages') C.loadChats();
    if (screen === 'requests') C.loadRequests('recv');
  },

  enterApp() {
    C.navTo('discover');
    C.setupDiscoverHeader();
    C.initCategories();
    C.loadSkills();
    C.listenNotifs();
  },

  browseGuest() {
    S.isGuest = true;
    C.enterApp();
  },

  // ── THEME ──
  toggleTheme() {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('cionti-theme', S.theme);
    if (S.theme === 'light') {
      document.documentElement.setAttribute('data-theme','light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    document.querySelectorAll('.theme-btn').forEach(b => b.textContent = S.theme === 'dark' ? '🌙' : '☀️');
  },

  // ── ONBOARDING ──
  obNext() {
    S.obSlide++;
    if (S.obSlide >= 3) {
      C.goTo('login-options');
      return;
    }
    const slides = document.getElementById('ob-slides');
    if (slides) slides.style.transform = `translateX(-${S.obSlide * 100}%)`;
    const btn = document.getElementById('ob-next-btn');
    if (btn) btn.textContent = S.obSlide === 2 ? 'Get Started →' : 'Next →';
  },

  // ── AUTH ──
  togglePw(id, btn) {
    const inp = document.getElementById(id);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '👁' : '🙈';
  },

  async login() {
    if (!auth) return C.toast('Firebase not configured', 'err');
    const email = document.getElementById('l-email').value.trim();
    const pw = document.getElementById('l-pw').value;
    const errEl = document.getElementById('l-err');
    if (!email || !pw) return C.showErr(errEl, 'Fill in all fields');
    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      await auth.signInWithEmailAndPassword(email, pw);
    } catch(e) {
      btn.disabled = false; btn.textContent = 'Sign In';
      C.showErr(errEl, C.authErr(e.code));
    }
  },

  async register() {
    if (!auth) return C.toast('Firebase not configured', 'err');
    const name = document.getElementById('r-name').value.trim();
    const email = document.getElementById('r-email').value.trim();
    const phone = document.getElementById('r-phone').value.trim();
    const pw = document.getElementById('r-pw').value;
    const terms = document.getElementById('r-terms').checked;
    const errEl = document.getElementById('r-err');
    if (!name || !email || !pw) return C.showErr(errEl, 'Fill in all required fields');
    if (pw.length < 6) return C.showErr(errEl, 'Password must be at least 6 characters');
    if (!terms) return C.showErr(errEl, 'Accept the Terms & Conditions to continue');
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`%c🔑 CIONTI DEV OTP: ${otp}`, 'background:#2952FF;color:white;padding:4px 8px;border-radius:4px;font-weight:bold;font-size:14px');
    S.pendingReg = { name, email, phone, pw, type: S.selectedType, otp };
    document.getElementById('v-dest').textContent = email;
    C.goTo('verify');
    C.startResendTimer();
  },

  async verifyOtp() {
    const code = [0,1,2,3].map(i => document.getElementById('otp-'+i).value).join('');
    const errEl = document.getElementById('otp-err');
    const okEl = document.getElementById('otp-ok');
    if (code.length < 4) return;
    if (S.pendingReg && code === S.pendingReg.otp) {
      [0,1,2,3].forEach(i => document.getElementById('otp-'+i).classList.add('ok'));
      errEl.style.display = 'none'; okEl.style.display = 'block';
      await C.createAccount(S.pendingReg);
    } else {
      [0,1,2,3].forEach(i => document.getElementById('otp-'+i).classList.add('err'));
      errEl.style.display = 'block';
    }
  },

  async createAccount({ name, email, phone, pw, type }) {
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      await cred.user.updateProfile({ displayName: name });
      await db.collection('users').doc(cred.user.uid).set({
        fullName: name, email, phone,
        userType: type,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        averageRating: 0, totalRatings: 0,
        completedJobs: 0, referralCount: 0,
        walletBalance: 0, escrowBalance: 0,
        trustScore: 0, setupComplete: false, isAvailable: true,
      });
      S.user = cred.user;
      C.goTo('setup');
    } catch(e) {
      C.toast(C.authErr(e.code), 'err');
    }
  },

  async loginGoogle() {
    if (!auth) return C.toast('Firebase not configured', 'err');
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await auth.signInWithPopup(provider);
      const doc = await db.collection('users').doc(cred.user.uid).get();
      if (!doc.exists) {
        await db.collection('users').doc(cred.user.uid).set({
          fullName: cred.user.displayName || '', email: cred.user.email || '',
          phone: '', userType: 'both',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          averageRating: 0, totalRatings: 0,
          completedJobs: 0, referralCount: 0,
          walletBalance: 0, escrowBalance: 0,
          trustScore: 0, setupComplete: false, isAvailable: true,
          profileImageUrl: cred.user.photoURL || '',
        });
      }
    } catch(e) {
      C.toast(C.authErr(e.code), 'err');
    }
  },

  async sendPhoneCode() {
    if (!auth) return C.toast('Firebase not configured', 'err');
    const phone = document.getElementById('ph-num').value.trim();
    if (!phone) return;
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-phone', { size: 'invisible' });
      }
      window.confirmationResult = await auth.signInWithPhoneNumber(phone, window.recaptchaVerifier);
      S.pendingPhone = { phone };
      document.getElementById('v-dest').textContent = phone;
      C.goTo('verify');
    } catch(e) {
      document.getElementById('ph-err').textContent = e.message;
      document.getElementById('ph-err').classList.add('show');
    }
  },

  otpIn(i) {
    const val = document.getElementById('otp-'+i).value;
    [0,1,2,3].forEach(j => document.getElementById('otp-'+j).classList.remove('err','ok'));
    if (val && i < 3) document.getElementById('otp-'+(i+1)).focus();
  },

  otpKey(e, i) {
    if (e.key === 'Backspace' && !document.getElementById('otp-'+i).value && i > 0) {
      document.getElementById('otp-'+(i-1)).focus();
    }
  },

  resendOtp() {
    if (S.pendingReg) {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      S.pendingReg.otp = otp;
      console.log(`%c🔑 NEW OTP: ${otp}`, 'background:#2952FF;color:white;padding:4px 8px;border-radius:4px');
      C.toast('New code sent!', 'ok');
      C.startResendTimer();
    }
  },

  startResendTimer() {
    let t = 60;
    const lnk = document.getElementById('resend-lnk');
    const tmr = document.getElementById('resend-tmr');
    if (lnk) lnk.style.display = 'none';
    if (tmr) { tmr.style.display = 'block'; tmr.textContent = `Resend in ${t}s`; }
    const iv = setInterval(() => {
      t--;
      if (tmr) tmr.textContent = `Resend in ${t}s`;
      if (t <= 0) {
        clearInterval(iv);
        if (lnk) lnk.style.display = 'inline';
        if (tmr) tmr.style.display = 'none';
      }
    }, 1000);
  },

  async forgotPw() {
    const email = document.getElementById('l-email').value.trim();
    if (!email) return C.toast('Enter your email first');
    try {
      await auth.sendPasswordResetEmail(email);
      C.toast('Reset email sent! Check inbox.', 'ok');
    } catch(e) { C.toast(C.authErr(e.code), 'err'); }
  },

  authErr(code) {
    const m = {
      'auth/user-not-found': 'No account with that email',
      'auth/wrong-password': 'Incorrect password',
      'auth/email-already-in-use': 'Email already registered',
      'auth/invalid-email': 'Invalid email address',
      'auth/weak-password': 'Password too weak (min 6 chars)',
      'auth/too-many-requests': 'Too many attempts. Try later.',
      'auth/network-request-failed': 'Network error. Check connection.',
    };
    return m[code] || 'Something went wrong. Try again.';
  },

  showErr(el, msg) { if (el) { el.textContent = msg; el.classList.add('show'); } },

  selType(type) {
    S.selectedType = type;
    ['both','provider','seeker'].forEach(t => {
      document.getElementById('to-'+t)?.classList.toggle('on', t === type);
    });
  },

  // ── SETUP ──
  previewSetupAv(inp) {
    if (!inp.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
      const av = document.getElementById('setup-av');
      av.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
      S.setupPhoto = inp.files[0];
    };
    reader.readAsDataURL(inp.files[0]);
  },

  async detectLoc() {
    if (!navigator.geolocation) return C.toast('Geolocation not supported');
    C.toast('Detecting location...');
    navigator.geolocation.getCurrentPosition(async pos => {
      S.userLat = pos.coords.latitude;
      S.userLng = pos.coords.longitude;
      S.detectedLat = S.userLat; S.detectedLng = S.userLng;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${S.userLat}&lon=${S.userLng}&format=json`);
        const d = await r.json();
        const city = d.address?.city || d.address?.town || d.address?.village || d.address?.suburb || '';
        const state = d.address?.state || '';
        if (city) document.getElementById('setup-city').value = city;
        if (state) document.getElementById('setup-state').value = state;
      } catch(e) {}
      const ok = document.getElementById('loc-ok');
      if (ok) ok.classList.add('show');
      C.toast('Location detected!', 'ok');
    }, () => C.toast('Could not detect location', 'err'));
  },

  async saveSetup() {
    if (!auth || !S.user) return;
    const city = document.getElementById('setup-city').value.trim();
    const state = document.getElementById('setup-state').value.trim();
    const bio = document.getElementById('setup-bio').value.trim();
    if (!city) return C.toast('Enter your city', 'err');
    const data = { bio, city, state, setupComplete: true, lat: S.detectedLat || S.userLat, lng: S.detectedLng || S.userLng };
    if (S.setupPhoto && storage) {
      try {
        const ref = storage.ref(`profiles/${S.user.uid}`);
        await ref.put(S.setupPhoto);
        data.profileImageUrl = await ref.getDownloadURL();
      } catch(e) {}
    }
    await db.collection('users').doc(S.user.uid).update(data);
    await C.loadUserData(S.user.uid);
    C.enterApp();
  },

  skipSetup() {
    if (db && S.user) db.collection('users').doc(S.user.uid).update({ setupComplete: true });
    C.enterApp();
  },

  // ── USER DATA ──
  async loadUserData(uid) {
    if (!db) return;
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists) S.userData = doc.data();
    } catch(e) {}
  },

  // ── DISCOVER HEADER ──
  setupDiscoverHeader() {
    if (!S.userData && !S.isGuest) return;
    const nameEl = document.getElementById('disc-name');
    const avEl = document.getElementById('disc-av');
    const locEl = document.getElementById('disc-loc');
    const name = S.userData?.fullName || S.user?.displayName || 'Explorer';
    const firstName = name.split(' ')[0];
    if (nameEl) nameEl.textContent = `Hi, ${firstName} 👋`;
    if (locEl) locEl.textContent = `📍 ${S.userData?.city || 'Effurun'}, Nigeria`;
    if (avEl) {
      const img = S.userData?.profileImageUrl || S.user?.photoURL;
      if (img) {
        avEl.innerHTML = `<img src="${img}" style="width:100%;height:100%;object-fit:cover">`;
      } else {
        avEl.textContent = firstName[0].toUpperCase();
        avEl.style.background = C.avatarColor(name);
        avEl.style.color = '#fff';
        avEl.style.fontWeight = '800';
        avEl.style.display = 'flex';
        avEl.style.alignItems = 'center';
        avEl.style.justifyContent = 'center';
      }
    }
  },

  avatarColor(name) {
    const palette = ['#2952FF','#5B7FFF','#0EA5E9','#00D97E','#FFB800','#8B5CF6','#EC4899','#FF5722'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFFFF;
    return palette[Math.abs(h) % palette.length];
  },

  renderAvatar(container, name, imageUrl, size='av-md') {
    if (!container) return;
    container.className = `avatar ${size}`;
    if (imageUrl) {
      container.innerHTML = `<img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover">`;
    } else {
      container.textContent = (name || '?')[0].toUpperCase();
      container.style.background = C.avatarColor(name || '?');
      container.style.color = '#fff';
    }
  },

  // ── CATEGORIES ──
  initCategories() {
    const el = document.getElementById('cat-chips');
    const fel = document.getElementById('f-cat');
    const psel = document.getElementById('ps-cat');
    if (!el) return;
    const all = `<div class="chip on" data-cat="all" onclick="C.filterByCategory('all',this)">✨ All</div>`;
    const chips = CATS.map(c => `<div class="chip" data-cat="${c.id}" onclick="C.filterByCategory('${c.id}',this)">${c.label}</div>`).join('');
    el.innerHTML = all + chips;
    if (fel) CATS.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.label; fel.appendChild(o); });
    if (psel) CATS.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.label; psel.appendChild(o); });
  },

  filterByCategory(cat, el) {
    S.activeCategory = cat;
    document.querySelectorAll('#cat-chips .chip').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
    C.renderSkills();
  },

  // ── MAP ──
  mapInited: false,
  map: null,
  markerCluster: null,
  markers: [],

  initMap() {
    if (S.mapInited) return;
    S.mapInited = true;
    const map = L.map('cionti-map', { zoomControl: false }).setView([S.userLat, S.userLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    C.map = map;
    C.markerCluster = L.markerClusterGroup({
      iconCreateFunction: cluster => L.divIcon({
        html: `<div class="marker-cluster-custom">${cluster.getChildCount()}</div>`,
        className: '', iconSize: [40,40],
      }),
    });
    map.addLayer(C.markerCluster);
    // User dot
    L.circleMarker([S.userLat, S.userLng], { radius:10, color:'#2952FF', fillColor:'#2952FF', fillOpacity:1, weight:3 }).addTo(map).bindPopup('You');
    navigator.geolocation?.getCurrentPosition(pos => {
      S.userLat = pos.coords.latitude; S.userLng = pos.coords.longitude;
      map.setView([S.userLat, S.userLng], 13);
    });
    C.renderMapMarkers();
  },

  renderMapMarkers() {
    if (!C.markerCluster) return;
    C.markerCluster.clearLayers();
    C.markers = [];
    const skills = C.getFilteredSkills();
    skills.forEach(skill => {
      if (!skill.lat || !skill.lng) return;
      const cat = CATS.find(c => c.id === skill.category) || CATS[CATS.length-1];
      const icon = L.divIcon({
        html: `<div style="width:36px;height:36px;border-radius:50%;background:${cat.color};display:flex;align-items:center;justify-content:center;font-size:16px;border:2.5px solid rgba(255,255,255,0.8);box-shadow:0 2px 10px rgba(0,0,0,0.3)">${CAT_ICONS[skill.category]||'⭐'}</div>`,
        className: '', iconSize: [36,36], iconAnchor: [18,36],
      });
      const m = L.marker([skill.lat, skill.lng], { icon });
      m.on('click', () => C.showMapPeek(skill));
      C.markerCluster.addLayer(m);
    });
  },

  showMapPeek(skill) {
    const peek = document.getElementById('map-peek');
    if (!peek) return;
    const dist = C.haversine(S.userLat, S.userLng, skill.lat, skill.lng);
    peek.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="font-size:1.6rem">${CAT_ICONS[skill.category]||'⭐'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${skill.title}</div>
          <div style="font-size:.73rem;color:var(--textl)">${skill.userName||'Unknown'} · ${dist.toFixed(1)}km away</div>
        </div>
        <div style="font-size:.75rem;font-weight:700;color:var(--ok)">${C.formatPrice(skill)}</div>
      </div>
      <button class="btn btn-p btn-full btn-sm" onclick="C.viewProfile('${skill.userId}')">View Profile →</button>
      <div style="position:absolute;top:10px;right:10px;cursor:pointer;color:var(--textm);font-size:1.1rem" onclick="document.getElementById('map-peek').style.display='none'">×</div>
    `;
    peek.style.display = 'block';
  },

  haversine(lat1,lng1,lat2,lng2) {
    const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  },

  switchView(view) {
    document.getElementById('map-view').style.display = view==='map' ? 'flex' : 'none';
    document.getElementById('list-view').style.display = view==='list' ? 'block' : 'none';
    document.getElementById('radius-wrap').style.display = view==='map' ? 'flex' : 'none';
    document.getElementById('vt-map').classList.toggle('on', view==='map');
    document.getElementById('vt-list').classList.toggle('on', view==='list');
    if (view==='map' && !S.mapInited) C.initMap();
    if (view==='list') C.renderSkillList();
  },

  updateRadius(val) {
    S.currentRadius = parseInt(val);
    document.getElementById('rad-label').textContent = val+'km';
    C.renderSkills();
  },

  // ── SKILLS ──
  async loadSkills() {
    if (!db) return;
    try {
      const snap = await db.collection('skills').where('isActive','==',true).orderBy('createdAt','desc').limit(100).get();
      S.skills = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      C.renderSkills();
    } catch(e) {}
  },

  getFilteredSkills() {
    let skills = S.skills;
    const search = document.getElementById('disc-search')?.value.toLowerCase().trim();
    if (search) skills = skills.filter(s =>
      s.title?.toLowerCase().includes(search) ||
      s.description?.toLowerCase().includes(search) ||
      s.tags?.some(t => t.toLowerCase().includes(search)) ||
      s.userName?.toLowerCase().includes(search)
    );
    if (S.activeCategory !== 'all') skills = skills.filter(s => s.category === S.activeCategory);
    if (S.activeFilters.stype && S.activeFilters.stype !== 'all') skills = skills.filter(s => s.serviceType===S.activeFilters.stype||s.serviceType==='both');
    if (S.activeFilters.price && S.activeFilters.price !== 'all') skills = skills.filter(s => s.priceType===S.activeFilters.price);
    if (S.activeFilters.avail === 'true') skills = skills.filter(s => s.isAvailable);
    if (S.activeFilters.maxPrice) skills = skills.filter(s => !s.price || s.price <= parseInt(S.activeFilters.maxPrice));
    skills = skills.filter(s => !s.lat || C.haversine(S.userLat,S.userLng,s.lat,s.lng) <= S.currentRadius);
    skills.sort((a,b) => {
      const da = (a.lat&&a.lng) ? C.haversine(S.userLat,S.userLng,a.lat,a.lng) : 999;
      const db2 = (b.lat&&b.lng) ? C.haversine(S.userLat,S.userLng,b.lat,b.lng) : 999;
      return da-db2;
    });
    return skills;
  },

  renderSkills() {
    C.renderMapMarkers();
    C.renderSkillList();
  },

  renderSkillList() {
    const el = document.getElementById('skill-list');
    if (!el) return;
    const skills = C.getFilteredSkills();
    if (!skills.length) {
      el.innerHTML = `<div class="empty-c"><div class="ei">🔍</div><h3>No skills found</h3><p>Try adjusting your search or increase the radius</p></div>`;
      return;
    }
    el.innerHTML = skills.map(s => {
      const dist = (s.lat&&s.lng) ? `<span>${C.haversine(S.userLat,S.userLng,s.lat,s.lng).toFixed(1)}km</span>` : '';
      const cat = CATS.find(c=>c.id===s.category)||CATS[CATS.length-1];
      return `<div class="skill-card" onclick="C.viewProfile('${s.userId}')">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="width:44px;height:44px;border-radius:12px;background:${cat.color}22;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0">${CAT_ICONS[s.category]||'⭐'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.9rem;margin-bottom:2px">${s.title}</div>
            <div style="font-size:.78rem;color:var(--textl);margin-bottom:6px">${s.userName||'Unknown'}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="badge badge-n">${cat.label}</span>
              ${s.isAvailable ? '<span class="badge badge-ok">✅ Available</span>' : ''}
              <span class="badge badge-p">${C.formatPrice(s)}</span>
              ${dist ? `<span class="text-xs text-muted">📍 ${dist._innerText||dist.replace(/<[^>]*>/g,'')}</span>` : ''}
            </div>
          </div>
          ${s.averageRating>0 ? `<div style="text-align:right;flex-shrink:0"><div style="color:var(--gold);font-size:.8rem">⭐${s.averageRating.toFixed(1)}</div></div>` : ''}
        </div>
      </div>`;
    }).join('');
    // fix distance display
    el.querySelectorAll('.skill-card').forEach((card,i) => {
      const s = skills[i];
      if (s.lat && s.lng) {
        const distEl = card.querySelector('.text-muted');
        if (distEl) distEl.textContent = `📍 ${C.haversine(S.userLat,S.userLng,s.lat,s.lng).toFixed(1)}km`;
      }
    });
  },

  filterSkills() { C.renderSkills(); },

  formatPrice(skill) {
    if (skill.priceType === 'free') return 'Free';
    if (skill.priceType === 'negotiable') return 'Negotiate';
    if (skill.price) return `₦${parseInt(skill.price).toLocaleString()}`;
    return 'Ask';
  },

  // ── FILTERS ──
  openFilters() {
    const el = document.getElementById('s-filters');
    if (el) { el.style.display = 'flex'; requestAnimationFrame(() => el.style.opacity='1'); }
  },
  closeFilters(e) {
    if (e.target.id === 's-filters') {
      document.getElementById('s-filters').style.display = 'none';
    }
  },
  selTgl(groupId, el) {
    document.querySelectorAll(`#${groupId} .tgl`).forEach(t => t.classList.remove('on'));
    el.classList.add('on');
  },
  applyFilters() {
    S.activeFilters = {
      stype: document.querySelector('#f-stype .tgl.on')?.dataset.v,
      price: document.querySelector('#f-price .tgl.on')?.dataset.v,
      avail: document.querySelector('#f-avail .tgl.on')?.dataset.v,
      maxPrice: document.getElementById('f-max').value,
    };
    document.getElementById('s-filters').style.display = 'none';
    C.renderSkills();
  },
  resetFilters() {
    S.activeFilters = {};
    document.querySelectorAll('.tgl.on').forEach(t => { t.classList.remove('on'); t.closest('.tgl-row')?.querySelector('.tgl')?.classList.add('on'); });
    document.getElementById('f-max').value = '';
    document.getElementById('s-filters').style.display = 'none';
    C.renderSkills();
  },

  // ── FEED ──
  async loadFeed(tab) {
    const el = document.getElementById('feed-content');
    if (!el) return;
    el.innerHTML = `<div class="loading-c"><div class="spinner"></div></div>`;
    if (tab === 'community') await C.loadCommunityFeed(el);
    else if (tab === 'jobs') await C.loadJobsFeed(el);
    else if (tab === 'trending') await C.loadTrendingFeed(el);
    else if (tab === 'news') await C.loadNewsFeed(el);
  },

  async loadCommunityFeed(el) {
    if (!db) { el.innerHTML = '<div class="empty-c"><div class="ei">🔥</div><h3>Community Feed</h3><p>Sign in to see activity</p></div>'; return; }
    try {
      const snap = await db.collection('skills').where('isActive','==',true).orderBy('createdAt','desc').limit(20).get();
      const skills = snap.docs.map(d=>({id:d.id,...d.data()}));
      if (!skills.length) { el.innerHTML = '<div class="empty-c"><div class="ei">🔥</div><h3>No posts yet</h3><p>Be the first to post a skill!</p></div>'; return; }
      el.innerHTML = skills.map(s => {
        const cat = CATS.find(c=>c.id===s.category)||CATS[CATS.length-1];
        const liked = S.feedLikes[s.id];
        return `<div class="feed-card">
          <div style="padding:14px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <div class="avatar av-sm" style="background:${C.avatarColor(s.userName||'?')};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem">${(s.userName||'?')[0].toUpperCase()}</div>
              <div style="flex:1">
                <div style="font-weight:700;font-size:.87rem">${s.userName||'Unknown'}</div>
                <div style="font-size:.72rem;color:var(--textl)">${s.city||''} · ${C.timeAgo(s.createdAt)}</div>
              </div>
              <span class="badge badge-n">${cat.label}</span>
            </div>
            <div style="font-weight:700;margin-bottom:4px">${s.title}</div>
            <div style="font-size:.83rem;color:var(--textl);line-height:1.6;margin-bottom:8px">${(s.description||'').substring(0,120)}${s.description?.length>120?'...':''}</div>
            ${s.portfolioImageUrl ? `<img src="${s.portfolioImageUrl}" style="width:100%;border-radius:10px;max-height:200px;object-fit:cover;margin-bottom:8px" loading="lazy">` : ''}
            <div style="display:flex;gap:8px"><span class="badge badge-p">${C.formatPrice(s)}</span>${s.isAvailable?'<span class="badge badge-ok">✅ Available</span>':''}</div>
          </div>
          <div class="feed-actions">
            <button class="feed-action-btn ${liked?'liked':''}" onclick="C.toggleLike('${s.id}',this)"><span>${liked?'❤️':'🤍'}</span>${liked?'Liked':'Like'}</button>
            <button class="feed-action-btn" onclick="C.viewProfile('${s.userId}')"><span>👁</span>View</button>
            <button class="feed-action-btn" onclick="C.openChatWithUser('${s.userId}','${s.userName||''}')"><span>💬</span>Message</button>
          </div>
        </div>`;
      }).join('');
    } catch(e) { el.innerHTML = `<div class="empty-c"><div class="ei">⚠️</div><h3>Could not load feed</h3><p>${e.message}</p></div>`; }
  },

  async loadJobsFeed(el) {
    el.innerHTML = `
      <div style="padding:12px 0">
        <div style="margin-bottom:12px">
          <div class="badge badge-p" style="margin-bottom:8px">🌐 External Jobs · Powered by RSS</div>
          <p style="font-size:.8rem;color:var(--textl);line-height:1.6">Jobs sourced from public feeds. Tap to view on original site.</p>
        </div>
        ${['Frontend Developer — Lagos','UI/UX Designer — Remote Nigeria','Android Developer — Port Harcourt','Fashion Designer — Abuja','Electrician — Delta State','Digital Marketer — Warri'].map((j,i)=>`
        <div class="job-card" onclick="C.openJobLink()">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="job-logo">${['💻','🎨','📱','👗','⚡','📢'][i]}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:.88rem;margin-bottom:2px">${j}</div>
              <div style="font-size:.75rem;color:var(--textl)">Posted today · Full-time</div>
            </div>
            <div style="color:var(--p);font-size:.8rem;font-weight:700">Apply →</div>
          </div>
        </div>`).join('')}
        <div class="empty-c" style="padding:20px 0">
          <div class="ei">💼</div>
          <p style="font-size:.8rem">Connect your Cionti profile to Indeed & LinkedIn to see personalised jobs here</p>
          <button class="btn btn-o btn-sm mt-8" onclick="C.toast('Coming soon!','ok')">Connect LinkedIn</button>
        </div>
      </div>`;
  },

  async loadTrendingFeed(el) {
    const trending = CATS.map(c => ({
      cat: c, count: Math.floor(Math.random()*50)+5
    })).sort((a,b)=>b.count-a.count);
    el.innerHTML = `
      <div style="padding:12px 0">
        <div class="badge badge-gold mb-16">📈 Trending in Effurun/Warri this week</div>
        ${trending.map((t,i)=>`
        <div class="feed-card" onclick="C.filterByCategory('${t.cat.id}',document.querySelector('[data-cat=${t.cat.id}]')||document.querySelector('.chip'));C.navTo('discover')">
          <div style="padding:14px;display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:${t.cat.color}22;display:flex;align-items:center;justify-content:center;font-size:1.3rem">${CAT_ICONS[t.cat.id]}</div>
            <div style="flex:1">
              <div style="font-weight:700">${t.cat.label.split(' ').slice(1).join(' ')}</div>
              <div style="font-size:.75rem;color:var(--textl)">${t.count} active providers near you</div>
            </div>
            <div style="display:flex;align-items:center;gap:4px">
              <div style="width:60px;height:6px;border-radius:3px;background:var(--bg3);overflow:hidden">
                <div style="height:100%;width:${Math.min(100,(t.count/55)*100)}%;background:${t.cat.color};border-radius:3px"></div>
              </div>
              <span style="font-size:.72rem;color:var(--textm)">#${i+1}</span>
            </div>
          </div>
        </div>`).join('')}
      </div>`;
  },

  async loadNewsFeed(el) {
    el.innerHTML = `
      <div style="padding:12px 0">
        <div class="badge badge-n mb-16">📰 Tech & Business News — Nigeria</div>
        ${[
          {title:'Nigeria\'s tech startup ecosystem raises $100M in Q1 2026',src:'TechCabal',time:'2h ago',emoji:'🚀'},
          {title:'Delta State government launches digital skills program for youths',src:'The Guardian NG',time:'4h ago',emoji:'📚'},
          {title:'Paystack announces lower transaction fees for micro-businesses',src:'BusinessDay',time:'6h ago',emoji:'💰'},
          {title:'How Warri\'s informal economy is going digital in 2026',src:'Nairametrics',time:'1d ago',emoji:'🌍'},
          {title:'Freelance economy: Nigerians earning in dollars from local skills',src:'TechPoint Africa',time:'2d ago',emoji:'💪'},
        ].map(n=>`
        <div class="feed-card" onclick="C.toast('Opening article...')">
          <div style="padding:14px;display:flex;gap:12px;align-items:flex-start">
            <div style="font-size:1.6rem">${n.emoji}</div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:.87rem;line-height:1.5;margin-bottom:4px">${n.title}</div>
              <div style="font-size:.72rem;color:var(--textl)">${n.src} · ${n.time}</div>
            </div>
          </div>
        </div>`).join('')}
      </div>`;
  },

  openJobLink() { C.toast('Opening job listing...'); },

  toggleLike(id, btn) {
    S.feedLikes[id] = !S.feedLikes[id];
    btn.classList.toggle('liked', S.feedLikes[id]);
    btn.innerHTML = `<span>${S.feedLikes[id]?'❤️':'🤍'}</span>${S.feedLikes[id]?'Liked':'Like'}`;
  },

  switchFeedTab(btn, tab) {
    document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('on'));
    btn.classList.add('on');
    C.loadFeed(tab);
  },

  timeAgo(ts) {
    if (!ts) return 'Recently';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now()-d)/1000);
    if (diff<60) return 'Just now';
    if (diff<3600) return `${Math.floor(diff/60)}m ago`;
    if (diff<86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  },

  // ── AI MATCHER ──
  aiInited: false,
  initAI() {
    if (S.aiHistory.length) return;
    const msgs = document.getElementById('ai-msgs');
    const suggs = document.getElementById('ai-suggestions');
    if (!msgs) return;
    const welcome = `<div class="ai-bubble">👋 Hi${S.userData?' '+S.userData.fullName.split(' ')[0]:''}! I'm Cionti AI.<br><br>Tell me what skill or service you need and I'll find the best match near you. Try: <em>"I need an electrician in Effurun"</em> or <em>"Find me a graphic designer under ₦10,000"</em></div>`;
    msgs.innerHTML = welcome;
    if (suggs) suggs.innerHTML = ['🔧 Plumber near me','💻 Web developer','✂️ Barber or stylist','📸 Photographer','🍽️ Caterer for events'].map(s=>`<div class="ai-suggestion" onclick="C.sendAiSuggestion('${s}')">${s}</div>`).join('');
  },

  sendAiSuggestion(text) {
    const inp = document.getElementById('ai-inp');
    if (inp) inp.value = text;
    C.sendAiMsg();
  },

  aiKey(e) { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); C.sendAiMsg(); } },
  aiTyping(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,100)+'px'; },

  async sendAiMsg() {
    const inp = document.getElementById('ai-inp');
    const msgs = document.getElementById('ai-msgs');
    if (!inp || !msgs) return;
    const text = inp.value.trim();
    if (!text) return;
    inp.value = ''; inp.style.height = 'auto';
    msgs.innerHTML += `<div class="ai-bubble user">${text}</div>`;
    msgs.innerHTML += `<div class="ai-bubble" id="ai-typing"><span class="ai-typing"><span></span><span></span><span></span></span></div>`;
    msgs.scrollTop = msgs.scrollHeight;
    S.aiHistory.push({ role:'user', content:text });
    try {
      const systemPrompt = `You are Cionti AI, a skill-matching assistant for a Nigerian local talent platform. Users describe what they need and you help them find local talent.

Current platform skills available: ${S.skills.slice(0,20).map(s=>`${s.title} (${s.category}, ${s.city||'Effurun'}, ${C.formatPrice(s)})`).join('; ') || 'No skills posted yet — encourage them to post or browse.'}

User location: ${S.userData?.city || 'Effurun'}, Nigeria.

Reply in 2-3 short paragraphs. Be helpful, conversational, and match Nigerian context. If relevant skills exist, mention them specifically. End with a quick action suggestion like "Want me to filter the map?" or "Should I show you their profiles?". Keep responses under 150 words.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:300,
          system:systemPrompt,
          messages: S.aiHistory,
        })
      });
      const data = await response.json();
      const reply = data.content?.[0]?.text || 'I couldn\'t find a match right now. Try browsing the map or adjusting your search!';
      S.aiHistory.push({ role:'assistant', content:reply });
      document.getElementById('ai-typing')?.remove();
      msgs.innerHTML += `<div class="ai-bubble">${reply.replace(/\n/g,'<br>')}</div>`;
      msgs.scrollTop = msgs.scrollHeight;
    } catch(e) {
      document.getElementById('ai-typing')?.remove();
      msgs.innerHTML += `<div class="ai-bubble">I'm having trouble connecting right now. Try browsing the <span class="link-p" onclick="C.navTo('discover')">map view</span> to find local talent!</div>`;
      msgs.scrollTop = msgs.scrollHeight;
    }
  },

  // ── VIEW PROFILE ──
  async viewProfile(userId) {
    if (!db || !userId) return;
    try {
      const doc = await db.collection('users').doc(userId).get();
      if (!doc.exists) return C.toast('Profile not found');
      const user = doc.data();
      S.currentViewProfile = { id:userId, ...user };
      const skillsSnap = await db.collection('skills').where('userId','==',userId).where('isActive','==',true).get();
      const skills = skillsSnap.docs.map(d=>({id:d.id,...d.data()}));
      const reviewsSnap = await db.collection('reviews').where('revieweeId','==',userId).orderBy('createdAt','desc').limit(10).get();
      const reviews = reviewsSnap.docs.map(d=>d.data());
      C.renderViewProfile(user, skills, reviews);
      C.goTo('view-profile');
      document.getElementById('vp-back').onclick = () => C.goTo(S.currentNav||'discover');
      const showReq = S.user && userId !== S.user.uid && skills.length > 0;
      const reqBtn = document.getElementById('vp-req-btn');
      if (reqBtn) { reqBtn.style.display = showReq ? 'flex' : 'none'; }
    } catch(e) { C.toast('Could not load profile', 'err'); }
  },

  renderViewProfile(user, skills, reviews) {
    const el = document.getElementById('vp-content');
    if (!el) return;
    const trust = C.calcTrust(user);
    const isOnline = Math.random() > 0.5;
    el.innerHTML = `
      <div class="profile-hero">
        <div style="display:flex;align-items:flex-end;gap:14px;margin-bottom:14px;position:relative;z-index:1">
          <div class="avatar av-xl ${isOnline?'av-online':''}" style="background:${C.avatarColor(user.fullName||'?')};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800">
            ${user.profileImageUrl ? `<img src="${user.profileImageUrl}" style="width:100%;height:100%;object-fit:cover">` : (user.fullName||'?')[0].toUpperCase()}
          </div>
          <div style="flex:1">
            <h2 style="font-size:1.2rem;font-weight:800;color:#fff;margin-bottom:2px">${user.fullName||'Unknown'}</h2>
            <div style="font-size:.78rem;color:rgba(255,255,255,.75);margin-bottom:6px">📍 ${user.city||'Nigeria'} ${user.state?'· '+user.state:''}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${isOnline?'<span class="badge" style="background:rgba(0,217,126,.25);color:#00D97E">🟢 Online</span>':''}
              ${user.isAvailable?'<span class="badge badge-ok">✅ Available</span>':'<span class="badge badge-n">⏸ Busy</span>'}
              <span class="trust-badge">⭐ ${trust}</span>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;position:relative;z-index:1">
          ${[['⭐','Rating',user.averageRating?(user.averageRating.toFixed(1)+'/5'):'New'],['✅','Jobs',user.completedJobs||0],['🤝','Refers',user.referralCount||0]].map(([i,l,v])=>`
          <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:8px;text-align:center">
            <div style="font-size:.7rem;color:rgba(255,255,255,.65);margin-bottom:2px">${i} ${l}</div>
            <div style="font-weight:800;color:#fff">${v}</div>
          </div>`).join('')}
        </div>
      </div>
      <div style="padding:16px 20px">
        ${user.bio ? `<p style="font-size:.87rem;color:var(--textl);line-height:1.7;margin-bottom:16px">${user.bio}</p>` : ''}
        ${skills.length ? `<div class="sec-title">Skills & Services (${skills.length})</div>
        ${skills.map(s=>`<div class="profile-skill" onclick="C.selectSkillForReq('${s.id}')">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:1.3rem">${CAT_ICONS[s.category]||'⭐'}</span>
            <div style="flex:1"><div style="font-weight:700;font-size:.88rem">${s.title}</div><div style="font-size:.75rem;color:var(--textl)">${C.formatPrice(s)} · ${s.serviceType==='remote'?'🌐 Remote':s.serviceType==='physical'?'📍 In-Person':'🔄 Both'}</div></div>
            <span id="sk-check-${s.id}" style="display:none;color:var(--p)">✓</span>
          </div>
        </div>`).join('')}` : '<p class="text-sm text-muted text-c" style="padding:16px 0">No skills posted yet</p>'}
        ${reviews.length ? `<div class="sec-title">Reviews (${reviews.length})</div>
        ${reviews.map(r=>`<div class="review-item">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <div class="stars-html">${'⭐'.repeat(r.rating||0)}</div>
            <span style="font-size:.72rem;color:var(--textm)">${C.timeAgo(r.createdAt)}</span>
          </div>
          <p style="font-size:.83rem;color:var(--textl);line-height:1.6">${r.comment||''}</p>
        </div>`).join('')}` : ''}
      </div>`;
  },

  selectSkillForReq(skillId) {
    document.querySelectorAll('[id^="sk-check-"]').forEach(e => e.style.display='none');
    const el = document.getElementById('sk-check-'+skillId);
    if (el) el.style.display = 'inline';
    document.querySelectorAll('.profile-skill').forEach(e => e.classList.remove('sel'));
    el?.closest('.profile-skill')?.classList.add('sel');
    S.selectedSkillForReq = skillId;
  },

  calcTrust(user) {
    const r = Math.min(30,(user.averageRating||0)*6);
    const j = Math.min(30,(user.completedJobs||0)*2);
    const ref = Math.min(20,(user.referralCount||0)*5);
    const prof = [user.bio,user.profileImageUrl,user.city,user.phone].filter(Boolean).length * 5;
    return Math.round(r+j+ref+prof);
  },

  // ── REQUESTS ──
  openReqModal() {
    if (!S.user || S.isGuest) return C.toast('Sign in to send requests');
    if (!S.currentViewProfile) return;
    const selEl = document.getElementById('req-skill-sel');
    const skills = S.currentViewProfile.skills || [];
    if (selEl) selEl.innerHTML = `<p style="font-size:.82rem;color:var(--textl);margin-bottom:10px">Provider: <strong>${S.currentViewProfile.fullName}</strong></p>`;
    document.getElementById('modal-request').classList.add('open');
    document.getElementById('modal-request').style.display = 'flex';
  },

  async submitRequest() {
    if (!db || !S.user || !S.currentViewProfile) return;
    const msg = document.getElementById('req-msg').value.trim();
    if (!msg) return C.toast('Add a message', 'err');
    await db.collection('requests').add({
      seekerId: S.user.uid, seekerName: S.userData?.fullName||S.user.displayName||'',
      providerId: S.currentViewProfile.id, providerName: S.currentViewProfile.fullName||'',
      skillId: S.selectedSkillForReq||'', message: msg,
      status: 'pending', reviewed: false,
      payment: { status:'none', amount:0 },
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await C.sendNotif(S.currentViewProfile.id, 'New request from '+S.userData?.fullName, 'request');
    C.closeModalById('modal-request');
    C.toast('Request sent!', 'ok');
  },

  async loadRequests(tab) {
    if (!db || !S.user) {
      document.getElementById('req-list').innerHTML = '<div class="empty-c"><div class="ei">📋</div><h3>Sign in to see requests</h3></div>';
      return;
    }
    const el = document.getElementById('req-list');
    el.innerHTML = '<div class="loading-c"><div class="spinner"></div></div>';
    document.getElementById('tab-recv').classList.toggle('on', tab==='recv');
    document.getElementById('tab-sent').classList.toggle('on', tab==='sent');
    const field = tab==='recv' ? 'providerId' : 'seekerId';
    try {
      const snap = await db.collection('requests').where(field,'==',S.user.uid).orderBy('createdAt','desc').get();
      const reqs = snap.docs.map(d=>({id:d.id,...d.data()}));
      if (!reqs.length) { el.innerHTML = '<div class="empty-c"><div class="ei">📭</div><h3>No requests yet</h3><p>Your requests will appear here</p></div>'; return; }
      el.innerHTML = reqs.map(r => {
        const statusColors = {pending:'var(--warn)',accepted:'var(--ok)',completed:'var(--p)',declined:'var(--bad)'};
        const isRecv = tab==='recv';
        return `<div class="req-card">
          <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
            <div style="flex:1">
              <div style="font-weight:700;font-size:.9rem">${isRecv?(r.seekerName||'Someone'):(r.providerName||'Provider')}</div>
              <div style="font-size:.78rem;color:var(--textl);margin-top:2px">${r.message?.substring(0,80)||''}...</div>
            </div>
            <span class="badge" style="background:${statusColors[r.status]||'var(--bg3)'}22;color:${statusColors[r.status]||'var(--textl)'};flex-shrink:0">${r.status}</span>
          </div>
          <div class="req-actions">
            ${isRecv && r.status==='pending' ? `<button class="btn btn-ok btn-sm" onclick="C.acceptReq('${r.id}')">Accept</button><button class="btn btn-bad btn-sm" onclick="C.declineReq('${r.id}')">Decline</button>` : ''}
            ${isRecv && r.status==='accepted' ? `<button class="btn btn-p btn-sm" onclick="C.completeReq('${r.id}','${r.seekerId}')">Mark Complete</button>` : ''}
            ${!isRecv && r.status==='accepted' && r.payment?.status!=='paid' ? `<button class="btn btn-gold btn-sm" onclick="C.openPayment('${r.id}')">Pay Escrow 💳</button>` : ''}
            ${!isRecv && r.status==='completed' && !r.reviewed ? `<button class="btn btn-o btn-sm" onclick="C.openReview('${r.id}','${r.providerId}')">Leave Review ⭐</button>` : ''}
            <button class="btn btn-g btn-sm" onclick="C.openChatWithUser('${isRecv?r.seekerId:r.providerId}','${isRecv?r.seekerName:r.providerName}')">💬 Chat</button>
          </div>
        </div>`;
      }).join('');
    } catch(e) { el.innerHTML = `<div class="empty-c"><div class="ei">⚠️</div><h3>Error loading</h3><p>${e.message}</p></div>`; }
  },

  switchReqTab(tab) { C.loadRequests(tab); },

  async acceptReq(id) {
    await db.collection('requests').doc(id).update({ status:'accepted' });
    C.toast('Request accepted!', 'ok'); C.loadRequests('recv');
  },
  async declineReq(id) {
    await db.collection('requests').doc(id).update({ status:'declined' });
    C.toast('Request declined'); C.loadRequests('recv');
  },
  async completeReq(id, seekerId) {
    await db.collection('requests').doc(id).update({ status:'completed' });
    await db.collection('users').doc(S.user.uid).update({ completedJobs: firebase.firestore.FieldValue.increment(1) });
    await C.sendNotif(seekerId, 'Job marked complete — leave a review!', 'complete');
    C.toast('Marked complete! ✅', 'ok'); C.loadRequests('recv');
  },

  // ── REVIEWS ──
  openReview(reqId, provId) {
    S.selectedReqRating = 0;
    document.getElementById('rev-req-id').value = reqId;
    document.getElementById('rev-prov-id').value = provId;
    const sp = document.getElementById('star-picker');
    sp.innerHTML = [1,2,3,4,5].map(i=>`<span class="star-pick" data-v="${i}" onclick="C.pickStar(${i})">★</span>`).join('');
    document.getElementById('modal-review').classList.add('open');
    document.getElementById('modal-review').style.display = 'flex';
  },
  pickStar(n) {
    S.selectedReqRating = n;
    document.querySelectorAll('.star-pick').forEach((s,i) => s.classList.toggle('on', i<n));
  },
  async submitReview() {
    if (!S.selectedReqRating) return C.toast('Pick a rating', 'err');
    const reqId = document.getElementById('rev-req-id').value;
    const provId = document.getElementById('rev-prov-id').value;
    const comment = document.getElementById('rev-comment').value.trim();
    await db.collection('reviews').add({ reviewerId:S.user.uid, revieweeId:provId, requestId:reqId, rating:S.selectedReqRating, comment, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('requests').doc(reqId).update({ reviewed:true });
    const uDoc = await db.collection('users').doc(provId).get();
    const ud = uDoc.data();
    const newTotal = (ud.totalRatings||0)+1;
    const newAvg = ((ud.averageRating||0)*(ud.totalRatings||0)+S.selectedReqRating)/newTotal;
    await db.collection('users').doc(provId).update({ averageRating:newAvg, totalRatings:newTotal });
    C.closeModalById('modal-review');
    C.toast('Review submitted! ⭐', 'ok');
    C.loadRequests('sent');
  },

  // ── PAYMENT ──
  openPayment(reqId) {
    S.currentPayReq = reqId;
    document.getElementById('pay-summary').innerHTML = `
      <div class="pay-row"><span>Service fee</span><span>₦5,000</span></div>
      <div class="pay-row"><span>Cionti fee (1.5%)</span><span>₦75</span></div>
      <div class="pay-row"><span>Total</span><span>₦5,075</span></div>`;
    document.getElementById('modal-payment').classList.add('open');
    document.getElementById('modal-payment').style.display = 'flex';
  },
  initiatePayment() {
    if (!S.user) return;
    const handler = PaystackPop.setup({
      key: S.paystackKey, email: S.user.email, amount: 507500,
      currency:'NGN', ref:'CIONTI_'+Date.now(),
      onSuccess: async (trx) => {
        await db.collection('requests').doc(S.currentPayReq).update({ 'payment.status':'paid', 'payment.amount':5000, 'payment.paystackRef':trx.reference });
        await db.collection('transactions').add({ uid:S.user.uid, type:'escrow_hold', amount:5000, requestId:S.currentPayReq, paystackRef:trx.reference, status:'held', createdAt:firebase.firestore.FieldValue.serverTimestamp() });
        C.closeModalById('modal-payment');
        C.toast('Payment held in escrow! ✅', 'ok');
        C.loadRequests('sent');
      },
      onCancel: () => C.toast('Payment cancelled'),
    });
    handler.openIframe();
  },

  // ── CHAT ──
  async loadChats() {
    if (!db || !S.user) {
      document.getElementById('chats-list').innerHTML = '<div class="empty-c"><div class="ei">💬</div><h3>Sign in to message</h3></div>';
      return;
    }
    const el = document.getElementById('chats-list');
    el.innerHTML = '<div class="loading-c"><div class="spinner"></div></div>';
    const snap = await db.collection('chats').where('participants','array-contains',S.user.uid).orderBy('lastMessageTime','desc').get();
    const chats = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (!chats.length) { el.innerHTML = '<div class="empty-c"><div class="ei">💬</div><h3>No messages yet</h3><p>Start a conversation from someone\'s profile</p></div>'; return; }
    el.innerHTML = chats.map(chat => {
      const otherId = chat.participants?.find(p=>p!==S.user.uid);
      const unread = chat.unreadCount?.[S.user.uid] > 0;
      return `<div class="chat-item" onclick="C.openChat('${chat.id}','${otherId||''}','${chat.otherName||'User'}')">
        <div class="avatar av-md" style="background:${C.avatarColor(chat.otherName||'?')};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${(chat.otherName||'?')[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700;font-size:.9rem">${chat.otherName||'User'}</span>
            <span style="font-size:.68rem;color:var(--textm);margin-left:auto">${C.timeAgo(chat.lastMessageTime)}</span>
          </div>
          <div style="font-size:.8rem;color:var(--textl);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${chat.lastMessage||'Start a conversation'}</div>
        </div>
        ${unread ? '<div class="unread-dot"></div>' : ''}
      </div>`;
    }).join('');
  },

  async openChatWith() {
    if (!S.currentViewProfile || !S.user) return;
    C.openChatWithUser(S.currentViewProfile.id, S.currentViewProfile.fullName||'User');
  },

  async openChatWithUser(userId, userName) {
    if (!S.user || S.isGuest) return C.toast('Sign in to chat');
    if (userId === S.user.uid) return;
    const chatId = [S.user.uid, userId].sort().join('_');
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) {
      await chatRef.set({
        participants:[S.user.uid, userId],
        otherName: userName, lastMessage:'', lastMessageTime:null,
        unreadCount:{ [S.user.uid]:0, [userId]:0 },
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    C.openChat(chatId, userId, userName);
  },

  openChat(chatId, otherId, otherName) {
    S.currentChat = chatId;
    if (S.chatUnsub) S.chatUnsub();
    document.getElementById('chat-name').textContent = otherName;
    document.getElementById('chat-status').textContent = '🟢 Online';
    C.renderAvatar(document.getElementById('chat-av'), otherName, null, 'av-sm');
    document.getElementById('chat-back').onclick = () => C.goTo('messages');
    C.goTo('chat');
    const msgsEl = document.getElementById('chat-msgs');
    msgsEl.innerHTML = '';
    S.chatUnsub = db.collection('chats').doc(chatId).collection('messages').orderBy('timestamp').onSnapshot(snap => {
      msgsEl.innerHTML = snap.docs.map(d => {
        const m = d.data();
        const mine = m.senderId === S.user?.uid;
        return `<div class="${mine?'msg-wrap-sent':'msg-wrap-recv'}">
          ${m.imageUrl ? `<img src="${m.imageUrl}" style="max-width:200px;border-radius:12px;margin:2px 0">` : `<div class="msg-bubble ${mine?'msg-sent':'msg-recv'}">${m.text||''}</div>`}
          <div class="msg-time">${C.timeAgo(m.timestamp)} ${mine?'·✓':''}</div>
        </div>`;
      }).join('');
      msgsEl.scrollTop = msgsEl.scrollHeight;
    });
  },

  async sendMsg() {
    if (!S.currentChat || !S.user) return;
    const inp = document.getElementById('chat-inp');
    const text = inp.value.trim();
    if (!text) return;
    inp.value = ''; inp.style.height = 'auto';
    await db.collection('chats').doc(S.currentChat).collection('messages').add({
      senderId:S.user.uid, text, timestamp:firebase.firestore.FieldValue.serverTimestamp(), read:false,
    });
    await db.collection('chats').doc(S.currentChat).update({ lastMessage:text, lastMessageTime:firebase.firestore.FieldValue.serverTimestamp() });
  },

  chatKey(e) { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); C.sendMsg(); } },
  chatTyping() {
    const ta = document.getElementById('chat-inp');
    if (ta) { ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,120)+'px'; }
  },

  async sendImg(inp) {
    if (!inp.files[0] || !storage || !S.currentChat || !S.user) return;
    C.toast('Uploading image...');
    try {
      const ref = storage.ref(`chat/${S.currentChat}/${Date.now()}`);
      await ref.put(inp.files[0]);
      const url = await ref.getDownloadURL();
      await db.collection('chats').doc(S.currentChat).collection('messages').add({
        senderId:S.user.uid, imageUrl:url, text:'', timestamp:firebase.firestore.FieldValue.serverTimestamp(), read:false,
      });
      C.toast('Image sent!', 'ok');
    } catch(e) { C.toast('Upload failed', 'err'); }
  },

  // ── POST SKILL ──
  openPostSkill() {
    if (!S.user || S.isGuest) return C.toast('Sign in to post a skill');
    S.currentSkillEdit = null;
    document.getElementById('ps-title').textContent = 'Post a Skill';
    document.getElementById('btn-post-skill').textContent = 'Post Skill 🚀';
    document.getElementById('btn-del-skill').style.display = 'none';
    ['ps-skill-title','ps-desc','ps-tags'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
    document.getElementById('portfolio-prev').style.display='none';
    document.querySelectorAll('#ps-stype .stype-card').forEach((c,i) => c.classList.toggle('on',i===0));
    document.querySelectorAll('#ps-ptype .stype-card').forEach((c,i) => c.classList.toggle('on',i===0));
    document.getElementById('ps-price').style.display = 'none';
    document.getElementById('ps-back').onclick = () => C.goTo(S.currentNav||'discover');
    C.goTo('post-skill');
  },

  selStype(el) { document.querySelectorAll('#ps-stype .stype-card').forEach(c=>c.classList.remove('on')); el.classList.add('on'); },
  selPtype(el) {
    document.querySelectorAll('#ps-ptype .stype-card').forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
    document.getElementById('ps-price').style.display = el.dataset.v==='fixed' ? 'block' : 'none';
  },

  prevPortfolio(inp) {
    if (!inp.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
      const pv = document.getElementById('portfolio-prev');
      pv.innerHTML = `<img src="${e.target.result}" style="width:100%;object-fit:cover">`;
      pv.style.display = 'block';
      S.portfolioFile = inp.files[0];
    };
    reader.readAsDataURL(inp.files[0]);
  },

  async postSkill() {
    if (!db || !S.user) return;
    const title = document.getElementById('ps-skill-title').value.trim();
    const cat = document.getElementById('ps-cat').value;
    const desc = document.getElementById('ps-desc').value.trim();
    if (!title||!cat||!desc) return C.toast('Fill in title, category and description', 'err');
    const btn = document.getElementById('btn-post-skill');
    btn.disabled = true; btn.textContent = 'Posting...';
    const tags = document.getElementById('ps-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
    const stype = document.querySelector('#ps-stype .stype-card.on')?.dataset.v || 'both';
    const ptype = document.querySelector('#ps-ptype .stype-card.on')?.dataset.v || 'negotiable';
    const price = document.getElementById('ps-price').value;
    let portfolioUrl = '';
    if (S.portfolioFile && storage) {
      try {
        const ref = storage.ref(`portfolios/${S.user.uid}/${Date.now()}`);
        await ref.put(S.portfolioFile);
        portfolioUrl = await ref.getDownloadURL();
      } catch(e) {}
    }
    const data = {
      userId:S.user.uid, userName:S.userData?.fullName||S.user.displayName||'',
      title, category:cat, description:desc, tags, serviceType:stype, priceType:ptype,
      price:price?parseInt(price):0, portfolioImageUrl:portfolioUrl,
      city:S.userData?.city||'', state:S.userData?.state||'',
      lat:S.userData?.lat||S.userLat, lng:S.userData?.lng||S.userLng,
      isActive:true, isAvailable:true, viewCount:0, averageRating:0,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    };
    try {
      if (S.currentSkillEdit) await db.collection('skills').doc(S.currentSkillEdit).update(data);
      else await db.collection('skills').add(data);
      btn.disabled=false; btn.textContent='Post Skill 🚀';
      C.toast(S.currentSkillEdit?'Skill updated!':'Skill posted! 🚀','ok');
      S.portfolioFile = null; S.currentSkillEdit = null;
      await C.loadSkills();
      C.navTo('discover');
    } catch(e) { btn.disabled=false; btn.textContent='Post Skill 🚀'; C.toast('Error posting: '+e.message,'err'); }
  },

  async deleteSkill() {
    if (!S.currentSkillEdit) return;
    await db.collection('skills').doc(S.currentSkillEdit).update({ isActive:false });
    C.toast('Skill deleted','ok');
    await C.loadSkills();
    C.navTo('discover');
  },

  // ── MY PROFILE ──
  async renderMyProfile() {
    const el = document.getElementById('my-profile');
    if (!el || (!S.user && !S.isGuest)) { el.innerHTML = '<div class="empty-c"><div class="ei">👤</div><h3>Not signed in</h3><button class="btn btn-p btn-sm mt-16" onclick="C.goTo(\'login-options\')">Sign In</button></div>'; return; }
    if (!S.userData && S.user) await C.loadUserData(S.user.uid);
    const u = S.userData||{};
    const trust = C.calcTrust(u);
    let skills = [];
    try {
      const snap = await db.collection('skills').where('userId','==',S.user?.uid||'').where('isActive','==',true).get();
      skills = snap.docs.map(d=>({id:d.id,...d.data()}));
    } catch(e) {}
    el.innerHTML = `
      <div class="profile-hero">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;position:relative;z-index:1">
          <div class="avatar av-xl" style="background:${C.avatarColor(u.fullName||'Me')};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;overflow:hidden">
            ${u.profileImageUrl?`<img src="${u.profileImageUrl}" style="width:100%;height:100%;object-fit:cover">`:(u.fullName||'Me')[0].toUpperCase()}
          </div>
          <div style="flex:1">
            <h2 style="color:#fff;font-size:1.2rem;font-weight:800;margin-bottom:2px">${u.fullName||'Your Name'}</h2>
            <div style="color:rgba(255,255,255,.7);font-size:.78rem">📍 ${u.city||'Nigeria'}</div>
            <div style="margin-top:6px"><span class="trust-badge">⭐ Trust ${trust}/100</span></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;position:relative;z-index:1">
          ${[['Rating',(u.averageRating||0).toFixed(1),'⭐'],['Jobs',u.completedJobs||0,'✅'],['Refers',u.referralCount||0,'🤝'],['Skills',skills.length,'🛠']].map(([l,v,i])=>`
          <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:8px;text-align:center">
            <div style="font-size:1rem">${i}</div>
            <div style="font-weight:800;color:#fff;font-size:.9rem">${v}</div>
            <div style="font-size:.62rem;color:rgba(255,255,255,.6)">${l}</div>
          </div>`).join('')}
        </div>
      </div>
      <div style="padding:16px 20px">
        ${u.bio ? `<p style="font-size:.87rem;color:var(--textl);line-height:1.7;margin-bottom:16px">${u.bio}</p>` : '<p class="text-sm text-muted mb-16">Add a bio to let people know about you</p>'}
        <div style="display:flex;gap:10px;margin-bottom:16px">
          <button class="btn btn-p" style="flex:1" onclick="C.goTo('wallet')">💰 Wallet</button>
          <button class="btn btn-g" style="flex:1" onclick="C.goTo('settings')">⚙️ Settings</button>
        </div>
        <div class="sec-title">My Skills (${skills.length})</div>
        ${skills.map(s=>`<div class="profile-skill" onclick="C.editSkill('${s.id}')">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:1.3rem">${CAT_ICONS[s.category]||'⭐'}</span>
            <div style="flex:1"><div style="font-weight:700;font-size:.88rem">${s.title}</div><div style="font-size:.75rem;color:var(--textl)">${C.formatPrice(s)}</div></div>
            <span style="font-size:.75rem;color:var(--p);font-weight:600">Edit</span>
          </div>
        </div>`).join('')||'<p class="text-sm text-muted text-c" style="padding:16px 0">Post your first skill to get started!</p>'}
        <button class="btn btn-o btn-full mt-8 mb-16" onclick="C.openPostSkill()">+ Post a Skill</button>
        <button class="btn btn-g btn-full" onclick="C.signOut()">Sign Out</button>
      </div>`;
  },

  async editSkill(id) {
    const snap = await db.collection('skills').doc(id).get();
    const s = snap.data();
    S.currentSkillEdit = id;
    document.getElementById('ps-title').textContent = 'Edit Skill';
    document.getElementById('btn-post-skill').textContent = 'Save Changes';
    document.getElementById('btn-del-skill').style.display = 'block';
    document.getElementById('ps-skill-title').value = s.title||'';
    document.getElementById('ps-cat').value = s.category||'';
    document.getElementById('ps-desc').value = s.description||'';
    document.getElementById('ps-tags').value = (s.tags||[]).join(', ');
    document.getElementById('ps-back').onclick = () => C.navTo('profile');
    C.goTo('post-skill');
  },

  openEditProfile() {
    const u = S.userData||{};
    document.getElementById('ep-name').value = u.fullName||'';
    document.getElementById('ep-bio').value = u.bio||'';
    document.getElementById('ep-city').value = u.city||'';
    document.getElementById('ep-state').value = u.state||'';
    document.getElementById('ep-avail').value = String(u.isAvailable!==false);
    document.getElementById('modal-edit-profile').classList.add('open');
    document.getElementById('modal-edit-profile').style.display = 'flex';
  },

  async saveEditProfile() {
    const btn = document.getElementById('btn-save-ep');
    btn.disabled=true; btn.textContent='Saving...';
    const data = {
      fullName:document.getElementById('ep-name').value.trim(),
      bio:document.getElementById('ep-bio').value.trim(),
      city:document.getElementById('ep-city').value.trim(),
      state:document.getElementById('ep-state').value.trim(),
      isAvailable:document.getElementById('ep-avail').value==='true',
    };
    const photo = document.getElementById('ep-photo').files[0];
    if (photo && storage) {
      try {
        const ref = storage.ref(`profiles/${S.user.uid}`);
        await ref.put(photo);
        data.profileImageUrl = await ref.getDownloadURL();
      } catch(e) {}
    }
    await db.collection('users').doc(S.user.uid).update(data);
    await C.loadUserData(S.user.uid);
    btn.disabled=false; btn.textContent='Save';
    C.closeModalById('modal-edit-profile');
    C.toast('Profile updated!','ok');
    C.setupDiscoverHeader();
    C.renderMyProfile();
  },

  // ── WALLET ──
  async renderWallet() {
    const el = document.getElementById('wallet-content');
    if (!el||!S.user) return;
    await C.loadUserData(S.user.uid);
    const u = S.userData||{};
    const txSnap = await db.collection('transactions').where('uid','==',S.user.uid).orderBy('createdAt','desc').limit(20).get();
    const txs = txSnap.docs.map(d=>({id:d.id,...d.data()}));
    el.innerHTML = `
      <div class="wallet-card" style="margin-bottom:16px;position:relative;z-index:1">
        <div style="font-size:.75rem;opacity:.7;margin-bottom:4px">Available Balance</div>
        <div style="font-size:2.2rem;font-weight:800;margin-bottom:4px">₦${(u.walletBalance||0).toLocaleString()}</div>
        <div style="font-size:.8rem;opacity:.7">In Escrow: ₦${(u.escrowBalance||0).toLocaleString()}</div>
        <div style="position:relative;z-index:1;display:flex;gap:10px;margin-top:16px">
          <button class="btn" style="background:rgba(255,255,255,.2);color:#fff;flex:1" onclick="C.toast('Withdrawal coming soon!')">Withdraw</button>
          <button class="btn" style="background:rgba(255,255,255,.15);color:#fff;flex:1" onclick="C.openReferModal()">Refer & Earn</button>
        </div>
      </div>
      <div class="sec-title">Transactions</div>
      ${txs.length ? txs.map(t=>`<div class="card" style="padding:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
        <div style="font-size:1.4rem">${t.type==='escrow_hold'?'🔒':'💰'}</div>
        <div style="flex:1"><div style="font-weight:600;font-size:.87rem">${t.type==='escrow_hold'?'Escrow Hold':'Earning'}</div><div style="font-size:.73rem;color:var(--textl)">${C.timeAgo(t.createdAt)}</div></div>
        <div style="font-weight:700;color:${t.type==='escrow_hold'?'var(--warn)':'var(--ok)'}">₦${(t.amount||0).toLocaleString()}</div>
      </div>`).join('') : '<p class="text-sm text-muted text-c" style="padding:20px 0">No transactions yet</p>'}`;
  },

  // ── REFERRAL ──
  openReferModal() {
    if (!S.user||S.isGuest) return C.toast('Sign in to refer');
    document.getElementById('modal-refer').classList.add('open');
    document.getElementById('modal-refer').style.display = 'flex';
  },
  async submitReferral() {
    if (!S.currentViewProfile||!S.user) return;
    const ctx = document.getElementById('refer-ctx').value.trim();
    await db.collection('referrals').add({ referrerId:S.user.uid, referrerId_name:S.userData?.fullName||'', referredId:S.currentViewProfile.id, context:ctx, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(S.currentViewProfile.id).update({ referralCount:firebase.firestore.FieldValue.increment(1) });
    C.closeModalById('modal-refer');
    C.toast('Referral sent! 🤝','ok');
  },

  // ── NOTIFICATIONS ──
  listenNotifs() {
    if (!db||!S.user) return;
    S.notifsUnsub = db.collection('notifications').where('toUid','==',S.user.uid).where('read','==',false).onSnapshot(snap => {
      const dot = document.getElementById('notif-dot');
      if (dot) dot.style.display = snap.docs.length ? 'block' : 'none';
    });
  },
  async sendNotif(toUid, message, type) {
    if (!db||!S.user) return;
    await db.collection('notifications').add({ toUid, fromUid:S.user.uid, fromName:S.userData?.fullName||'', type, message, read:false, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
  },
  async openNotifs() {
    if (!S.user) return C.toast('Sign in to see notifications');
    const snap = await db.collection('notifications').where('toUid','==',S.user.uid).orderBy('createdAt','desc').limit(20).get();
    const notifs = snap.docs.map(d=>({id:d.id,...d.data()}));
    const list = document.getElementById('notifs-list');
    const icons = {request:'📩',complete:'✅',review:'⭐',referral:'🤝',message:'💬'};
    list.innerHTML = notifs.length ? notifs.map(n=>`<div style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:flex-start">
      <span style="font-size:1.2rem">${icons[n.type]||'🔔'}</span>
      <div style="flex:1"><div style="font-size:.85rem;font-weight:${n.read?'400':'700'}">${n.message}</div><div style="font-size:.72rem;color:var(--textm);margin-top:2px">${C.timeAgo(n.createdAt)}</div></div>
    </div>`).join('') : '<p class="text-sm text-muted text-c" style="padding:20px 0">No notifications yet</p>';
    snap.docs.forEach(d => d.ref.update({ read:true }));
    document.getElementById('modal-notifs').classList.add('open');
    document.getElementById('modal-notifs').style.display = 'flex';
  },

  // ── SETTINGS ──
  renderSettings() {
    const el = document.getElementById('settings-content');
    if (!el) return;
    const rows = [
      { section:'Account' },
      { icon:'👤', name:'Edit Profile', desc:'Update your info and photo', action:'C.openEditProfile()' },
      { icon:'🔒', name:'Change Password', desc:'Update your password', action:'C.toast("Coming soon!")' },
      { icon:'📱', name:'Linked Accounts', desc:'Google, Facebook, etc.', action:'C.toast("Coming soon!")' },
      { section:'Notifications' },
      { icon:'🔔', name:'Push Notifications', desc:'Requests and messages', toggle:true },
      { icon:'📧', name:'Email Notifications', desc:'Weekly digest', toggle:true },
      { section:'Privacy' },
      { icon:'📍', name:'Location Visibility', desc:'Show on map to everyone', toggle:true, on:true },
      { icon:'👁', name:'Profile Visibility', desc:'Public profile', toggle:true, on:true },
      { section:'App' },
      { icon:S.theme==='dark'?'🌙':'☀️', name:'Dark Mode', desc:'Toggle dark/light theme', action:'C.toggleTheme()' },
      { icon:'🌍', name:'Language', desc:'English (Nigeria)', action:'C.toast("Coming soon!")' },
      { section:'Support' },
      { icon:'❓', name:'Help & FAQ', desc:'Get help with Cionti', action:'C.toast("Help centre coming soon!")' },
      { icon:'⭐', name:'Rate Cionti', desc:'Leave a review on the store', action:'C.toast("Thank you! ⭐")' },
      { icon:'🚪', name:'Sign Out', desc:'Sign out of your account', action:'C.signOut()' },
    ];
    el.innerHTML = rows.map(r => r.section ? `<div class="setting-section">${r.section}</div>` : `
      <div class="setting-row" onclick="${r.action||''}">
        <div class="setting-icon">${r.icon}</div>
        <div style="flex:1"><div class="setting-name">${r.name}</div><div class="setting-desc">${r.desc}</div></div>
        ${r.toggle ? `<div class="toggle-switch ${r.on?'on':''}" onclick="event.stopPropagation();this.classList.toggle('on')"><div class="toggle-thumb"></div></div>` : '<span style="color:var(--textm);font-size:.85rem">→</span>'}
      </div>`).join('');
  },

  // ── SIGN OUT ──
  async signOut() {
    if (S.chatUnsub) S.chatUnsub();
    if (S.notifsUnsub) S.notifsUnsub();
    if (auth) await auth.signOut();
    S.user = null; S.userData = null; S.isGuest = false;
    S.skills = []; S.mapInited = false; S.aiHistory = [];
    document.getElementById('bottom-nav').classList.remove('visible');
    C.goTo('onboard');
    C.toast('Signed out successfully');
  },

  // ── MODALS ──
  closeModal(e, id) { if (e.target.id===id) C.closeModalById(id); },
  closeModalById(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display='none'; el.classList.remove('open'); }
  },

  // ── TOAST ──
  toast(msg, type='') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.className = 'show ' + type;
    clearTimeout(S._toastTimer);
    S._toastTimer = setTimeout(() => { t.className = ''; }, 2800);
  },
};

// ── ROUTE lifecycle hooks ──
const _goTo = C.goTo.bind(C);
C.goTo = function(screen) {
  _goTo(screen);
  if (screen === 'wallet') C.renderWallet();
  if (screen === 'settings') C.renderSettings();
};

