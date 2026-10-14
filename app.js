let currentUser = null;
let currentChatUser = null;

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.success) {
    currentUser = data.user;
    initApp();
  } else {
    document.getElementById('auth-error').innerText = data.error;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  const data = await res.json();
  if (data.success) {
    checkAuth();
  } else {
    document.getElementById('auth-error').innerText = data.error;
  }
}

async function checkAuth() {
  const res = await fetch('/api/me');
  if (res.ok) {
    currentUser = await res.json();
    initApp();
  } else {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
  }
}

async function logout() {
  await fetch('/api/post', { method: 'POST' }); // dummy or just logout route
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
}

function initApp() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  showSection('feed');
  loadNotifications();
}

function showSection(sectionId) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(`section-${sectionId}`).classList.remove('hidden');
  
  document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));

  if (sectionId === 'feed') loadPosts();
  if (sectionId === 'friends') loadFriends();
  if (sectionId === 'profile') loadProfile(currentUser.id);
  if (sectionId === 'messages') loadMessengerUsers();
}

// --- PRÍSPEVKY ---
async function loadPosts() {
  const res = await fetch('/api/posts');
  const posts = await res.json();
  const feed = document.getElementById('posts-feed');
  feed.innerHTML = '';
  posts.forEach(post => {
    feed.appendChild(createPostElement(post));
  });
}

function createPostElement(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  const isMyPost = currentUser && post.user_id === currentUser.id;
  
  div.innerHTML = `
    <div class="post-header">
      <div class="post-user" onclick="loadProfile(${post.user_id})">
        <img src="${post.avatar}" class="avatar" alt="">
        <div>
          <strong>${post.name}</strong>
          <div class="post-time">@${post.username} • ${new Date(post.created_at).toLocaleString()}</div>
        </div>
      </div>
      ${isMyPost ? `<button onclick="deletePost(${post.id})" style="background:none;border:none;cursor:pointer;color:#888;">🗑️</button>` : ''}
    </div>
    <div class="post-content">${escapeHTML(post.content)}</div>
    <div class="post-actions">
      <button onclick="likePost(${post.id})" class="${post.user_liked ? 'liked' : ''}">
        ❤️ <span>${post.likes_count}</span>
      </button>
      <button onclick="toggleComments(${post.id})">💬 Komentovať (${post.comments_count})</button>
      <button onclick="sharePost(${post.id})">🔗 Zdieľať</button>
    </div>
    <div id="comments-${post.id}" class="comments-section hidden">
      <div id="comments-list-${post.id}"></div>
      <div class="comment-form">
        <input type="text" id="comment-input-${post.id}" placeholder="Napíš komentár...">
        <button onclick="addComment(${post.id})" class="btn-primary">Odoslať</button>
      </div>
    </div>
  `;
  return div;
}

async function createPost() {
  const content = document.getElementById('post-content').value;
  if (!content.trim()) return;
  await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  document.getElementById('post-content').value = '';
  loadPosts();
}

async function deletePost(postId) {
  if (!confirm('Naozaj zmazať príspevok?')) return;
  await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
  loadPosts();
}

async function likePost(postId) {
  await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
  loadPosts();
}

async function toggleComments(postId) {
  const sec = document.getElementById(`comments-${postId}`);
  sec.classList.toggle('hidden');
  if (!sec.classList.contains('hidden')) {
    loadComments(postId);
  }
}

async function loadComments(postId) {
  const res = await fetch(`/api/posts/${postId}/comments`);
  const comments = await res.json();
  const list = document.getElementById(`comments-list-${postId}`);
  list.innerHTML = '';
  comments.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.innerHTML = `
      <img src="${c.avatar}" class="avatar" style="width:30px;height:30px;">
      <div class="comment-bubble">
        <strong>${c.name}</strong>
        <div>${escapeHTML(c.content)}</div>
      </div>
    `;
    list.appendChild(item);
  });
}

async function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input.value;
  if (!content.trim()) return;
  await fetch(`/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  input.value = '';
  loadComments(postId);
}

function sharePost(postId) {
  navigator.clipboard.writeText(window.location.origin + `/#post-${postId}`);
  alert('Odkaz na príspevok bol skopírovaný do schránky!');
}

// --- PROFIL ---
async function loadProfile(userId) {
  showSection('profile');
  const res = await fetch(`/api/users/${userId}`);
  const user = await res.json();
  
  document.getElementById('profile-avatar').src = user.avatar;
  document.getElementById('profile-name').innerText = user.name;
  document.getElementById('profile-username').innerText = `@${user.username}`;
  document.getElementById('profile-bio').innerText = user.bio;
  document.getElementById('stat-posts').innerText = user.postsCount;
  document.getElementById('stat-friends').innerText = user.friendsCount;

  const postsRes = await fetch('/api/posts');
  const posts = await postsRes.json();
  const profilePosts = document.getElementById('profile-posts');
  profilePosts.innerHTML = '';
  posts.filter(p => p.user_id === userId).forEach(p => {
    profilePosts.appendChild(createPostElement(p));
  });
}

function openEditProfile() {
  document.getElementById('edit-name').value = currentUser.name;
  document.getElementById('edit-bio').value = currentUser.bio;
  document.getElementById('edit-avatar').value = currentUser.avatar;
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditProfile() {
  document.getElementById('edit-modal').classList.add('hidden');
}

async function saveProfile() {
  const name = document.getElementById('edit-name').value;
  const bio = document.getElementById('edit-bio').value;
  const avatar = document.getElementById('edit-avatar').value;
  await fetch('/api/users/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, bio, avatar })
  });
  currentUser.name = name;
  currentUser.bio = bio;
  currentUser.avatar = avatar;
  closeEditProfile();
  loadProfile(currentUser.id);
}

