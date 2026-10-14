const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(session({
  secret: 'neviem-secret-key-change-it',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Inicializácia SQLite databázy
const dbFile = path.join(__dirname, 'neviem.db');
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) console.error('Chyba pripojenia k DB', err.message);
  else console.log('Pripojené k SQLite databáze.');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    bio TEXT,
    avatar TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    user_id INTEGER,
    UNIQUE(post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    user_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    actor_id INTEGER,
    type TEXT,
    target_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(actor_id) REFERENCES users(id)
  )`);
});

// Middleware pre overenie prihlásenia
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: 'Nie ste prihlásený.' });
}

// --- AUTENTIFIKÁCIA ---
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Vyplňte všetky polia.' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (username, email, password, name, bio, avatar) VALUES (?, ?, ?, ?, ?, ?)`,
      [username, email, hashedPassword, username, 'Čo dnes nevieš?', 'https://api.dicebear.com/7.x/bottts/svg?seed=' + username],
      function (err) {
        if (err) return res.status(400).json({ error: 'Používateľské meno alebo email už existuje.' });
        req.session.userId = this.lastID;
        res.json({ success: true, userId: this.lastID });
      }
    );
  } catch (e) {
    res.status(500).json({ error: 'Chyba servera.' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Neplatný email alebo heslo.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Neplatný email alebo heslo.' });
    req.session.userId = user.id;
    res.json({ success: true, user });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/me', isAuthenticated, (req, res) => {
  db.get(`SELECT id, username, email, name, bio, avatar FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Používateľ nenájdený.' });
    res.json(user);
  });
});

// --- POUŽÍVATELIA A PROFIL ---
app.get('/api/users/:id', isAuthenticated, (req, res) => {
  const userId = req.params.id;
  db.get(`SELECT id, username, name, bio, avatar FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Používateľ nenájdený.' });
    db.get(`SELECT COUNT(*) as count FROM posts WHERE user_id = ?`, [userId], (err, pCount) => {
      db.get(`SELECT COUNT(*) as count FROM friendships WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'`, [userId, userId], (err, fCount) => {
        user.postsCount = pCount ? pCount.count : 0;
        user.friendsCount = fCount ? fCount.count : 0;
        res.json(user);
      });
    });
  });
});

app.put('/api/users/profile', isAuthenticated, (req, res) => {
  const { name, bio, avatar } = req.body;
  db.run(`UPDATE users SET name = ?, bio = ?, avatar = ? WHERE id = ?`, [name, bio, avatar, req.session.userId], (err) => {
    if (err) return res.status(500).json({ error: 'Chyba pri aktualizácii profilu.' });
    res.json({ success: true });
  });
});

app.get('/api/search', isAuthenticated, (req, res) => {
  const q = `%${req.query.q || ''}%`;
  db.all(`SELECT id, username, name, avatar FROM users WHERE username LIKE ? OR name LIKE ? LIMIT 10`, [q, q], (err, users) => {
    db.all(`SELECT p.id, p.content, p.created_at, u.username, u.name, u.avatar FROM posts p JOIN users u ON p.user_id = u.id WHERE p.content LIKE ? LIMIT 10`, [q, q], (err, posts) => {
      res.json({ users, posts });
    });
  });
});

// --- PRÍSPEVKY ---
app.get('/api/posts', isAuthenticated, (req, res) => {
  const query = `
    SELECT p.*, u.username, u.name, u.avatar,
    (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
    (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked,
    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count
    FROM posts p JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `;
  db.all(query, [req.session.userId], (err, posts) => {
    if (err) return res.status(500).json({ error: 'Chyba načítania príspevkov.' });
    res.json(posts);
  });
});

app.post('/api/posts', isAuthenticated, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Príspevok nemôže byť prázdny.' });
  db.run(`INSERT INTO posts (user_id, content) VALUES (?, ?)`, [req.session.userId, content], function(err) {
    if (err) return res.status(500).json({ error: 'Chyba pri vytváraní príspevku.' });
    res.json({ success: true, postId: this.lastID });
  });
});

