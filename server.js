require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const axios   = require('axios');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PW = '1JaGdYufr5t&"';

const INSTANCES = [
  'https://invidious.io.lol',
  'https://inv.tux.pizza',
  'https://yewtu.be',
  'https://invidious.privacyredirect.com',
  'https://iv.melmac.space',
  'https://invidious.nerdvpn.de',
];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const users    = JSON.parse(fs.readFileSync('./users.json', 'utf8'));

// ═══════════════════════════════════════════════════════════════
// ユーティリティ
// ═══════════════════════════════════════════════════════════════
const esc  = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtV = n => (!n && n!==0) ? '不明' : n>=100000000 ? (n/100000000).toFixed(1)+'億再生' : n>=10000 ? Math.floor(n/10000)+'万再生' : n.toLocaleString()+'回再生';
const fmtD = u => u ? new Date(u*1000).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'}) : '不明';
const fmtT = s => s ? new Date(s).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}) : '';
const fmtDur = s => { if (!s) return '0:00'; const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return (h?h+':':'')+String(m).padStart(h?2:1,'0')+':'+String(sec).padStart(2,'0'); };
const bestThumb = a => a?.length ? [...a].sort((x,y)=>(y.width||0)-(x.width||0))[0]?.url||'' : '';

async function invFetch(path, params={}) {
  let last;
  for (const inst of INSTANCES) {
    try {
      const {data} = await axios.get(`${inst}/api/v1${path}`, {params, timeout:7000, headers:{'User-Agent':'Mozilla/5.0 YTViewer/1.0'}});
      return data;
    } catch(err) { last = err; }
  }
  throw new Error(`全インスタンス接続失敗: ${last?.message}`);
}

async function saveWatch(un, vid, title, thumb, ch) {
  try { await supabase.from('watch_history').insert({username:un,video_id:vid,title,thumbnail:thumb||'',channel:ch||'',watched_at:new Date().toISOString(),deleted_by_user:false}); } catch{}
}
async function saveSearch(un, q) {
  try { await supabase.from('search_history').insert({username:un,query:q,searched_at:new Date().toISOString(),deleted_by_user:false}); } catch{}
}

// ═══════════════════════════════════════════════════════════════
// HTML テンプレート
// ═══════════════════════════════════════════════════════════════
function navHtml(user, path) {
  const li = (href, icon, label) => {
    const active = href==='/' ? (path==='/'||path==='/search') : (path===href||path.startsWith(href+'/'));
    return `<li class="nav-item${active?' active':''}"><a href="${href}"><span class="nav-icon">${icon}</span><span class="nav-label">${label}</span></a></li>`;
  };
  return `<nav class="sidebar" id="sidebar">
  <div class="sidebar-logo"><button class="menu-btn" onclick="toggleSidebar()">&#9776;</button><a href="/" class="logo-text">&#9654; YTViewer</a></div>
  <ul class="nav-list">
    ${li('/','&#127968;','ホーム')}${li('/shorts','&#128241;','Shorts')}${li('/channel','&#128225;','チャンネル')}
    <li class="nav-item"><a href="/music"><span class="nav-icon">&#127925;</span><span class="nav-label">Music</span></a></li>
    ${li('/history','&#128203;','履歴')}
    <li class="nav-divider"></li>
    ${li('/settings','&#9881;','設定')}
    <li class="nav-item"><a href="/admin"><span class="nav-icon">&#128274;</span><span class="nav-label">管理者</span></a></li>
  </ul>
  <div class="sidebar-user"><span class="user-avatar">${esc((user||'?').charAt(0).toUpperCase())}</span><span class="nav-label user-name">${esc(user||'')}</span></div>
</nav>
<div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>`;
}

const BASE_SCRIPT = `(function(){var c=localStorage.getItem('sc')==='1';if(c&&window.innerWidth>768){document.body.classList.add('sidebar-collapsed');document.getElementById('sidebar').classList.add('collapsed');}})();function toggleSidebar(){var s=document.getElementById('sidebar'),o=document.getElementById('sidebarOverlay');if(window.innerWidth<=768){s.classList.toggle('mobile-open');o.classList.toggle('active');}else{document.body.classList.toggle('sidebar-collapsed');s.classList.toggle('collapsed');localStorage.setItem('sc',s.classList.contains('collapsed')?'1':'0');}}document.addEventListener('keydown',function(ev){if(ev.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){ev.preventDefault();var i=document.querySelector('.search-input');if(i)i.focus();}});`;

