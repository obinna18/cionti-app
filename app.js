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
window.addEventListener('load', async () => {
  // Apply theme
  if (S.theme === 'light') document.documentElement.setAttribute('data-theme','light');
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.textContent = S.theme === 'dark' ? '🌙' : '☀️';

  if (!auth) { C.goTo('onboard'); return; }

  // Handle Google redirect result (mobile sign-in)
  if (localStorage.getItem('cionti-google-redirect')) {
    localStorage.removeItem('cionti-google-redirect');
    try {
      const result = await auth.getRedirectResult();
      if (result && result.user) {
        await C.ensureGoogleUserDoc(result.user);
        // onAuthStateChanged will fire and handle navigation
        return;
      }
    } catch(e) {
      console.warn('Redirect result error:', e.message);
    }
  }

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
    const showNav = ['discover','feed','ai','requests','messages','profile','market'].includes(screen);
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.classList.toggle('visible', showNav);
  },

  navTo(screen) {
    C.goTo(screen);
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const el = document.getElementById('nav-' + screen);
    if (el) el.classList.add('active');
    S.currentNav = screen;
    // Map is now inside its own tab — only init when user taps Map tab
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
    C.listenNotifs();
    // Seed demo data immediately so page is never blank
    if (S.skills.length === 0) {
      S.skills = C.DEMO_TALENTS.map((t, i) => ({ id: 'demo' + (i+1), ...t }));
    }
    // Render all sections right away (no waiting for async)
    C.renderHomeFeedSections();
    // Then load live data in background
    C.loadSkills();
    C.loadAPIData();
    C.initPeopleTab();
  },

  // ═══════════════════════════════════
  // HOME TABS
  // ═══════════════════════════════════
  switchHomeTab(tab, btn) {
    // Hide all tab panels
    ['feed','people','events','jobs','map'].forEach(t => {
      const el = document.getElementById('htab-' + t);
      if (el) { el.style.display = 'none'; el.style.flex = ''; }
    });
    // Show selected
    const target = document.getElementById('htab-' + tab);
    if (target) {
      target.style.display = tab === 'map' ? 'flex' : 'block';
      target.style.flex = '1';
    }
    // Update tab buttons
    document.querySelectorAll('.home-tab').forEach(b => b.classList.remove('on'));
    if (btn) btn.classList.add('on');
    // Lazy-load per tab
    if (tab === 'map') {
      if (!S.mapInited) setTimeout(() => C.initMap(), 80);
      else if (C.map) setTimeout(() => C.map.invalidateSize(), 80);
    }
    if (tab === 'events' && !S.eventsLoaded) C.loadEvents();
    if (tab === 'jobs' && !S.jobsLoaded) C.loadJobs();
    if (tab === 'people') C.initPeopleTab();
  },

  switchView(view) {
    const mv = document.getElementById('map-view');
    const lv = document.getElementById('list-view');
    if (mv) mv.style.display = view === 'map' ? 'flex' : 'none';
    if (lv) lv.style.display = view === 'list' ? 'block' : 'none';
    document.getElementById('vt-map')?.classList.toggle('on', view === 'map');
    document.getElementById('vt-list')?.classList.toggle('on', view === 'list');
    if (view === 'map' && !S.mapInited) C.initMap();
    else if (view === 'map' && C.map) setTimeout(() => C.map.invalidateSize(), 80);
    if (view === 'list') C.renderSkillList();
  },

  // ═══════════════════════════════════
  // HOME FEED SECTIONS
  // ═══════════════════════════════════
  loadHomeFeed() { C.renderHomeFeedSections(); },

  renderHomeFeedSections() {
    C.renderHomeStats();
    C.renderQuickActions();
    C.renderTrendingSkills();
    C.renderRequestsNear();
    C.renderActivityFeed();
    C.renderCommunityPostsHome();
  },

  renderHomeStats() {
    const el = document.getElementById('home-stats');
    if (!el) return;
    const total = S.skills.length + 1238;
    const stats = [
      { icon:'🛠', label:'Skills Listed', val: total.toLocaleString() },
      { icon:'📍', label:'Cities', val: '43' },
      { icon:'🤝', label:'Connections', val: '2,847' },
      { icon:'⭐', label:'Avg Rating', val: '4.8' },
    ];
    el.innerHTML = stats.map(s => `
      <div style="flex-shrink:0;background:var(--bg1);border:1px solid var(--border);border-radius:14px;padding:10px 16px;text-align:center;min-width:78px">
        <div style="font-size:1.2rem;margin-bottom:2px">${s.icon}</div>
        <div style="font-size:.95rem;font-weight:800;color:var(--p)">${s.val}</div>
        <div style="font-size:.6rem;color:var(--textm);margin-top:1px;white-space:nowrap">${s.label}</div>
      </div>`).join('');
  },

  renderQuickActions() {
    const el = document.getElementById('quick-actions');
    if (!el) return;
    const actions = [
      { icon:'🗺', label:'Map View', fn:"C.switchHomeTab('map',document.querySelector('[data-htab=map]'))" },
      { icon:'🤖', label:'AI Match', fn:"C.navTo('ai')" },
      { icon:'🛍', label:'Market', fn:"C.navTo('market')" },
      { icon:'✍️', label:'Post', fn:"C.showCreatePicker()" },
    ];
    el.innerHTML = actions.map(a => `
      <div style="background:var(--bg1);border:1px solid var(--border);border-radius:14px;padding:12px 6px;text-align:center;cursor:pointer;transition:all .18s;-webkit-tap-highlight-color:transparent" onclick="${a.fn}" ontouchstart="this.style.transform='scale(.93)';this.style.background='var(--bg2)'" ontouchend="this.style.transform='';this.style.background='var(--bg1)'">
        <div style="font-size:1.5rem;margin-bottom:5px">${a.icon}</div>
        <div style="font-size:.7rem;font-weight:700;color:var(--text)">${a.label}</div>
      </div>`).join('');
  },

  renderTrendingSkills() {
    const el = document.getElementById('trending-scroll');
    if (!el) return;
    const catCounts = {};
    S.skills.forEach(s => { catCounts[s.category] = (catCounts[s.category]||0)+1; });
    const sorted = CATS.map(c => ({ ...c, count: catCounts[c.id] || Math.floor(Math.random()*15)+3 }))
      .sort((a,b) => b.count - a.count).slice(0, 12);
    el.innerHTML = sorted.map((c,i) => `
      <div style="flex-shrink:0;background:var(--bg1);border:1.5px solid ${i<3?c.color+'55':'var(--border)'};border-radius:16px;padding:12px 14px;cursor:pointer;min-width:96px;text-align:center;transition:all .2s;-webkit-tap-highlight-color:transparent" onclick="C.switchHomeTab('people',document.querySelector('[data-htab=people]'));C.filterByCategory('${c.id}',null)" ontouchstart="this.style.transform='scale(.95)'" ontouchend="this.style.transform=''">
        <div style="font-size:1.5rem;margin-bottom:4px">${c.label.split(' ')[0]}</div>
        <div style="font-weight:700;font-size:.73rem;color:var(--text);white-space:nowrap">${c.label.split(' ').slice(1).join(' ')}</div>
        <div style="font-size:.63rem;color:${i<3?c.color:'var(--textm)'};margin-top:3px;font-weight:600">${c.count} nearby</div>
      </div>`).join('');
  },

  renderRequestsNear() {
    const el = document.getElementById('requests-near');
    if (!el) return;
    const reqs = [
      { icon:'📸', text:'Need photographer for wedding this Saturday', city:'Warri', budget:'₦50,000', urgent:true },
      { icon:'💻', text:'Looking for web developer for e-commerce site', city:'Effurun', budget:'₦80,000', urgent:false },
      { icon:'🎤', text:'Need MC for corporate dinner next Friday', city:'Warri', budget:'₦30,000', urgent:false },
      { icon:'💄', text:'Bridal makeup artist needed urgently', city:'Effurun', budget:'₦15,000', urgent:true },
      { icon:'🎵', text:'DJ needed for birthday party (100 guests)', city:'Agbarho', budget:'₦25,000', urgent:false },
    ];
    el.innerHTML = reqs.map(r => `
      <div class="request-card" ontouchstart="this.style.background='var(--pl)'" ontouchend="this.style.background='var(--bg1)'">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--pl);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${r.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.84rem;font-weight:600;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.text}</div>
          <div style="font-size:.72rem;color:var(--textl)">📍 ${r.city} · 💰 ${r.budget}</div>
        </div>
        ${r.urgent?'<span class="badge badge-deal" style="flex-shrink:0;font-size:.6rem">Urgent</span>':''}
      </div>`).join('') +
      `<button class="btn btn-o btn-full" style="margin-top:4px;font-size:.8rem" onclick="C.navTo('market')">View all opportunities →</button>`;
  },

  renderActivityFeed() {
    const el = document.getElementById('activity-feed');
    if (!el) return;
    const activities = [
      { icon:'📸', name:'Daniel Obi', action:'just completed a photography gig', time:'2m ago', city:'Effurun' },
      { icon:'💻', name:'Samuel Dike', action:'delivered a website to a client', time:'5m ago', city:'Warri' },
      { icon:'💄', name:'Ada Nwosu', action:'got 3 new bookings for bridal makeup', time:'12m ago', city:'Warri' },
      { icon:'⚡', name:'Emeka Johnson', action:'installed solar panels in Agbarho', time:'25m ago', city:'Agbarho' },
      { icon:'🎓', name:'Ifeoma Chukwu', action:"student scored A1 in WAEC Maths 🎉", time:'38m ago', city:'Effurun' },
      { icon:'🎨', name:'Grace Adeola', action:'launched a brand identity for a startup', time:'52m ago', city:'Warri' },
    ];
    // Rotate activities randomly to feel "live"
    const shuffled = activities.sort(() => Math.random() - 0.5);
    el.innerHTML = shuffled.slice(0,4).map(a => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg1);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;cursor:pointer;-webkit-tap-highlight-color:transparent" onclick="C.navTo('feed')" ontouchstart="this.style.background='var(--bg2)'" ontouchend="this.style.background='var(--bg1)'">
        <div style="width:38px;height:38px;border-radius:50%;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${a.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.83rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><strong>${a.name}</strong> ${a.action}</div>
          <div style="font-size:.7rem;color:var(--textm);margin-top:1px">📍 ${a.city} · ${a.time}</div>
        </div>
      </div>`).join('');
  },

  async renderCommunityPostsHome() {
    const el = document.getElementById('community-posts-home');
    if (!el) return;
    // Try Firebase first
    const posts = [];
    if (db) {
      try {
        const snap = await db.collection('content')
          .where('isActive','==',true)
          .where('visibility','==','public')
          .orderBy('createdAt','desc')
          .limit(3).get();
        posts.push(...snap.docs.map(d => ({ id:d.id,...d.data() })));
      } catch(e) {}
    }
    // Always pad with demo posts
    const demoPosts = [
      { type:'post', id:'dp1', userName:'Chiamaka Obi', userCity:'Effurun', text:'Just landed my first client from Cionti! 🎉 This platform actually works. If you have a skill, post it today — the demand is real!', createdAt:null, likes:24, comments:8 },
      { type:'post', id:'dp2', userName:'Ngozi Fashola', userCity:'Warri', text:'Quick tip for freelancers: always take 50% upfront before starting any project. Protect your work and energy 💡', createdAt:null, likes:89, comments:17 },
      { type:'post', id:'dp3', userName:'David Ikenna', userCity:'Effurun', text:'Opening my design studio in Effurun next month! Accepting clients for logo, branding, and print. DM to book a spot 🎨', createdAt:null, likes:41, comments:5 },
    ];
    const combined = [...posts, ...demoPosts].slice(0, 3);
    el.innerHTML = combined.map(p => `
      <div class="home-post" onclick="C.navTo('feed')" ontouchstart="this.style.background='var(--bg2)'" ontouchend="this.style.background='var(--bg1)'">
        <div class="home-post-head">
          <div style="width:34px;height:34px;border-radius:50%;background:${C.avatarColor(p.userName||'?')};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;flex-shrink:0">${(p.userName||'?')[0].toUpperCase()}</div>
          <div><div style="font-weight:700;font-size:.84rem">${p.userName}</div><div style="font-size:.7rem;color:var(--textl)">📍 ${p.userCity||''} · ${C.timeAgo(p.createdAt)}</div></div>
        </div>
        <div class="home-post-body">${(p.text||p.title||'').substring(0,140)}${(p.text||'').length>140?'...':''}</div>
        <div style="display:flex;gap:12px;margin-top:10px;font-size:.75rem;color:var(--textl)">
          <span>❤️ ${p.likes||0}</span><span>💬 ${p.comments||0}</span><span style="margin-left:auto;color:var(--p);font-weight:600">Read more →</span>
        </div>
      </div>`).join('') +
      `<button class="btn btn-o btn-full" style="font-size:.8rem" onclick="C.navTo('feed')">See all community posts →</button>`;
  },

  // ═══════════════════════════════════
  // API CALLS — REAL LIVE DATA
  // ═══════════════════════════════════
  async loadAPIData() {
    // Run all APIs in parallel — none block the UI
    Promise.allSettled([
      C.loadQuote(),
      C.loadWeather(),
      C.loadDevArticles(),
    ]);
  },

  async loadQuote() {
    try {
      const r = await fetch('https://api.quotable.io/random?tags=business,technology,success,inspirational', { signal: AbortSignal.timeout(5000) });
      const d = await r.json();
      if (d.content) {
        const el = document.getElementById('quote-card');
        if (el) {
          document.getElementById('quote-text').textContent = '"' + d.content + '"';
          document.getElementById('quote-author').textContent = '— ' + (d.author||'Unknown');
          el.style.display = 'block';
        }
      }
    } catch(e) {
      // Fallback quotes if API fails
      const fallbacks = [
        { q: 'Your network is your net worth.', a: 'Porter Gale' },
        { q: 'The best time to plant a tree was 20 years ago. The second best time is now.', a: 'Chinese Proverb' },
        { q: 'Opportunities are usually disguised as hard work, so most people don\'t recognize them.', a: 'Ann Landers' },
        { q: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', a: 'Winston Churchill' },
      ];
      const pick = fallbacks[Math.floor(Math.random()*fallbacks.length)];
      const el = document.getElementById('quote-card');
      if (el) {
        document.getElementById('quote-text').textContent = '"' + pick.q + '"';
        document.getElementById('quote-author').textContent = '— ' + pick.a;
        el.style.display = 'block';
      }
    }
  },

  async loadWeather() {
    // OpenWeatherMap — use a free API key or skip gracefully
    const WEATHER_KEY = 'demo'; // replace with real key from openweathermap.org
    const city = S.userData?.city || 'Effurun';
    try {
      // Use wttr.in — no API key needed, CORS-friendly
      const r = await fetch(`https://wttr.in/${encodeURIComponent(city+',Nigeria')}?format=j1`, { signal: AbortSignal.timeout(5000) });
      const d = await r.json();
      const current = d.current_condition?.[0];
      if (current) {
        const temp = current.temp_C;
        const desc = current.weatherDesc?.[0]?.value || 'Clear';
        const icons = { 'Sunny':'☀️', 'Clear':'🌤', 'Partly':'⛅', 'Cloudy':'☁️', 'Rain':'🌧', 'Thunder':'⛈', 'Drizzle':'🌦', 'Mist':'🌫', 'Fog':'🌫' };
        const icon = Object.keys(icons).find(k => desc.includes(k)) ? icons[Object.keys(icons).find(k => desc.includes(k))] : '🌤';
        const note = parseInt(temp) >= 28 ? '☀️ Good day for outdoor gigs & events' : parseInt(temp) <= 20 ? '🧥 Cool weather — perfect for indoor sessions' : '✅ Good conditions for all activities';
        const wc = document.getElementById('weather-card');
        if (wc) {
          wc.style.display = 'flex';
          document.getElementById('weather-icon').textContent = icon;
          document.getElementById('weather-temp').textContent = temp + '°C — ' + desc;
          document.getElementById('weather-desc').textContent = '📍 ' + city + ', Nigeria';
          document.getElementById('weather-note').textContent = note;
        }
      }
    } catch(e) {
      // Show static fallback
      const wc = document.getElementById('weather-card');
      if (wc) {
        wc.style.display = 'flex';
        document.getElementById('weather-icon').textContent = '🌤';
        document.getElementById('weather-temp').textContent = '29°C — Partly Cloudy';
        document.getElementById('weather-desc').textContent = '📍 ' + city + ', Nigeria';
        document.getElementById('weather-note').textContent = '☀️ Good day for outdoor gigs & events';
      }
    }
  },

  async loadDevArticles() {
    const el = document.getElementById('articles-list');
    if (!el) return;
    try {
      // DEV.to API — free, no key needed
      const r = await fetch('https://dev.to/api/articles?tag=career&per_page=5&top=7', { signal: AbortSignal.timeout(6000) });
      const articles = await r.json();
      if (articles?.length) {
        el.innerHTML = articles.slice(0,4).map(a => `
          <a href="${a.url}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
            <div style="display:flex;gap:12px;padding:12px 14px;background:var(--bg1);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;-webkit-tap-highlight-color:transparent" ontouchstart="this.style.background='var(--bg2)'" ontouchend="this.style.background='var(--bg1)'">
              <div style="font-size:1.4rem;flex-shrink:0">${a.tag_list?.includes('javascript')?'💛':a.tag_list?.includes('python')?'🐍':a.tag_list?.includes('career')?'🎯':'📝'}</div>
              <div>
                <div style="font-weight:600;font-size:.84rem;line-height:1.5;margin-bottom:3px;color:var(--text)">${a.title}</div>
                <div style="font-size:.7rem;color:var(--textm)">${a.reading_time_minutes||3} min · ${a.user?.name||'DEV Community'}</div>
              </div>
            </div>
          </a>`).join('');
        return;
      }
    } catch(e) {}
    // Fallback articles
    const fallback = [
      { title:'How to price your freelance services in Nigeria (2026)', tag:'💰', time:'4 min', url:'#' },
      { title:'Top 10 skills Nigerian businesses are hiring for right now', tag:'🔥', time:'3 min', url:'#' },
      { title:'How to get your first client as a designer or developer', tag:'🎯', time:'5 min', url:'#' },
      { title:'Building a portfolio that wins clients in West Africa', tag:'📁', time:'6 min', url:'#' },
    ];
    el.innerHTML = fallback.map(a => `
      <div style="display:flex;gap:12px;padding:12px 14px;background:var(--bg1);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;cursor:pointer" ontouchstart="this.style.background='var(--bg2)'" ontouchend="this.style.background='var(--bg1)'">
        <div style="font-size:1.4rem;flex-shrink:0">${a.tag}</div>
        <div>
          <div style="font-weight:600;font-size:.84rem;line-height:1.5;margin-bottom:3px">${a.title}</div>
          <div style="font-size:.7rem;color:var(--textm)">${a.time} read · Cionti Tips</div>
        </div>
      </div>`).join('');
  },

  async loadJobs() {
    S.jobsLoaded = true;
    const el = document.getElementById('jobs-list');
    const countEl = document.getElementById('jobs-count');
    if (!el) return;
    try {
      // Remotive API — free, CORS-enabled
      const r = await fetch('https://remotive.com/api/remote-jobs?limit=20&category=software-dev', { signal: AbortSignal.timeout(7000) });
      const d = await r.json();
      const jobs = d.jobs || [];
      if (jobs.length) {
        if (countEl) countEl.textContent = jobs.length + ' open';
        el.innerHTML = jobs.slice(0,12).map(j => `
          <a href="${j.url}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
            <div class="job-card" ontouchstart="this.style.background='var(--bg2)'" ontouchend="this.style.background='var(--bg1)'">
              <div class="job-card-top">
                <div class="job-logo">${j.company_name?.[0]||'?'}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:700;font-size:.87rem;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${j.title}</div>
                  <div style="font-size:.75rem;color:var(--textl);margin-bottom:4px">${j.company_name} · ${j.candidate_required_location||'Remote'}</div>
                  <div style="font-size:.73rem;font-weight:700;color:var(--ok)">${j.salary||'Competitive'}</div>
                </div>
              </div>
              <div class="job-tags">
                ${(j.tags||[]).slice(0,4).map(t=>`<span class="badge badge-n" style="font-size:.62rem">${t}</span>`).join('')}
                <span class="badge" style="background:var(--bg2);font-size:.62rem">${j.job_type||'Full-time'}</span>
              </div>
            </div>
          </a>`).join('') +
          `<div style="text-align:center;padding:12px 0;font-size:.75rem;color:var(--textm)">Source: Remotive · ${jobs.length} jobs loaded</div>`;
        return;
      }
    } catch(e) {}
    // Fallback jobs
    C.renderFallbackJobs(el, countEl);
  },

  renderFallbackJobs(el, countEl) {
    if (countEl) countEl.textContent = '10 open';
    const jobs = [
      { title:'React Native Developer', company:'Paystack', loc:'Remote · Nigeria', salary:'₦400k–800k/mo', tags:['react-native','javascript'], logo:'💳' },
      { title:'Product Designer (UI/UX)', company:'Flutterwave', loc:'Remote', salary:'$1,500–2,500/mo', tags:['figma','design','ux'], logo:'🌊' },
      { title:'Backend Engineer (Node.js)', company:'Kuda Bank', loc:'Lagos or Remote', salary:'₦500k+/mo', tags:['nodejs','mongodb','api'], logo:'🏦' },
      { title:'Android Developer (Kotlin)', company:'PiggyVest', loc:'Remote', salary:'₦350k–600k/mo', tags:['android','kotlin','firebase'], logo:'🐷' },
      { title:'Data Analyst', company:'MTN Nigeria', loc:'Hybrid · Abuja', salary:'₦300k–450k/mo', tags:['python','sql','powerbi'], logo:'📶' },
      { title:'Digital Marketing Manager', company:'Jumia Nigeria', loc:'Lagos', salary:'₦200k–350k/mo', tags:['seo','ads','social-media'], logo:'📦' },
      { title:'DevOps Engineer', company:'Interswitch', loc:'Remote', salary:'$2,000–3,500/mo', tags:['aws','docker','ci/cd'], logo:'🔄' },
    ];
    el.innerHTML = jobs.map(j => `
      <div class="job-card" ontouchstart="this.style.background='var(--bg2)'" ontouchend="this.style.background='var(--bg1)'">
        <div class="job-card-top">
          <div class="job-logo" style="font-size:1.4rem">${j.logo}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.87rem;margin-bottom:2px">${j.title}</div>
            <div style="font-size:.75rem;color:var(--textl);margin-bottom:4px">${j.company} · ${j.loc}</div>
            <div style="font-size:.75rem;font-weight:700;color:var(--ok)">${j.salary}</div>
          </div>
        </div>
        <div class="job-tags">${j.tags.map(t=>`<span class="badge badge-n" style="font-size:.63rem">${t}</span>`).join('')}</div>
      </div>`).join('');
  },

  async loadEvents() {
    S.eventsLoaded = true;
    const el = document.getElementById('events-list');
    if (!el) return;
    // Eventbrite requires OAuth — use demo data enriched with real structure
    const events = [
      { name:'Delta State Tech Summit 2026', date:'Mar 22, 2026', time:'09:00 AM', venue:'Warri City Hotel', city:'Warri', type:'Technology', entry:'Free', icon:'💻', attending:84 },
      { name:'Effurun Business Networking Night', date:'Mar 28, 2026', time:'06:00 PM', venue:'Protea Hotel Effurun', city:'Effurun', type:'Business', entry:'₦2,000', icon:'🤝', attending:56 },
      { name:'Photography Workshop: Natural Light Mastery', date:'Apr 5, 2026', time:'10:00 AM', venue:'Studio 12, Warri', city:'Warri', type:'Workshop', entry:'₦5,000', icon:'📸', attending:30 },
      { name:'Fashion Pop-Up Market — Lagos Meets Warri', date:'Apr 12, 2026', time:'11:00 AM', venue:'Warri Culture Centre', city:'Warri', type:'Fashion', entry:'Free', icon:'👗', attending:200 },
      { name:'Freelancers Meetup — Delta State', date:'Apr 19, 2026', time:'02:00 PM', venue:'Online (Zoom)', city:'Online', type:'Career', entry:'Free', icon:'💼', attending:120 },
      { name:'Startup Pitch Night Warri Vol.3', date:'May 3, 2026', time:'04:00 PM', venue:'Heritage Hub, Warri', city:'Warri', type:'Startup', entry:'₦1,000', icon:'🚀', attending:75 },
    ];
    const typeColors = { Technology:'#2952FF', Business:'var(--gold)', Workshop:'#EC4899', Fashion:'#E91E63', Career:'var(--ok)', Startup:'#8B5CF6' };
    el.innerHTML = events.map(ev => `
      <div class="event-row-card" ontouchstart="this.style.background='var(--bg2)'" ontouchend="this.style.background='var(--bg1)'">
        <div style="width:52px;height:52px;border-radius:12px;background:${typeColors[ev.type]||'var(--p)'}22;border:1.5px solid ${typeColors[ev.type]||'var(--p)'}44;display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0">${ev.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.87rem;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ev.name}</div>
          <div style="font-size:.73rem;color:var(--textl);margin-bottom:5px">📅 ${ev.date} · ⏰ ${ev.time}</div>
          <div style="font-size:.73rem;color:var(--textl);margin-bottom:6px">📍 ${ev.venue}, ${ev.city}</div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="badge" style="background:${ev.entry==='Free'?'var(--okl)':'var(--pl)'};color:${ev.entry==='Free'?'var(--ok)':'var(--p)'}">${ev.entry==='Free'?'🎟 Free Entry':'🎟 '+ev.entry}</span>
            <span class="badge badge-n" style="font-size:.62rem">👥 ${ev.attending} going</span>
          </div>
        </div>
      </div>`).join('') +
      `<button class="btn btn-p btn-full" style="margin-top:6px" onclick="C.showCreatePicker()">📅 Post Your Own Event →</button>`;
  },

  async initPeopleTab() {
    const el = document.getElementById('featured-pros-grid');
    if (!el || el.innerHTML) return; // Already loaded
    // Use demo talents + try randomuser.me for profile pics
    const pros = S.skills.slice(0,12);
    el.innerHTML = `<div class="pro-grid">${pros.map(s => `
      <div class="pro-card" onclick="C.viewProfile('${s.userId}')" ontouchstart="this.style.transform='scale(.97)'" ontouchend="this.style.transform=''">
        <div class="pro-av" style="background:${C.avatarColor(s.userName||'?')}">${(s.userName||'?')[0].toUpperCase()}</div>
        <div class="pro-name">${s.userName||'Talent'}</div>
        <div class="pro-skill">${s.title||'Freelancer'}</div>
        <div class="pro-loc">📍 ${s.city||'Nigeria'} · ⭐ ${s.averageRating||'New'}</div>
        ${s.isAvailable?'<div class="pro-avail"></div>':''}
      </div>`).join('')}</div>`;
    // Also set up category chips for People tab
    const chips = document.getElementById('cat-chips-people');
    if (chips && !chips.innerHTML) {
      chips.innerHTML = `<div class="chip on" data-cat="all" onclick="C.filterByCategory('all',this)">✨ All</div>` +
        CATS.map(c => `<div class="chip" data-cat="${c.id}" onclick="C.filterByCategory('${c.id}',this)">${c.label}</div>`).join('');
    }
    // Render list below chips
    C.renderPeopleSkillList();
  },

  renderPeopleSkillList() {
    const el = document.getElementById('people-skill-list');
    if (!el) return;
    const skills = C.getFilteredSkills();
    el.innerHTML = skills.map(s => {
      const cat = CATS.find(c=>c.id===s.category)||CATS[CATS.length-1];
      return `<div class="skill-card" onclick="C.viewProfile('${s.userId}')">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <div class="avatar av-md" style="background:${C.avatarColor(s.userName||'?')};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;flex-shrink:0">${(s.userName||'?')[0].toUpperCase()}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.9rem">${s.title}</div>
            <div style="font-size:.75rem;color:var(--textl);">${s.userName||'User'} · ${s.city||''}</div>
          </div>
          <div style="font-size:.82rem;font-weight:700;color:var(--p)">${C.formatPrice(s)}</div>
        </div>
        <div style="font-size:.8rem;color:var(--textl);line-height:1.6;margin-bottom:8px">${(s.description||'').substring(0,90)}...</div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="badge badge-n" style="font-size:.65rem">${cat.label}</span>
          ${s.isAvailable?'<span class="badge badge-ok" style="font-size:.65rem">✅ Available</span>':'<span class="badge" style="background:var(--bg2);font-size:.65rem">⏸ Busy</span>'}
          <span style="margin-left:auto;font-size:.75rem;color:var(--gold)">⭐ ${s.averageRating||'New'}</span>
        </div>
      </div>`;
    }).join('');
  },

  // Overriding the old filterByCategory to also update people tab
  filterByCategory(cat, el) {
    S.activeCategory = cat;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
    if (el) el.classList.add('on');
    C.renderSkills();
    if (document.getElementById('htab-people')?.style.display !== 'none') {
      C.renderPeopleSkillList();
    }
  },

  DEMO_TALENTS: [
    { userId:'demo1', userName:'Daniel Obi', title:'Professional Photographer', category:'media', description:'Portrait, event & product photography. 5 years exp. Available for hire.', priceType:'fixed', price:15000, city:'Effurun', lat:5.5262, lng:5.7630, isAvailable:true, averageRating:4.8, portfolioImageUrl:'', tags:['photography','events','portrait'] },
    { userId:'demo2', userName:'Grace Adeola', title:'UI/UX & Graphic Designer', category:'design', description:'Logos, brand identity, app mockups. Figma & Illustrator expert. Remote & in-person.', priceType:'fixed', price:20000, city:'Warri', lat:5.5167, lng:5.7500, isAvailable:true, averageRating:4.9, tags:['design','logo','figma'] },
    { userId:'demo3', userName:'Tunde Bakare', title:'Android App Developer', category:'tech', description:'Native Android & Flutter dev. 3+ years. Firebase, APIs, Google Play deployment.', priceType:'negotiable', price:0, city:'Effurun', lat:5.5320, lng:5.7550, isAvailable:true, averageRating:4.7, tags:['android','flutter','kotlin'] },
    { userId:'demo4', userName:'Ada Nwosu', title:'Makeup Artist & Stylist', category:'beauty', description:'Bridal, gele tying, glam & editorial. Available for events all over Delta State.', priceType:'fixed', price:8000, city:'Warri', lat:5.5050, lng:5.7480, isAvailable:true, averageRating:4.9, tags:['makeup','bridal','beauty'] },
    { userId:'demo5', userName:'Emeka Johnson', title:'Electrician & AC Installer', category:'trades', description:'Electrical wiring, AC installation & repairs, solar systems. Certified & insured.', priceType:'negotiable', price:0, city:'Agbarho', lat:5.5600, lng:5.7900, isAvailable:true, averageRating:4.6, tags:['electrical','AC','solar'] },
    { userId:'demo6', userName:'Chisom Okafor', title:'Fashion Designer (Ankara/Lace)', category:'fashion', description:'Custom made native attire, agbada, ankara suits. Tailored to fit. 7-day turnaround.', priceType:'fixed', price:12000, city:'Effurun', lat:5.5180, lng:5.7680, isAvailable:true, averageRating:4.8, tags:['fashion','ankara','tailoring'] },
    { userId:'demo7', userName:'Kingsley Eze', title:'Video Editor & Content Creator', category:'media', description:'YouTube, TikTok, Instagram reels. Color grading, motion graphics. Premiere Pro & DaVinci.', priceType:'fixed', price:10000, city:'Warri', lat:5.5090, lng:5.7550, isAvailable:false, averageRating:4.7, tags:['video','editing','content'] },
    { userId:'demo8', userName:'Blessing Okonkwo', title:'Caterer & Event Food', category:'food', description:'Jollof rice, small chops, puff puff, full catering packages for any event size.', priceType:'negotiable', price:0, city:'Effurun', lat:5.5240, lng:5.7700, isAvailable:true, averageRating:4.9, tags:['catering','food','events'] },
    { userId:'demo9', userName:'Samuel Dike', title:'Web Developer (React/Node)', category:'tech', description:'Full-stack web dev. React, Node.js, MongoDB, Firebase. E-commerce & business sites.', priceType:'fixed', price:50000, city:'Warri', lat:5.5130, lng:5.7410, isAvailable:true, averageRating:4.8, tags:['web','react','nodejs'] },
    { userId:'demo10', userName:'Nkechi Okoro', title:'Music Teacher & Piano Lessons', category:'music', description:'Piano, keyboard & music theory. Beginner to advanced. Home visits available in Effurun.', priceType:'fixed', price:5000, city:'Effurun', lat:5.5300, lng:5.7600, isAvailable:true, averageRating:5.0, tags:['music','piano','teaching'] },
    { userId:'demo11', userName:'Frank Amadi', title:'Security Guard / Night Watch', category:'other', description:'Certified security personnel. OND holder. Available for residential & commercial.', priceType:'fixed', price:40000, city:'Uvwie', lat:5.4950, lng:5.7520, isAvailable:true, averageRating:4.5, tags:['security','guard'] },
    { userId:'demo12', userName:'Ifeoma Chukwu', title:'Private Tutor (Maths & English)', category:'education', description:'WAEC/NECO preparation. Primary through SS3. Track record of A grades. Home tutoring.', priceType:'fixed', price:6000, city:'Effurun', lat:5.5210, lng:5.7650, isAvailable:true, averageRating:4.9, tags:['tutoring','maths','waec'] },
  ],

  DEMO_ACTIVITY: [
    { icon:'📸', name:'Daniel Obi', action:'just booked a photography gig', time:'2m ago', city:'Effurun' },
    { icon:'💻', name:'Samuel Dike', action:'completed a website for a client', time:'5m ago', city:'Warri' },
    { icon:'💄', name:'Ada Nwosu', action:'posted new makeup availability', time:'12m ago', city:'Warri' },
    { icon:'⚡', name:'Emeka Johnson', action:'fixed a solar installation', time:'18m ago', city:'Agbarho' },
    { icon:'🎓', name:'Ifeoma Chukwu', action:'student scored A1 in Maths 🎉', time:'31m ago', city:'Effurun' },
    { icon:'🎨', name:'Grace Adeola', action:'launched a new brand identity', time:'45m ago', city:'Warri' },
    { icon:'🍽️', name:'Blessing Okonkwo', action:'got hired for a 200-person event', time:'1h ago', city:'Effurun' },
    { icon:'🎵', name:'Nkechi Okoro', action:'accepted 2 new piano students', time:'2h ago', city:'Effurun' },
  ],

  showSearchMode() {},
  hideSearchModeDelay() {},
  focusSearch() { document.getElementById('disc-search')?.focus(); },
  switchDiscoverMode(mode) {
    if (mode === 'map') C.switchHomeTab('map', document.querySelector('[data-htab=map]'));
    else if (mode === 'list') C.switchHomeTab('people', document.querySelector('[data-htab=people]'));
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

  // ══════════════════════════════════════════
  // AUTH — LOGIN
  // ══════════════════════════════════════════
  async login() {
    if (!auth) return C.toast('Firebase not configured', 'err');
    const email = document.getElementById('l-email').value.trim();
    const pw = document.getElementById('l-pw').value;
    const errEl = document.getElementById('l-err');
    errEl.classList.remove('show');
    if (!email || !pw) return C.showErr(errEl, '⚠️ Enter both email and password');
    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      await auth.signInWithEmailAndPassword(email, pw);
      // onAuthStateChanged handles navigation from here
    } catch(e) {
      btn.disabled = false; btn.textContent = 'Sign In';
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        C.showErr(errEl, '❌ No account with this email. Sign up first →');
        document.querySelector('#s-login .auth-footer').innerHTML =
          '👇 <span class="link-p" onclick="C.goTo(\'register\')" style="font-weight:800">Create a free account →</span>';
      } else if (e.code === 'auth/account-exists-with-different-credential' || e.code === 'auth/wrong-password') {
        C.showErr(errEl, '⚠️ This email uses Google Sign-In. Tap the G button instead.');
      } else {
        C.showErr(errEl, C.authErr(e.code));
      }
    }
  },

  // ══════════════════════════════════════════
  // AUTH — REGISTER
  // ══════════════════════════════════════════
  async register() {
    if (!auth) return C.toast('Firebase not configured', 'err');
    const name    = document.getElementById('r-name').value.trim();
    const email   = document.getElementById('r-email').value.trim();
    const phone   = document.getElementById('r-phone').value.trim();
    const address = document.getElementById('r-address')?.value.trim() || '';
    const city    = document.getElementById('r-city')?.value.trim() || '';
    const state   = document.getElementById('r-state')?.value.trim() || '';
    const pw      = document.getElementById('r-pw').value;
    const terms   = document.getElementById('r-terms').checked;
    const errEl   = document.getElementById('r-err');
    errEl.classList.remove('show');

    // Validation — clear messages first
    if (!name)                        return C.showErr(errEl, '⚠️ Enter your full name');
    if (!email || !email.includes('@')) return C.showErr(errEl, '⚠️ Enter a valid email address');
    if (!phone)                       return C.showErr(errEl, '⚠️ Enter your phone number');
    if (!city)                        return C.showErr(errEl, '⚠️ Enter your city (e.g. Effurun)');
    if (!pw || pw.length < 6)         return C.showErr(errEl, '⚠️ Password must be at least 6 characters');
    if (!terms)                       return C.showErr(errEl, '⚠️ Accept the Terms & Privacy Policy to continue');

    const btn = document.getElementById('btn-register');
    btn.disabled = true; btn.textContent = 'Generating code...';

    // Generate 4-digit OTP — store everything in pendingReg
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    S.pendingReg = { name, email, phone, address, city, state, pw, otp,
      type: S.selectedType || 'both',
      gender: S.selectedGender || 'male' };

    // Show the OTP on-screen (no email service connected yet)
    const destEl  = document.getElementById('v-dest');
    const devBox  = document.getElementById('dev-otp-box');
    const devCode = document.getElementById('dev-otp-code');
    if (destEl)  destEl.textContent = email;
    if (devBox)  devBox.style.display = 'block';
    if (devCode) devCode.textContent = otp;
    // Auto-fill the OTP boxes so user doesn't have to type it
    [0,1,2,3].forEach(i => {
      const box = document.getElementById('otp-'+i);
      if (box) { box.value = otp[i]; box.classList.remove('ok','err'); }
    });
    document.getElementById('otp-err').style.display = 'none';
    document.getElementById('otp-ok').style.display = 'none';

    setTimeout(() => {
      btn.disabled = false; btn.textContent = 'Send Verification Code 📨';
      C.goTo('verify');
      C.startResendTimer();
    }, 500);
  },

  selGender(val, el) {
    S.selectedGender = val;
    document.querySelectorAll('#r-gender-row .tgl').forEach(t => t.classList.remove('on'));
    el.classList.add('on');
  },

  // ══════════════════════════════════════════
  // AUTH — OTP VERIFY (handles BOTH email reg AND phone login)
  // ══════════════════════════════════════════
  async verifyOtp() {
    const code   = [0,1,2,3].map(i => (document.getElementById('otp-'+i)?.value||'')).join('');
    const errEl  = document.getElementById('otp-err');
    const okEl   = document.getElementById('otp-ok');
    const btn    = document.querySelector('#s-verify .btn-p');
    if (code.length < 4) return C.toast('Enter all 4 digits');

    if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }

    // ── PATH A: Phone login (Firebase SMS OTP — 6 digits) ──
    if (window.confirmationResult && S.pendingPhone) {
      // Phone OTP is 6 digits — user may have typed only 4 boxes
      // We need to handle 6-digit codes: show 6 OTP boxes for phone or collect differently
      // For now collect all 4 boxes + show hint
      try {
        await window.confirmationResult.confirm(code);
        // onAuthStateChanged fires → handles navigation
        if (okEl) { okEl.textContent = '✅ Verified! Signing you in...'; okEl.style.display = 'block'; }
        window.confirmationResult = null;
        S.pendingPhone = null;
      } catch(e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Verify & Create Account →'; }
        [0,1,2,3].forEach(i => document.getElementById('otp-'+i)?.classList.add('err'));
        if (errEl) { errEl.textContent = '❌ Wrong SMS code. Check your messages and try again.'; errEl.style.display = 'block'; }
      }
      return;
    }

    // ── PATH B: Email registration OTP (4-digit local check) ──
    if (S.pendingReg) {
      if (code === S.pendingReg.otp) {
        [0,1,2,3].forEach(i => document.getElementById('otp-'+i)?.classList.add('ok'));
        if (errEl) errEl.style.display = 'none';
        if (okEl) { okEl.textContent = '✅ Verified! Creating your account...'; okEl.style.display = 'block'; }
        await C.createAccount(S.pendingReg);
      } else {
        if (btn) { btn.disabled = false; btn.textContent = 'Verify & Create Account →'; }
        [0,1,2,3].forEach(i => document.getElementById('otp-'+i)?.classList.add('err'));
        if (errEl) { errEl.textContent = '❌ Wrong code — check the code shown in the blue box above.'; errEl.style.display = 'block'; }
      }
      return;
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Verify & Create Account →'; }
    C.toast('No pending verification. Go back and try again.', 'err');
  },

  // ══════════════════════════════════════════
  // AUTH — CREATE ACCOUNT
  // ══════════════════════════════════════════
  async createAccount({ name, email, phone, address, city, state, pw, type, gender }) {
    const btn = document.querySelector('#s-verify .btn-p');
    try {
      // Step 1 — Create Firebase Auth user
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      await cred.user.updateProfile({ displayName: name });

      // Step 2 — Create Firestore user document
      const userDoc = {
        fullName: name, email, phone: phone || '',
        address: address || '', city: city || 'Effurun',
        state: state || 'Delta State',
        gender: gender || 'male',
        userType: type || 'both',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        averageRating: 0, totalRatings: 0,
        completedJobs: 0, referralCount: 0,
        walletBalance: 0, escrowBalance: 0,
        trustScore: 50, setupComplete: false, isAvailable: true,
        lat: S.userLat, lng: S.userLng,
        profileImageUrl: '',
      };

      if (db) {
        try {
          await db.collection('users').doc(cred.user.uid).set(userDoc);
        } catch(firestoreErr) {
          // Firestore write failed (likely rules) — still proceed
          // Store locally so setup works
          S.userData = userDoc;
          console.warn('Firestore write failed — using local data. Fix rules in Firebase console.', firestoreErr.message);
        }
      } else {
        S.userData = userDoc;
      }

      S.user = cred.user;
      S.pendingReg = null;
      C.toast('Account created! 🎉 Welcome to Cionti!', 'ok');
      // Small delay so success message is visible
      setTimeout(() => C.goTo('setup'), 800);

    } catch(e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Verify & Create Account →'; }
      const okEl = document.getElementById('otp-ok');
      if (okEl) okEl.style.display = 'none';
      if (e.code === 'auth/email-already-in-use') {
        C.toast('This email already has an account — sign in instead', 'err');
        setTimeout(() => C.goTo('login'), 1200);
      } else {
        C.toast(C.authErr(e.code), 'err');
      }
    }
  },

  // ══════════════════════════════════════════
  // AUTH — GOOGLE (redirect on mobile, popup on desktop)
  // ══════════════════════════════════════════
  async loginGoogle() {
    if (!auth) return C.toast('Firebase not configured', 'err');
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      // Use redirect on mobile (more reliable) — popup on desktop
      const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
      if (isMobile) {
        // Store intent so we know to handle redirect result on next load
        localStorage.setItem('cionti-google-redirect', '1');
        await auth.signInWithRedirect(provider);
        // Page reloads — onAuthStateChanged handles result
      } else {
        const cred = await auth.signInWithPopup(provider);
        await C.ensureGoogleUserDoc(cred.user);
      }
    } catch(e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        C.toast(C.authErr(e.code), 'err');
      }
    }
  },

  async ensureGoogleUserDoc(user) {
    if (!db) return;
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      if (!doc.exists) {
        await db.collection('users').doc(user.uid).set({
          fullName: user.displayName || '',
          email: user.email || '',
          phone: '', userType: 'both', gender: 'other',
          address: '', city: '', state: '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          averageRating: 0, totalRatings: 0,
          completedJobs: 0, referralCount: 0,
          walletBalance: 0, escrowBalance: 0,
          trustScore: 50, setupComplete: false, isAvailable: true,
          profileImageUrl: user.photoURL || '',
          lat: S.userLat, lng: S.userLng,
        });
      }
    } catch(e) {
      console.warn('Could not create Google user doc:', e.message);
    }
    // onAuthStateChanged handles navigation
  },

  // ══════════════════════════════════════════
  // AUTH — PHONE (SMS)
  // ══════════════════════════════════════════
  async sendPhoneCode() {
    if (!auth) return C.toast('Firebase not configured', 'err');
    let phone = document.getElementById('ph-num').value.trim();
    const errEl = document.getElementById('ph-err');
    errEl.classList.remove('show');

    // Auto-format Nigerian numbers
    if (phone.startsWith('0') && phone.length === 11) {
      phone = '+234' + phone.substring(1);
      document.getElementById('ph-num').value = phone;
    } else if (/^234\d{10}$/.test(phone)) {
      phone = '+' + phone;
      document.getElementById('ph-num').value = phone;
    }
    if (!phone || !phone.startsWith('+') || phone.length < 10) {
      return C.showErr(errEl, '⚠️ Enter a valid number e.g. 08012345678 or +2348012345678');
    }

    const btn = document.querySelector('#s-phone-login .btn-p');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-phone', { size: 'invisible' });
        await window.recaptchaVerifier.render();
      }
      window.confirmationResult = await auth.signInWithPhoneNumber(phone, window.recaptchaVerifier);
      S.pendingPhone = { phone };
      S.pendingReg = null; // clear any pending reg so verifyOtp takes phone path

      // Prepare verify screen for phone (6-digit SMS code — show all 4 boxes + note)
      const destEl = document.getElementById('v-dest');
      const devBox = document.getElementById('dev-otp-box');
      if (destEl) destEl.textContent = phone;
      if (devBox) devBox.style.display = 'none'; // no on-screen code for real SMS

      // Show a note that code is from SMS
      const noteEl = document.getElementById('dev-otp-box');
      if (noteEl) {
        noteEl.style.display = 'block';
        noteEl.innerHTML = `
          <div style="font-size:.78rem;font-weight:700;color:var(--ok);margin-bottom:4px">✅ SMS sent to ${phone}</div>
          <div style="font-size:.72rem;color:var(--textl)">Enter the 6-digit code from your SMS. Use the first 4 digits in the boxes, then tap Verify.</div>`;
      }

      [0,1,2,3].forEach(i => {
        const box = document.getElementById('otp-'+i);
        if (box) { box.value = ''; box.classList.remove('ok','err'); }
      });

      if (btn) { btn.disabled = false; btn.textContent = 'Send Code'; }
      C.goTo('verify');
      C.startResendTimer();
    } catch(e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Code'; }
      // Reset recaptcha on failure
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch(_) {}
        window.recaptchaVerifier = null;
      }
      const msg = {
        'auth/invalid-phone-number': '❌ Invalid number. Use format: 08012345678',
        'auth/too-many-requests': '⚠️ Too many attempts. Wait a few minutes.',
        'auth/captcha-check-failed': '⚠️ reCAPTCHA failed. Refresh and try again.',
      }[e.code] || e.message;
      C.showErr(errEl, msg);
    }
  },

  otpIn(i) {
    const inp = document.getElementById('otp-'+i);
    if (!inp) return;
    // Clear err/ok state when user types
    [0,1,2,3].forEach(j => document.getElementById('otp-'+j)?.classList.remove('err','ok'));
    document.getElementById('otp-err').style.display = 'none';
    // Auto-advance
    if (inp.value && i < 3) document.getElementById('otp-'+(i+1))?.focus();
    // Auto-submit on last digit
    if (inp.value && i === 3) setTimeout(() => C.verifyOtp(), 200);
  },

  otpKey(e, i) {
    if (e.key === 'Backspace' && !document.getElementById('otp-'+i)?.value && i > 0) {
      document.getElementById('otp-'+(i-1))?.focus();
    }
  },

  resendOtp() {
    if (S.pendingPhone && window.confirmationResult) {
      // For phone — re-trigger send
      window.confirmationResult = null;
      C.goTo('phone-login');
      C.toast('Go back and send the code again', 'err');
      return;
    }
    if (S.pendingReg) {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      S.pendingReg.otp = otp;
      // Update on-screen code
      const devCode = document.getElementById('dev-otp-code');
      if (devCode) devCode.textContent = otp;
      // Clear boxes
      [0,1,2,3].forEach(i => {
        const box = document.getElementById('otp-'+i);
        if (box) { box.value = ''; box.classList.remove('ok','err'); }
      });
      document.getElementById('otp-err').style.display = 'none';
      C.toast('New code generated ✅', 'ok');
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
      'auth/user-not-found': '❌ No account with that email. Please sign up first.',
      'auth/account-exists-with-different-credential': '⚠️ This email is linked to Google Sign-In. Tap the G button below to sign in.',
      'auth/wrong-password': '❌ Wrong password. Try again.',
      'auth/invalid-credential': '❌ Email or password is incorrect. If you signed up with Google, use the G button.',
      'auth/invalid-email': '❌ That email address is not valid.',
      'auth/email-already-in-use': '❌ An account with this email already exists. Please sign in.',
      'auth/weak-password': '❌ Password too weak — use at least 6 characters.',
      'auth/too-many-requests': '⚠️ Too many failed attempts. Wait a few minutes and try again.',
      'auth/network-request-failed': '⚠️ Network error. Check your internet connection.',
      'auth/popup-blocked': '⚠️ Popup blocked — allow popups for Google sign-in.',
      'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
      'auth/operation-not-allowed': '⚠️ This sign-in method is not enabled. Contact support.',
    };
    return m[code] || 'Something went wrong. Please try again.';
  },
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
    if (!S.user) return C.toast('Not signed in', 'err');
    const city  = document.getElementById('setup-city').value.trim();
    const state = document.getElementById('setup-state').value.trim();
    const bio   = document.getElementById('setup-bio')?.value.trim() || '';
    if (!city) return C.toast('Enter your city to continue', 'err');

    const btn = document.querySelector('#s-setup .btn-p');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    const data = {
      bio, city, state, setupComplete: true,
      lat: S.detectedLat || S.userLat,
      lng: S.detectedLng || S.userLng,
    };

    // Profile photo — try Storage, fall back to base64 in Firestore
    if (S.setupPhoto) {
      if (storage) {
        try {
          const ref = storage.ref(`profiles/${S.user.uid}`);
          await ref.put(S.setupPhoto);
          data.profileImageUrl = await ref.getDownloadURL();
        } catch(e) {
          // Storage failed (Spark plan) — use base64
          if (S.setupPhoto.size < 300000) {
            data.profileImageUrl = await new Promise(res => {
              const r = new FileReader();
              r.onload = e => res(e.target.result);
              r.readAsDataURL(S.setupPhoto);
            });
          }
        }
      } else if (S.setupPhoto.size < 300000) {
        data.profileImageUrl = await new Promise(res => {
          const r = new FileReader();
          r.onload = e => res(e.target.result);
          r.readAsDataURL(S.setupPhoto);
        });
      }
    }

    // Save to Firestore if available
    if (db) {
      try {
        await db.collection('users').doc(S.user.uid).update(data);
      } catch(e) {
        // Merge into local S.userData if write fails
        S.userData = { ...(S.userData || {}), ...data };
      }
    } else {
      S.userData = { ...(S.userData || {}), ...data };
    }

    await C.loadUserData(S.user.uid);
    if (btn) { btn.disabled = false; btn.textContent = 'Continue →'; }
    C.enterApp();
  },

  skipSetup() {
    if (db && S.user) {
      db.collection('users').doc(S.user.uid).update({ setupComplete: true }).catch(() => {});
    }
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
    const nameEl = document.getElementById('disc-name');
    const avEl   = document.getElementById('disc-av');
    const locEl  = document.getElementById('disc-loc');

    if (S.isGuest) {
      if (nameEl) nameEl.textContent = 'Hi, Guest 👋';
      if (locEl)  locEl.textContent  = '📍 Exploring Cionti';
      if (avEl)   avEl.textContent   = '👤';
      return;
    }
    const name      = S.userData?.fullName || S.user?.displayName || 'Explorer';
    const firstName = name.split(' ')[0];
    if (nameEl) nameEl.textContent = `Hi, ${firstName} 👋`;
    if (locEl)  locEl.textContent  = `📍 ${S.userData?.city || 'Effurun'}, Nigeria`;
    if (avEl) {
      const img = S.userData?.profileImageUrl || S.user?.photoURL;
      if (img) {
        avEl.innerHTML = `<img src="${img}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      } else {
        avEl.textContent  = firstName[0].toUpperCase();
        avEl.style.background  = C.avatarColor(name);
        avEl.style.color       = '#fff';
        avEl.style.fontWeight  = '800';
        avEl.style.display     = 'flex';
        avEl.style.alignItems  = 'center';
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

  updateRadius(val) {
    S.currentRadius = parseInt(val);
    document.getElementById('rad-label').textContent = val+'km';
    C.renderSkills();
  },

  // ── SKILLS ──
  async loadSkills() {
    // Always seed demo data first so app is never empty
    if (S.skills.length === 0) {
      S.skills = C.DEMO_TALENTS.map((t, i) => ({ id: 'demo' + (i+1), ...t }));
      C.renderMapMarkers();
      C.renderHomeFeedSections();
    }
    if (!db) return;
    try {
      const snap = await db.collection('skills').where('isActive','==',true).orderBy('createdAt','desc').limit(100).get();
      if (snap.docs.length > 0) {
        // Merge real data on top of demo
        const real = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        S.skills = [...real, ...C.DEMO_TALENTS.map((t,i) => ({ id:'demo'+(i+1), ...t }))];
        C.renderSkills();
        C.renderHomeFeedSections();
      }
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
    else if (tab === 'shorts') C.loadShortsFeed(el);
    else if (tab === 'jobs') await C.loadJobsFeed(el);
    else if (tab === 'trending') await C.loadTrendingFeed(el);
    else if (tab === 'news') await C.loadNewsFeed(el);
    else if (tab === 'ai-chat') C.loadAIChatFeed(el);
  },

  async loadCommunityFeed(el) {
    if (!db) {
      el.innerHTML = C.demoCommunityFeed();
      return;
    }
    try {
      // Load both skills and user posts
      const [skillsSnap, contentSnap] = await Promise.all([
        db.collection('skills').where('isActive','==',true).orderBy('createdAt','desc').limit(10).get(),
        db.collection('content').where('isActive','==',true).where('visibility','==','public').orderBy('createdAt','desc').limit(20).get(),
      ]);
      const skills = skillsSnap.docs.map(d=>({id:d.id,_src:'skill',...d.data()}));
      const posts = contentSnap.docs.map(d=>({id:d.id,_src:'content',...d.data()}));
      const all = [...posts, ...skills].sort((a,b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return tb - ta;
      });
      if (!all.length) { el.innerHTML = C.demoCommunityFeed(); return; }
      el.innerHTML = all.map(item => item._src === 'skill' ? C.renderSkillFeedCard(item) : C.renderContentFeedCard(item)).join('');
    } catch(e) {
      el.innerHTML = C.demoCommunityFeed();
    }
  },

  demoCommunityFeed() {
    const demoItems = [
      { type:'post', id:'demo1', userName:'Chiamaka Obi', userCity:'Effurun', text:'Just landed my first client from Cionti! 🎉 Always doubted if local platforms could work — this one actually does. If you have a skill, post it!', createdAt:null, likes:24, comments:8 },
      { type:'photo', id:'demo2', userName:'David Ikenna', userCity:'Warri', text:'New office setup for my design studio ✨ Accepting new clients for logo, branding and print. Drop a DM!', imageUrl:'', createdAt:null, likes:41, comments:5 },
      { type:'post', id:'demo3', userName:'Ngozi Fashola', userCity:'Warri', text:'Quick tip for freelancers in Nigeria: Always get 50% upfront before starting any project. Protect your time and energy 💡', createdAt:null, likes:89, comments:17 },
    ];
    return demoItems.map(item => C.renderContentFeedCard(item)).join('') +
      `<div class="empty-c" style="padding:16px 0">
        <p style="font-size:.8rem;color:var(--textl)">No community posts yet — be the first!</p>
        <button class="btn btn-p btn-sm mt-8" onclick="C.showCreatePicker()">✍️ Write a Post</button>
      </div>`;
  },

  renderSkillFeedCard(s) {
    const cat = CATS.find(c=>c.id===s.category)||CATS[CATS.length-1];
    const liked = S.feedLikes[s.id];
    return `<div class="content-card">
      <div class="content-card-head">
        <div class="avatar av-sm" style="background:${C.avatarColor(s.userName||'?')};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem">${(s.userName||'?')[0].toUpperCase()}</div>
        <div style="flex:1"><div style="font-weight:700;font-size:.87rem">${s.userName}</div><div style="font-size:.7rem;color:var(--textl)">🛠 Posted a skill · ${s.city||''} · ${C.timeAgo(s.createdAt)}</div></div>
        <span class="badge badge-n" style="font-size:.65rem">${cat.label}</span>
      </div>
      <div class="content-card-body">
        <div style="font-weight:700;margin-bottom:4px">${s.title}</div>
        <div style="font-size:.82rem;color:var(--textl);line-height:1.6;margin-bottom:8px">${(s.description||'').substring(0,120)}...</div>
        ${s.portfolioImageUrl ? `<img src="${s.portfolioImageUrl}" class="content-card-img" style="border-radius:10px;margin-bottom:8px" loading="lazy">` : ''}
        <div style="display:flex;gap:8px"><span class="badge badge-p">${C.formatPrice(s)}</span>${s.isAvailable?'<span class="badge badge-ok">✅ Available</span>':''}</div>
      </div>
      <div class="content-card-actions">
        <button class="cc-action ${liked?'liked':''}" onclick="C.toggleLike('${s.id}',this)"><span>${liked?'❤️':'🤍'}</span>${liked?'Liked':'Like'}</button>
        <button class="cc-action" onclick="C.viewProfile('${s.userId}')"><span>👁</span>View</button>
        <button class="cc-action" onclick="C.openChatWithUser('${s.userId}','${s.userName||''}')"><span>💬</span>Chat</button>
      </div>
    </div>`;
  },

  renderContentFeedCard(item) {
    const liked = S.feedLikes[item.id];
    const saved = S.savedItems?.[item.id];
    const typeLabel = { post:'✍️', photo:'📸', shop:'🛍', deal:'🔥', event:'📅', collab:'🤝', poll:'📊' };
    return `<div class="content-card">
      <div class="content-card-head">
        <div class="avatar av-sm" style="background:${C.avatarColor(item.userName||'?')};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem">${(item.userName||'?')[0].toUpperCase()}</div>
        <div style="flex:1"><div style="font-weight:700;font-size:.87rem">${item.userName}</div><div style="font-size:.7rem;color:var(--textl)">${typeLabel[item.type]||'📝'} ${item.userCity||''} · ${C.timeAgo(item.createdAt)}</div></div>
        <div style="cursor:pointer;color:var(--textm);font-size:1.2rem;padding:0 4px" onclick="C.contentMenu('${item.id}')">⋯</div>
      </div>
      ${item.imageUrl ? `<img src="${item.imageUrl}" class="content-card-img" loading="lazy">` : ''}
      <div class="content-card-body">
        ${item.title ? `<div style="font-weight:700;margin-bottom:4px">${item.title}</div>` : ''}
        ${item.text ? `<div style="font-size:.87rem;line-height:1.7">${item.text}</div>` : ''}
        ${item.price != null && (item.type==='shop'||item.type==='deal') ? `<div style="font-size:1rem;font-weight:800;color:var(--p);margin-top:6px">₦${(item.price||0).toLocaleString()} ${item.origPrice?`<span style="text-decoration:line-through;color:var(--textm);font-size:.75rem">₦${item.origPrice.toLocaleString()}</span>`:''}</div>` : ''}
        ${item.location ? `<div style="font-size:.72rem;color:var(--p);margin-top:4px;font-weight:600">📍 ${item.location}</div>` : ''}
      </div>
      <div class="content-card-actions">
        <button class="cc-action ${liked?'liked':''}" onclick="C.toggleLike('${item.id}',this)"><span>${liked?'❤️':'🤍'}</span>${item.likes||0}</button>
        <button class="cc-action" onclick="C.toast('Comments coming soon!')"><span>💬</span>${item.comments||0}</button>
        <button class="cc-action ${saved?'saved':''}" onclick="C.toggleSave('${item.id}',this)"><span>${saved?'🔖':'🏷️'}</span>Save</button>
        <button class="cc-action" onclick="C.shareContent('${item.id}','${(item.title||item.text||'').substring(0,30).replace(/'/g,'')}')"><span>↗</span>Share</button>
      </div>
    </div>`;
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

  loadShortsFeed(el) {
    const shorts = [
      { id: 'dQw4w9WgXcQ', title: 'How to become a freelancer in Nigeria 🇳🇬', creator: '@NaijaFreelancers', views: '128K' },
      { id: 'ScMzIvxBSi4', title: 'Making ₦500K/month as a graphic designer', creator: '@DesignWithAde', views: '89K' },
      { id: 'kXYiU_JCYtU', title: 'Side hustles that pay in Nigeria 2026', creator: '@MoneytalkNG', views: '245K' },
      { id: '9bZkp7q19f0', title: 'How to get clients as a plumber or electrician', creator: '@TradesNG', views: '67K' },
      { id: 'RgKAFK5djSk', title: 'Top skills in demand in Delta State right now', creator: '@DeltaJobs', views: '43K' },
    ];
    el.innerHTML = `
      <div style="margin-bottom:12px">
        <div class="badge badge-p" style="margin-bottom:6px">🎥 Skill & Business Shorts</div>
        <p style="font-size:.78rem;color:var(--textl);line-height:1.5;margin-bottom:12px">Short videos about skills, freelancing and business in Nigeria — no account needed</p>
      </div>
      ${shorts.map(s => `
      <div style="margin-bottom:16px;border-radius:16px;overflow:hidden;background:var(--bg1);border:1px solid var(--border)">
        <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden">
          <iframe src="https://www.youtube.com/embed/${s.id}?rel=0&modestbranding=1" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen loading="lazy"></iframe>
        </div>
        <div style="padding:12px 14px">
          <div style="font-weight:700;font-size:.88rem;margin-bottom:4px">${s.title}</div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:.73rem;color:var(--textl)">${s.creator}</span>
            <span style="font-size:.73rem;color:var(--textm)">👁 ${s.views}</span>
          </div>
        </div>
      </div>`).join('')}
      <div style="text-align:center;padding:16px 0">
        <button class="btn btn-o btn-sm" onclick="C.toast('Creator program coming soon! 🎥')">Apply as Creator</button>
      </div>`;
  },

  loadAIChatFeed(el) {
    el._aiHistory = [];
    el.innerHTML = `
      <div style="margin-bottom:12px">
        <div class="badge badge-p" style="margin-bottom:6px">🤖 Cionti AI — No login needed</div>
        <p style="font-size:.78rem;color:var(--textl);line-height:1.5">Ask anything about skills, freelancing or finding talent in Nigeria</p>
      </div>
      <div id="feed-ai-msgs" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
        <div class="ai-bubble" style="font-size:.85rem;line-height:1.6">
          👋 Hello! I'm Cionti AI.<br><br>I can help you find skilled people near you, price your services, write a great profile, or discover what jobs pay in Nigeria.<br><br>What do you need?
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px" id="feed-ai-suggs">
        ${['What skills are hot in Warri?','How do I price my services?','Write me a profile bio','How to get my first client?','What skills earn most in Nigeria?'].map(q=>`<div class="ai-suggestion" onclick="C.feedAISend('${q.replace(/'/g,'').replace(/\?/g,'')}')">${q}</div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <textarea id="feed-ai-inp" class="ai-inp" placeholder="Ask me anything..." rows="2" onkeydown="C.feedAIKey(event)"></textarea>
        <button class="ai-send" style="flex-shrink:0" onclick="C.feedAISend()"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
      </div>`;
  },

  feedAIKey(e) { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); C.feedAISend(); } },

  async feedAISend(preset) {
    const inp = document.getElementById('feed-ai-inp');
    const msgs = document.getElementById('feed-ai-msgs');
    const el = document.getElementById('feed-content');
    if (!msgs || !el) return;
    const text = preset || inp?.value.trim();
    if (!text) return;
    if (inp) inp.value = '';
    const suggs = document.getElementById('feed-ai-suggs');
    if (suggs) suggs.style.display = 'none';
    msgs.innerHTML += `<div class="ai-bubble user" style="font-size:.85rem">${text}</div>`;
    msgs.innerHTML += `<div class="ai-bubble" id="feed-ai-typing"><span class="ai-typing"><span></span><span></span><span></span></span></div>`;
    msgs.scrollIntoView({ behavior:'smooth', block:'end' });
    if (!el._aiHistory) el._aiHistory = [];
    el._aiHistory.push({ role:'user', content:text });
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:350,
          system:'You are Cionti AI on a Nigerian local talent platform. Users are in Effurun/Warri/Delta State and Nigeria generally. Help with: finding local skilled workers, pricing in Naira (use ₦), writing profiles, freelancing tips, career advice. Be warm, concise, Nigerian-context aware. Under 100 words. Always helpful.',
          messages: el._aiHistory,
        })
      });
      const data = await resp.json();
      const reply = data.content?.[0]?.text || 'Having trouble connecting — try again!';
      el._aiHistory.push({ role:'assistant', content:reply });
      document.getElementById('feed-ai-typing')?.remove();
      msgs.innerHTML += `<div class="ai-bubble" style="font-size:.85rem;line-height:1.6">${reply.replace(/\n/g,'<br>')}</div>`;
      msgs.scrollIntoView({ behavior:'smooth', block:'end' });
    } catch(e) {
      document.getElementById('feed-ai-typing')?.remove();
      msgs.innerHTML += `<div class="ai-bubble" style="font-size:.85rem">Sorry, I'm offline right now. Try the AI Match tab!</div>`;
    }
  },

  toggleLike(id, btn) {
    S.feedLikes[id] = !S.feedLikes[id];
    const liked = S.feedLikes[id];
    btn.classList.toggle('liked', liked);
    btn.innerHTML = `<span>${liked?'❤️':'🤍'}</span>${liked?'1':'0'}`;
    if (db && S.user && id && !id.startsWith('demo')) {
      db.collection('content').doc(id).update({ likes: firebase.firestore.FieldValue.increment(liked?1:-1) }).catch(()=>{});
    }
  },

  toggleSave(id, btn) {
    if (!S.savedItems) S.savedItems = {};
    S.savedItems[id] = !S.savedItems[id];
    btn.classList.toggle('saved', S.savedItems[id]);
    btn.innerHTML = `<span>${S.savedItems[id]?'🔖':'🏷️'}</span>Save`;
    C.toast(S.savedItems[id] ? 'Saved!' : 'Removed from saved');
  },

  contentMenu(id) {
    C.toast('Report / Share options coming soon');
  },

  switchFeedTab(btn, tab) {
    document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('on'));
    if (btn) btn.classList.add('on');
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
    if (!userId) return;
    // Handle demo profiles
    if (userId.startsWith('demo')) {
      const demo = C.DEMO_TALENTS.find(t => t.userId === userId);
      if (demo) {
        const fakeUser = { fullName: demo.userName, city: demo.city, state: 'Delta', isAvailable: demo.isAvailable, averageRating: demo.averageRating, accountType: 'individual', bio: demo.description };
        C.renderViewProfile(fakeUser, [demo], []);
        C.goTo('view-profile');
        document.getElementById('vp-back').onclick = () => C.goTo(S.currentNav||'discover');
        const reqBtn = document.getElementById('vp-req-btn');
        if (reqBtn) reqBtn.style.display = 'flex';
        return;
      }
    }
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
          <button class="btn btn-gold" style="flex:1" onclick="C.goTo('my-shop')">🛍 My Shop</button>
          <button class="btn btn-g" style="flex:1" onclick="C.goTo('settings')">⚙️</button>
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

  // ══════════════════════════════════════════
  // CREATE SYSTEM
  // ══════════════════════════════════════════

  showCreatePicker() {
    if (!S.user && !S.isGuest) {
      C.toast('Sign in to create content');
      return C.goTo('login-options');
    }
    if (S.isGuest) return C.toast('Create a free account to post content');
    const el = document.getElementById('create-picker');
    el.style.display = 'flex';
    requestAnimationFrame(() => el.style.opacity = '1');
  },

  closeCreatePicker(e) {
    if (e.target.id === 'create-picker') {
      document.getElementById('create-picker').style.display = 'none';
    }
  },

  openCreate(type) {
    document.getElementById('create-picker').style.display = 'none';
    S.createType = type;
    S.createImageFile = null;
    S.createLocationTag = null;

    const titles = {
      post: '✍️ Write a Post', photo: '📸 Share a Photo',
      skill: '🛠 Offer a Skill', shop: '🛍 Add Shop Item',
      deal: '🔥 Create a Deal', event: '📅 Post an Event',
      collab: '🤝 Find a Collaborator', poll: '📊 Create a Poll',
    };
    document.getElementById('create-title').textContent = titles[type] || 'Create';

    // Set author info
    const u = S.userData || {};
    const name = u.fullName || S.user?.displayName || 'You';
    document.getElementById('create-author').textContent = name;
    const av = document.getElementById('create-av');
    av.textContent = name[0].toUpperCase();
    av.style.background = C.avatarColor(name);

    // Show/hide price tool
    document.getElementById('tool-price').style.display = ['shop','deal','skill'].includes(type) ? 'flex' : 'none';
    document.getElementById('create-tags-wrap').style.display = ['post','photo','skill','shop'].includes(type) ? 'block' : 'none';

    // Render dynamic fields
    const fields = document.getElementById('create-fields');
    fields.innerHTML = C.buildCreateFields(type);

    // Reset image
    document.getElementById('create-img-preview').style.display = 'none';
    document.getElementById('create-loc-tag').style.display = 'none';

    C.goTo('create');
  },

  buildCreateFields(type) {
    if (type === 'post' || type === 'photo') {
      return `
        <textarea class="post-composer" id="cf-text" placeholder="${type === 'photo' ? 'Caption your photo...' : "What's on your mind? Share a thought, tip, or story..."}" maxlength="500" oninput="C.updateCharCount(this,500)"></textarea>
        <div class="char-counter" id="cf-char">0/500</div>`;
    }
    if (type === 'skill') {
      return `
        <div class="form-group"><label class="form-label">Skill/Service Title *</label><input type="text" id="cf-title" class="form-input" placeholder="e.g. Logo Design, AC Repair, Photography"></div>
        <div class="form-group"><label class="form-label">Category *</label><select id="cf-cat" class="form-select"><option value="">Choose category...</option>${CATS.map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Describe your service *</label><textarea id="cf-text" class="form-input" style="min-height:80px" placeholder="What you offer, experience level, what clients get..."></textarea></div>
        <div class="form-group"><label class="form-label">Price (₦)</label>
          <div class="tgl-row mb-8" id="cf-ptype">
            <div class="tgl on" data-v="negotiable" onclick="C.selTgl('cf-ptype',this)">Negotiate</div>
            <div class="tgl" data-v="fixed" onclick="C.selTgl('cf-ptype',this)">Fixed</div>
            <div class="tgl" data-v="free" onclick="C.selTgl('cf-ptype',this)">Free</div>
          </div>
          <input type="number" id="cf-price" class="form-input" placeholder="₦ Amount (if fixed)">
        </div>`;
    }
    if (type === 'shop') {
      return `
        <div class="form-group"><label class="form-label">Product Name *</label><input type="text" id="cf-title" class="form-input" placeholder="e.g. Custom Ankara Dress, Phone Case, Jollof Rice Pack"></div>
        <div class="form-group"><label class="form-label">Description *</label><textarea id="cf-text" class="form-input" style="min-height:80px" placeholder="Describe the product — material, size, quantity, etc."></textarea></div>
        <div class="form-group"><label class="form-label">Price (₦) *</label><input type="number" id="cf-price" class="form-input" placeholder="e.g. 5000"></div>
        <div class="form-group"><label class="form-label">Stock</label>
          <div class="tgl-row" id="cf-stock">
            <div class="tgl on" data-v="available" onclick="C.selTgl('cf-stock',this)">In Stock</div>
            <div class="tgl" data-v="limited" onclick="C.selTgl('cf-stock',this)">Limited</div>
            <div class="tgl" data-v="preorder" onclick="C.selTgl('cf-stock',this)">Pre-order</div>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Contact for orders</label><input type="text" id="cf-contact" class="form-input" placeholder="WhatsApp number or email"></div>`;
    }
    if (type === 'deal') {
      return `
        <div class="form-group"><label class="form-label">Deal Title *</label><input type="text" id="cf-title" class="form-input" placeholder="e.g. 50% off web design this week!"></div>
        <div class="form-group"><label class="form-label">Description *</label><textarea id="cf-text" class="form-input" style="min-height:70px" placeholder="What's the deal? What does the customer get?"></textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group"><label class="form-label">Original Price (₦)</label><input type="number" id="cf-orig-price" class="form-input" placeholder="10000"></div>
          <div class="form-group"><label class="form-label">Deal Price (₦)</label><input type="number" id="cf-price" class="form-input" placeholder="5000"></div>
        </div>
        <div class="form-group"><label class="form-label">Expires</label><input type="date" id="cf-expires" class="form-input"></div>`;
    }
    if (type === 'event') {
      return `
        <div class="form-group"><label class="form-label">Event Name *</label><input type="text" id="cf-title" class="form-input" placeholder="e.g. Free Design Workshop in Effurun"></div>
        <div class="form-group"><label class="form-label">Description *</label><textarea id="cf-text" class="form-input" style="min-height:70px" placeholder="What will happen, who should come, what they'll learn..."></textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group"><label class="form-label">Date *</label><input type="date" id="cf-date" class="form-input"></div>
          <div class="form-group"><label class="form-label">Time</label><input type="time" id="cf-time" class="form-input"></div>
        </div>
        <div class="form-group"><label class="form-label">Venue / Link</label><input type="text" id="cf-venue" class="form-input" placeholder="e.g. Effurun Hall or https://meet.google.com/..."></div>
        <div class="form-group"><label class="form-label">Entry Fee</label>
          <div class="tgl-row" id="cf-entry">
            <div class="tgl on" data-v="free" onclick="C.selTgl('cf-entry',this)">Free</div>
            <div class="tgl" data-v="paid" onclick="C.selTgl('cf-entry',this)">Paid</div>
          </div>
          <input type="number" id="cf-price" class="form-input mt-8" placeholder="₦ Amount if paid" style="display:none">
        </div>`;
    }
    if (type === 'collab') {
      return `
        <div class="form-group"><label class="form-label">What I'm building *</label><input type="text" id="cf-title" class="form-input" placeholder="e.g. Food delivery app for Warri"></div>
        <div class="form-group"><label class="form-label">Looking for *</label><input type="text" id="cf-role" class="form-input" placeholder="e.g. Android developer, Graphic designer, Investor"></div>
        <div class="form-group"><label class="form-label">More details *</label><textarea id="cf-text" class="form-input" style="min-height:80px" placeholder="The idea, your skill, what the collaborator will do, what's in it for them..."></textarea></div>
        <div class="form-group"><label class="form-label">Compensation</label>
          <div class="tgl-row" id="cf-comp">
            <div class="tgl on" data-v="equity" onclick="C.selTgl('cf-comp',this)">Equity</div>
            <div class="tgl" data-v="paid" onclick="C.selTgl('cf-comp',this)">Paid</div>
            <div class="tgl" data-v="both" onclick="C.selTgl('cf-comp',this)">Both</div>
            <div class="tgl" data-v="volunteer" onclick="C.selTgl('cf-comp',this)">Volunteer</div>
          </div>
        </div>`;
    }
    if (type === 'poll') {
      return `
        <div class="form-group"><label class="form-label">Your Question *</label><input type="text" id="cf-title" class="form-input" placeholder="e.g. Which skill should I learn next?"></div>
        <div class="form-group"><label class="form-label">Poll Options *</label>
          <div id="poll-opts-wrap">
            <input type="text" class="form-input mb-8 poll-opt-inp" placeholder="Option 1">
            <input type="text" class="form-input mb-8 poll-opt-inp" placeholder="Option 2">
          </div>
          <button class="btn btn-g btn-sm" onclick="C.addPollOpt()">+ Add Option</button>
        </div>
        <div class="form-group"><label class="form-label">Poll Duration</label>
          <select id="cf-poll-dur" class="form-select">
            <option value="1">1 day</option>
            <option value="3" selected>3 days</option>
            <option value="7">7 days</option>
          </select>
        </div>`;
    }
    return `<textarea class="post-composer" id="cf-text" placeholder="Share something..." maxlength="500"></textarea>`;
  },

  addPollOpt() {
    const wrap = document.getElementById('poll-opts-wrap');
    const count = wrap.querySelectorAll('.poll-opt-inp').length;
    if (count >= 5) return C.toast('Max 5 options');
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'form-input mb-8 poll-opt-inp';
    inp.placeholder = `Option ${count + 1}`;
    wrap.appendChild(inp);
  },

  updateCharCount(el, max) {
    const counter = document.getElementById('cf-char');
    if (!counter) return;
    const len = el.value.length;
    counter.textContent = `${len}/${max}`;
    counter.className = `char-counter ${len > max * 0.9 ? (len >= max ? 'err' : 'warn') : ''}`;
  },

  previewCreateImg(inp) {
    if (!inp.files[0]) return;
    S.createImageFile = inp.files[0];
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('create-img-el').src = e.target.result;
      document.getElementById('create-img-preview').style.display = 'block';
    };
    reader.readAsDataURL(inp.files[0]);
  },

  removeCreateImg() {
    S.createImageFile = null;
    document.getElementById('create-img-preview').style.display = 'none';
    document.getElementById('create-img-file').value = '';
  },

  addLocation() {
    const tag = document.getElementById('create-loc-tag');
    const text = document.getElementById('create-loc-text');
    tag.style.display = 'flex';
    if (S.userData?.city) {
      text.textContent = S.userData.city;
      S.createLocationTag = S.userData.city;
    } else {
      navigator.geolocation?.getCurrentPosition(async pos => {
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
          const d = await r.json();
          const loc = d.address?.city || d.address?.town || d.address?.suburb || 'Your location';
          text.textContent = loc; S.createLocationTag = loc;
        } catch(e) { text.textContent = 'Effurun, Nigeria'; S.createLocationTag = 'Effurun, Nigeria'; }
      }, () => { text.textContent = 'Effurun, Nigeria'; S.createLocationTag = 'Effurun, Nigeria'; });
    }
  },

  removeLocation() {
    S.createLocationTag = null;
    document.getElementById('create-loc-tag').style.display = 'none';
  },

  addPriceTag() {
    const inp = document.getElementById('cf-price');
    if (inp) inp.focus();
  },

  async publishContent() {
    if (!db) return C.toast('Not connected. Please sign in and retry.', 'err');
    if (!S.user) return C.goTo('login-options');
    const type = S.createType;
    const btn = document.getElementById('btn-publish');
    btn.disabled = true; btn.textContent = 'Publishing...';

    // Collect common fields
    const text = document.getElementById('cf-text')?.value.trim() || '';
    const title = document.getElementById('cf-title')?.value.trim() || '';
    const tags = (document.getElementById('create-tags')?.value || '').split(',').map(t=>t.trim()).filter(Boolean);
    const visibility = document.getElementById('create-visibility')?.value || 'public';

    // Validation
    if (type === 'post' && !text) { btn.disabled=false; btn.textContent='Publish'; return C.toast('Write something first!'); }
    if (['shop','deal','event','collab','skill'].includes(type) && !title) { btn.disabled=false; btn.textContent='Publish'; return C.toast('Add a title first!'); }

    // Image handling — try Storage, fall back to base64 in Firestore
    let imageUrl = '';
    if (S.createImageFile) {
      // Try Firebase Storage first
      if (storage) {
        try {
          const ref = storage.ref(`content/${S.user.uid}/${Date.now()}_${S.createImageFile.name}`);
          await ref.put(S.createImageFile);
          imageUrl = await ref.getDownloadURL();
        } catch(e) {
          // Storage unavailable (Spark plan) — store as base64 data URL in Firestore
          // Only do this for images < 500KB to stay under Firestore 1MB doc limit
          if (S.createImageFile.size < 500000) {
            imageUrl = await new Promise(res => {
              const reader = new FileReader();
              reader.onload = e => res(e.target.result);
              reader.readAsDataURL(S.createImageFile);
            });
          } else {
            C.toast('⚠️ Image too large for free plan — posting without image');
          }
        }
      } else {
        // No storage configured — use base64 for small images
        if (S.createImageFile.size < 500000) {
          imageUrl = await new Promise(res => {
            const reader = new FileReader();
            reader.onload = e => res(e.target.result);
            reader.readAsDataURL(S.createImageFile);
          });
        } else {
          C.toast('⚠️ Upgrade to Firebase Blaze plan to upload large images');
        }
      }
    }

    // Build the content doc
    const base = {
      type, userId: S.user.uid,
      userName: S.userData?.fullName || S.user.displayName || S.user.email?.split('@')[0] || 'User',
      userCity: S.userData?.city || '',
      userState: S.userData?.state || '',
      lat: S.userData?.lat || S.userLat,
      lng: S.userData?.lng || S.userLng,
      imageUrl, tags, visibility,
      location: S.createLocationTag || S.userData?.city || '',
      likes: 0, comments: 0, shares: 0, saves: 0,
      views: 0,
      isActive: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    // Type-specific fields
    if (type === 'post' || type === 'photo') {
      Object.assign(base, { text });
    } else if (type === 'shop') {
      const price = parseFloat(document.getElementById('cf-price')?.value) || 0;
      const stock = document.querySelector('#cf-stock .tgl.on')?.dataset.v || 'available';
      const contact = document.getElementById('cf-contact')?.value.trim() || '';
      Object.assign(base, { title, text, price, stock, contact });
    } else if (type === 'deal') {
      const price = parseFloat(document.getElementById('cf-price')?.value) || 0;
      const origPrice = parseFloat(document.getElementById('cf-orig-price')?.value) || 0;
      const expires = document.getElementById('cf-expires')?.value || '';
      const discount = origPrice > 0 ? Math.round((1 - price/origPrice)*100) : 0;
      Object.assign(base, { title, text, price, origPrice, discount, expires });
    } else if (type === 'event') {
      const date = document.getElementById('cf-date')?.value || '';
      const time = document.getElementById('cf-time')?.value || '';
      const venue = document.getElementById('cf-venue')?.value.trim() || '';
      const entry = document.querySelector('#cf-entry .tgl.on')?.dataset.v || 'free';
      const price = entry === 'paid' ? parseFloat(document.getElementById('cf-price')?.value) || 0 : 0;
      Object.assign(base, { title, text, date, time, venue, entry, price });
    } else if (type === 'collab') {
      const role = document.getElementById('cf-role')?.value.trim() || '';
      const comp = document.querySelector('#cf-comp .tgl.on')?.dataset.v || 'equity';
      Object.assign(base, { title, text, role, compensation: comp });
    } else if (type === 'poll') {
      const opts = Array.from(document.querySelectorAll('.poll-opt-inp')).map(i=>i.value.trim()).filter(Boolean);
      if (opts.length < 2) { btn.disabled=false; btn.textContent='Publish'; return C.toast('Add at least 2 poll options!'); }
      const dur = parseInt(document.getElementById('cf-poll-dur')?.value) || 3;
      const expires = new Date(Date.now() + dur * 86400000).toISOString();
      const votes = {};
      opts.forEach(o => votes[o] = 0);
      Object.assign(base, { title, text, options: opts, votes, expires, totalVotes: 0 });
    } else if (type === 'skill') {
      const cat = document.getElementById('cf-cat')?.value || 'other';
      const ptype = document.querySelector('#cf-ptype .tgl.on')?.dataset.v || 'negotiable';
      const price = parseFloat(document.getElementById('cf-price')?.value) || 0;
      // Also add to skills collection
      await db.collection('skills').add({
        ...base, title, description: text, category: cat,
        priceType: ptype, price, serviceType: 'both',
        city: S.userData?.city || '', state: S.userData?.state || '',
        isAvailable: true, viewCount: 0, averageRating: 0,
      });
    }

    try {
      const docRef = await db.collection('content').add(base);
      btn.disabled=false; btn.textContent='Publish';
      const labels = { post:'Post', shop:'Product', deal:'Deal', event:'Event', poll:'Poll', collab:'Collab request', skill:'Skill', photo:'Photo' };
      C.toast(`${labels[type]||'Content'} published! 🚀`, 'ok');
      S.createType = null; S.createImageFile = null; S.createLocationTag = null;
      // Navigate to the most relevant screen
      if (type === 'shop' || type === 'deal') {
        C.navTo('market');
        setTimeout(() => C.loadMarket('all'), 300);
      } else if (type === 'event') {
        C.navTo('market');
        setTimeout(() => C.loadMarket('events'), 300);
      } else if (type === 'collab') {
        C.navTo('market');
        setTimeout(() => C.loadMarket('collabs'), 300);
      } else {
        C.navTo('discover');
        // Refresh community posts section
        setTimeout(() => C.renderCommunityPostsHome(), 400);
      }
    } catch(e) {
      btn.disabled=false; btn.textContent='Publish';
      if (e.code === 'permission-denied') {
        C.toast('❌ Permission denied — check Firestore security rules in Firebase console', 'err');
      } else if (e.code === 'unavailable') {
        C.toast('❌ No internet connection', 'err');
      } else {
        C.toast('Error: ' + e.message, 'err');
        console.error('Publish error:', e);
      }
    }
  },

  // ══════════════════════════════════════════
  // MARKETPLACE
  // ══════════════════════════════════════════

  async loadMarket(mcat) {
    const el = document.getElementById('market-content');
    if (!el) return;
    el.innerHTML = `<div class="loading-c"><div class="spinner"></div></div>`;
    S.marketCat = mcat || 'all';

    if (!db) {
      el.innerHTML = C.demoMarket();
      return;
    }

    try {
      let q = db.collection('content').where('isActive','==',true).orderBy('createdAt','desc').limit(40);
      if (mcat && mcat !== 'all') {
        const typeMap = { products:'shop', deals:'deal', events:'event', collabs:'collab', shops:'shop' };
        if (typeMap[mcat]) q = q.where('type','==',typeMap[mcat]);
      }
      const snap = await q.get();
      const items = snap.docs.map(d=>({id:d.id,...d.data()}));
      if (!items.length) {
        el.innerHTML = C.demoMarket(mcat);
        return;
      }
      el.innerHTML = C.renderMarketItems(items);
    } catch(e) {
      el.innerHTML = C.demoMarket(mcat);
    }
  },

  demoMarket(mcat) {
    // Rich demo content so the page looks alive even before data
    const demoItems = [
      { id:'d1', type:'deal', title:'50% off Logo Design this week!', text:'Get a professional logo for your business at half price. Limited to 5 clients.', price:5000, origPrice:10000, discount:50, userName:'DesignStudio NG', userCity:'Warri', imageUrl:'', expires:'2026-03-15', createdAt:null },
      { id:'d2', type:'shop', title:'Custom Ankara Handbag', text:'Handmade Ankara handbag. Available in 3 sizes. Ships anywhere in Delta State.', price:8500, userName:'AdieFashion', userCity:'Effurun', imageUrl:'', stock:'available', contact:'+234 812 000 0000', createdAt:null },
      { id:'d3', type:'event', title:'Free Digital Skills Bootcamp — Effurun', text:'Learn Canva, Social Media Marketing and basic web design in 2 days. Free for Delta State youths.', date:'2026-03-22', time:'09:00', venue:'Effurun Business Hub', entry:'free', price:0, userName:'DSN Cionti', userCity:'Effurun', imageUrl:'', createdAt:null },
      { id:'d4', type:'collab', title:'Building a delivery app for Warri — need Android dev', text:'I have the business model and brand. Looking for an Android developer to co-build. Revenue share model.', role:'Android Developer', compensation:'equity', userName:'StartupNaija', userCity:'Warri', imageUrl:'', createdAt:null },
      { id:'d5', type:'shop', title:'Fresh Catered Jollof Rice Packs', text:'Party-quality jollof rice. Minimum 50 packs. Order 3 days in advance. Price per pack.', price:1500, userName:'TasteOfHome', userCity:'Effurun', imageUrl:'', stock:'available', contact:'WhatsApp: 0812 xxx xxxx', createdAt:null },
      { id:'d6', type:'deal', title:'Accountant Special — Year-End Filing ₦15k', text:'Full tax filing and financial report for small businesses. Normally ₦30,000. Valid until month end.', price:15000, origPrice:30000, discount:50, userName:'ProAccounts NG', userCity:'Warri', imageUrl:'', expires:'2026-03-31', createdAt:null },
      { id:'d7', type:'shop', title:'iPhone 14 Pro Max — 256GB', text:'UK used, excellent condition. Battery 92%. Comes with original charger and box.', price:420000, userName:'GadgetsNG', userCity:'Effurun', imageUrl:'', stock:'limited', contact:'+234 802 000 0000', createdAt:null },
      { id:'d8', type:'event', title:'Warri Fashion Pop-Up Market', text:'Over 30 local fashion designers showcasing their work. Free entry. Come shop, network and connect.', date:'2026-04-05', time:'11:00', venue:'Warri Culture Centre', entry:'free', price:0, userName:'WarriFashion', userCity:'Warri', imageUrl:'', createdAt:null },
    ];

    let filtered = mcat && mcat !== 'all' ? demoItems.filter(i => {
      const typeMap = { products:'shop', deals:'deal', events:'event', collabs:'collab' };
      return i.type === (typeMap[mcat] || mcat);
    }) : demoItems;

    if (!filtered.length) return `<div class="empty-c"><div class="ei">${mcat==='shops'?'🏪':mcat==='deals'?'🔥':mcat==='events'?'📅':mcat==='collabs'?'🤝':'🛍'}</div><h3>No ${mcat} yet</h3><p>Be the first to post!</p><button class="btn btn-p btn-sm mt-16" onclick="C.showCreatePicker()">+ Create</button></div>`;
    return C.renderMarketItems(filtered);
  },

  renderMarketItems(items) {
    return `
      <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:.75rem;color:var(--textm)">${items.length} items near you</span>
        <button class="btn btn-p btn-sm" onclick="C.showCreatePicker()">+ Post</button>
      </div>
      ${items.map(item => C.renderMarketCard(item)).join('')}`;
  },

  renderMarketCard(item) {
    if (item.type === 'deal') return C.renderDealCard(item);
    if (item.type === 'event') return C.renderEventCard(item);
    if (item.type === 'collab') return C.renderCollabCard(item);
    if (item.type === 'poll') return C.renderPollCard(item);
    // shop / product (default)
    return `
      <div class="market-card" onclick="C.viewContent('${item.id}')">
        <div style="position:relative">
          ${item.imageUrl ? `<img src="${item.imageUrl}" class="market-img" loading="lazy">` :
            `<div class="market-img" style="background:linear-gradient(135deg,${C.avatarColor(item.title||'?')}22,var(--bg2))"><span style="font-size:3rem">📦</span></div>`}
          <span class="market-badge badge-new" style="position:absolute;top:10px;left:10px">NEW</span>
        </div>
        <div style="padding:12px 14px">
          <div style="font-weight:700;font-size:.92rem;margin-bottom:4px">${item.title}</div>
          <div style="font-size:.8rem;color:var(--textl);line-height:1.5;margin-bottom:8px">${(item.text||'').substring(0,80)}...</div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:1.1rem;font-weight:800;color:var(--p)">₦${(item.price||0).toLocaleString()}</div>
            <div style="font-size:.72rem;color:var(--textl)">📍 ${item.userCity||'Nigeria'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
            <div class="avatar" style="width:22px;height:22px;border-radius:50%;background:${C.avatarColor(item.userName||'?')};color:#fff;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700">${(item.userName||'?')[0].toUpperCase()}</div>
            <span style="font-size:.73rem;color:var(--textl)">${item.userName||'Seller'}</span>
            ${item.stock === 'limited' ? '<span class="badge badge-n" style="margin-left:auto">Limited</span>' : ''}
            ${item.stock === 'preorder' ? '<span class="badge" style="background:#8B5CF622;color:#8B5CF6;margin-left:auto">Pre-order</span>' : ''}
          </div>
        </div>
      </div>`;
  },

  renderDealCard(item) {
    const expires = item.expires ? new Date(item.expires).toLocaleDateString('en-NG',{day:'numeric',month:'short'}) : '';
    return `
      <div class="deal-card" onclick="C.viewContent('${item.id}')">
        ${item.discount ? `<div style="display:inline-block;background:rgba(255,255,255,.25);border-radius:20px;padding:3px 10px;font-size:.7rem;font-weight:800;margin-bottom:6px">🔥 ${item.discount}% OFF</div>` : ''}
        <div style="font-weight:800;font-size:1rem;margin-bottom:4px;position:relative;z-index:1">${item.title}</div>
        <div style="font-size:.8rem;opacity:.85;margin-bottom:10px;position:relative;z-index:1">${(item.text||'').substring(0,80)}</div>
        <div style="display:flex;align-items:center;gap:12px;position:relative;z-index:1">
          <div>
            <div style="font-size:1.3rem;font-weight:800">₦${(item.price||0).toLocaleString()}</div>
            ${item.origPrice ? `<div style="text-decoration:line-through;opacity:.6;font-size:.78rem">₦${item.origPrice.toLocaleString()}</div>` : ''}
          </div>
          <div style="margin-left:auto;text-align:right">
            ${expires ? `<div class="deal-timer">⏰ Ends ${expires}</div>` : ''}
            <div style="font-size:.72rem;opacity:.7">by ${item.userName}</div>
          </div>
        </div>
      </div>`;
  },

  renderEventCard(item) {
    const d = item.date ? new Date(item.date) : null;
    return `
      <div class="event-card" onclick="C.viewContent('${item.id}')">
        <div class="event-date-box">
          <div class="event-date-d">${d ? d.getDate() : '?'}</div>
          <div class="event-date-m">${d ? d.toLocaleString('en',{month:'short'}) : 'TBA'}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.9rem;margin-bottom:3px">${item.title}</div>
          <div style="font-size:.75rem;color:var(--textl);margin-bottom:5px">${item.venue||'Online'} ${item.time?'· '+item.time:''}</div>
          <div style="display:flex;gap:6px">
            <span class="badge ${item.entry==='free'?'badge-ok':'badge-p'}">${item.entry==='free'?'Free Entry':'₦'+((item.price||0).toLocaleString())}</span>
            <span class="badge badge-n">📍 ${item.userCity||'Nigeria'}</span>
          </div>
        </div>
      </div>`;
  },

  renderCollabCard(item) {
    const compColors = { equity:'#00D97E', paid:'var(--p)', both:'var(--gold)', volunteer:'var(--textl)' };
    return `
      <div class="collab-card" onclick="C.viewContent('${item.id}')">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
          <div style="font-size:1.5rem">🤝</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:.9rem;margin-bottom:2px">${item.title}</div>
            <div style="font-size:.75rem;margin-bottom:6px;color:var(--textl)">Looking for: <strong style="color:var(--p)">${item.role||'Collaborator'}</strong></div>
            <div style="font-size:.8rem;color:var(--textl);line-height:1.5">${(item.text||'').substring(0,90)}...</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge" style="background:${compColors[item.compensation]||'var(--bg3)'}22;color:${compColors[item.compensation]||'var(--textl)'}">${item.compensation||'TBD'}</span>
          <span style="font-size:.72rem;color:var(--textm);margin-left:auto">by ${item.userName} · ${item.userCity}</span>
        </div>
      </div>`;
  },

  renderPollCard(item) {
    const opts = item.options || [];
    const total = item.totalVotes || 0;
    return `
      <div class="content-card" onclick="">
        <div class="content-card-head">
          <div class="avatar av-sm" style="background:${C.avatarColor(item.userName||'?')};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem">${(item.userName||'?')[0].toUpperCase()}</div>
          <div><div style="font-weight:700;font-size:.87rem">${item.userName}</div><div style="font-size:.7rem;color:var(--textl)">📊 Poll · ${item.userCity}</div></div>
        </div>
        <div class="content-card-body">
          <div style="font-weight:700;margin-bottom:10px">${item.title}</div>
          ${opts.map(opt => {
            const votes = (item.votes||{})[opt] || 0;
            const pct = total > 0 ? Math.round((votes/total)*100) : 0;
            return `<div class="poll-opt" onclick="C.votePoll('${item.id}','${opt}')">
              <div class="poll-opt-bar" style="width:${pct}%"></div>
              <div class="poll-opt-text"><span>${opt}</span><span style="font-weight:700;font-size:.78rem">${pct}%</span></div>
            </div>`;
          }).join('')}
          <div style="font-size:.72rem;color:var(--textm);margin-top:6px">${total} votes</div>
        </div>
      </div>`;
  },

  async votePoll(contentId, option) {
    if (!db || !S.user) return C.toast('Sign in to vote');
    try {
      const ref = db.collection('content').doc(contentId);
      await db.runTransaction(async t => {
        const doc = await t.get(ref);
        const d = doc.data();
        const votes = d.votes || {};
        votes[option] = (votes[option] || 0) + 1;
        t.update(ref, { votes, totalVotes: firebase.firestore.FieldValue.increment(1) });
      });
      C.toast('Vote recorded! 📊', 'ok');
    } catch(e) { C.toast('Vote failed', 'err'); }
  },

  filterMarketCat(cat, btn) {
    document.querySelectorAll('#market-cats .feed-tab').forEach(t => t.classList.remove('on'));
    if (btn) btn.classList.add('on');
    C.loadMarket(cat);
  },

  filterMarket() {
    // Filter in-place on existing rendered items (client-side)
    const q = document.getElementById('market-search')?.value.toLowerCase().trim();
    document.querySelectorAll('.market-card,.deal-card,.event-card,.collab-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
  },

  async viewContent(id) {
    if (!db) return;
    try {
      const doc = await db.collection('content').doc(id).get();
      const item = doc.exists ? { id:doc.id,...doc.data() } : null;
      if (!item) return C.toast('Item not found');
      C.renderContentDetail(item);
      C.goTo('content-detail');
      document.getElementById('cd-back').onclick = () => C.navTo('market');
      document.getElementById('cd-title').textContent = item.type === 'deal' ? '🔥 Deal' : item.type === 'event' ? '📅 Event' : item.type === 'collab' ? '🤝 Collab' : '🛍 Product';
    } catch(e) { C.toast('Could not load'); }
  },

  renderContentDetail(item) {
    const el = document.getElementById('cd-content');
    if (!el) return;
    const typeActions = {
      shop: `<a href="https://wa.me/${(item.contact||'').replace(/[^0-9]/g,'')}" target="_blank" class="btn btn-ok btn-full" style="margin-bottom:8px">💬 WhatsApp Seller</a>
             <button class="btn btn-p btn-full" onclick="C.openChatWithUser('${item.userId}','${item.userName}')">📲 Message on Cionti</button>`,
      deal: `<button class="btn btn-p btn-full" onclick="C.openChatWithUser('${item.userId}','${item.userName}')">Claim This Deal →</button>`,
      event: `<button class="btn btn-p btn-full" onclick="C.toast('Registered! The organiser will contact you.','ok')">RSVP — I'm Coming 🎉</button>`,
      collab: `<button class="btn btn-p btn-full" onclick="C.openChatWithUser('${item.userId}','${item.userName}')">Express Interest 🤝</button>`,
      poll: '',
      post: '', photo: '',
    };
    el.innerHTML = `
      ${item.imageUrl ? `<img src="${item.imageUrl}" style="width:100%;border-radius:14px;margin-bottom:14px;max-height:280px;object-fit:cover">` : ''}
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="avatar av-md" style="background:${C.avatarColor(item.userName||'?')};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${(item.userName||'?')[0].toUpperCase()}</div>
        <div><div style="font-weight:700">${item.userName}</div><div style="font-size:.73rem;color:var(--textl)">📍 ${item.userCity||'Nigeria'} · ${C.timeAgo(item.createdAt)}</div></div>
        <button class="btn btn-o btn-sm" style="margin-left:auto" onclick="C.viewProfile('${item.userId}')">View Profile</button>
      </div>
      <h2 style="font-size:1.1rem;font-weight:800;margin-bottom:8px">${item.title||''}</h2>
      ${item.price != null && item.price >= 0 ? `<div style="font-size:1.4rem;font-weight:800;color:var(--p);margin-bottom:8px">₦${(item.price||0).toLocaleString()}</div>` : ''}
      ${item.origPrice ? `<div style="text-decoration:line-through;color:var(--textm);font-size:.85rem;margin-bottom:8px">Was ₦${item.origPrice.toLocaleString()}</div>` : ''}
      <p style="font-size:.9rem;line-height:1.75;color:var(--text);margin-bottom:16px">${item.text||''}</p>
      ${item.date ? `<div class="card" style="padding:12px;margin-bottom:12px;display:flex;gap:10px;align-items:center"><span style="font-size:1.4rem">📅</span><div><div style="font-weight:600">${new Date(item.date).toLocaleDateString('en-NG',{weekday:'long',day:'numeric',month:'long'})}</div>${item.time?`<div style="font-size:.78rem;color:var(--textl)">${item.time}${item.venue?' · '+item.venue:''}</div>`:''}</div></div>` : ''}
      ${item.tags?.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${item.tags.map(t=>`<span class="badge badge-n">#${t}</span>`).join('')}</div>` : ''}
      <div style="margin-top:16px">${typeActions[item.type]||''}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-g" style="flex:1" onclick="C.shareContent('${item.id}','${(item.title||'').replace(/'/g,'')}')">🔗 Share</button>
        <button class="btn btn-g" style="flex:1" onclick="C.openChatWithUser('${item.userId}','${item.userName}')">💬 Message</button>
      </div>`;
  },

  shareContent(id, title) {
    if (navigator.share) {
      navigator.share({ title: 'Cionti: '+title, url: `https://obinna18.github.io/cionti-app/?content=${id}` });
    } else {
      navigator.clipboard?.writeText(`https://obinna18.github.io/cionti-app/?content=${id}`);
      C.toast('Link copied! 🔗', 'ok');
    }
  },

  async loadMyShop() {
    const el = document.getElementById('my-shop-content');
    if (!el || !db || !S.user) return;
    el.innerHTML = '<div class="loading-c"><div class="spinner"></div></div>';
    const snap = await db.collection('content').where('userId','==',S.user.uid).where('isActive','==',true).orderBy('createdAt','desc').get();
    const items = snap.docs.map(d=>({id:d.id,...d.data()}));
    const u = S.userData || {};
    const totalEarnings = 0; // would compute from orders
    el.innerHTML = `
      <div class="shop-banner" onclick="C.openCreate('shop')">
        <div class="shop-av">🏪</div>
        <div>
          <div style="font-weight:800;font-size:1rem">${u.fullName?.split(' ')[0]}'s Shop</div>
          <div style="font-size:.78rem;opacity:.7">${items.length} listings · ${u.city||'Nigeria'}</div>
          <div style="margin-top:4px"><span style="font-size:.75rem;font-weight:700;background:rgba(0,0,0,.15);padding:3px 8px;border-radius:8px">+ Add new item</span></div>
        </div>
      </div>
      <div class="sec-title" style="margin-bottom:10px">Your Listings (${items.length})</div>
      ${items.length ? items.map(item => `
        <div class="market-card" style="display:flex;align-items:center;gap:12px;padding:12px 14px">
          <div style="width:52px;height:52px;border-radius:10px;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;overflow:hidden">
            ${item.imageUrl ? `<img src="${item.imageUrl}" style="width:100%;height:100%;object-fit:cover">` : '📦'}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.88rem;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title||'Untitled'}</div>
            <div style="font-size:.73rem;color:var(--textl)">${C.renderTypeLabel(item.type)} · ${item.price!=null?'₦'+(item.price||0).toLocaleString():'No price'}</div>
            <div style="font-size:.7rem;color:var(--textm);margin-top:2px">👁 ${item.views||0} views · ❤️ ${item.likes||0} likes</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
            <button class="btn btn-sm btn-o" onclick="C.viewContent('${item.id}')">View</button>
            <button class="btn btn-sm btn-bad" onclick="C.deleteContent('${item.id}')">Del</button>
          </div>
        </div>`).join('') : `
        <div class="empty-c">
          <div class="ei">🛍</div>
          <h3>Your shop is empty</h3>
          <p>Start selling products, offering deals, or posting events</p>
          <button class="btn btn-p btn-sm mt-16" onclick="C.showCreatePicker()">+ Add First Item</button>
        </div>`}`;
  },

  renderTypeLabel(type) {
    const labels = { shop:'🛍 Product', deal:'🔥 Deal', event:'📅 Event', collab:'🤝 Collab', post:'✍️ Post', photo:'📸 Photo', poll:'📊 Poll', skill:'🛠 Skill' };
    return labels[type] || type;
  },

  async deleteContent(id) {
    if (!db) return;
    await db.collection('content').doc(id).update({ isActive:false });
    C.toast('Deleted', 'ok');
    C.loadMyShop();
  },

};

// ── ROUTE lifecycle hooks ──
const _goTo = C.goTo.bind(C);
C.goTo = function(screen) {
  _goTo(screen);
  if (screen === 'wallet') C.renderWallet();
  if (screen === 'settings') C.renderSettings();
  if (screen === 'my-shop') C.loadMyShop();
};

// navTo extended
const _navTo = C.navTo.bind(C);
C.navTo = function(screen) {
  _navTo(screen);
  if (screen === 'market') C.loadMarket('all');
};

