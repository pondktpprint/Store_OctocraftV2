const net = require("net");

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
    writeVarInt(767), // Protocol version
    writeVarInt(hostBuffer.length),
    hostBuffer,
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    writeVarInt(1) // Next state: status
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

function pingMinecraftServer(host, port) {
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

module.exports = { pingMinecraftServer };
