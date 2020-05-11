#!/usr/bin/env node
const express = require('express');
const expressws = require('express-ws');
const app = express();

expressws(app);
app.use(express.static('chat'));

let users = {};
let messages = [];

const controller = {
	login(params) {
		let username = params['login'];
		let password = params['password'];
		if (!Object.keys(users).includes(username)) {
			users[username] = password;
			return true;
		} else if (users[username] === password) {
			return true;
		} else {
			return false;
		}
	},
	message(params) {
		let username = params['login'];
		let password = params['password'];
		let text = params['text'];
		if (Object.keys(users).includes(username) && users[username] === password && text) {
			messages.push('<b>' + username + '</b>  базарит: ' + text);
			if (messages.length > 50) {
				messages.shift();
			}
		}
		return messages;
	},
	messages(params) {
		return messages;
	}
}

app.ws('/ws', (ws, req) => {
	ws.on('message', rq => {
		try {
			rq = JSON.parse(rq);
			ws.send(JSON.stringify({ "result": controller[rq.method](rq.params) }));
		} catch (err) {
			console.log(err);
			ws.send(JSON.stringify({ 'result': false }));
		}
	})
});

app.listen(80, () => console.log('app listening on port 80'))