const TAB_SCRIPT = `function switchTab(t,btn){document.querySelectorAll('[id^="tab-"]').forEach(function(el){el.style.display='none';});document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});document.getElementById('tab-'+t).style.display='';btn.classList.add('active');}`;

function layout(title, user, path, body, cls, script) {
  cls    = cls    || '';
  script = script || '';
  return `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - YTViewer</title>
<link rel="stylesheet" href="/style.css">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
</head><body class="${cls}">
${navHtml(user,path)}
<div class="app-content">${body}</div>
<script>${BASE_SCRIPT}${script}</script>
</body></html>`;
}

function authLayout(title, body) {
  return `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - YTViewer</title>
<link rel="stylesheet" href="/style.css">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
</head><body class="login-body">${body}</body></html>`;
}

function videoCard(v) {
  const dur  = v.lengthSeconds ? `<span class="duration-badge">${fmtDur(v.lengthSeconds)}</span>` : '';
  const meta = [v.viewCount?Math.floor(v.viewCount/10000)+'万回視聴':'', v.publishedText||''].filter(Boolean).join(' · ');
  return `<a href="/video/${esc(v.videoId)}" class="video-card"><div class="thumb-wrap"><img src="${esc(v.videoThumbnails?.[0]?.url||'')}" alt="${esc(v.title||'')}" class="video-thumb" loading="lazy" onerror="this.style.display='none'">${dur}</div><div class="video-info"><p class="video-title">${esc(v.title||'')}</p><p class="video-channel">${esc(v.author||'')}</p><p class="video-meta">${esc(meta)}</p></div></a>`;
}

// ─── ページ関数 ────────────────────────────────────────────────

function pageLogin(err) {
  return authLayout('ログイン', `<div class="login-container">
<div class="login-logo">&#9654; YTViewer</div>
<h1 class="login-title">ログイン</h1>
${err?`<div class="alert alert-error">${esc(err)}</div>`:''}
<form action="/login" method="POST" class="login-form">
<div class="form-group"><label>ユーザー名</label><input type="text" name="username" required autocomplete="username" placeholder="ユーザー名"></div>
<div class="form-group"><label>パスワード</label><input type="password" name="password" required autocomplete="current-password" placeholder="パスワード"></div>
<button type="submit" class="btn btn-primary btn-full">ログイン</button>
</form></div>`);
}

function pageHome(user, path, query, results, err) {
  const bar = `<div class="search-bar-wrap"><form action="/search" method="GET" class="search-form"><input type="text" name="q" value="${esc(query)}" placeholder="動画を検索..." class="search-input" autofocus><button type="submit" class="search-btn">&#128269;</button></form></div>`;
  let body = bar;
  if (err) body += `<div class="alert alert-error">${esc(err)}</div>`;
  if (results === null) {
    body += `<div class="home-hero"><div class="hero-icon">&#9654;</div><h2>何を見ますか？</h2><p>検索バーで動画を探してください</p><div class="hero-shortcuts"><a href="/shorts" class="shortcut-btn">&#128241; Shorts</a><a href="/channel" class="shortcut-btn">&#128225; チャンネル</a><a href="/history" class="shortcut-btn">&#128203; 履歴</a><a href="/music" class="shortcut-btn">&#127925; Music</a></div></div>`;
  } else if (!results.length) {
    body += `<div class="empty-state">「<strong>${esc(query)}</strong>」の検索結果は見つかりませんでした</div>`;
  } else {
    body += `<h2 class="section-title">「${esc(query)}」の検索結果 (${results.length}件)</h2><div class="video-grid">${results.filter(v=>!v.type||v.type==='video').map(videoCard).join('')}</div>`;
  }
  return layout(query?`検索: ${query}`:'ホーム', user, path, body);
}

