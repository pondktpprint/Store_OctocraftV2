const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

let mysql, bcrypt;
try {
  mysql = require("mysql2/promise");
  bcrypt = require("bcryptjs");
} catch (err) {
  console.warn("MySQL2 or BcryptJS is unavailable. Database login will be disabled until dependencies are installed.");
}

// พยายามโหลด dotenv ถ้ามี
try {
  require("dotenv").config();
} catch (e) {}

const PORT = Number(process.env.PORT || 4987);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.join(__dirname, "..", "frontend");
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "bridge-state.json");
const PUBLIC_MINECRAFT_HOST = process.env.PUBLIC_MINECRAFT_HOST || "";
const PUBLIC_MINECRAFT_PORT = Number(process.env.PUBLIC_MINECRAFT_PORT || 25565);
const PUBLIC_DISCORD_INVITE = process.env.PUBLIC_DISCORD_INVITE || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const bridgeClients = new Map();
const pendingRequests = new Map();
const adminSessions = new Set();
const userSessions = new Map();

function getSession(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, "");
  if (userSessions.has(token)) return userSessions.get(token);
  if (token.startsWith("admin_") && adminSessions.has(token)) {
    return { username: ADMIN_USERNAME, role: "admin" };
  }
  return null;
}

function localBridgeUrl() {
  return `ws://localhost:${PORT}/bridge`;
}

function defaultState() {
  return {
    tickets: [],
    tokens: [],
    serverConfig: {
      panelUrl: localBridgeUrl(),
      backend: process.env.AUTH_BACKEND || "nlogin"
    },
    mysqlConfig: {
      mysqlHost: process.env.MYSQL_HOST || "",
      mysqlPort: process.env.MYSQL_PORT || "3306",
      mysqlDatabase: process.env.MYSQL_DATABASE || "",
      mysqlTable: process.env.MYSQL_TABLE || "",
      mysqlUsername: process.env.MYSQL_USER || "",
      mysqlPassword: process.env.MYSQL_PASSWORD || "",
      columns: {
        id: process.env.MYSQL_COLUMN_ID || "id",
        last_name: process.env.MYSQL_COLUMN_USERNAME || "username",
        password: process.env.MYSQL_COLUMN_PASSWORD || "password",
        email: process.env.MYSQL_COLUMN_EMAIL || "email",
        creation_date: process.env.MYSQL_COLUMN_CREATED_AT || "creation_date",
        last_seen: process.env.MYSQL_COLUMN_LAST_SEEN || "last_seen"
      }
    },
    paymentConfig: {
      promptpayName: process.env.PROMPTPAY_NAME || "",
      promptpayTarget: process.env.PROMPTPAY_TARGET || "",
      pointRate: process.env.POINT_RATE || "1",
      easySlipApiKey: process.env.EASYSLIP_API_KEY || ""
    },
    categories: [],
    items: [],
    itemCodes: [],
    members: []
  };
}