// --- PRIATELIA ---
async function loadFriends() {
  const res = await fetch('/api/friends');
  const data = await res.json();
  
  const reqContainer = document.getElementById('friend-requests-container');
  reqContainer.innerHTML = data.requests.length ? '<h3>Žiadosti o priateľstvo</h3>' : '';
  data.requests.forEach(r => {
    const div = document.createElement('div');
    div.className = 'user-card';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${r.avatar}" class="avatar">
        <span>${r.name}</span>
      </div>
      <button onclick="acceptFriend(${r.friendship_id})" class="btn-primary" style="width:auto;padding:8px 15px;">Prijať</button>
    `;
    reqContainer.appendChild(div);
  });

  const friendsList = document.getElementById('friends-list');
  friendsList.innerHTML = '';
  data.friends.forEach(f => {
    const div = document.createElement('div');
    div.className = 'user-card';
    div.innerHTML = `
      <img src="${f.avatar}">
      <h4>${f.name}</h4>
      <button onclick="openChat(${f.id})" class="btn-primary" style="margin-top:10px;">Správa</button>
    `;
    friendsList.appendChild(div);
  });

  // Hľadať nových priateľov
  const searchRes = await fetch('/api/search?q=');
  const searchData = await searchRes.json();
  const allList = document.getElementById('all-users-list');
  allList.innerHTML = '';
  searchData.users.filter(u => u.id !== currentUser.id).forEach(u => {
    const div = document.createElement('div');
    div.className = 'user-card';
    div.innerHTML = `
      <img src="${u.avatar}">
      <h4>${u.name}</h4>
      <button onclick="sendFriendRequest(${u.id})" class="btn-secondary" style="margin-top:10px;">Pridať priateľa</button>
    `;
    allList.appendChild(div);
  });
}

async function sendFriendRequest(receiverId) {
  await fetch('/api/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiver_id: receiverId })
  });
  alert('Žiadosť bola odoslaná.');
}

async function acceptFriend(friendshipId) {
  await fetch('/api/friends/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendship_id: friendshipId })
  });
  loadFriends();
}

// --- MESSENGER ---
async function loadMessengerUsers() {
  const res = await fetch('/api/friends');
  const data = await res.json();
  const sidebar = document.getElementById('messenger-users');
  sidebar.innerHTML = '';
  data.friends.forEach(f => {
    const div = document.createElement('div');
    div.className = 'search-item';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '10px';
    div.innerHTML = `<img src="${f.avatar}" class="avatar" style="width:35px;height:35px;"> <span>${f.name}</span>`;
    div.onclick = () => openChat(f.id, f.name);
    sidebar.appendChild(div);
  });
}

async function openChat(userId, name) {
  showSection('messages');
  currentChatUser = userId;
  document.getElementById('chat-header').innerText = name || 'Konverzácia';
  const res = await fetch(`/api/messages/${userId}`);
  const messages = await res.json();
  const chatMessages = document.getElementById('chat-messages');
  chatMessages.innerHTML = '';
  messages.forEach(m => {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${m.sender_id === currentUser.id ? 'sent' : 'received'}`;
    bubble.innerText = m.content;
    chatMessages.appendChild(bubble);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
  if (!currentChatUser) return;
  const input = document.getElementById('chat-input');
  const content = input.value;
  if (!content.trim()) return;
  await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiver_id: currentChatUser, content })
  });
  input.value = '';
  openChat(currentChatUser, document.getElementById('chat-header').innerText);
}

// --- VYHĽADÁVANIE ---
async function handleSearch(e) {
  const q = e.target.value;
  const dropdown = document.getElementById('search-results');
  if (!q.trim()) {
    dropdown.classList.add('hidden');
    return;
  }
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  dropdown.innerHTML = '';
  
  if (data.users.length === 0 && data.posts.length === 0) {
    dropdown.innerHTML = '<div class="search-item">Žiadne výsledky</div>';
  } else {
    data.users.forEach(u => {
      const div = document.createElement('div');
      div.className = 'search-item';
      div.innerHTML = `👤 <strong>${u.name}</strong> (@${u.username})`;
      div.onclick = () => { loadProfile(u.id); dropdown.classList.add('hidden'); };
      dropdown.appendChild(div);
    });
  }
  dropdown.classList.remove('hidden');
}

// --- NOTIFIKÁCIE ---
async function loadNotifications() {
  const res = await fetch('/api/notifications');
  const notifs = await res.json();
  const dropdown = document.getElementById('notifications-dropdown');
  dropdown.innerHTML = '';
  
  const unread = notifs.filter(n => n.is_read === 0).length;
  const badge = document.getElementById('notif-badge');
  if (unread > 0) {
    badge.innerText = unread;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  notifs.forEach(n => {
    let text = '';
    if (n.type === 'like') text = `<strong>${n.name}</strong> lajkol váš príspevok.`;
    if (n.type === 'comment') text = `<strong>${n.name}</strong> komentoval váš príspevok.`;
    if (n.type === 'friend') text = `<strong>${n.name}</strong> vám poslal žiadosť o priateľstvo.`;

    const item = document.createElement('div');
    item.className = 'notif-item';
    item.innerHTML = text;
    dropdown.appendChild(item);
  });
}

async function toggleNotifications() {
  const dropdown = document.getElementById('notifications-dropdown');
  dropdown.classList.toggle('hidden');
  if (!dropdown.classList.contains('hidden')) {
    await fetch('/api/notifications/read', { method: 'POST' });
    document.getElementById('notif-badge').classList.add('hidden');
  }
}

// --- DARK MODE ---
function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  document.documentElement.classList.toggle('light');
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}