function pageVideo(user, path, videoId, video, comments, err) {
  if (err && !video) return layout('動画', user, path, `<div class="alert alert-error">${esc(err)}</div>`);
  const av = video.authorThumbnails?.length
    ? `<img src="${esc(video.authorThumbnails.slice(-1)[0]?.url||'')}" class="channel-avatar" alt="">`
    : `<div class="channel-avatar-placeholder">${esc((video.author||'?').charAt(0))}</div>`;
  const desc = video.description
    ? `<details class="vd-desc"><summary>説明を見る</summary><p>${esc(video.description.slice(0,800))}${video.description.length>800?'…':''}</p></details>`
    : '';
  const cHtml = comments.slice(0,30).map(c => {
    const cav = c.authorThumbnails?.length
      ? `<img src="${esc(c.authorThumbnails[0]?.url||'')}" alt="" loading="lazy">`
      : `<div class="avatar-initial">${esc((c.author||'?').charAt(0))}</div>`;
    const likes = (c.likeCount||0)>0 ? `<span class="comment-likes">&#128077; ${c.likeCount}</span>` : '';
    return `<div class="comment-item"><div class="comment-avatar">${cav}</div><div class="comment-body"><div class="comment-header"><span class="comment-author">${esc(c.author||'')}</span><span class="comment-date">${esc(c.publishedText||'')}</span>${likes}</div><p class="comment-text">${esc(c.content||'')}</p></div></div>`;
  }).join('');
  const body = `<div class="video-layout">
<div class="player-wrap"><iframe src="https://www.youtube.com/embed/${esc(videoId)}?autoplay=1&rel=0" allowfullscreen allow="autoplay; encrypted-media" class="yt-player"></iframe></div>
<div class="video-details">
<h1 class="vd-title">${esc(video.title||'')}</h1>
<div class="vd-meta-row"><span>${fmtV(video.viewCount)}</span><span class="vd-dot">·</span><span>${fmtD(video.published)}</span></div>
<div class="vd-channel">${av}<div><a href="/channel/${esc(video.authorId||'')}" class="channel-name">${esc(video.author||'')}</a>${video.subCountText?`<p class="channel-subs">${esc(video.subCountText)}</p>`:''}</div></div>
${desc}
</div>
<div class="comments-section"><h2 class="comments-title">コメント (${comments.length})</h2>
<div class="comments-list">${cHtml||'<p class="no-comments">コメントはありません</p>'}</div>
${comments.length>30?`<p class="comments-more">他 ${comments.length-30} 件のコメント</p>`:''}
</div></div>`;
  return layout(video.title||'動画', user, path, body);
}

