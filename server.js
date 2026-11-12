const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");

const app = express();
const db = new Database(process.env.DB_FILE || "aurora.db");
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "troque-esta-chave-antes-de-publicar-" + crypto.randomBytes(24).toString("hex");

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 balance_cents INTEGER NOT NULL DEFAULT 100000,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transfers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 from_user_id INTEGER NOT NULL,
 to_user_id INTEGER NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(from_user_id) REFERENCES users(id),
 FOREIGN KEY(to_user_id) REFERENCES users(id)
);
`);

const auth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Faça login novamente." });
  }
};
const publicUser = row => ({ id: row.id, name: row.name, email: row.email, balanceCents: row.balance_cents });

app.post("/api/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim().slice(0, 60);
    const email = String(req.body.email || "").trim().toLowerCase().slice(0, 120);
    const password = String(req.body.password || "");
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return res.status(400).json({ error: "Informe nome, e-mail válido e senha com pelo menos 8 caracteres." });
    }
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name, email, hash);
    const row = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
    const token = jwt.sign({ id: row.id, email: row.email }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, user: publicUser(row), message: "Conta de demonstração criada. O saldo inicial é fictício." });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "Este e-mail já possui uma conta." });
    res.status(500).json({ error: "Não foi possível criar a conta." });
  }
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const row = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    return res.status(401).json({ error: "E-mail ou senha incorretos." });
  }
  const token = jwt.sign({ id: row.id, email: row.email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: publicUser(row) });
});

app.get("/api/me", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!row) return res.status(404).json({ error: "Conta não encontrada." });
  res.json({ user: publicUser(row) });
});

app.get("/api/users", auth, (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 80);
  if (q.length < 2) return res.json({ users: [] });
  const rows = db.prepare("SELECT id,name,email FROM users WHERE id<>? AND (name LIKE ? OR email LIKE ?) ORDER BY name LIMIT 8")
    .all(req.user.id, `%${q}%`, `%${q}%`);
  res.json({ users: rows });
});

app.post("/api/transfers", auth, (req, res) => {
  const toEmail = String(req.body.toEmail || "").trim().toLowerCase();
  const amount = Number(req.body.amount);
  const note = String(req.body.note || "").trim().slice(0, 100);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    return res.status(400).json({ error: "Digite um valor entre R$ 0,01 e R$ 10.000,00." });
  }
  const cents = Math.round(amount * 100);
  if (cents < 1) return res.status(400).json({ error: "Valor inválido." });
  const recipient = db.prepare("SELECT * FROM users WHERE email=?").get(toEmail);
  if (!recipient) return res.status(404).json({ error: "Não encontramos uma conta com esse e-mail." });
  if (recipient.id === req.user.id) return res.status(400).json({ error: "Você não pode transferir para si mesmo." });

  const sender = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  const perform = db.transaction(() => {
    const current = db.prepare("SELECT balance_cents FROM users WHERE id=?").get(req.user.id);
    if (!current || current.balance_cents < cents) throw new Error("SALDO_INSUFICIENTE");
    db.prepare("UPDATE users SET balance_cents=balance_cents-? WHERE id=?").run(cents, req.user.id);
    db.prepare("UPDATE users SET balance_cents=balance_cents+? WHERE id=?").run(cents, recipient.id);
    const info = db.prepare("INSERT INTO transfers(from_user_id,to_user_id,amount_cents,note) VALUES(?,?,?,?)")
      .run(req.user.id, recipient.id, cents, note);
    return info.lastInsertRowid;
  });
  try {
    const id = perform();
    res.status(201).json({ message: "Transferência de demonstração concluída!", transferId: id });
  } catch (e) {
    if (e.message === "SALDO_INSUFICIENTE") return res.status(400).json({ error: "Saldo insuficiente." });
    res.status(500).json({ error: "Não foi possível concluir a transferência." });
  }
});

app.get("/api/transactions", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT t.id,t.amount_cents,t.note,t.created_at,
      CASE WHEN t.from_user_id=? THEN 'sent' ELSE 'received' END AS direction,
      CASE WHEN t.from_user_id=? THEN receiver.name ELSE sender.name END AS other_name,
      CASE WHEN t.from_user_id=? THEN receiver.email ELSE sender.email END AS other_email
    FROM transfers t
    JOIN users sender ON sender.id=t.from_user_id
    JOIN users receiver ON receiver.id=t.to_user_id
    WHERE t.from_user_id=? OR t.to_user_id=?
    ORDER BY t.id DESC LIMIT 50
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
  res.json({ transactions: rows });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Aurora+ rodando em http://localhost:${PORT}`));