app.delete('/api/posts/:id', isAuthenticated, (req, res) => {
  db.run(`DELETE FROM posts WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], function(err) {
    if (err || this.changes === 0) return res.status(403).json({ error: 'Nemôžete zmazať tento príspevok.' });
    res.json({ success: true });
  });
});

app.put('/api/posts/:id', isAuthenticated, (req, res) => {
  const { content } = req.body;
  db.run(`UPDATE posts SET content = ? WHERE id = ? AND user_id = ?`, [content, req.params.id, req.session.userId], function(err) {
    if (err || this.changes === 0) return res.status(403).json({ error: 'Nemôžete upraviť tento príspevok.' });
    res.json({ success: true });
  });
});

// --- LAJKY ---
app.post('/api/posts/:id/like', isAuthenticated, (req, res) => {
  const postId = req.params.id;
  const userId = req.session.userId;
  db.get(`SELECT * FROM likes WHERE post_id = ? AND user_id = ?`, [postId, userId], (err, row) => {
    if (row) {
      db.run(`DELETE FROM likes WHERE post_id = ? AND user_id = ?`, [postId, userId], () => {
        res.json({ liked: false });
      });
    } else {
      db.run(`INSERT INTO likes (post_id, user_id) VALUES (?, ?)`, [postId, userId], () => {
        db.get(`SELECT user_id FROM posts WHERE id = ?`, [postId], (err, post) => {
          if (post && post.user_id !== userId) {
            db.run(`INSERT INTO notifications (user_id, actor_id, type, target_id) VALUES (?, ?, 'like', ?)`, [post.user_id, userId, postId]);
          }
        });
        res.json({ liked: true });
      });
    }
  });
});

// --- KOMENTÁRE ---
app.get('/api/posts/:id/comments', isAuthenticated, (req, res) => {
  const query = `
    SELECT c.*, u.username, u.name, u.avatar 
    FROM comments c JOIN users u ON c.user_id = u.id 
    WHERE c.post_id = ? ORDER BY c.created_at ASC
  `;
  db.all(query, [req.params.id], (err, comments) => {
    res.json(comments);
  });
});

app.post('/api/posts/:id/comments', isAuthenticated, (req, res) => {
  const postId = req.params.id;
  const { content } = req.body;
  const userId = req.session.userId;
  if (!content) return res.status(400).json({ error: 'Komentár nemôže byť prázdny.' });
  db.run(`INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)`, [postId, userId, content], function(err) {
    if (err) return res.status(500).json({ error: 'Chyba komentára.' });
    db.get(`SELECT user_id FROM posts WHERE id = ?`, [postId], (err, post) => {
      if (post && post.user_id !== userId) {
        db.run(`INSERT INTO notifications (user_id, actor_id, type, target_id) VALUES (?, ?, 'comment', ?)`, [post.user_id, userId, postId]);
      }
    });
    res.json({ success: true, commentId: this.lastID });
  });
});

// --- PRIATELIA ---
app.get('/api/friends', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const query = `
    SELECT u.id, u.username, u.name, u.avatar FROM friendships f
    JOIN users u ON (u.id = f.sender_id OR u.id = f.receiver_id)
    WHERE (f.sender_id = ? OR f.receiver_id = ?) AND f.status = 'accepted' AND u.id != ?
  `;
  db.all(query, [userId, userId, userId], (err, friends) => {
    db.all(`SELECT f.id as friendship_id, u.id, u.username, u.name, u.avatar FROM friendships f JOIN users u ON u.id = f.sender_id WHERE f.receiver_id = ? AND f.status = 'pending'`, [userId], (err, requests) => {
      res.json({ friends, requests });
    });
  });
});

app.post('/api/friends/request', isAuthenticated, (req, res) => {
  const { receiver_id } = req.body;
  const sender_id = req.session.userId;
  if (sender_id == receiver_id) return res.status(400).json({ error: 'Nemôžete pridať seba.' });
  db.run(`INSERT INTO friendships (sender_id, receiver_id, status) VALUES (?, ?, 'pending')`, [sender_id, receiver_id], function(err) {
    if (err) return res.status(400).json({ error: 'Žiadosť už existuje.' });
    db.run(`INSERT INTO notifications (user_id, actor_id, type, target_id) VALUES (?, ?, 'friend', ?)`, [receiver_id, sender_id, this.lastID]);
    res.json({ success: true });
  });
});

app.post('/api/friends/accept', isAuthenticated, (req, res) => {
  const { friendship_id } = req.body;
  db.run(`UPDATE friendships SET status = 'accepted' WHERE id = ? AND receiver_id = ?`, [friendship_id, req.session.userId], (err) => {
    res.json({ success: true });
  });
});

// --- SPRÁVY (MESSENGER) ---
app.get('/api/messages/:userId', isAuthenticated, (req, res) => {
  const myId = req.session.userId;
  const otherId = req.params.userId;
  const query = `
    SELECT * FROM messages 
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
  `;
  db.all(query, [myId, otherId, otherId, myId], (err, messages) => {
    res.json(messages);
  });
});

app.post('/api/messages', isAuthenticated, (req, res) => {
  const { receiver_id, content } = req.body;
  const sender_id = req.session.userId;
  if (!content) return res.status(400).json({ error: 'Správa nemôže byť prázdna.' });
  db.run(`INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)`, [sender_id, receiver_id, content], function(err) {
    if (err) return res.status(500).json({ error: 'Chyba odoslania správy.' });
    res.json({ success: true, messageId: this.lastID });
  });
});

// --- NOTIFIKÁCIE ---
app.get('/api/notifications', isAuthenticated, (req, res) => {
  const query = `
    SELECT n.*, u.username, u.name, u.avatar FROM notifications n
    JOIN users u ON n.actor_id = u.id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 20
  `;
  db.all(query, [req.session.userId], (err, notifications) => {
    res.json(notifications);
  });
});

app.post('/api/notifications/read', isAuthenticated, (req, res) => {
  db.run(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [req.session.userId], () => {
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Server beží na porte ${PORT}`);
});