function pageShorts(user, path, shorts, err) {
  const items = shorts.map((s,i) => {
    const src     = i===0 ? `https://www.youtube.com/embed/${esc(s.videoId)}?autoplay=1&loop=1&playlist=${esc(s.videoId)}` : '';
    const dataSrc = `https://www.youtube.com/embed/${esc(s.videoId)}?autoplay=1&loop=1&playlist=${esc(s.videoId)}`;
    return `<div class="short-item" data-id="${esc(s.videoId)}" data-title="${esc(s.title||'')}" data-thumb="${esc(s.videoThumbnails?.[0]?.url||'')}" data-channel="${esc(s.author||'')}">
<div class="short-player-wrap">
<iframe class="short-iframe${i>0?' lazy-iframe':''}" src="${src}" data-src="${dataSrc}" allowfullscreen allow="autoplay; encrypted-media"></iframe>
<div class="short-info-overlay"><p class="short-title">${esc(s.title||'')}</p><p class="short-channel">${esc(s.author||'')}</p><span class="short-dur">${fmtDur(s.lengthSeconds||0)}</span></div>
<button class="short-comment-btn" onclick="toggleComments('${esc(s.videoId)}')">&#128172;</button>
</div>
<div class="short-comments-panel" id="comments-${esc(s.videoId)}" style="display:none">
<div class="short-comments-header"><span>コメント</span><button onclick="toggleComments('${esc(s.videoId)}')">&#10005;</button></div>
<div class="short-comments-list" id="list-${esc(s.videoId)}"><div class="loading-spinner">読み込み中...</div></div>
</div></div>`;
  }).join('');
  const script = `document.getElementById('sidebar').classList.add('collapsed');document.body.classList.add('sidebar-collapsed');
var _obs=new IntersectionObserver(function(en){en.forEach(function(entry){if(!entry.isIntersecting)return;var it=entry.target,ifr=it.querySelector('.lazy-iframe');if(ifr&&!ifr.src){ifr.src=ifr.dataset.src;ifr.classList.remove('lazy-iframe');}fetch('/api/shorts-view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoId:it.dataset.id,title:it.dataset.title,thumbnail:it.dataset.thumb,channel:it.dataset.channel})}).catch(function(){});});},{threshold:0.6});
document.querySelectorAll('.short-item').forEach(function(el){_obs.observe(el);});
async function toggleComments(vid){var panel=document.getElementById('comments-'+vid),list=document.getElementById('list-'+vid);var open=panel.style.display!=='none';panel.style.display=open?'none':'flex';if(!open&&list.querySelector('.loading-spinner')){var r=await fetch('/api/shorts-comments/'+vid).then(function(x){return x.json();}).catch(function(){return{ok:false};});list.innerHTML=r.ok&&r.comments&&r.comments.length?r.comments.slice(0,20).map(function(c){return'<div class="sc-item"><strong class="sc-author">'+c.author+'</strong><span class="sc-likes">&#128077;'+(c.likeCount||0)+'</span><p class="sc-text">'+c.content+'</p></div>';}).join(''):'<p class="no-comments">コメントなし</p>';}}`;
  const body = (err?`<div class="alert alert-error" style="margin:1rem">${esc(err)}</div>`:'')+`<div class="shorts-feed">${items}</div>`;
  return layout('Shorts', user, path, body, 'shorts-body', script);
}

function pageChannel(user, path, query, channels, err) {
  const bar = `<div class="search-bar-wrap"><form action="/channel/search" method="GET" class="search-form"><input type="text" name="q" value="${esc(query)}" placeholder="チャンネルを検索..." class="search-input" autofocus><button type="submit" class="search-btn">&#128269;</button></form></div>`;
  let body = bar;
  if (err) body += `<div class="alert alert-error">${esc(err)}</div>`;
  if (!query) {
    body += `<div class="home-hero"><div class="hero-icon">&#128225;</div><h2>チャンネルを検索</h2><p>お気に入りのチャンネルを見つけましょう</p></div>`;
  } else if (!channels.length) {
    body += `<div class="empty-state">「<strong>${esc(query)}</strong>」のチャンネルは見つかりませんでした</div>`;
  } else {
    const cards = channels.map(ch => {
      const av = ch.authorThumbnails?.length
        ? `<img src="${esc(ch.authorThumbnails.slice(-1)[0]?.url||'')}" class="ch-avatar" alt="" loading="lazy">`
        : `<div class="ch-avatar-placeholder">${esc((ch.author||'?').charAt(0))}</div>`;
      return `<a href="/channel/${esc(ch.authorId||'')}" class="channel-card">${av}<div class="ch-info"><p class="ch-name">${esc(ch.author||'')}</p>${ch.subCount?`<p class="ch-subs">登録者 ${Math.floor(ch.subCount/10000)}万人</p>`:''}${ch.description?`<p class="ch-desc">${esc(ch.description.slice(0,100))}...</p>`:''}</div><span class="ch-arrow">&#8250;</span></a>`;
    }).join('');
    body += `<h2 class="section-title">チャンネル: 「${esc(query)}」 (${channels.length}件)</h2><div class="channel-list">${cards}</div>`;
  }
  return layout(query?`チャンネル: ${query}`:'チャンネル検索', user, path, body);
}

