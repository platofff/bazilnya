#!/usr/bin/env node
'use strict';
const express = require('express');
const expressws = require('express-ws');
const sharp = require('sharp')
const multer = require('multer');
const fs = require('fs');
const fsExtra = require('fs-extra')
const { hash } = require('blake3');
const app = express();
const showdown = require('showdown');

fsExtra.emptyDirSync('chat/uploads');
(async () => {
	let server, SALT;
	let users = {};
	let sessions = {};
	let messages = [];
	const MAX_MESSAGES = process.env.MAX_MESSAGES || 50;
	const converter = new showdown.Converter();

	if (process.env.SSL_PRIV && process.env.SSL_PUB) {
		const keys = await Promise.all([fs.readFile(process.env.SSL_PRIV), fs.readFile(process.env.SSL_PUB)]);
		server = require('https').createServer({
			key: keys[0],
			cert: keys[1]
		}, app);
	} else
		server = require('http').createServer(app);

	try {
		SALT = await fs.promises.readFile('config/salt', 'utf8');
	} catch (e) {
		if (e.errno !== -2)
			throw e
		else {
			SALT = Math.random().toString(36).substring(5);
			fs.writeFile('config/salt', SALT, 'utf8');
		}
	}

	const upload = multer({ dest: '/tmp/simple-chat' });
	const wss = expressws(app, server);
	app.use('/', express.static('chat'));

	const removeNotUsed = async (path) => {
		await new Promise(resolve => setTimeout(resolve, 30000));
		let used = false;
		for (const m of messages) {
			if (m.includes(path))
				used = true;
		}
		if (!used)
			await fs.promises.unlink(`chat${path}`);
	}

	app.post('/upload', upload.single('file'), async (req, res) => {
		let buf;
		try {
			buf = await sharp(req.file.path, { animated: true })
				.resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
				.webp()
				.toBuffer();
		} catch (_) {
			res.send('error');
			return null;
		}
		const unlinkPromise = fs.promises.unlink(req.file.path);
		const filename = hash(buf).toString('base64url');
		const realPath = `chat/uploads/${filename}.webp`;
		const path = `/uploads/${filename}.webp`;
		if (fs.existsSync(realPath)) {
			await unlinkPromise;
			res.send(path);
			return null;
		}
		await Promise.all([unlinkPromise, fs.promises.writeFile(realPath, buf, 'binary')])
		removeNotUsed(path);
		res.send(path);
	})
	app.use('/uploads', express.static('chat/uploads'))

	const rmOldPics = async (m) => {
		const matched = m.match('<img src="/uploads/.*.\.webp" alt="">')
		if (matched !== null) {
			let unic = true
			for (let i = 0; i < messages.length; i++) {
				if (messages[i].includes(matched[0])) {
					unic = false
					break
				}
			}
			if (unic)
				await fs.promises.unlink('chat' + matched[0].split('"')[1])
		}
	}

	const controller = {
		login(params, req) {
			let username = params['login'];
			let password = params['password'];
			let addr = req.connection.remoteAddress
			if (!Object.keys(users).includes(username) && username && password.length > 5) {
				users[username] = hash(SALT + password);
				sessions[username] = req.connection;
				console.log('New registration from ' + addr + ' Username: ' + username);
				return true;
			} else if (Buffer.compare(users[username], hash(SALT + password)) === 0) {
				sessions[username] = req.connection;
				console.log(username + ' : successful login from ' + addr);
				return true;
			} else {
				console.log('Invalid login from ' + addr);
				return false;
			}
		},
		message(params, req) {
			let text = params['text'];
			let username = params['login'];
			let session = req.connection;
			if (sessions[username] === session) {
				messages.push(`<div class="message"><b>${username}</b>${converter.makeHtml(text)}</div>`);
				if (messages.length > MAX_MESSAGES)
					rmOldPics(messages.shift());
				chatWss.clients.forEach((client) => {
					client.send(JSON.stringify({ "message": messages[messages.length - 1] }));
				});
			} else {
				console.log('Unauthorized message attempt from ' + session.remoteAddress);
			}
		},
		messages() {
			return messages;
		}
	}

	app.ws('/ws', (ws, req) => {
		ws.on('message', rq => {
			try {
				rq = JSON.parse(rq);
				ws.send(JSON.stringify({ "result": controller[rq.method](rq.params, req) }));
			} catch (err) {
				console.log(err);
				ws.send(JSON.stringify({ 'result': false }));
			}
		})
	});
	let chatWss = wss.getWss('/ws');

	server.listen(3000);
})()