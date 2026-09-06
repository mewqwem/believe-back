import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { io } from 'socket.io-client';
import { connectMongoDB } from '../src/db/connectMongoDB.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';

const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:3001';
const email = `frontend-test-${randomUUID()}@example.invalid`;
const password = 'frontend-test-password-123';
let userId;
const clients = [];
const event = (socket, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Timed out: ' + name)), 5000);
  socket.once(name, data => { clearTimeout(timer); resolve(data); });
});
try {
 await connectMongoDB();
 const post = (action, body, cookie = '', origin = base) => fetch(`${base}/api/auth/${action}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }, body: JSON.stringify(body), redirect: 'manual',
 });
 let response = await post('register', {}, '', 'https://untrusted.example');
 assert.equal(response.status, 403);
 response = await post('register', { email, password, confirmPassword: password, name: 'Frontend Test' });
 assert.equal(response.status, 201);
 const data = await response.json(); userId = data.user.id;
 assert.equal('token' in data, false);
 const setCookie = response.headers.get('set-cookie');
 assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=lax/i); assert.match(setCookie, /Path=\//i);
 const cookie = setCookie.split(';')[0];
 response = await fetch(`${base}/account`, { headers: { Cookie: cookie }, redirect: 'manual' });
 assert.equal(response.status, 200); assert.match(await response.text(), /Frontend Test/);
 response = await fetch(`${base}/login?next=%2F%3Fcode%3DABC123`, { headers: { Cookie: cookie }, redirect: 'manual' });
 const page = await response.text();
 assert.ok(response.headers.get('location')?.includes('code=ABC123') || page.includes('/?code=ABC123'));
 response = await post('logout', {}, cookie); assert.equal(response.status, 200);
 assert.match(response.headers.get('set-cookie'), /Max-Age=0/i);
 response = await fetch(`${base}/account`, { headers: { Cookie: cookie }, redirect: 'manual' });
 const loggedOutPage = await response.text();
 assert.ok(response.status === 307 || loggedOutPage.includes('/login?next='));
 assert.equal(loggedOutPage.includes('Frontend Test'), false);
 response = await fetch(`${base}/account`, { redirect: 'manual' }); assert.equal(response.status, 307);
 response = await fetch(`${base}/?code=ABC123`); assert.equal(response.status, 200);
 response = await post('login', { email, password }); assert.equal(response.status, 200);
 await post('logout', {}, response.headers.get('set-cookie').split(';')[0]);
 // The socket game continues to accept unauthenticated players.
 for (let i = 0; i < 2; i++) {
  const socket = io('http://127.0.0.1:3000', { autoConnect: false, reconnection: false });
  clients.push(socket); const connected = event(socket, 'connect'); socket.connect(); await connected;
 }
 const ids = [randomUUID(), randomUUID()];
 const created = event(clients[0], 'ROOM_CREATED');
 clients[0].emit('CREATE_ROOM', { playerName: 'Guest Test 1', playerId: ids[0] });
 const { roomId } = await created;
 const joined = event(clients[1], 'JOINED');
 clients[1].emit('JOIN_ROOM', { roomId, playerName: 'Guest Test 2', playerId: ids[1] }); await joined;
 const hands = clients.map(socket => event(socket, 'HAND_UPDATED'));
 clients[0].emit('START_GAME', { roomId });
 for (const { hand } of await Promise.all(hands)) assert.equal(hand.length, 26);
 console.log('PASS: frontend CSRF, HttpOnly cookie, protected account, login redirect, logout/revocation, public lobby and two-player guest game.');
} finally {
 for (const socket of clients) socket.disconnect();
 if (!userId && mongoose.connection.readyState === 1) userId = (await User.findOne({ email }))?.id;
 if (userId) { await Session.deleteMany({ userId }); await User.deleteOne({ _id: userId, email }); }
 await mongoose.disconnect();
}