function pageChannelDetail(user, path, ch, videos, err) {
  if (!ch) return layout('チャンネル', user, path, `<div class="alert alert-error">${esc(err||'チャンネル情報を取得できませんでした')}</div>`);
  const banner = ch.authorBanners?.length ? `<div class="channel-banner" style="background-image:url('${esc(ch.authorBanners[0]?.url||'')}')"></div>` : '';
  const av = ch.authorThumbnails?.length
    ? `<img src="${esc(ch.authorThumbnails.slice(-1)[0]?.url||'')}" class="ch-detail-avatar" alt="">`
    : `<div class="ch-avatar-placeholder large">${esc((ch.author||'?').charAt(0))}</div>`;
  const body = `${banner}<div class="channel-header-info">${av}<div><h1 class="ch-detail-name">${esc(ch.author||'')}</h1><p class="ch-detail-subs">${esc(ch.subCountText||'')} 登録者</p>${ch.totalViews?`<p class="ch-detail-views">総再生数: ${fmtV(ch.totalViews)}</p>`:''}</div></div>
<h2 class="section-title" style="margin-top:24px">動画一覧 (${videos.length}件)</h2>
${videos.length?`<div class="video-grid">${videos.map(videoCard).join('')}</div>`:'<p class="no-comments">動画が見つかりませんでした</p>'}`;
  return layout(ch.author||'チャンネル', user, path, body);
}

function pageHistory(user, path, watchH, searchH) {
  const wItems = watchH.map(item => {
    const t = item.thumbnail ? `<img src="${esc(item.thumbnail)}" class="history-thumb" alt="" loading="lazy" onerror="this.style.display='none'">` : `<div class="history-thumb-placeholder">&#9654;</div>`;
    return `<div class="history-item"><a href="/video/${esc(item.video_id)}" class="history-thumb-link">${t}</a><div class="history-info"><a href="/video/${esc(item.video_id)}" class="history-title">${esc(item.title||'')}</a><p class="history-channel">${esc(item.channel||'不明')}</p><p class="history-time">&#128336; ${esc(fmtT(item.watched_at))}</p></div><form action="/history/delete-watch/${item.id}" method="POST"><button type="submit" class="btn-icon-delete">&#10005;</button></form></div>`;
  }).join('');
  const sItems = searchH.map(item =>
    `<div class="history-item"><span class="search-icon">&#128269;</span><div class="history-info"><a href="/search?q=${encodeURIComponent(item.query||'')}" class="history-title">${esc(item.query||'')}</a><p class="history-time">&#128336; ${esc(fmtT(item.searched_at))}</p></div><form action="/history/delete-search/${item.id}" method="POST"><button type="submit" class="btn-icon-delete">&#10005;</button></form></div>`
  ).join('');
  const wC = watchH.length
    ? `<form action="/history/clear-watch" method="POST" style="margin-bottom:1rem"><button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('すべて削除しますか？')">&#128465; すべて削除</button></form><div class="history-list">${wItems}</div>`
    : '<div class="empty-state">視聴履歴がありません</div>';
  const sC = searchH.length
    ? `<form action="/history/clear-search" method="POST" style="margin-bottom:1rem"><button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('すべて削除しますか？')">&#128465; すべて削除</button></form><div class="history-list">${sItems}</div>`
    : '<div class="empty-state">検索履歴がありません</div>';
  const body = `<h1 class="page-title">&#128203; 履歴</h1>
<div class="tabs"><button class="tab-btn active" onclick="switchTab('watch',this)">視聴履歴 (${watchH.length})</button><button class="tab-btn" onclick="switchTab('search',this)">検索履歴 (${searchH.length})</button></div>
<div id="tab-watch">${wC}</div><div id="tab-search" style="display:none">${sC}</div>`;
  return layout('履歴', user, path, body, '', TAB_SCRIPT);
}

function pageAdminLogin(err) {
  return authLayout('管理者ログイン', `<div class="login-container">
<div class="login-logo">&#128274; 管理者</div>
<h1 class="login-title">管理者パスワード</h1>
${err?`<div class="alert alert-error">${esc(err)}</div>`:''}
<form action="/admin" method="POST" class="login-form">
<div class="form-group"><label>パスワード</label><input type="password" name="password" required autofocus placeholder="管理者パスワード"></div>
<button type="submit" class="btn btn-primary btn-full">ログイン</button>
</form>
<a href="/" class="back-link">&#8592; アプリに戻る</a>
</div>`);
}

