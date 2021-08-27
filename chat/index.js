'use strict';
let socket, username, connect, images;
const mesText = document.getElementById('mes-text');
const fill = document.getElementById('fill');
const loginInput = document.getElementById('login');
const passwordInput = document.getElementById('pass');
const loginBtn = document.getElementById('login-btn');
const loginForm = document.getElementById('login-form');
const chatElem = document.getElementById('chat');
const currentUser = document.getElementById('user');
const sendBtn = document.getElementById('send');
const messages = document.getElementById('messages');
const fileInput = document.getElementById('file-input');
const processLabel = document.getElementById('process');
const header = document.getElementById('header');
const toBottomBtn = document.getElementById('to-bottom-btn');

const scrollHandler = () => {
  if (window.scrollY + 10 >= (document.documentElement.scrollHeight - document.documentElement.clientHeight))
    toBottomBtn.style.display = 'none';
  else
    toBottomBtn.style.display = 'block';
}
window.addEventListener('scroll', scrollHandler);

const initialHeaderHeight = header.getBoundingClientRect().height;
chatElem.style.marginTop = initialHeaderHeight + 'px';
loginForm.style.marginTop = initialHeaderHeight + 'px';
const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    if (entry.contentBoxSize) {
      chatElem.style.marginTop = entry.contentRect.height + 'px';
      loginForm.style.marginTop = entry.contentRect.height + 'px';
    }
  }
});
resizeObserver.observe(header);

const setCookie = (name, value, options = {}) => {
  options = {
    path: '/', ...options
  };
  let updatedCookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  for (const optionKey in options) {
    updatedCookie += '; ' + optionKey;
    const optionValue = options[optionKey];
    if (optionValue !== true) {
      updatedCookie += '=' + optionValue;
    }
  }
  document.cookie = updatedCookie;
}
const getCookie = (name) => {
  const matches = document.cookie.match(new RegExp(
    '(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'
  ));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}
const deleteCookie = (name) => {
  setCookie(name, '', {
    'max-age': -1,
    SameSite: 'Strict',
    Secure: true
  });
}

document.body.addEventListener('dragover', (event) => event.preventDefault());
document.body.addEventListener('drop', (event) => {
  event.preventDefault();
  const url = event.dataTransfer.getData('text');
  if (url === '') {
    if (event.dataTransfer.files[0] === undefined)
      return;
    attachFiles(event.dataTransfer.files);
  } else {
    if (mesText.value !== '')
      mesText.value += '<br>';
    mesText.value += `![](${url})<br>`;
  }
});

passwordInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loginBtn.click();
  }
});
connect = () => {
  if (window.location.href.includes('https://')) {
    socket = new WebSocket('wss://' + location.host + '/ws');
  } else {
    socket = new WebSocket('ws://' + location.host + '/ws');
  }
  socket.onclose = () => {
    processLabel.innerText = 'Подключение...'
    fill.style.display = 'block';
    connect();
  }
  socket.onerror = (err) => {
    console.error(err);
    socket.close();
  }
  socket.onopen = () => {
    fill.style.display = 'none';
    const login = getCookie('login');
    const password = getCookie('password');
    if (login && password) {
      loginInput.value = login;
      passwordInput.value = password;
      doLogin();
    }
  }
}

const doLogin = async () => {
  username = loginInput.value;
  const password = passwordInput.value
  let rq = JSON.stringify({ "method": "login", "params": { "login": username, "password": password } });
  socket.send(rq);
  socket.onmessage = (event) => {
    let res = JSON.parse(event.data);
    res = res['result'];
    if (res) {
      loginForm.hidden = true;
      chatElem.hidden = false;
      mesText.addEventListener("keyup", (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          sendBtn.click();
        }
      });
      setCookie('login', username, { Secure: true, SameSite: 'Strict' });
      setCookie('password', password, { Secure: true, SameSite: 'Strict' });
      socket.send(JSON.stringify({ "method": "messages", "params": {} }));
      socket.onmessage = chat;
      currentUser.innerHTML = `👨 <b>${username}</b><br><div class="btn btn-outline-danger btn-sm" onclick="logout()">🚪</div>`
    } else alert('неверный pASSword или fuck you с таким паролем (делай от 6 символов)');
  }
}

const message = async () => {
  if (mesText.value) {
    let rq = JSON.stringify({ "method": "message", "params": { "text": mesText.value, "login": username } });
    socket.send(rq);
    mesText.value = '';
  }
}

const addMessage = (html) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.classList.add('message');
  messages.appendChild(div);
}

const chat = (event) => {
  let res = JSON.parse(event.data);
  if (Object.keys(res).includes('message')) {
    addMessage(res.message);
    scrollHandler();
  } else if (Object.keys(res).includes('result')) {
    if (res.result) {
      for (const mes of res.result)
        addMessage(mes);
      images = document.getElementsByTagName('img');
      const onloadHandler = () => {
        if (onloadHandler.i === undefined)
          onloadHandler.i = 0;
        onloadHandler.i++;
        if (onloadHandler.i == images.length)
          window.scrollTo(0, document.body.clientHeight);
      }
      for (const img of images)
        img.onload = onloadHandler;
    }
  }
}

const attach = () => fileInput.click();
const attachFiles = async (files) => {
  if (files[0].type.startsWith('image')) {
    processLabel.innerText = 'Загрузка файла...';
    fill.style.display = 'block';
    const formData = new FormData();
    formData.append('file', files[0]);
    if (mesText.value !== '')
      mesText.value += '<br>';
    const res = await fetch('/upload', { method: "POST", body: formData });
    mesText.value += `![](${await res.text()})<br> `;
    fill.style.display = 'none';
    mesText.focus();
  } else {
    alert('хей, дружок-пирожок, ты кажется выбрал неправильный файл, поддерживаются только картинки');
  }
}

const logout = () => {
  deleteCookie('login');
  deleteCookie('password');
  loginInput.value = '';
  passwordInput.value = '';
  username = '';
  loginForm.hidden = false;
  chatElem.hidden = true;
  currentUser.innerHTML = '';
}

connect();