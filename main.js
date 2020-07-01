#!/usr/bin/env node
const express = require('express');
const expressws = require('express-ws');
const app = express();
const showdown  = require('showdown');

let converter = new showdown.Converter()
let wss = expressws(app);
app.use('/', express.static('chat'));

let users = {};
let sessions = {};
let messages = [];

const controller = {
	login(params, req) {
		let username = params['login'];
		let password = params['password'];
		let addr = req.connection.remoteAddress
		if (!Object.keys(users).includes(username) && username && password.length > 5) {
			users[username] = password;
			sessions[username] = req.connection;
			console.log('New registration from ' + addr + ' Username: ' + username);
			return true;
		} else if (users[username] === password) {
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
			messages.push('<div class="message"><b>' + username + '</b>  базарит: ' + converter.makeHtml(text) + "</div>");
			if (messages.length > 50) {
				messages.shift();
			}
			chatWss.clients.forEach(function (client) {
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

app.listen(80, () => console.log('app listening on port 80'))