function pageAdmin(watchH, searchH, userList, filterUser) {
  const wRows = watchH.map(item =>
    `<tr class="${item.deleted_by_user?'deleted-row':''}"><td><span class="user-badge">${esc(item.username||'')}</span></td><td><a href="/video/${esc(item.video_id||'')}" target="_blank" class="admin-link">${esc((item.title||'').slice(0,50))}&#8230;</a></td><td>${esc(item.channel||'-')}</td><td class="time-cell">${esc(fmtT(item.watched_at))}</td><td><span class="badge ${item.deleted_by_user?'badge-deleted':'badge-active'}">${item.deleted_by_user?'削除済':'有効'}</span></td></tr>`
  ).join('');
  const sRows = searchH.map(item =>
    `<tr class="${item.deleted_by_user?'deleted-row':''}"><td><span class="user-badge">${esc(item.username||'')}</span></td><td><a href="/search?q=${encodeURIComponent(item.query||'')}" class="admin-link">${esc(item.query||'')}</a></td><td class="time-cell">${esc(fmtT(item.searched_at))}</td><td><span class="badge ${item.deleted_by_user?'badge-deleted':'badge-active'}">${item.deleted_by_user?'削除済':'有効'}</span></td></tr>`
  ).join('');
  const opts = userList.map(u=>`<option value="${esc(u)}"${filterUser===u?' selected':''}>${esc(u)}</option>`).join('');
  return `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>管理者ダッシュボード - YTViewer</title>
<link rel="stylesheet" href="/style.css">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
</head><body>
<div class="admin-layout">
<div class="admin-header"><h1>&#128274; 管理者ダッシュボード</h1><div class="admin-actions"><a href="/" class="btn btn-sm">&#8592; アプリへ</a><a href="/admin/logout" class="btn btn-danger btn-sm">ログアウト</a></div></div>
<form action="/admin/dashboard" method="GET" class="admin-filter">
<label>ユーザー絞り込み:</label>
<select name="user" onchange="this.form.submit()" class="filter-select"><option value="">全ユーザー</option>${opts}</select>
${filterUser?'<a href="/admin/dashboard" class="btn btn-sm">リセット</a>':''}
</form>
<div class="tabs"><button class="tab-btn active" onclick="switchTab('watch',this)">視聴履歴 (${watchH.length})</button><button class="tab-btn" onclick="switchTab('search',this)">検索履歴 (${searchH.length})</button></div>
<div id="tab-watch">${watchH.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>ユーザー</th><th>動画</th><th>チャンネル</th><th>視聴日時</th><th>状態</th></tr></thead><tbody>${wRows}</tbody></table></div>`:'<p class="no-comments">履歴なし</p>'}</div>
<div id="tab-search" style="display:none">${searchH.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>ユーザー</th><th>検索ワード</th><th>日時</th><th>状態</th></tr></thead><tbody>${sRows}</tbody></table></div>`:'<p class="no-comments">履歴なし</p>'}</div>
</div>
<script>${TAB_SCRIPT}</script>
</body></html>`;
}

function pageSettings(user, path, region, saved) {
  const body = `<h1 class="page-title">&#9881; 設定</h1>
${saved?'<div class="alert alert-success">&#9989; 設定を保存しました</div>':''}
<div class="settings-card"><form action="/settings" method="POST">
<div class="setting-group"><h2 class="setting-title">&#127758; 検索地域</h2><p class="setting-desc">検索結果の地域フィルターを設定します</p>
<div class="radio-group">
<label class="radio-label"><input type="radio" name="region" value="JP"${region==='JP'?' checked':''}><span class="radio-custom"></span><span>&#127471;&#127477; 日本のみ（JP）</span></label>
<label class="radio-label"><input type="radio" name="region" value="ALL"${region==='ALL'?' checked':''}><span class="radio-custom"></span><span>&#127758; 全世界</span></label>
</div></div>
<div class="setting-group"><h2 class="setting-title">&#128100; アカウント</h2><p class="setting-desc">ログイン中: <strong>${esc(user||'')}</strong></p></div>
<div class="settings-footer"><button type="submit" class="btn btn-primary">保存</button></div>
</form></div>
<div class="settings-card danger-card"><h2 class="setting-title">&#128682; ログアウト</h2><p class="setting-desc">アカウントからログアウトします</p>
<a href="/logout" class="btn btn-danger" onclick="return confirm('ログアウトしますか？')">ログアウト</a></div>`;
  return layout('設定', user, path, body);
}

