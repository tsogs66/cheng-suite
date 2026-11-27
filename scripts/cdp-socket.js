/**
 * Tiny WebSocket client for Chrome DevTools on localhost.
 * Node 20 (what CI runs) has no global WebSocket. Node 22 does.
 * This speaks the frames we need and nothing else.
 */
'use strict';

const crypto = require('crypto');
const net = require('net');

function openCdp(wsUrl) {
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: u.hostname, port: Number(u.port) || 80 });
    const key = crypto.randomBytes(16).toString('base64');
    let buf = Buffer.alloc(0);
    let opened = false;
    const inbox = [];
    const waiters = [];

    function push(text) {
      let data;
      try { data = JSON.parse(text); } catch (e) { return; }
      const waiter = waiters.shift();
      if (waiter) waiter(data);
      else inbox.push(data);
    }

    function nextMessage() {
      if (inbox.length) return Promise.resolve(inbox.shift());
      return new Promise((res) => waiters.push(res));
    }

    function sendText(text) {
      const payload = Buffer.from(text);
      const mask = crypto.randomBytes(4);
      let header;
      if (payload.length < 126) {
        header = Buffer.from([0x81, 0x80 | payload.length]);
      } else {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(payload.length, 2);
      }
      const masked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
      socket.write(Buffer.concat([header, mask, masked]));
    }

    function parseFrames() {
      while (buf.length >= 2) {
        const opcode = buf[0] & 0x0f;
        let len = buf[1] & 0x7f;
        let offset = 2;
        if (len === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2);
          offset = 4;
        } else if (len === 127) {
          if (buf.length < 10) return;
          len = Number(buf.readBigUInt64BE(2));
          offset = 10;
        }
        if (buf.length < offset + len) return;
        const payload = buf.subarray(offset, offset + len);
        buf = buf.subarray(offset + len);
        if (opcode === 0x1) push(payload.toString('utf8'));
        else if (opcode === 0x8) socket.end();
        else if (opcode === 0x9) {
          const pong = Buffer.alloc(2 + payload.length);
          pong[0] = 0x8a;
          pong[1] = payload.length;
          payload.copy(pong, 2);
          socket.write(pong);
        }
      }
    }

    socket.on('error', (err) => {
      if (!opened) reject(err);
    });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!opened) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buf.subarray(0, end).toString('utf8');
        buf = buf.subarray(end + 4);
        if (!/^HTTP\/1\.[01] 101/.test(head)) {
          reject(new Error('websocket upgrade failed: ' + head.split('\r\n')[0]));
          socket.destroy();
          return;
        }
        opened = true;
        parseFrames();
        resolve({
          send: sendText,
          next: nextMessage,
          close: () => { try { socket.end(); } catch (e) { /* already closed */ } },
        });
        return;
      }
      parseFrames();
    });

    socket.write(
      'GET ' + u.pathname + u.search + ' HTTP/1.1\r\n' +
      'Host: ' + u.host + '\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Key: ' + key + '\r\n' +
      'Sec-WebSocket-Version: 13\r\n\r\n'
    );
  });
}

module.exports = { openCdp };