function readState() {
  try {
    const state = { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
    return state;
  } catch (error) {
    return defaultState();
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function isAdmin(req) {
  const auth = req.headers.authorization;
  const token = auth ? auth.replace(/^Bearer\s+/i, "") : "";
  return token && adminSessions.has(token);
}

function publicMember(member) {
  return {
    id: member.id,
    name: member.name,
    points: member.points,
    totalTopup: member.totalTopup,
    totalSpent: member.totalSpent,
    lastLogin: member.lastLogin,
    lastSeen: member.lastSeen
  };
}

function publicToken(token) {
  return {
    id: token.id,
    token: token.token,
    createdAt: token.createdAt,
    status: token.status,
    lastUsed: token.lastUsed || null
  };
}

function publicPaymentConfig(paymentConfig) {
  return {
    promptpayName: paymentConfig.promptpayName || "OctoCraft SMP",
    promptpayTarget: paymentConfig.promptpayTarget || "",
    pointRate: paymentConfig.pointRate || "1",
    closePayment: Boolean(paymentConfig.closePayment),
    promoEnabled: Boolean(paymentConfig.promoEnabled),
    promoRate: paymentConfig.promoRate || "1"
  };
}

function connectedSummary() {
  return Array.from(bridgeClients.values()).map((client) => ({
    id: client.id,
    connectedAt: client.connectedAt,
    lastSeen: client.lastSeen,
    hello: client.hello
  }));
}

function writeVarInt(value) {
  const bytes = [];
  let remaining = Number(value);
  do {
    let temp = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (remaining !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset) {
  let value = 0;
  let position = 0;
  let currentOffset = offset;
  while (currentOffset < buffer.length) {
    const current = buffer[currentOffset++];
    value |= (current & 0x7f) << position;
    if ((current & 0x80) !== 0x80) {
      return { value, offset: currentOffset };
    }
    position += 7;
    if (position >= 35) throw new Error("VarInt too large");
  }
  return null;
}

function createMinecraftPacket(parts) {
  const payload = Buffer.concat(parts);
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

function createMinecraftHandshake(host, port) {
  const hostBuffer = Buffer.from(host, "utf8");
  return createMinecraftPacket([
    writeVarInt(0),
    writeVarInt(767),
    writeVarInt(hostBuffer.length),
    hostBuffer,
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    writeVarInt(1)
  ]);
}

function parseMinecraftStatus(buffer) {
  let cursor = readVarInt(buffer, 0);
  if (!cursor) return null;

  cursor = readVarInt(buffer, cursor.offset);
  if (!cursor || cursor.value !== 0) return null;

  const jsonLength = readVarInt(buffer, cursor.offset);
  if (!jsonLength) return null;

  const start = jsonLength.offset;
  const end = start + jsonLength.value;
  if (buffer.length < end) return null;

  return JSON.parse(buffer.subarray(start, end).toString("utf8"));
}

function pingMinecraftServer(host = PUBLIC_MINECRAFT_HOST, port = PUBLIC_MINECRAFT_PORT) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 5000 });
    const chunks = [];

    socket.on("connect", () => {
      socket.write(createMinecraftHandshake(host, port));
      socket.write(createMinecraftPacket([writeVarInt(0)]));
    });

    socket.on("data", (chunk) => {
      chunks.push(chunk);
      try {
        const status = parseMinecraftStatus(Buffer.concat(chunks));
        if (status) {
          socket.end();
          resolve(status);
        }
      } catch (error) {
        socket.destroy();
        reject(error);
      }
    });

    socket.on("timeout", () => {
      socket.destroy(new Error("minecraft_status_timeout"));
    });

    socket.on("error", reject);

    socket.on("close", () => {
      if (!chunks.length) reject(new Error("minecraft_status_unavailable"));
    });
  });
}

function sendFrame(socket, text, opcode = 1) {
  const payload = Buffer.isBuffer(text) ? text : Buffer.from(text);
  let header;
  const firstByte = 0x80 | (opcode & 0x0f);
  if (payload.length < 126) {
    header = Buffer.from([firstByte, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = firstByte;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = firstByte;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

function readFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;

    let payload = buffer.subarray(offset + headerLength + maskLength, frameEnd);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }
    frames.push({ opcode, text: payload.toString("utf8") });
    offset = frameEnd;
  }
  return { frames, remaining: buffer.subarray(offset) };
}

function bridgeRequest(type, payload) {
  const client = Array.from(bridgeClients.values())[0];
  if (!client) {
    return Promise.reject(new Error("OctoBridge plugin is not connected."));
  }

  const requestId = `req-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const message = JSON.stringify({ requestId, type, payload: payload || {} });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Bridge request timed out."));
    }, 20000);
    pendingRequests.set(requestId, { resolve, reject, timeout });
    sendFrame(client.socket, message);
  });
}

function handleBridgeMessage(client, text) {
  client.lastSeen = Date.now();
  let message;
  try {
    message = JSON.parse(text);
  } catch (error) {
    return;
  }

  if (message.type === "hello") {
    client.hello = message.data || {};
    return;
  }

  if (message.requestId && pendingRequests.has(message.requestId)) {
    const pending = pendingRequests.get(message.requestId);
    clearTimeout(pending.timeout);
    pendingRequests.delete(message.requestId);
    pending.resolve(message);
  }
}

function upgradeBridge(req, socket) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const state = readState();
  const savedToken = state.tokens.find((item) => item.token === token && item.status === "active");

  if (!savedToken) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  savedToken.lastUsed = Date.now();
  writeState(state);

  const key = req.headers["sec-websocket-key"];
  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  const client = {
    id: crypto.randomBytes(8).toString("hex"),
    socket,
    tokenId: savedToken.id,
    connectedAt: Date.now(),
    lastSeen: Date.now(),
    hello: null,
    buffer: Buffer.alloc(0)
  };
  bridgeClients.set(client.id, client);

  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    const result = readFrames(client.buffer);
    client.buffer = result.remaining;
    result.frames.forEach((frame) => {
      if (frame.opcode === 1) {
        client.lastSeen = Date.now();
        handleBridgeMessage(client, frame.text);
      }
      if (frame.opcode === 8) {
        socket.end();
      }
      if (frame.opcode === 9) {
        client.lastSeen = Date.now();
        sendFrame(socket, frame.text, 10); // Pong
      }
      if (frame.opcode === 10) {
        client.lastSeen = Date.now();
      }
    });
  });

  socket.on("close", () => {
    bridgeClients.delete(client.id);
  });

  socket.on("error", () => {
    bridgeClients.delete(client.id);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const state = readState();
      const body = await readBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!username || !password) {
        json(res, 400, { ok: false, error: "\u0e01\u0e23\u0e38\u0e13\u0e32\u0e01\u0e23\u0e2d\u0e01 username \u0e41\u0e25\u0e30 password" });
        return;
      }

      if (ADMIN_USERNAME && ADMIN_PASSWORD && username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = "admin_" + crypto.randomBytes(16).toString("hex");
        adminSessions.add(token);
        json(res, 200, {
          ok: true,
          token: token,
          player: { id: "admin", name: ADMIN_USERNAME, role: "admin", points: 0 }
        });
        return;
      }

      if (!mysql || !bcrypt) {
        return json(res, 503, { ok: false, error: "database_auth_unavailable" });
      }

      const dbConf = state.mysqlConfig;
      if (!dbConf.mysqlHost || !dbConf.mysqlDatabase || !dbConf.mysqlTable || !dbConf.mysqlUsername) {
        return json(res, 503, { ok: false, error: "database_auth_not_configured" });
      }

      const connection = await mysql.createConnection({
        host: dbConf.mysqlHost,
        port: dbConf.mysqlPort,
        user: dbConf.mysqlUsername,
        password: dbConf.mysqlPassword,
        database: dbConf.mysqlDatabase,
        connectTimeout: 3000
      });

      const [rows] = await connection.execute(`SELECT * FROM ${dbConf.mysqlTable} WHERE ${dbConf.columns.last_name} = ?`, [username]);
      await connection.end();

      if (rows.length === 0) {
        return json(res, 401, { ok: false, error: "invalid_credentials" });
      }

      const userRow = rows[0];
      const match = await bcrypt.compare(password, userRow[dbConf.columns.password]);
      if (!match) {
        return json(res, 401, { ok: false, error: "invalid_credentials" });
      }

      // Sync member state
      let member = state.members.find(m => String(m.name).toLowerCase() === String(username).toLowerCase());
      if (!member) {
        member = {
          id: String(Date.now()),
          name: username,
          points: 0,
          totalTopup: 0,
          totalSpent: 0,
          firstLogin: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          topups: [],
          purchases: []
        };
        state.members.push(member);
      } else {
        member.lastLogin = new Date().toISOString();
        member.lastSeen = new Date().toISOString();
        if(!member.topups) member.topups = [];
        if(!member.purchases) member.purchases = [];
      }
      writeState(state);

      const token = "user_" + crypto.randomBytes(32).toString("hex");
      userSessions.set(token, { username: member.name, role: "user" });
      json(res, 200, {
        ok: true,
        token: token,
        player: publicMember(member)
      });
      return;
    } catch (error) {
      json(res, 503, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const session = getSession(req);
    if (!session) return json(res, 401, { ok: false, error: "not_logged_in" });
    if (session.role === "admin") {
      return json(res, 200, { ok: true, player: { id: "admin", name: session.username, role: "admin", points: 0 } });
    }
    const state = readState();
    const member = (state.members || []).find(m => String(m.name).toLowerCase() === String(session.username).toLowerCase());
    if (!member) return json(res, 404, { ok: false, error: "user_not_found" });
    return json(res, 200, { ok: true, player: publicMember(member) });
  }

  // ==== API เติม Item Code (Redeem) ====
  if (req.method === "POST" && url.pathname === "/api/shop/redeem") {
    try {
      const session = getSession(req);
      if (!session) return json(res, 401, { ok: false, error: "not_logged_in" });
      const state = readState();
      const body = await readBody(req);
      const username = session.username;
      const codeInput = String(body.code || "").trim();

      if (!username || !codeInput) return json(res, 400, { ok: false, error: "Missing data" });

      const codeItem = (state.itemCodes || []).find(c => c.code === codeInput);
      if (!codeItem) return json(res, 404, { ok: false, error: "ไม่พบโค้ดนี้" });

      if (codeItem.usedBy && codeItem.usedBy.includes(username)) {
        return json(res, 400, { ok: false, error: "คุณใช้โค้ดนี้ไปแล้ว" });
      }

      if (codeItem.limit > 0 && (codeItem.usedBy || []).length >= codeItem.limit) {
        return json(res, 400, { ok: false, error: "โค้ดถูกใช้ครบจำนวนแล้ว" });
      }

      if (!codeItem.usedBy) codeItem.usedBy = [];
      codeItem.usedBy.push(username);
      writeState(state);

      const command = codeItem.command.replace(/{player}/g, username);
      await bridgeRequest("execute_command", { command: command });

      return json(res, 200, { ok: true, message: "เติมโค้ดสำเร็จและได้รับไอเทมแล้ว!" });
    } catch (error) {
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  // ==== เพิ่งเพิ่ม Endpoint สำหรับการซื้อไอเทม (Buy) ====
  if (req.method === "POST" && url.pathname === "/api/shop/buy") {
    try {
      const session = getSession(req);
      if (!session) return json(res, 401, { ok: false, error: "not_logged_in" });
      const state = readState();
      const body = await readBody(req);
      const username = session.username;
      const itemId = body.itemId;

      if (!username || !itemId) {
        return json(res, 400, { ok: false, error: "Missing username or itemId" });
      }

      const item = state.items.find(i => i.id === itemId);
      if (!item) {
        return json(res, 404, { ok: false, error: "Item not found" });
      }

      let member = state.members.find(m => String(m.name).toLowerCase() === String(username).toLowerCase());
      if (!member || member.points < item.price) {
        return json(res, 400, { ok: false, error: "พอยท์ไม่เพียงพอ" });
      }

      // หักพอยท์
      member.points -= item.price;
      member.totalSpent = (member.totalSpent || 0) + item.price;
      if (!member.purchases) member.purchases = [];
      member.purchases.push({ date: new Date().toISOString(), item: item.name, price: item.price });
      writeState(state);

      // ส่งคำสั่งผ่าน Bridge ไปยังเซิร์ฟเวอร์มายคราฟ
      const command = item.command.replace(/{player}/g, username);
      await bridgeRequest("execute_command", { command: command });

      return json(res, 200, { ok: true, message: "ซื้อสินค้าสำเร็จ ส่งคำสั่งแล้ว", newPoints: member.points });
    } catch (error) {
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/payment/config") {
    const state = readState();
    json(res, 200, {
      ok: true,
      paymentConfig: publicPaymentConfig(state.paymentConfig || {})
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/public/server-status") {
    if (!PUBLIC_MINECRAFT_HOST) {
      json(res, 200, { ok: true, online: false, host: "", port: PUBLIC_MINECRAFT_PORT, players: { online: 0, max: 0 } });
      return;
    }
    try {
      const status = await pingMinecraftServer();
      json(res, 200, {
        ok: true,
        online: true,
        host: PUBLIC_MINECRAFT_HOST,
        port: PUBLIC_MINECRAFT_PORT,
        version: status.version && status.version.name ? status.version.name : "",
        players: {
          online: status.players && Number(status.players.online || 0),
          max: status.players && Number(status.players.max || 0)
        }
      });
    } catch (error) {
      json(res, 200, {
        ok: true,
        online: false,
        host: PUBLIC_MINECRAFT_HOST,
        port: PUBLIC_MINECRAFT_PORT,
        players: { online: 0, max: 0 },
        error: error.message
      });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/public/discord") {
    if (!PUBLIC_DISCORD_INVITE) {
      json(res, 200, { ok: true, online: 0, total: 0 });
      return;
    }
    try {
      const resp = await fetch(`https://discord.com/api/v9/invites/${encodeURIComponent(PUBLIC_DISCORD_INVITE)}?with_counts=true`);
      const data = await resp.json();
      json(res, 200, { ok: true, online: data.approximate_presence_count, total: data.approximate_member_count });
    } catch(e) {
      json(res, 200, { ok: false });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/public/donators") {
    const state = readState();
    const members = state.members || [];
    
    // Sort by totalTopup (descending)
    const topDonators = [...members]
      .filter(m => m.totalTopup && m.totalTopup > 0)
      .sort((a, b) => b.totalTopup - a.totalTopup)
      .slice(0, 3)
      .map(m => ({ name: m.name, amount: m.totalTopup }));

    // Sort by lastSeen or let's use the ones that recently topped up
    // Assuming lastSeen is relatively close for recent donators, but ideally we'd track topup history.
    // For now, we'll sort by lastSeen as a proxy for 'recent' if they have topped up.
    const recentDonators = [...members]
      .filter(m => m.totalTopup && m.totalTopup > 0)
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
      .slice(0, 5)
      .map(m => ({ 
        name: m.name, 
        amount: m.totalTopup, // This should be individual transaction amount ideally, but we only store total.
        time: m.lastSeen 
      }));

    json(res, 200, { ok: true, topDonators, recentDonators });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/topup/verify-slip") {
    try {
      const session = getSession(req);
      if (!session) return json(res, 401, { ok: false, error: "not_logged_in" });
      const state = readState();
      const body = await readBody(req);
      const amount = Number(body.amount || 0);
      const points = Number(body.points || 0);

      if (!amount || amount < 1 || !points || points < 1) {
        json(res, 400, { ok: false, error: "invalid_topup_amount" });
        return;
      }

      if (!body.slipData) {
        json(res, 400, { ok: false, error: "slip_required" });
        return;
      }

      const apiKey = state.paymentConfig && state.paymentConfig.easySlipApiKey;
      if (!apiKey) {
        json(res, 503, { ok: false, error: "payment_verification_not_configured" });
        return;
      }

      if (apiKey) {
        // Real EasySlip API Slip Verification
        let base64Image = body.slipData;
        if (base64Image.includes(",")) {
          base64Image = base64Image.split(",")[1];
        }

        const response = await fetch("https://api.easyslip.com/v1/verify", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            image: base64Image
          })
        });

        const result = await response.json();
        if (!response.ok || result.status !== "success" || !result.data) {
          json(res, 400, { 
            ok: false, 
            error: result.message || "\u0e45\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e15\u0e23\u0e27\u0e0a\u0e2aà¸\u0e1a\u0e2a\u0e25\u0e34\u0e1b\u0e45\u0e14\u0e49 (EasySlip Verification Failed)" 
          });
          return;
        }

        // Verify transfer amount matches expected amount
        const transferAmount = Number(result.data.amount || 0);
        if (Math.abs(transferAmount - amount) > 0.01) {
          json(res, 400, { 
            ok: false, 
            error: "\u0e0a\u0e33\u0e19\u0e27\u0e19\u0e40\u0e07\u0e34\u0e19\u0e43\u0e19\u0e2a\u0e25\u0e34\u0e1b (" + transferAmount + " \u0e1a\u0e32\u0e17) \u0e45\u0e21\u0e48\u0e15\u0e23\u0e0a\u0e01\u0e31\u0e1a\u0e17\u0e35\u0e48\u0e40\u0e25\u0e37\u0e2d\u0e01 (" + amount + " \u0e1a\u0e32\u0e17)"
          });
          return;
        }

        // Verify receiver promptpay matches if configured
        const receiverTarget = String(state.paymentConfig.promptpayTarget || "").trim();
        const slipReceiver = result.data.receiver && result.data.receiver.account && result.data.receiver.account.value;
        if (receiverTarget && slipReceiver) {
          const cleanTarget = receiverTarget.replace(/[^\d]/g, "");
          const cleanSlipReceiver = slipReceiver.replace(/[^\d]/g, "");
          if (!cleanSlipReceiver.includes(cleanTarget) && !cleanTarget.includes(cleanSlipReceiver)) {
            json(res, 400, { 
              ok: false, 
              error: "\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e1c\u0e39\u0e49\u0e23\u0e31\u0e1a\u0e40\u0e07\u0e34\u0e19\u0e43\u0e19\u0e2a\u0e25\u0e34\u0e1b\u0e45\u0e21\u0e48\u0e15\u0e23\u0e0a\u0e01\u0e31\u0e1a\u0e02\u0e2d\u0e0a\u0e17\u0e32\u0e0a\u0e40\u0e0a\u0e35\u0e23\u0e4c\u0e1f\u0e40\u0e27\u0e2d\u0e23\u0e4c"
            });
            return;
          }
        }

        if (!state.members) state.members = [];
        let member = state.members.find(m => String(m.name).toLowerCase() === String(session.username).toLowerCase());
        if (member) {
          member.points = Number(member.points || 0) + points;
          member.totalTopup = Number(member.totalTopup || 0) + amount;
          if (!member.topups) member.topups = [];
          member.topups.push({ date: new Date().toISOString(), amount: amount, points: points, method: "easyslip" });
          member.lastSeen = new Date().toISOString();
        } else {
          json(res, 404, { ok: false, error: "user_not_found" });
          return;
        }
        writeState(state);

        json(res, 200, {
          ok: true,
          mode: "easyslip",
          transactionId: result.data.transRef || ("topup_" + Date.now().toString(36)),
          message: "\u0e15\u0e23\u0e27\u0e0a\u0e2a\u0e2d\u0e1a\u0e2a\u0e25\u0e34\u0e1b\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e0a"
        });
        return;
      }
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
      return;
    }
  }

  // ==== NEW: Ticket API ====
  if (req.method === "POST" && url.pathname === "/api/tickets") {
    const session = getSession(req);
    if (!session) return json(res, 401, { ok: false, error: "not_logged_in" });
    const body = await readBody(req);
    const subject = body.subject || "No Subject";
    const message = body.message || "No Message";
    const state = readState();
    if (!state.tickets) state.tickets = [];
    const newTicket = {
      id: "TCK-" + Date.now().toString().substring(5),
      username: session.username,
      subject: subject,
      message: message,
      status: "open",
      date: new Date().toISOString()
    };
    state.tickets.push(newTicket);
    writeState(state);
    return json(res, 200, { ok: true, ticket: newTicket });
  }

  if (req.method === "GET" && url.pathname === "/api/user/history") {
    const session = getSession(req);
    if (!session) return json(res, 401, { ok: false, error: "not_logged_in" });
    const state = readState();
    const member = (state.members || []).find(m => String(m.name).toLowerCase() === String(session.username).toLowerCase());
    if (!member) return json(res, 404, { ok: false, error: "user_not_found" });

    json(res, 200, {
      ok: true,
      topups: member.topups || [],
      purchases: member.purchases || []
    });
    return;
  }

  if (!isAdmin(req)) {
    json(res, 401, { ok: false, error: "admin_session_required" });
    return;
  }

  const state = readState();

  if (req.method === "GET" && url.pathname === "/api/bridge/status") {
    json(res, 200, {
      ok: true,
      panelUrl: state.serverConfig.panelUrl || localBridgeUrl(),
      connected: bridgeClients.size > 0,
      clients: connectedSummary()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tokens") {
    if (!state.tokens || !Array.isArray(state.tokens)) state.tokens = [];
    json(res, 200, { ok: true, tokens: state.tokens.map(publicToken) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tokens") {
    if (!state.tokens || !Array.isArray(state.tokens)) state.tokens = [];
    const token = {
      id: String(Date.now()),
      token: "octo_" + crypto.randomBytes(32).toString("hex"),
      createdAt: Date.now(),
      status: "active",
      lastUsed: null
    };
    state.tokens.unshift(token);
    writeState(state);
    json(res, 200, { ok: true, token: publicToken(token), panelUrl: state.serverConfig.panelUrl });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/tokens/")) {
    if (!state.tokens || !Array.isArray(state.tokens)) state.tokens = [];
    const id = decodeURIComponent(url.pathname.split("/").pop());
    state.tokens = state.tokens.filter((token) => token.id !== id);
    writeState(state);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    json(res, 200, {
      ok: true,
      serverConfig: state.serverConfig,
      mysqlConfig: state.mysqlConfig,
      paymentConfig: state.paymentConfig || defaultState().paymentConfig
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/config/server") {
    state.serverConfig = { ...state.serverConfig, ...(await readBody(req)) };
    state.serverConfig.panelUrl = state.serverConfig.panelUrl || localBridgeUrl();
    writeState(state);
    json(res, 200, { ok: true, serverConfig: state.serverConfig });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/config/mysql") {
    state.mysqlConfig = { ...state.mysqlConfig, ...(await readBody(req)) };
    writeState(state);
    json(res, 200, { ok: true, mysqlConfig: state.mysqlConfig });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/config/payment") {
    const body = await readBody(req);
    state.paymentConfig = {
      ...(state.paymentConfig || defaultState().paymentConfig),
      promptpayName: String(body.promptpayName || "").trim(),
      promptpayTarget: String(body.promptpayTarget || "").trim(),
      pointRate: String(body.pointRate || "1").trim(),
      easySlipApiKey: String(body.easySlipApiKey || "").trim(),
      closePayment: body.closePayment !== undefined ? Boolean(body.closePayment) : false,
      promoEnabled: body.promoEnabled !== undefined ? Boolean(body.promoEnabled) : false,
      promoRate: String(body.promoRate || "1").trim()
    };
    writeState(state);
    json(res, 200, { ok: true, paymentConfig: state.paymentConfig });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/shop/config") {
    json(res, 200, {
      ok: true,
      categories: state.categories || [],
      items: state.items || []
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/shop/categories") {
    const body = await readBody(req);
    if (!state.categories) state.categories = [];
    state.categories = state.categories.filter(c => c.id !== body.id);
    state.categories.push({
      id: body.id || ("cat_" + Date.now().toString(36)),
      icon: body.icon,
      name: body.name,
      slug: body.slug,
      sort: Number(body.sort || 0)
    });
    writeState(state);
    json(res, 200, { ok: true, categories: state.categories });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/shop/categories/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    if (state.categories) {
      state.categories = state.categories.filter(c => c.id !== id);
      writeState(state);
    }
    json(res, 200, { ok: true, categories: state.categories });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/shop/items") {
    const body = await readBody(req);
    if (!state.items) state.items = [];
    state.items = state.items.filter(i => i.id !== body.id);
    state.items.push({
      id: body.id || ("item_" + Date.now().toString(36)),
      category: body.category,
      icon: body.icon,
      name: body.name,
      price: Number(body.price || 0),
      command: body.command
    });
    writeState(state);
    json(res, 200, { ok: true, items: state.items });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/shop/items/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    if (state.items) {
      state.items = state.items.filter(i => i.id !== id);
      writeState(state);
    }
    json(res, 200, { ok: true, items: state.items });
    return;
  }

  // ==== Admin API สำหรับจัดการ Item Codes ====
  if (req.method === "GET" && url.pathname === "/api/admin/codes") {
    json(res, 200, { ok: true, codes: state.itemCodes || [] });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/codes") {
    const body = await readBody(req);
    if (!state.itemCodes) state.itemCodes = [];
    state.itemCodes = state.itemCodes.filter(c => c.code !== body.code);
    state.itemCodes.push({
      code: String(body.code || "").trim(),
      limit: Number(body.limit || 0),
      command: String(body.command || "").trim(),
      usedBy: []
    });
    writeState(state);
    json(res, 200, { ok: true, codes: state.itemCodes });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/codes/")) {
    const codeId = decodeURIComponent(url.pathname.split("/").pop());
    if (state.itemCodes) {
      state.itemCodes = state.itemCodes.filter((c) => c.code !== codeId);
      writeState(state);
    }
    json(res, 200, { ok: true });
    return;
  }

  // ==== NEW: User History API ====
  if (req.method === "GET" && url.pathname === "/api/user/history") {
    const username = url.searchParams.get("user");
    if (!username) return json(res, 400, {ok: false, error: "Missing user param"});
    
    const member = state.members.find(m => String(m.name).toLowerCase() === String(username).toLowerCase());
    if (!member) return json(res, 404, {ok: false, error: "User not found"});

    json(res, 200, {
      ok: true,
      topups: member.topups || [],
      purchases: member.purchases || []
    });
    return;
  }

  // ==== NEW: Admin Dashboard API ====
  if (req.method === "GET" && url.pathname === "/api/admin/dashboard") {
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "admin_session_required" });

    const members = state.members || [];
    
    // Sort for top spenders
    const topSpenders = [...members].sort((a,b) => (b.totalTopup || 0) - (a.totalTopup || 0)).slice(0, 3);
    
    // Get all topups from all members to find recent topups
    let allTopups = [];
    members.forEach(m => {
      if(m.topups) {
        m.topups.forEach(t => allTopups.push({...t, username: m.name}));
      }
    });
    allTopups.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const recentTopups = allTopups.slice(0, 5);

    json(res, 200, {
      ok: true,
      members: members.map(publicMember),
      topSpenders: topSpenders.map(publicMember),
      recentTopups: recentTopups
    });
    return;
  }


  if (req.method === "GET" && url.pathname === "/api/admin/tickets") {
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "admin_session_required" });
    if (!state.tickets) state.tickets = [];
    return json(res, 200, { ok: true, tickets: state.tickets.reverse() });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/tickets/resolve") {
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "admin_session_required" });
    const body = await readBody(req);
    if (!state.tickets) state.tickets = [];
    const ticket = state.tickets.find(t => t.id === body.id);
    if (ticket) {
      ticket.status = "resolved";
      writeState(state);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { ok: false, error: "not_found" });
  }

  // ==== NEW: Admin Edit Member API ====
  if (req.method === "POST" && url.pathname === "/api/admin/members/edit") {
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "admin_session_required" });
    const body = await readBody(req);
    const targetName = body.username;
    const newPoints = Number(body.points);

    if (!targetName || isNaN(newPoints)) {
        return json(res, 400, { ok: false, error: "Invalid data" });
    }

    const member = state.members.find(m => String(m.name).toLowerCase() === String(targetName).toLowerCase());
    if (member) {
        member.points = newPoints;
        writeState(state);
        return json(res, 200, { ok: true });
    }
    return json(res, 404, { ok: false, error: "Member not found" });
  }

  if (req.method === "GET" && url.pathname === "/api/members") {
    json(res, 200, {
      ok: true,
      members: state.members || []
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/members") {
    const body = await readBody(req);
    if (!state.members) state.members = [];
    const id = String(body.id || body.name);
    state.members = state.members.filter(m => String(m.id || m.name) !== id);
    state.members.push({
      id: id,
      name: body.name,
      email: body.email || "",
      points: Number(body.points || 0),
      totalTopup: Number(body.totalTopup || 0),
      totalSpent: Number(body.totalSpent || 0),
      firstLogin: body.firstLogin || new Date().toISOString(),
      lastLogin: body.lastLogin || new Date().toISOString(),
      lastSeen: body.lastSeen || new Date().toISOString()
    });
    writeState(state);
    json(res, 200, { ok: true, members: state.members });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/members/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    if (state.members) {
      state.members = state.members.filter(m => String(m.id || m.name) !== id);
      writeState(state);
    }
    json(res, 200, { ok: true, members: state.members });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/members/sync") {
    const body = await readBody(req);
    if (!state.members) state.members = [];
    const id = String(body.id || body.name);
    let member = state.members.find(m => String(m.id || m.name) === id);
    if (!member) {
      member = {
        id: id,
        name: body.name,
        email: body.email || "",
        points: Number(body.points !== undefined ? body.points : 0),
        totalTopup: Number(body.totalTopup || 0),
        totalSpent: Number(body.totalSpent || 0),
        firstLogin: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      state.members.push(member);
    } else {
      if (body.points !== undefined) member.points = Number(body.points);
      if (body.totalTopup !== undefined) member.totalTopup = Number(body.totalTopup);
      if (body.totalSpent !== undefined) member.totalSpent = Number(body.totalSpent);
      if (body.email !== undefined) member.email = body.email;
      member.lastSeen = new Date().toISOString();
    }
    writeState(state);
    json(res, 200, { ok: true, member });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/upload") {
    try {
      const body = await readBody(req);
      let base64Data = body.data || "";
      if (base64Data.includes(",")) {
        base64Data = base64Data.split(",")[1];
      }
      const buffer = Buffer.from(base64Data, "base64");
      
      let filename = String(body.filename || "upload_" + Date.now() + ".png").replace(/[^a-zA-Z0-9_.-]/g, "_");
      if (!filename.endsWith(".png") && !filename.endsWith(".jpg") && !filename.endsWith(".jpeg") && !filename.endsWith(".gif")) {
        filename += ".png";
      }
      
      const uploadDir = path.join(ROOT, "images", "upload");
      fs.mkdirSync(uploadDir, { recursive: true });
      const targetPath = path.join(uploadDir, filename);
      
      fs.writeFileSync(targetPath, buffer);
      
      json(res, 200, {
        ok: true,
        url: "/images/upload/" + filename
      });
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  json(res, 404, { ok: false, error: "not_found" });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") filePath = "/index.html";
  if (filePath.endsWith("/")) filePath += "index.html";
  const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(ROOT, safePath);

  if (!absolutePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(absolutePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch((error) => json(res, 500, { ok: false, error: error.message }));
    return;
  }
  serveStatic(req, res);
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/bridge") {
    upgradeBridge(req, socket);
    return;
  }
  socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
  socket.destroy();
});

// Start WebSocket keepalive ping interval (every 25 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [clientId, client] of bridgeClients.entries()) {
    if (now - client.lastSeen > 60000) {
      console.warn(`[Bridge] Client ${clientId} is unresponsive (no heartbeat for >60s). Destroying socket.`);
      client.socket.destroy();
      bridgeClients.delete(clientId);
    } else {
      try {
        sendFrame(client.socket, "", 9); // Ping frame (opcode 9)
      } catch (error) {
        console.error(`[Bridge] Failed to send ping to client ${clientId}:`, error.message);
        client.socket.destroy();
        bridgeClients.delete(clientId);
      }
    }
  }
}, 25000);

server.listen(PORT, HOST, () => {
  const state = readState();
  if (!state.serverConfig.panelUrl || /^ws:\/\/localhost:\d+\/bridge$/.test(state.serverConfig.panelUrl)) {
    state.serverConfig.panelUrl = localBridgeUrl();
  }
  writeState(state);
  console.log(`=====================================`);
  console.log(`🚀 OctoCraft Backend is running!`);
  console.log(`🌐 Web listening on http://${HOST}:${PORT}`);
  console.log(`🔌 OctoBridge WebSocket: ${state.serverConfig.panelUrl}`);
  console.log(`=====================================`);
});