// ═══════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════
app.use(express.static('public'));
app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'yt-secret-2024',
  resave: false, saveUninitialized: false,
  cookie: {maxAge: 7*24*60*60*1000},
}));

const auth      = (req,res,next) => req.session.user      ? next() : res.redirect('/login');
const adminAuth = (req,res,next) => req.session.adminAuth ? next() : res.redirect('/admin');

// ═══════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════

// ログイン
app.get('/login',  (req,res) => req.session.user ? res.redirect('/') : res.send(pageLogin(null)));
app.post('/login', (req,res) => {
  const {username,password} = req.body;
  const u = users.find(u => u.user===username && u.pass===password);
  if (!u) return res.send(pageLogin('ユーザー名またはパスワードが違います'));
  req.session.user = username; req.session.region = 'JP';
  res.redirect('/');
});
app.get('/logout', (req,res) => req.session.destroy(() => res.redirect('/login')));

// ホーム・検索
app.get('/', auth, (req,res) => res.send(pageHome(req.session.user, '/', '', null, null)));
app.get('/search', auth, async (req,res) => {
  const q = (req.query.q||'').trim();
  if (!q) return res.redirect('/');
  await saveSearch(req.session.user, q);
  try {
    const params = {q, type:'video', sort_by:'relevance'};
    if (req.session.region==='JP') params.region = 'JP';
    const results = await invFetch('/search', params);
    res.send(pageHome(req.session.user, '/search', q, results||[], null));
  } catch(err) {
    res.send(pageHome(req.session.user, '/search', q, [], '動画の取得に失敗しました'));
  }
});

// 動画
app.get('/video/:id', auth, async (req,res) => {
  const {id} = req.params;
  try {
    const [vR,cR] = await Promise.allSettled([invFetch(`/videos/${id}`), invFetch(`/comments/${id}`,{sort_by:'top'})]);
    const video    = vR.status==='fulfilled' ? vR.value : null;
    const comments = cR.status==='fulfilled' ? (cR.value?.comments||[]) : [];
    if (video) await saveWatch(req.session.user, id, video.title, bestThumb(video.videoThumbnails), video.author);
    res.send(pageVideo(req.session.user, `/video/${id}`, id, video, comments, video?null:'動画情報の取得に失敗しました'));
  } catch(err) {
    res.send(pageVideo(req.session.user, `/video/${id}`, id, null, [], err.message));
  }
});
app.get('/api/comments/:id', auth, async (req,res) => {
  try { res.json({ok:true, data:await invFetch(`/comments/${req.params.id}`,{sort_by:'top'})}); }
  catch(err) { res.json({ok:false, error:err.message}); }
});

// Shorts
app.get('/shorts', auth, async (req,res) => {
  try {
    const params = {q:'#shorts', type:'video', sort_by:'relevance'};
    if (req.session.region==='JP') params.region = 'JP';
    const results = await invFetch('/search', params);
    const shorts  = (results||[]).filter(v => v.lengthSeconds>0 && v.lengthSeconds<=60).slice(0,20);
    res.send(pageShorts(req.session.user, '/shorts', shorts, null));
  } catch(err) {
    res.send(pageShorts(req.session.user, '/shorts', [], err.message));
  }
});
app.post('/api/shorts-view', auth, async (req,res) => {
  const {videoId,title,thumbnail,channel} = req.body;
  await saveWatch(req.session.user, videoId, title, thumbnail, channel);
  res.json({ok:true});
});
app.get('/api/shorts-comments/:id', auth, async (req,res) => {
  try { const d=await invFetch(`/comments/${req.params.id}`,{sort_by:'top'}); res.json({ok:true,comments:d?.comments||[]}); }
  catch(err) { res.json({ok:false,error:err.message}); }
});

