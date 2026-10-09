const LOCAL_HOSTS = [`127.0.0.1`, `localhost`];
const hostname = typeof location !== `undefined` ? location.hostname : ``;

export const API_BASE_URL = LOCAL_HOSTS.includes(hostname)
  ? `http://127.0.0.1:8000`
  : `https://api.learnolelo.com`;
