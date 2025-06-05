const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

// 配置参数
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;
const SUB_PATH = process.env.SUB_PATH || 'sub';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || '9afa0f97-643e-4c22-8156-dfa49bfcd88b';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'leapcell.mycf2hj.us.kg';
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiM2IwNjc1YmExZTMzNmVlZTliZTgzOWIyMjQ2YjJkMmIiLCJ0IjoiMDNiZjgwZjgtODIxMC00YjNiLTgwNmEtYzgwNjdjMTAwNThkIiwicyI6IllXTmtObU01T0RndE9HUTVZaTAwT1RnM0xXSmtZall0WXpWak9UZzFOell4TXpGaSJ9';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const CFIP = process.env.CFIP || 'www.visa.com.hk';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'Vls';

// 内存存储替代文件系统
const memoryStore = {
  config: {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
  },
  subData: '',
  bootLog: ''
};

// 根路由
app.get("/", function(req, res) {
  res.send("Hello world!");
});

// 判断系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  return (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') ? 'arm' : 'amd';
}

// 下载文件到内存
async function downloadToMemory(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return response.data;
  } catch (err) {
    console.error(`Download failed: ${url} - ${err.message}`);
    return null;
  }
}

// 执行二进制文件从内存
async function executeFromMemory(binaryData, args = '') {
  try {
    // 在只读系统中，我们无法直接执行内存中的二进制
    // 这里需要改为使用系统预装的工具或改变架构
    console.error('Cannot execute binary from memory in read-only system');
    return false;
  } catch (err) {
    console.error(`Execution error: ${err}`);
    return false;
  }
}

// 哪吒监控配置
function getNezhaConfig() {
  if (!NEZHA_SERVER || !NEZHA_KEY) return null;

  const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
  const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
  const nezhatls = tlsPorts.has(port) ? 'true' : 'false';

  return `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: false
ip_report_period: 1800
report_delay: 1
server: ${NEZHA_SERVER}
skip_connection_count: false
skip_procs_count: false
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;
}

// Argo 隧道配置
function getArgoConfig() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) return null;

  if (ARGO_AUTH.includes('TunnelSecret')) {
    return `
tunnel: ${ARGO_AUTH.split('"')[11]}
protocol: http2
ingress:
  - hostname: ${ARGO_DOMAIN}
    service: http://localhost:${ARGO_PORT}
    originRequest:
      noTLSVerify: true
  - service: http_status:404`;
  }
  return null;
}

// 生成订阅内容
async function generateSubContent(argoDomain) {
  const metaInfo = execSync(
    'curl -s https://speed.cloudflare.com/meta | awk -F\\" \'{print $26"-"$18}\' | sed -e \'s/ /_/g\'',
    { encoding: 'utf-8' }
  ).trim();
  const ISP = metaInfo;

  const VMESS = { 
    v: '2', 
    ps: `${NAME}-${ISP}`, 
    add: CFIP, 
    port: CFPORT, 
    id: UUID, 
    aid: '0', 
    scy: 'none', 
    net: 'ws', 
    type: 'none', 
    host: argoDomain, 
    path: '/vmess-argo?ed=2560', 
    tls: 'tls', 
    sni: argoDomain, 
    alpn: '' 
  };

  return `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${NAME}-${ISP}

vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}

trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${NAME}-${ISP}`;
}

// 订阅路由
app.get(`/${SUB_PATH}`, (req, res) => {
  if (!memoryStore.subData) {
    return res.status(404).send('Subscription not ready');
  }
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(Buffer.from(memoryStore.subData).toString('base64'));
});

// 启动服务
async function startServices() {
  // 1. 获取Argo域名
  let argoDomain = ARGO_DOMAIN;
  if (!argoDomain) {
    console.log('Using temporary tunnel - domain will be unavailable in read-only system');
    return;
  }

  // 2. 生成订阅内容
  memoryStore.subData = await generateSubContent(argoDomain);
  console.log('Subscription content generated');

  // 3. 上传节点
  if (UPLOAD_URL) {
    try {
      if (PROJECT_URL) {
        const response = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, {
          subscription: [`${PROJECT_URL}/${SUB_PATH}`]
        }, { headers: { 'Content-Type': 'application/json' } });
        console.log('Subscription uploaded successfully');
      } else {
        const nodes = memoryStore.subData.split('\n')
          .filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
        
        if (nodes.length > 0) {
          await axios.post(`${UPLOAD_URL}/api/add-nodes`, 
            { nodes }, 
            { headers: { 'Content-Type': 'application/json' } });
          console.log('Nodes uploaded successfully');
        }
      }
    } catch (err) {
      console.error('Upload failed:', err.message);
    }
  }

  // 4. 自动保活
  if (AUTO_ACCESS && PROJECT_URL) {
    try {
      await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL });
      console.log('Auto access task added');
    } catch (err) {
      console.error('Auto access setup failed:', err.message);
    }
  }
}

// 启动HTTP服务
app.listen(PORT, () => {
  console.log(`HTTP server running on port:${PORT}`);
  startServices().catch(err => {
    console.error('Startup error:', err);
  });
});