// チャンネル
app.get('/channel', auth, (req,res) => res.send(pageChannel(req.session.user, '/channel', '', [], null)));
app.get('/channel/search', auth, async (req,res) => {
  const q = (req.query.q||'').trim();
  if (!q) return res.redirect('/channel');
  try {
    const results = await invFetch('/search', {q, type:'channel'});
    res.send(pageChannel(req.session.user, '/channel', q, results||[], null));
  } catch(err) {
    res.send(pageChannel(req.session.user, '/channel', q, [], err.message));
  }
});
app.get('/channel/:id', auth, async (req,res) => {
  try {
    const [chR,vR] = await Promise.allSettled([invFetch(`/channels/${req.params.id}`), invFetch(`/channels/${req.params.id}/videos`)]);
    const ch   = chR.status==='fulfilled' ? chR.value : null;
    const vids = vR.status==='fulfilled'  ? (vR.value?.videos||[]) : [];
    res.send(pageChannelDetail(req.session.user, '/channel', ch, vids, null));
  } catch { res.redirect('/channel'); }
});

// Music
app.get('/music', auth, (req,res) => res.redirect('https://musicviewer.onrender.com'));

// 履歴
app.get('/history', auth, async (req,res) => {
  const u = req.session.user;
  const [wR,sR] = await Promise.allSettled([
    supabase.from('watch_history').select('*').eq('username',u).eq('deleted_by_user',false).order('watched_at',{ascending:false}).limit(200),
    supabase.from('search_history').select('*').eq('username',u).eq('deleted_by_user',false).order('searched_at',{ascending:false}).limit(200),
  ]);
  res.send(pageHistory(u, '/history', wR.value?.data||[], sR.value?.data||[]));
});
app.post('/history/delete-watch/:id',  auth, async (req,res) => { await supabase.from('watch_history').update({deleted_by_user:true}).eq('id',req.params.id).eq('username',req.session.user);  res.redirect('/history'); });
app.post('/history/delete-search/:id', auth, async (req,res) => { await supabase.from('search_history').update({deleted_by_user:true}).eq('id',req.params.id).eq('username',req.session.user); res.redirect('/history'); });
app.post('/history/clear-watch',  auth, async (req,res) => { await supabase.from('watch_history').update({deleted_by_user:true}).eq('username',req.session.user);  res.redirect('/history'); });
app.post('/history/clear-search', auth, async (req,res) => { await supabase.from('search_history').update({deleted_by_user:true}).eq('username',req.session.user); res.redirect('/history'); });

// 管理者
app.get('/admin',  (req,res) => req.session.adminAuth ? res.redirect('/admin/dashboard') : res.send(pageAdminLogin(null)));
app.post('/admin', (req,res) => {
  if (req.body.password === ADMIN_PW) { req.session.adminAuth=true; return res.redirect('/admin/dashboard'); }
  res.send(pageAdminLogin('パスワードが違います'));
});
app.get('/admin/dashboard', adminAuth, async (req,res) => {
  const fu = req.query.user||'';
  let wq = supabase.from('watch_history').select('*').order('watched_at',{ascending:false}).limit(500);
  let sq = supabase.from('search_history').select('*').order('searched_at',{ascending:false}).limit(500);
  if (fu) { wq=wq.eq('username',fu); sq=sq.eq('username',fu); }
  const [wR,sR] = await Promise.allSettled([wq, sq]);
  res.send(pageAdmin(wR.value?.data||[], sR.value?.data||[], users.map(u=>u.user), fu));
});
app.get('/admin/logout', (req,res) => { req.session.adminAuth=false; res.redirect('/admin'); });

// 設定
app.get('/settings', auth, (req,res) => res.send(pageSettings(req.session.user, '/settings', req.session.region||'JP', false)));
app.post('/settings', auth, (req,res) => {
  req.session.region = req.body.region==='ALL' ? 'ALL' : 'JP';
  res.send(pageSettings(req.session.user, '/settings', req.session.region, true));
});

app.listen(PORT, () => console.log(`🎬 YTViewer: http://localhost:${PORT}`));
