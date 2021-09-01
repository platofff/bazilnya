#!/usr/bin/env node
'use strict';
const express = require('express');
const expressws = require('express-ws');
const sharp = require('sharp')
const multer = require('multer');
const fs = require('fs');
const fsExtra = require('fs-extra')
const { hash } = require('blake3');
const showdown = require('showdown');

const app = express();

(async () => {
	let server, SALT;
	let users = {};
	let sessions = {};
	let messages = [];
	const MAX_MESSAGES = process.env.MAX_MESSAGES || 50;
	const MAX_LENGTH = process.env.MAX_LENGTH || 1024;
	const MAX_SIZE = process.env.MAX_SIZE || 1024 * 1024 * 10;
	const converter = new showdown.Converter();

	fsExtra.emptyDirSync('chat/uploads');

	if (process.env.SSL_PRIV && process.env.SSL_PUB) {
		const keys = await Promise.all([fs.promises.readFile(process.env.SSL_PRIV), fs.promises.readFile(process.env.SSL_PUB)]);
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
			fs.promises.writeFile('config/salt', SALT);
		}
	}

	const upload = multer({ dest: '/tmp/simple-chat', limits: {fileSize: MAX_SIZE} });
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

	const based = (text) => {
		const basedWords = ['сьлржалсч', 'баз', 'максымардыш', 'пыздыр', 'пыж', 'base', 'славян', 'добротрах', 'еблуци'];
		const superBasedWords = ['нац', 'гитлер', 'австр', 'немец', 'художник', 'герман'];
		const hyperBasedWords = ['гиперборе', 'глубинн', 'пятибрат', 'веды', 'арии', 'арий', 'славяноари', 'славяно-ари', 'пчс'];
		if (text.includes('(((') && text.includes(')))'))
			text = text.replace('(((', `<span style="font-family:'DS Sholom Medium';color:blue">(((`).replace(')))', ')))</span>');
		let result = '';
		let _based = false;
		let superBased = false;
		let hyperBased = false;
		for (const word of text.split(' ')) {
			for (const basedWord of basedWords) {
				if (word.toLowerCase().startsWith(basedWord)) {
					_based = true;
					break;
				}
			}
			for (const superBasedWord of superBasedWords) {
				if (word.toLowerCase().startsWith(superBasedWord)) {
					superBased = true;
					break;
				}
			}
			for (const hyperBasedWord of hyperBasedWords) {
				if (word.toLowerCase().startsWith(hyperBasedWord)) {
					hyperBased = true;
					break;
				}
			}
			if (hyperBased)
				result += ` <span style="font-family:Runic;font-size:xx-large">${word}</span>`;
			else if (_based)
				result += ` <span style="font-family:Apostol;font-size:x-large">${word}</span>`;
			else if (superBased)
				result += ` <span style="font-family:'Deutsch Gothic'">${word}</span>`;
			else
				result += ` ${word}`;
		}
		return result.substr(1);
	}

	app.post('/upload', upload.single('file'), async (req, res) => {
		let buf;
		try {
			buf = await sharp(req.file.path, { animated: true })
				.resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
				.webp()
				.toBuffer();
		} catch (_) {
			res.send('Invalid image');
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
				await fs.promises.unlink('chat' + matched[0].split('"')[1]);
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
			let session = req.connection;
			if (params.text.length > MAX_LENGTH)
				throw new Error("Message's too long");
			params.text = based(params.text);
			if (sessions[params.login] === session) {
				messages.push(`<b class="author">${params.login}</b>${converter.makeHtml(params.text)}`);
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
				console.error(err);
				ws.send(JSON.stringify({ 'result': false }));
			}
		})
	});
	let chatWss = wss.getWss('/ws');

	server.listen(3000);
})()